# Ciclo 8 — Campanha, ritmo e polimento — Design

Data: 2026-11-12
Status: aprovado em conversa
Base: ciclos 1–7 na `main` (v0.2.0-teste).

## Objetivo
Fazer a partida durar e terminar bem: salvar e voltar, não perder informação com o tempo correndo, entender batalhas
antes e depois, rivais que usam o exército inteiro, uma campanha 1760–1918 que acaba com placar — e, primeiro, a pele
de mesa de guerra que o documento pede (tinta, papel, latão). Sistemas novos só onde fecham um buraco.

Fora deste ciclo (guardado a pedido do usuário): ultimato/pretexto/frentes/trincheiras/cansaço da guerra, capital
móvel, IAs com lógica própria. Camada visual por era (fuligem, trilhos, trincheiras desenhados): descartada. Áudio:
depois.

## Decisões
| Tema | Decisão |
|---|---|
| Ordem | Pele primeiro (8a), depois save, ritmo, batalha, IA e custo de tropas, campanha |
| Queda da capital | A nação continua eliminada; as províncias restantes viram cidades-estado com cidade e prédios |
| Custo de tropas | Muda agora: custo de treino quase fixo, freio passa para a manutenção crescente |
| Fim | Dezembro de 1918 encerra a partida com placar |
| Eras | Só mecânica + manchete; sem camada visual própria |

## Fases (cada uma vira um plano e um conjunto de commits)
| Fase | Tema |
|---|---|
| 8a | Pele e design do mapa |
| 8b | Salvar e carregar, tela inicial |
| 8c | Ritmo e informação |
| 8d | Batalha legível |
| 8e | IA de exército, diplomacia e custo de tropas |
| 8f | Campanha: datas, eras, cidades-estado, fim em 1918 |

---

## 8a. Pele e design do mapa
### Tipografia
Fontes embutidas (offline; nada de Google Fonts em tempo de execução), licença OFL, em `public/fonts/` com
`@font-face`: IM Fell English (títulos, nomes de província no mapa, manchetes), Libre Caslon Text (texto e números,
algarismos tabulares), UnifrakturMaguntia só no nome da Gazeta. O canvas espera `document.fonts.ready` antes do
primeiro desenho dos nomes (senão desenha em Georgia e não redesenha).

### Ícones a tinta
Recursos e tropas usam emoji (🪙🌾🪵⚫⛓🔩🔫🎖💣🐎), que mudam por sistema e brigam com a tinta do mapa. Um ícone por
recurso/tropa no mesmo traço dos ícones que `markers.ts` já desenha (feixe de trigo, árvore, picaretas, chaminé,
mosquete): um caminho SVG por ícone em `src/client/icons.ts`, usado como `<svg>` inline na barra e no painel e como
`Path2D` no canvas. `RES_ICON` e `TROOP_ICON` passam a vir dali. Alertas e marcações do mapa que usam emoji
(⚙ 🔥 ⛽ ✕ ⚔) entram no mesmo conjunto.

### Mapa
- **Fronteira nacional**: traço contínuo de 2,5 px na cor da nação onde as províncias vizinhas têm donos diferentes;
  entre províncias do mesmo dono fica o tracejado fino de hoje. Segmentos recalculados quando `owner` muda (a chave
  do renderizador já inclui `owner`).
- **Território**: preenchimento 0,16 → hachura diagonal na cor da nação (padrão de canvas criado uma vez por cor),
  mais legível sobre floresta e com cara de carta antiga.
- **Modos de mapa** (tecla `Tab` alterna, botão na barra): Político (hoje), Estabilidade (cor por faixa, as mesmas de
  `unrestInk`), Rede (cidades ligadas/desligadas, rotas, alcance de suprimento em sombra usando a máscara de
  `coverageMask`), Diplomacia (cor pela relação com você), Recursos (veios destacados, o resto esmaecido).
- **Legenda** pequena no canto do modo atual; **rosa dos ventos e escala** no canto inferior direito.

### Interface
- Painel e barra: borda de "latão" (gradiente e rebites em CSS), papel com textura leve feita em CSS (sem imagem),
  títulos em IM Fell.
- Barra superior: abaixo de 1500 px de largura os botões viram só ícone com dica e o saldo do recurso vai para a dica
  (hoje transborda em 1366 px).
- Manchete desce para baixo da faixa de alertas (hoje se sobrepõem: 64 px × 46 px).
- O FPS sai da tela (fica em `?debug=1`).
- Verde/vermelho do saldo continuam acompanhados de sinal e seta (legível para daltônicos).

## 8b. Salvar e carregar
### Formato
`{ v: 1, seed, difficulty, savedAt, month, nation, state: GameState }` em JSON. O mundo (províncias, grade de
movimento, ladrilhos) é regerado pela semente, que é determinística; só o `GameState` vai no arquivo. Ao carregar:
`speed = 0`, `stepAcc = 0`. Caches em `WeakMap` (rotas, suprimento, prévia) começam vazios sozinhos.
- `src/sim/save.ts`: `serialize(s, meta)`, `deserialize(text, pm)`. Valida `v`, campos obrigatórios e o tamanho dos
  arrays por província contra `pm.provinces.length`. Inválido ou de versão mais nova: recusa com motivo, sem tocar no
  jogo em andamento.

### Onde guarda
- `localStorage` (`imperio.save.<slot>`): 3 espaços manuais + 1 automático (funciona no Electron: `app://` é esquema
  padrão e seguro).
- Autosave a cada 12 meses de jogo e ao fechar (`beforeunload`). Falha ao gravar vira toast, nunca trava o jogo.
- Exportar/importar arquivo `.imperio.json` (download por `Blob`, importar por `<input type=file>`).

### Tela inicial e menu
Cartão central sobre o continente: **Império de Papel** · Continuar (último save, data e nação) · Novo jogo
(semente, dificuldade) · Carregar (espaços com data do jogo, províncias, data real) · Importar. Substitui a caixa de
semente solta no canto. Durante o jogo, `Esc` sem nada selecionado abre o menu: Continuar, Salvar, Carregar,
Exportar, Novo jogo, Sair (só Electron).

## 8c. Ritmo e informação
### Pausas automáticas
Configuráveis no menu (padrão ligado): carta recebida, guerra contra você (já existe), revolta numa província sua,
capital sob ocupação, batalha sua começou. A simulação marca `s.pauseRequest = kind` (onde hoje faz `s.speed = 0`) e
o cliente pausa conforme a preferência (`localStorage`), com toast explicando o motivo.

### Cartas
`DIPLO.letterMonths` 3 → 6, a carta pausa (acima) e o botão Cartas pulsa enquanto houver carta não lida.

### Diário
Painel "Diário" na barra: os 50 últimos `s.events`, mais novo em cima, com data e link que centraliza. `logEvent` e
`logFor` ganham alvo opcional `{ province?, army? }` (mesma forma dos alertas). Toasts: no máximo 3 por vez; a 4× ou
mais, só os que têm alvo do jogador — o resto vai direto para o Diário com toast "N novos no Diário".

### Previsão da resposta diplomática
Os botões de proposta mostram "provável: aceita" ou "provável: recusa — motivo" usando `evaluate` no estado atual
(com a ressalva de que a resposta vem no mês seguinte).

### Painel
- Não refaz o HTML enquanto um `input`/`select` do painel tiver foco (hoje o campo perde o foco com o tempo correndo).
- Renomear exército sem `prompt()` (o Electron não implementa `window.prompt`): campo no próprio painel. `confirm()`
  vira diálogo da casa com o mesmo texto.
- `Esc` fecha o painel; atalhos `L` Contas, `N` Nações, `C` Cartas, `J` Jornal, `D` Diário, `+`/`-` velocidade. A
  linha de ajuda no rodapé vira um `?` que abre a lista.

### Lista lateral
Coluna recolhível à esquerda: Exércitos (nome, homens, estado, suprimento), Obras em andamento, Colonizações,
Treinos. Cada linha centraliza e seleciona.

### Dicas de primeira vez
Depois dos 6 primeiros passos, uma dica dispensável na primeira vez de: siderúrgica liberada, exército fora do
território (suprimento), província abaixo de 40 (leis), primeira carta, primeira guerra, primeira mudança de era.

## 8d. Batalha legível
### Previsão antes de atacar
Com exércitos selecionados e o mouse sobre um exército hostil ou fortaleza, a dica mostra a razão de forças calculada
com os mesmos fatores do `battleStep` (contra-tipo, cobertura, rio, fortaleza, linha de suprimento, chegada sem
suprimento): "esmagadora / favorável / equilibrada / arriscada / suicida" + os 3 maiores fatores. Função pura
`battleOdds(s, grid, attackers, defenders)` em `src/sim/battle.ts`.

### Relatório depois
Ao fim de uma batalha com o jogador, `s.reports` (últimos 10): lugar, data, lados, homens antes/depois, quem fugiu,
fatores. Cartão "Despacho de [lugar]" ao clicar no evento do Diário ou no toast.

### No mapa
Ao passar o mouse na batalha, o nome do exército de cada lado nas barras de moral. Caminho planejado visível também
para os exércitos do jogador não selecionados, mais fraco.

## 8e. IA de exército, diplomacia e custo de tropas
### Custo de tropas (balanço)
Hoje `TROOP_GROWTH = 1.6` encarece o treino (o 8º batalhão custa ~27×), além do teto das guarnições; perder um
batalhão sai caríssimo e recuar é sempre o certo. Novo freio:
- `TROOP_GROWTH` 1.6 → 1.1 (treino quase fixo).
- Manutenção crescente: cada batalhão paga `upkeep × (1 + UPKEEP_GROWTH × (batalhões da nação − 1))`, com
  `UPKEEP_GROWTH = 0.1` inicial. Exército grande custa por mês, não na compra; perder tropa dói menos e o ouro parado
  não vira exército infinito.
- Recalibrar com `pacing.test.ts` (1ª fortaleza e 20 províncias nas faixas de hoje) e ajustar `armies.test.ts`.
  A projeção do botão "Treinar" já mostra o novo custo mensal (prévia por cópia do estado).

### IA
- **Tropas mistas:** com Guarnição N2/N3, recruta pela proporção-alvo da inclinação (Militarista 50% linha, 30%
  artilharia, 20% cavalaria; demais 60/30/10), escolhendo o tipo mais abaixo da meta que a guarnição libera.
- **Reserva:** ao atacar, fica na capital ao menos 1 batalhão (2 com 8 ou mais). Hoje um batalhão solto pode tomar a
  capital vazia e eliminar a nação.
- **Ataque pela previsão:** o alvo só entra na lista se `battleOdds` não for "arriscada" ou pior (substitui a margem
  fixa por número de batalhões, que ignora tipo e terreno).
- **Presente:** proposta `{ kind: 'gift', money }`, sem resposta: soma `money / DIPLO.giftPer` à relação, até +15 por
  ano por par. Alavanca para sair de "fria" sem pacto; a IA Industrial usa com vizinhos mais fortes.

## 8f. Campanha
### Datas
`formatDate` → "Março de 1763" (`CAMPAIGN.startYear = 1760`). Com `MONTH_SECONDS = 10`, 1760–1918 dá ~5,3 h a 1× e
~40 min a 8× (estimativa pelo balanço, não medida).

### Eras
Liberadas por nação quando cumpre a cota **e** chegou ao ano mínimo. Uma linha por era em `balance.ts` (`ERAS`), sem
sistema genérico de tecnologia. Na mudança: manchete e dica de primeira vez.
| Era | Ano mín. | Cota | Muda |
|---|---|---|---|
| Vapor | — | — | o jogo de hoje |
| Ferrovia | 1825 | 3 siderúrgicas prontas | melhoria "Ferrovia" na rota (custo em aço): alcance de suprimento +50%, reforço ×2, exércitos andam ×2 sobre ela |
| Fuzil | 1870 | 2 cidades N3 + 1 ferrovia | Guarnição N3 treina Infantaria de fuzil (substitui a linha nos treinos novos); defesa em fortaleza e província com Guarnição +25% |

### Cidades-estado
Na eliminação (`eliminate`), as províncias restantes da nação ficam neutras (`owner = −1`) **com cidade e prédios**,
estabilidade 30, sem exército, rotas nem depósito. Não produzem (sem dono). Colonizar uma: custo ×2
(`COLONIZE.cityStateMult`), mesmo tempo, e a nação recebe a cidade no nível e com os prédios como estão (`found` não
zera lotes e veios nesse caso). A IA já mira vizinhas neutras pelo valor dos veios; ganha um bônus pelos prédios.
Pontos que hoje supõem "neutra = sem cidade" e precisam de ajuste: `found`, `checkColonize`, `cityAt`/marcadores
(desenhar a cidade-estado em cinza), `stabilityMonth`/`unrest` (só províncias com dono), `rivalHtml`/painel de neutra.

### Fim em 1918
Em dezembro de 1918 a partida acaba: tela de fim com o placar de todas as nações vivas e a posição do jogador.
`placar = províncias × 10 + Σ níveis de cidade × 5 + estabilidade média + aço e armas produzidos na partida / 10`
(acumulado em `Nation.produced`). Eliminação e vitória por eliminação continuam terminando antes. "Continuar olhando"
deixa jogar além de 1918, sem novo placar.

## Testes
Vitest, simulação pura, no padrão de hoje:
- 8a: segmentos de fronteira nacional mudam com `owner`; modos de mapa sem teste de pixel (verificado jogando).
- 8b: ida e volta do save com igualdade depois de 24 meses de `tick` com rivais; recusa de save inválido e de outra
  semente.
- 8c: alvo dos eventos; pausa pedida nos eventos certos; previsão diplomática igual ao `evaluate`.
- 8d: `battleOdds` ordena corretamente confrontos simulados (quem a previsão favorece vence).
- 8e: manutenção crescente; IA com Guarnição N2 treina artilharia; reserva na capital; teto anual do presente;
  `pacing.test.ts` recalibrado e passando.
- 8f: datas; era só com ano e cota; eliminação deixa cidades-estado com prédios; colonizar cidade-estado custa ×2 e
  mantém prédios; fim em 1918 com placar.
