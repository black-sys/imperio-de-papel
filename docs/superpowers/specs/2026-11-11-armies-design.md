# Ciclo 3 — Exércitos como Peça Única — Design

Data: 2026-11-11
Status: aprovado em conversa
Base: `main` com mapa cartográfico, economia industrial e rotas/suprimento. Direção: documento "Projeto Império de
Papel" (o exército é um símbolo unificado no mapa; com zoom aparecem os batalhões; combate por fatores; a intervenção
tática é logística).
Ordem: 1a ✓ → 1b ✓ → 2 ✓ → **3 exércitos** (este) → 4 rivais → 5 diplomacia → 6 estabilidade → 7 refino visual.

## Objetivo
Trocar as tropas soltas por exércitos: uma peça no mapa com até 8 batalhões, comandada como uma unidade, que se abre
em fichas de batalhões de perto. A batalha continua a mesma, entre exércitos. Uma linha de suprimento até um exército
em batalha passa a trazer reforço: homens repostos (pagos do estoque) e batalhões recém-treinados na guarnição de origem.

## Decisões
| Tema | Decisão |
|---|---|
| Estrutura | Exército contém batalhões (tipo + homens); peça única no mapa |
| Limites | Teto de batalhões das guarnições; até 8 por exército; sem generais |
| Batalha | A mesma de hoje, entre exércitos; moral e fuga do exército inteiro |
| Reforço | Linha de suprimento até a batalha repõe homens e traz batalhões novos da guarnição de origem; para quando falta recurso |
| Arquitetura | `Army` com os batalhões dentro substitui `Troop` |

## Regras (calibração inicial, `balance.ts`)
### Exército
- 1 a 8 batalhões (infantaria de linha, artilharia ou cavalaria; homens, ataque, defesa e custos de hoje).
- Velocidade do batalhão mais lento. Nome gerado ("1º Exército de Traethdor"), renomeável.
- Teto total de batalhões do reino: guarnições sustentam 2 / 3 / 4 (como hoje, agora em batalhões).

### Recrutar e reorganizar
- Batalhão treinado entra no exército seu parado a ≤ 10 tiles da cidade com espaço (< 8); senão forma exército novo ali.
- Juntar: dois exércitos seus a ≤ 10 tiles, fora de batalha e não em fuga, até 8 batalhões.
- Dividir: batalhões marcados formam exército novo no mesmo lugar. Não em batalha nem em fuga.

### Batalha
- Contato a ≤ 6 tiles entre exércitos inimigos; exércitos a ≤ 20 tiles do ponto entram como reforço.
- Dano por batalhão com a conta atual (vantagens cruzadas, cobertura, rio, abertura da artilharia, +25% com linha,
  moral inicial 80% sem suprimento).
- Moral do exército; ao quebrar, o exército inteiro foge para a sua província ligada mais próxima.
- Batalhão com < 3 homens se desfaz; exército sem batalhões some.
- Fortalezas neutras: exércitos neutros parados com seus batalhões; defesa +50%; não fogem; regeneram como hoje.

### Suprimento
Regras do ciclo 2, por exército (território ligado, alcance 30 tiles, −1 homem/mês por batalhão sem suprimento, linha
com +25%).

### Reforço pela linha de suprimento
- Vale com linha não cortada até um exército em batalha, cidade de origem ligada e com Guarnição pronta.
- Reposição: +3 homens/mês por batalhão; cada homem custa 2 dinheiro, 0,5 grãos e 0,5 armas do estoque; faltando algum,
  para com aviso ("Reforço de X parado: faltam armas") e volta quando o estoque se recupera.
- Batalhão treinado na Guarnição de origem durante a batalha entra direto nesse exército, mesmo acima de 8; ao fim da
  batalha o excesso vira um exército novo ao lado.
- Linha cortada, cidade desligada ou fim da batalha encerram o reforço. Cidade desligada não manda linha.

### Ritmo
Alvos atuais; o jogador automático junta batalhões num exército para atacar fortalezas.

## Arquitetura
### Estado
```ts
interface Battalion { type: TroopType; soldiers: number }
interface Army {
  id; owner /* 0 jogador, −1 fortaleza */; name: string; battalions: Battalion[];
  x; y; path: number[]; morale; routedUntil; home /* província da fortaleza; −1 */;
  supply: { path; from; at; cut } | null; supplied: boolean; overflow: number
}
GameState: armies (substitui troops), nextArmyId; battles com armyIds
```

### Arquivos
- `troops.ts` → `armies.ts`: `spawnArmy`, `armyCap`, `armySpeed`, marcha, reposição, dispersão de batalhões;
  `mergeArmies`, `splitArmy`, `renameArmy` (`Result`).
- `commands.ts`: `moveArmies` (formação entre exércitos); recrutamento entrega o batalhão ao exército da cidade, a um
  novo, ou ao exército da linha de reforço.
- `battle.ts`: a conta atual por batalhão; contato entre exércitos; moral/fuga do exército.
- `routes.ts`: suprimento, desgaste e linha por exército; reforço pela linha (pagando ao estoque).
- `fortress.ts`: fortaleza = exército neutro; regeneração recompõe os batalhões.
- `economy.ts`: manutenção por batalhão; linha por exército.
- Fim de batalha: batalhões além de 8 separam-se num exército novo.
- Testes de tropas/batalha/fortaleza/suprimento portados: exército de 1 batalhão = tropa de hoje (mesmos números).

## Interface
- **Mapa:** exército como um retângulo na cor do dono com o símbolo do tipo predominante e "força · batalhões" embaixo;
  barrinha vermelha sem suprimento; ⛽ com linha. A partir de 4 px/tile abre em fichas dos batalhões em formação ao
  redor do estandarte (infantaria à frente, cavalaria nos flancos, artilharia atrás — só visual). Fortaleza: pentágono
  com o nº de batalhões (fichas de perto). Batalha: ⚔ com barras de moral. Linha de reforço ativa com setas animadas.
- **Seleção e ordens:** as de hoje, sobre exércitos.
- **Painel do exército:** nome (renomear), força, moral, situação, suprimento; batalhões com caixas; "Dividir (formar
  exército com os marcados)"; "Juntar com…" (exércitos seus a ≤ 10 tiles); "Abastecer"/"Cortar linha"; em batalha com
  linha, "Reforço de X: +3 homens/mês por batalhão" ou o motivo de estar parado. Vários selecionados: lista resumida.
- **Painel da Guarnição:** destino do próximo batalhão.
- **Barra superior:** "Batalhões n/teto".
- **Avisos:** batalhão chegou pela linha; reforço parado; exército dividido; exércitos unidos.

## Testes
Exércitos: velocidade do mais lento; recrutamento (entra no exército da cidade, forma novo, teto, cheio → novo); juntar
(8, 10 tiles) e dividir; recusas em batalha/fuga/índice inválido; mover em formação e no tempo; recusas atuais.
Batalha portada: vantagens, terreno, moral do exército e fuga, dispersão de batalhão e de exército, reforço a 20 tiles,
determinismo 1×/8×, JSON; exército misto coerente.
Reforço pela linha: reposição 3/mês paga; sem armas para com aviso e volta; batalhão novo entra pela linha acima de 8 e o
excesso se separa ao fim; corte/desligamento encerram.
Fortalezas como exércitos (regeneração, conquista). Suprimento portado. Ritmo nos alvos atuais. Mapa: escolha e caixa
pegam exércitos; chave de redesenho muda com batalhão entrando/saindo e com o limite de zoom que abre a peça.
Navegador sem GPU (semente 860): 3 batalhões num exército; dividir e juntar; fichas de perto; ataque a fortaleza com
linha; batalhão chegando pela linha durante a batalha.

## Fora do escopo
Generais, linhas de batalha com regra própria, tecnologia mudando unidades, exércitos rivais (ciclo 4).
