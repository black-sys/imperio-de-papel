# Subprojeto 3a — Reinos Rivais — Design

Data: 2026-11-10
Status: aprovado em conversa
Base: subprojetos 1 e 2 (na `main`). Jogo: estratégia territorial offline em tempo real.
O subprojeto 3 foi dividido em três ciclos: **3a rivais** (este), **3b bárbaros errantes**, **3c diplomacia**.

## Objetivo
Até 4 reinos rivais controlados por IA, nas outras capitais sugeridas, jogando com as mesmas regras do jogador.
Províncias com dono passam a ser conquistáveis por ocupação; perder a capital elimina o reino; a partida tem
vitória e derrota.

## Decisões
| Tema | Decisão |
|---|---|
| Conquista | Derrotar os defensores e ocupar por um tempo; Guarnição alonga |
| Capital | Capital caída elimina o reino; vence o último de pé |
| Guerra | Paz até as fronteiras encostarem; depois guerra permanente |
| Regras da IA | As mesmas do jogador, pelos mesmos comandos; dificuldade muda só a renda dos rivais |
| Comportamento | Uma IA, três inclinações por pesos (Expansionista, Militarista, Construtor) |
| Visão | Sem névoa de guerra |
| Arquitetura | Lista de reinos no estado; IA pura em `src/sim/ai.ts` |

## Regras (calibração inicial, `balance.ts`)
### Reinos
- Jogador (reino 0) e até 4 rivais, um por capital sugerida restante (menos capitais = menos rivais).
- Rivais começam como o jogador (capital com Vila N2, `START_RES`) no momento em que o jogador funda a capital.
- Cada reino tem nome ("Reino de <província da capital>"), cor, recursos, teto de tropas e custos de colonizar e
  recrutar próprios.
- Dificuldade (tela inicial): renda dos rivais × 0.7 (Fácil), 1 (Normal, padrão), 1.3 (Difícil). A do jogador não muda.

### Paz e guerra
- Dois reinos estão em paz até terem províncias vizinhas; aí entram em guerra para sempre (evento).
- Em paz: tropas se cruzam sem lutar e não ocupam.
- Fortalezas neutras lutam contra qualquer reino. Ao cair, a província vai para o reino com mais soldados a até
  20 tiles do local.

### Ocupação
- Começa quando há tropas de um reino em guerra dentro da província e nenhuma tropa do dono (em fuga não conta).
- Tempo para cair: 1 mês; com Guarnição pronta 2 / 3 / 4 meses (N1/N2/N3); capital +3 meses.
- A contagem zera se o ocupante sai ou é expulso; não avança com tropa do dono presente.
- Ao cair: a província passa ao ocupante; cada prédio perde um nível (N1 e em obra são destruídos); a Vila fica
  no mínimo N1; treino em andamento ali é cancelado. Pode abrir guerras novas (fronteira).

### Eliminação e fim
- Capital caída: o reino acaba; suas tropas se dispersam; as outras províncias viram neutras, sem prédios,
  colonizáveis. O conquistador fica com a capital como província comum.
- Derrota: a capital do jogador cai. Vitória: o último rival cai. Tela de fim com "Continuar olhando" e "Novo mundo".

### Igual para todos
Fuga para a província própria mais próxima; reposição só em território próprio; no máximo 2 colonizações
simultâneas por reino; metas de nível da Guarnição; manutenção; custo de recrutar crescente por reino.

## Arquitetura
### Estado (`src/sim/state.ts`)
```ts
interface Realm { id: number; name: string; res: Res; capital: number; alive: boolean;
                  bent: 'expansionist' | 'militarist' | 'builder'; incomeMult: number; atWar: number[] }
GameState: realms: Realm[]                         // 0 = jogador; substitui `res` e `capital`
           owner: number[]                         // −1 neutro, senão id do reino
           colonizing: { province, realm, remaining }[]
           occupations: { province, realm, progress }[]
           result: null | 'victory' | 'defeat'
```
Cor do reino = índice numa paleta fixa do cliente (carmim, azul, verde, ocre, roxo). Tudo serializável.

### Comandos (`src/sim/commands.ts`)
- Todos recebem o reino: `colonize(s, pm, realm, id)`, `build`, `upgrade`, `recruit`, `moveTroops(s, grid, realm, ids, x, y)`,
  com os `checkX` correspondentes e as mesmas recusas.
- `startGame(s, pm, capital, difficulty, seed)` substitui `chooseCapital`: funda a capital do jogador, cria os rivais
  nas outras capitais sugeridas e sorteia a inclinação pela semente.
- Economia (`monthlyIncome`, `colonizeCost`, `recruitCost`, `troopCap`) por reino.

### Passo de tempo
- Virada do mês, para cada reino vivo: renda (× `incomeMult`), dispersão por ouro negativo e, nos rivais, `aiStep`.
- Passo fixo das tropas: movimento → batalhas → ocupação/queda → eliminação → fronteiras/guerras → reposição → fortalezas.
- Hostilidade: duas tropas são inimigas se uma é de fortaleza ou se os reinos estão em guerra. Em batalha de
  vários lados, cada tropa só fere inimigos.
- Eventos (`events`) continuam sendo o feed do jogador: tudo que é dele, mais guerras e eliminações de qualquer reino.

### IA (`src/sim/ai.ts`)
`aiStep(s, pm, grid, realm)`, pura e determinística, uma vez por mês por rival, em passos diferentes do mês.
Ordem de preocupação:
1. **Defender:** província própria ocupada ou inimigo no território → manda as tropas livres mais próximas se a
   força somada for comparável; senão recua para a capital.
2. **Recompor:** tropa com < 50% dos soldados volta para província com Guarnição.
3. **Economia:** coloniza a melhor vizinha; serraria, pedreira, mercado; melhorias; garante uma província com
   rocha antes de tudo.
4. **Exército:** guarnições numa fração das províncias; recruta até o teto, mantendo reserva de ouro para a
   manutenção; arqueiros e cavaleiros quando o nível permite.
5. **Atacar:** junta as tropas prontas num exército; alvo mais vantajoso entre fortalezas próximas e províncias de
   inimigos; exige margem de força; capital inimiga ao alcance e mal defendida tem preferência.

Inclinação = três pesos: fração do ouro para colonizar/construir/recrutar; fração de províncias com Guarnição;
margem de força para atacar (Militarista menor, Construtor maior).

O jogador automático de `tests/greedy.ts` é absorvido pela IA; os testes de ritmo usam a IA jogando como reino 0.

### Desempenho
- `findCellPath` reusa os arrays de trabalho entre chamadas (sem ~9 MB por busca).
- A IA calcula um caminho por exército e só reordena quando o alvo muda.
- Rivais decidem em passos diferentes do mês.

## Interface
- **Tela inicial:** seletor de dificuldade; selos das outras capitais com "aqui nascerá um rival".
- **Cores:** território, estandartes e fichas na cor do reino (3D e pergaminho); fortalezas cinza; selo colorido na
  capital de cada reino no pergaminho.
- **Ocupação:** bandeira do ocupante no 3D; barra de progresso na ficha do pergaminho.
- **Painel:** província de rival (reino, inclinação, "em paz" / "em guerra com você", prédios, tropas; sem botões);
  província sua sob ocupação (quem e quanto falta); província inimiga que você ocupa (quanto falta e o que alonga).
- **Barra superior:** botão "Reinos" → lista (nome, cor, províncias, tropas, situação); clicar centraliza na capital.
- **Dica:** nome do reino dono.
- **Mensagens:** guerra iniciada, província sua sob ocupação, perdida, tomada, reino eliminado (e por quem).
  Entre rivais, só guerra e eliminação.
- **Tropa alheia:** clicar mostra painel só de leitura (tipo, soldados, moral, dono). Só as próprias são selecionáveis.
- **Fim:** tela "Vitória" / "Derrota" com tempo de jogo e províncias; "Continuar olhando" e "Novo mundo".

## Testes
Regras (vitest):
- Início: rivais nas outras capitais sugeridas, mesmos recursos e Vila N2; menos capitais = menos rivais.
- Mesmas regras: comando de rival tem os mesmos custos e recusas; reino não age em província alheia.
- Dificuldade: renda dos rivais × 0.7 / 1 / 1.3; a do jogador não muda.
- Paz e guerra: sem fronteira não lutam nem ocupam; ao virarem vizinhos, guerra uma vez só com evento; fortaleza
  luta contra todos.
- Batalha de três lados: dois reinos em paz não se ferem.
- Ocupação: 1 mês; 2/3/4 com Guarnição; capital +3; zera se o ocupante sai ou é expulso; não avança com tropa do
  dono (em fuga não conta); ao cair, prédios −1 nível, Vila sobra, treino cancelado.
- Eliminação: tropas dispersas, províncias neutras sem prédios, conquistador só com a capital; derrota e vitória.
- Fortaleza vai para o reino com mais soldados em volta.
- Estado com reinos, guerras e ocupações: ida e volta pelo JSON.

IA:
- Não trava nem quebra: 5 IAs por 600 meses em 4 sementes, sem exceção, sem ouro negativo persistente, sem tropa
  parada para sempre com ordem impossível.
- Progride: cada rival com ≥ 5 províncias em 150 meses e ≥ 1 fortaleza tomada em 300.
- Reage: defende província ocupada quando tem força; recua quando não tem.
- Não ataca alvo acima da margem da inclinação.
- Inclinações diferem em média: Militarista mais tropas, Expansionista mais províncias, Construtor mais renda.
- Determinismo: mesma semente, mesma partida, a 1× e 8×.

Ritmo: testes atuais com a IA como reino 0 (mesmos alvos). Novo: no Normal, 1ª guerra entre 20 e 60 min; ≥ 1 reino
eliminado em até 4 h.

Desempenho: um mês com 5 reinos e ~60 tropas móveis < 50 ms de simulação; busca de caminho sem alocação nova por chamada.

Manual (headless + autor): fundar capital, dificuldade, rivais crescendo no pergaminho, guerra, ocupar, perder
província, eliminar um rival, tela de fim.

## Fora do escopo
Bárbaros errantes (3b). Diplomacia e declaração de guerra por botão (3c). Névoa de guerra. Salvar/carregar.
Guardados para futuros modos de jogo: capital móvel (o reino sobrevive à queda da capital) e IAs com lógica
própria por personalidade.
