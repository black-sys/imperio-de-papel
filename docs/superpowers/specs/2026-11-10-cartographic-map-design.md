# Ciclo 1a — Mapa Cartográfico — Design

Data: 2026-11-10
Status: aprovado em conversa
Base: `main` com os subprojetos 1 e 2. Direção: documento "Projeto Império de Papel" (grand strategy 1760–1918
sobre uma mesa de guerra cartográfica).

## Contexto e ordem
O documento de design do usuário trocou a direção do jogo. O 3D sai inteiro e o jogo todo passa a ser o mapa
cartográfico 2D. Ordem dos ciclos: **1a mapa cartográfico** (este) → 1b economia industrial e exército de 1760 →
2 rotas e suprimento → 3 exércitos como peça única → 4 nações rivais (spec 3a pausada) → 5 diplomacia →
6 estabilidade → 7 refino visual (mesa de couro e latão, fuligem, mapa envelhecendo, áudio).

## Objetivo
Substituir a visão 3D por um mapa cartográfico 2D com zoom contínuo do continente até 3 px por tile. Mapa
aquarelado com marcadores em símbolos de carta militar. Toda a jogabilidade atual (capital, prédios, colonização,
tropas, fortalezas, batalhas, painéis) continua funcionando sobre o mapa novo. As regras do jogo não mudam neste ciclo.

## Decisões
| Tema | Decisão |
|---|---|
| Visão | Só o mapa 2D; norte sempre para cima; sem 3D |
| Estilo do mapa | Aquarela: papel, manchas suaves por bioma, relevo sombreado, árvores em pontos |
| Marcadores | Símbolos de carta militar: tinta, planos, cor do dono no preenchimento |
| Motor | Ladrilhos desenhados no worker em 5 níveis de zoom, Canvas 2D, camadas vetoriais por cima |
| Acabamento | Básico agora; refino no ciclo 7 |

## Visual
### Mapa
- Papel claro com textura leve; manchas de aquarela por bioma; relevo sombreado de leve (mais forte em montanha).
- Mar azul-acinzentado clareando com a distância da costa; costa em linha de tinta lisa (sem degraus).
- Rios e lagos em azul; rios engrossam com a vazão.
- Árvores como pontinhos verdes nas posições reais das árvores do mundo.

### Detalhe por zoom
- **Continente:** cores dos biomas, costa, rios principais, fronteiras dos reinos, nomes das províncias grandes.
- **Região:** todos os rios, fronteiras de província, mancha da cor do reino, todos os nomes.
- **Perto (≥ ~1 px/tile):** árvores, relevo detalhado, prédios e veios.

### Marcadores (tamanho fixo na tela)
- **Cidade:** círculo na cor do dono, um ponto por nível; capital com aro duplo.
- **Prédios:** ícones gravados a tinta (mina, fazenda, serraria, fábrica, mercado, guarnição; no 1a, os prédios
  atuais: vila, serraria, pedreira, mercado, guarnição); em obra, tracejado.
- **Colonização:** bandeirola com o tempo restante.
- **Fortaleza neutra:** pentágono cinza com o número de tropas vivas.
- **Tropa:** retângulo na cor do dono com o símbolo do tipo (✕ infantaria, ponto artilharia, barra cavalaria —
  no 1a os tipos atuais: lanceiros ✕, arqueiros ponto, cavaleiros barra) e o número de homens embaixo.
- **Seleção:** aro dourado; rota da tropa selecionada tracejada.
- **Batalha:** ⚔ vermelho com duas barrinhas de moral.
- Com zoom afastado, prédios somem e cada província mostra só a cidade.

### Tipografia e interface
Nomes das províncias em serifada itálica. Barra superior, painéis e mensagens em papel e tinta com serifada de
época. Couro, latão e manômetros ficam para o ciclo 7.

### Removido
Terreno 3D, água animada, vegetação 3D, sombras, céu, modelos de prédios e tropas, giro da câmera (Q/E), seletor de
qualidade gráfica, contador de triângulos.

## Motor de desenho
### Ladrilhos (worker)
- 5 níveis: escala `3 / 2^L` px por tile, `L = 0..4` (3 → 0,1875).
- Ladrilho de 192×192 px; no nível 0 cobre 64×64 tiles (um chunk); no nível L cobre `64·2^L` tiles.
- Níveis 0–2 desenhados com dados de chunk (relevo por tile, costa, rios com largura, árvores); níveis 3–4 só com
  o mapa global.
- O worker guarda chunks recentes num cache e responde à mensagem `tile (L, x, y)` com os pixels (transferidos).
  Meta: < 15 ms por ladrilho.
- Thread principal: cache de ladrilhos de tamanho fixo (~60 MB, LRU); usa o nível mais nítido que não passa da
  escala da tela; enquanto ele não chega, desenha o nível acima ampliado (nunca há buraco).

### Camadas (thread principal, Canvas 2D)
1. **Território e fronteiras:** contornos vetoriais por província (calculados uma vez a partir de `cellProvince`),
   traço nítido em qualquer zoom; mancha do reino = preenchimento dos contornos. Troca de dono não refaz ladrilhos.
2. **Nomes das províncias.**
3. **Marcadores.**
4. **Caixa de seleção.**
A tela só é redesenhada quando a vista, o estado do jogo ou um ladrilho recém-chegado mudam algo; mapa parado
custa zero.

### Aposentado
three.js; `src/client/view/*` (cena, terreno, água, flora, decoração, prédios, tropas, gerenciador de chunks);
`src/client/quality.ts`; `src/client/parchment.ts` e o pergaminho atual (`strategic.ts` dá lugar ao mapa novo); a
mensagem de chunk 3D do worker. Os testes desses módulos saem junto. Geração do mundo, províncias, simulação e
worker continuam.

## Interação
- **Câmera:** arrastar com botão do meio ou direito (o mapa acompanha o mouse); WASD e setas (mais rápido quanto
  mais afastado); roda = zoom contínuo centrado no ponteiro, de 0,1875 a 3 px/tile; M alterna entre o continente e
  a última vista de perto; o mapa não sai da tela e, no zoom mínimo, o continente fica centrado.
- **Seleção e ordens:** clique esquerdo seleciona a tropa sob o ponteiro (todo o retângulo do marcador, até 14 px),
  senão a província; arrastar com o esquerdo = caixa; Shift soma ou tira; clique direito sem arrastar (≤ 5 px)
  manda; Shift+1–9 salva e 1–9 chama grupos; Esc limpa. Cancelamento de toque fecha a caixa.
- **Tela inicial:** continente com os selos das capitais sugeridas; clicar num selo seleciona a província e mostra
  "Fundar capital aqui".
- **Dica:** nome da província e dono.
- **Painéis, barra superior e mensagens:** mesmo conteúdo, estilo papel e tinta; a barra mostra só o FPS (sem
  qualidade e triângulos). Ajuda no canto atualizada.
- Ao gerar um mundo novo, ladrilhos e imagens do mundo anterior são liberados.

## Testes
Lógica pura (vitest):
- Vista: tela → mapa → tela volta ao mesmo ponto; zoom pela roda mantém fixo o ponto sob o ponteiro; limites
  mantêm o mapa na tela; escala entre 0,1875 e 3 px/tile.
- Ladrilhos visíveis: cobrem a tela inteira, sem lacuna, em várias posições e zooms; nível escolhido é o mais nítido
  sem passar da escala; substituto vem do nível acima e cobre a mesma área.
- Desenho de ladrilho: determinístico; vizinhos casam na borda; mar, terra e rio nas cores certas; média < 15 ms.
- Contornos: fechados; área interna = células da província; fronteira entre duas províncias aparece uma vez.
- Alvo sob o ponteiro: tropa > cidade > fortaleza > província; o retângulo inteiro da tropa conta.

Navegador sem GPU (eventos reais de mouse e teclado): semente 860, fundar capital, construir, recrutar, selecionar
por clique e caixa, mandar marchar, tomar fortaleza, zoom do continente até perto e volta. Mapa parado: 0
redesenhos em 2 s; tropa marchando: redesenha. Capturas em três zooms.

Limpeza: testes dos módulos aposentados removidos; geração do mundo, simulação e ritmo passam sem mudança;
`npm run build` sem three.js no pacote.

Manual (autor): FPS ao arrastar e dar zoom na RTX 3060; estilo agradável de perto e de longe.

## Fora do escopo
Economia industrial e exército de 1760 (1b). Mesa de couro e latão, fuligem, mapa envelhecendo, áudio (ciclo 7).
