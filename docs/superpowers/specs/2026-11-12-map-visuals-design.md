# Ciclo 8 — Visual do mapa — Design

Data: 2026-11-12
Status: aprovado em conversa
Base: ciclos 1–7 na `main` (v0.2.0) + notas do teste (`TesteImpériodoPapel.docx`) e duas capturas da semente 2209734144.

## Objetivo
Cidades e construções legíveis em qualquer zoom, vegetação que não polua a tela, mar sem corte na borda do mundo e
um aviso no mapa do que já pode ser melhorado.

## Decisões
| Tema | Decisão |
|---|---|
| Tamanho dos marcadores | Base maior + cresce com o zoom (1× afastado → 2× perto, para aí) |
| Vegetação | Sem pontinhos de árvore em nenhum zoom; floresta em cor mais forte e lisa; borda de bioma suave |
| Borda do mundo | Fora do mundo pintado como alto-mar; limite da câmera inalterado; geração inalterada |
| "Dá para melhorar" | Setinha ▲ verde só quando dá agora (recurso, nível, sem obra); nada quando falta |
| Extras | Corrigir faixas verticais no fundo; veios livres só a partir de zoom médio |
| Fora | Botão "?" de atalhos (ciclo 9), troca de Electron |

## 1. Base do mapa (`src/client/map/tilePaint.ts`, `renderer.ts`)
- **Árvores:** `trees()` deixa de ser chamado e é removido (e `TREE`, `TREE_KINDS`). As posições de árvore continuam na
  geração (a simulação usa). Se o detalhe do chunk só servia às árvores em algum caminho, esse carregamento também sai.
- **Cores de floresta:** `TINT` de `TemperateForest`, `Taiga` e `Jungle` mais escuros/saturados para a floresta ler
  como mancha (temperada: verde-oliva médio; taiga: verde-acinzentado escuro; selva: verde mais vivo); pântano com tom
  próprio. Valores finais ajustados por captura.
- **Borda suave:** a cor do bioma interpolada também no zoom mais próximo (sem degraus de um tile). Causa dos degraus
  confirmada antes da mudança.
- **Mar fora do mundo:** o fundo do `renderer` (hoje `PAPER_BG`) passa a ser a cor do alto-mar (a mesma fórmula do
  oceano longe da costa em `paintTile`, sem o ruído), exportada de `tilePaint.ts` como `OPEN_SEA`.
- **Faixas verticais:** causa encontrada (sombreamento, amostragem ou emenda) e corrigida na raiz.

## 2. Marcadores (`src/client/map/markers.ts`, `pick.ts`)
- `markerScale(scale: number): number` em `pick.ts` — 1 a 2, não decrescente no zoom (1 a partir do zoom afastado
  até ~0,75 px/tile, 2 a partir de ~3 px/tile).
- Cidade: raio base ≈1,6× o atual, × `markerScale`, + nível. Lotes, veios, bandeira de colonização e fortaleza ×
  `markerScale`. Exércitos inalterados.
- O clique (`pick.ts`) usa os mesmos raios escalados.
- Capital: aro dourado externo além do aro interno atual.
- Nome: província com cidade → nome em negrito e maior; sem cidade → itálico claro como hoje.
- **Setinha ▲ verde** no canto do ícone (prédio do lote, veio explorado, cidade) da nação 0 quando a melhoria é
  válida agora — mesma validação do botão "Melhorar" do painel, numa cópia (estado real intacto). Entra na chave
  `markersKey`.
- **Zoom afastado:** veios livres e de outras nações só a partir de ~0,8 px/tile (hoje 0,35); veios explorados da
  nação 0 sempre. Abaixo disso: cidades, fortalezas, exércitos e nomes.

## Testes
- Ladrilho só de floresta: sem pontos (variação entre pixels vizinhos pequena).
- Pixel de alto-mar na borda do ladrilho ≈ `OPEN_SEA`.
- Teste do defeito das faixas, escrito após achar a causa.
- `markerScale`: entre 1 e 2, não decrescente.
- Clique na beira da cidade maior a seleciona.
- Setinha: aparece com recurso; some sem recurso, com obra em andamento e no nível máximo; estado real intacto.
- Veios livres ausentes no zoom afastado; veios explorados da nação 0 presentes.
- Navegador (semente 2209734144): capturas antes/depois, afastado e aproximado, 1400 px; FPS não cai.

## Fora do escopo
Botão "?" de atalhos e itens de janelas/painéis (ciclo 9); manchetes com escolhas e guerra (depois); troca de Electron.
