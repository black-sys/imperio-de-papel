# Ciclo 6 — Estabilidade civil — Design

Data: 2026-11-11
Status: aprovado em conversa
Base: ciclos 1–5 na `main` (economia industrial, rotas, exércitos, nações rivais, diplomacia).

## Objetivo
Cada província tem estabilidade (0–100) puxada por fome, guerra, indústria, tamanho da cidade, ligação com a capital e
conquista recente, e sustentada por Guarnição, Mercado e paz. Abaixo de certas faixas surgem greves, incêndios e
revoltas. O jogador responde com leis de emergência (nação) ou força bruta (província). Os grandes acontecimentos saem
como manchetes de jornal. Os rivais seguem as mesmas regras e a IA responde.

## Decisões
| Tema | Decisão |
|---|---|
| Onde mora | Por província; média da nação na barra superior |
| Respostas | Quatro leis (Pão e circo, Racionamento, Jornada reduzida, Lei marcial) + "Reprimir" com um exército |
| Manchetes | Grandes acontecimentos viram manchete (faixa de jornal + Jornal com as últimas 30); o resto segue como mensagem |
| Rivais | Mesmas regras; a IA decreta leis, reprime e combate rebeldes |

## Regras (calibração inicial em `balance.ts`)
### Estabilidade
`STAB = { start: 70, conquered: 30, base: 60, approach: 0.1 }`. Província fundada/colonizada começa em 70; conquistada
(ou cedida) em 30. Todo mês anda `approach` (10%) da distância até o alvo; com ressentimento, a subida anda pela metade.

Alvo = 60 + modificadores (`STAB.mod`):
| Fator | Valor |
|---|---|
| Nação sem grãos (`grainShort`) | −25 (não vale com Racionamento enquanto houver estoque de grãos) |
| Cada guerra em andamento | −5 |
| Guerra longa | −1 por 12 meses da guerra mais antiga, até −15 |
| Fábricas (siderúrgica, armas) | −5 por nível ativo (não vale com Jornada reduzida) |
| Cidade nível 2 / 3 | −5 / −10 |
| Desligada da capital | −15 |
| Conquistada há menos de 60 meses | −20 × (1 − meses/60) |
| Guarnição ativa | +10 + 5 por nível acima de 1 |
| Mercado | +5 por nível ativo |
| Capital | +10 |
| Nação sem nenhuma guerra | +5 |
| Pão e circo | +10 |
| Racionamento | −5 |
| Lei marcial | +15 onde há exército da nação parado na província |
| Ressentimento | −5 |
Alvo limitado a 0–100. Rótulos: ≥ 60 Estável, ≥ 40 Inquieta, ≥ 15 Tensa, < 15 Em revolta.

### Eventos (sorteio mensal determinístico por província: `makeRng(subSeed(seed, 'unrest:<prov>:<mês>'))`)
| Evento | Condição | Chance/mês | Efeito |
|---|---|---|---|
| Greve | < 40 e com fábrica, sem greve ativa | 10% | Fábricas da província param por 2 meses |
| Incêndio | < 30 | 5% | Um prédio sorteado perde um nível (N1 destruído) |
| Revolta | < 15, sem revolta ativa | 10% | Rebeldes na cidade; a província não paga impostos nem produz enquanto durar |

Rebeldes: exército de dono −1 (hostil a todos), `home: −1`, nome "Rebeldes de <província>", com
`1 + floor((15 − estabilidade) / 5) + nível da cidade` batalhões de infantaria. Derrotados: fim da revolta e +10 de
estabilidade. Sobrevivendo 3 meses: a província vira neutra (sem cidade nem prédios, rotas removidas), exceto a
capital, onde a revolta segue até ser vencida. Rebeldes não regeneram nem ocupam; batalham com quem estiver perto.

### Leis (por nação, até serem revogadas; `LAWS`)
| Lei | Para decretar | Enquanto vigora |
|---|---|---|
| Pão e circo (`bread`) | 50 de dinheiro | Alvo +10; 2 de dinheiro por cidade/mês (sem dinheiro no mês: cai, com aviso) |
| Racionamento (`ration`) | — | Cidades consomem metade dos grãos; alvo −5; o −25 da fome não vale enquanto houver estoque |
| Jornada reduzida (`shorter`) | — | Fábricas produzem 75%; o −5 por fábrica não vale |
| Lei marcial (`martial`) | 30 de dinheiro | +15 onde há exército da nação parado; impostos ×0,8 em todas |
Revogar é grátis; a mesma lei só volta depois de 12 meses (`LAWS.cooldown`).

### Força bruta
"Reprimir" com um exército da nação parado numa província dela com estabilidade < 40 (`REPRESS`): termina a greve ali;
estabilidade +20; ressentimento por 60 meses; cada batalhão perde 2 homens; uma vez a cada 12 meses na província. Com
rebeldes presentes, a repressão não os remove (a batalha com eles é a de sempre).

### IA
- Pão e circo com média < 45 e dinheiro ≥ 50 + 6 meses do custo; Racionamento quando `grainShort`; revoga cada lei
  quando a média passa de 60 (Racionamento quando os grãos voltam).
- Militarista: Lei marcial com média < 45; reprime províncias < 25 onde tem exército parado.
- Industrial: Jornada reduzida quando há greve ativa sua.
- A defesa trata rebeldes nas próprias províncias como invasores.

## Arquitetura
### Estado (`src/sim/state.ts`)
```ts
stability: number[]        // por província
conquered: number[]        // por província: mês da última mudança de dono por guerra/cessão (−1e9 se nunca)
resentment: number[]       // por província: mês até o qual dura o ressentimento
repressed: number[]        // por província: mês da última repressão (−1e9 se nunca)
strikes: { province: number; until: number }[]
revolts: { province: number; since: number; army: number }[]
headlines: { month: number; text: string }[]   // últimas 30
Nation: laws: LawKind[]; lawCooldown: Partial<Record<LawKind, number>>   // LawKind = 'bread' | 'ration' | 'shorter' | 'martial'
```

### `src/sim/stability.ts` (novo)
- `stabilityTarget(s, pm, id): { target: number; factors: [string, number][] }`.
- `stabilityMonth(s, pm)` na virada do mês (depois de `diplomacyMonth`): aproxima, sorteia eventos, cria rebeldes,
  encerra greves vencidas, resolve revoltas (derrotados → +10; 3 meses → neutra), cobra Pão e circo.
- `decree(s, n, law): Result` (recusas `'Lei já em vigor'`, `'Só pode decretar de novo em N meses'`, `'Falta dinheiro'`),
  `repeal(s, n, law): Result` (`'Lei não está em vigor'`).
- `repress(s, pm, grid, armyId, n = 0): Result` (recusas `'Exército inválido'`, `'Exército em marcha'`,
  `'Província não é sua'`, `'Estabilidade acima de 40'`, `'Reprimida há menos de 12 meses'`).
- `headline(s, text)`: grava em `headlines` (máx. 30) e no feed.
- `aiStability(s, pm, grid, n)` na fase mensal da nação.

### Mudanças
- `economy.ts` `runMonth`: Racionamento (grãos das cidades × 0,5), Jornada reduzida (fábricas × 0,75, arredondado para
  baixo por unidade), Lei marcial (impostos × 0,8), greve (fábricas da província não produzem; motivo `'strike'`),
  revolta (província sem impostos nem produção).
- `found` (70), `fall` (30 e `conquered = mês`), `eliminate` e província neutra por revolta zeram estabilidade,
  greves e revoltas.
- Manchetes também para guerra declarada, paz, traição e eliminação (via `headline`).
- `ai.ts` `defend`: rebeldes em províncias da nação contam como invasores.

## Interface
- Barra superior: "☮ <média>" (vermelho < 40), botão "Leis (n)" e "📰 Jornal".
- Faixa de manchete no topo do mapa ("A Gazeta de <capital>", data, título), 6 s, em fila.
- Jornal: últimas 30 manchetes com data.
- Painel da província: barra de estabilidade, rótulo, fatores do alvo, greve ("fábricas paradas por N meses"), revolta
  ("Rebeldes: N batalhões — a província cai em N meses"), ressentimento.
- Painel "Leis": efeito e custo de cada lei; Decretar/Revogar (desabilitado com motivo).
- Painel do exército: "Reprimir" (desabilitado com motivo).
- Mapa: contorno do selo da cidade por estabilidade (< 60 âmbar, < 40 laranja, < 15 vermelho); ícones de greve e revolta;
  rebeldes como exército neutro em preto.

## Testes
- Alvo: cada modificador e as leis; limites 0–100.
- Variação: 10% do caminho; ressentimento sobe pela metade; colonizada 70, conquistada 30.
- Eventos: greve só com fábrica e < 40 (2 meses); incêndio baixa um nível; revolta cria rebeldes do tamanho certo;
  determinístico; sem repetir evento ativo.
- Revolta: derrotados → fim e +10; 3 meses → neutra; capital nunca vira neutra; sem impostos/produção.
- Leis: custos, efeitos na conta do mês, queda do Pão e circo sem dinheiro, recusas e intervalo de 12 meses.
- Reprimir: +20, fim da greve, ressentimento 60 meses, −2 homens por batalhão, recusas.
- IA: Pão e circo com média baixa; ataca rebeldes.
- Manchetes: 30 últimas; guerra, paz e revolta geram manchete.
- Partida: 5 nações, 600 meses, 4 sementes sem exceção; revoltas acontecem; nenhuma nação em revolta permanente.
- Determinismo 1× = 8×; JSON de ida e volta. Ritmo: alvos atuais.
- Navegador: estabilidade e fatores; decretar lei; greve com manchete; reprimir; revolta e rebeldes; Jornal.

## Fora do escopo
Partidos, eleições, opinião pública por classe, sabotagem de rivais, imprensa controlada. Polimento visual e áudio (ciclo 7).
