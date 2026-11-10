# Subprojeto 1 — Províncias e Economia — Design

Data: 2026-11-10
Status: aprovado em conversa
Base: gerador v1 + 0a + 0b (na `main`). Jogo: estratégia territorial offline em tempo real.

## Objetivo
Dividir o continente em ~300 províncias com fronteiras naturais e criar o laço econômico:
escolher capital → construir prédios que rendem ouro/madeira/pedra → colonizar províncias neutras
vizinhas. Sem combate e sem IA (subprojetos 2 e 3). Câmera livre; o bonequinho sai.

## Decisões
| Tema | Decisão |
|---|---|
| Expansão | Colonizar província neutra vizinha (custo + tempo) |
| Prédios | Vagas por província (3–6), construídos por painel, aparecem no 3D em locais pré-escolhidos |
| Recursos | Ouro, madeira, pedra; rendimento proporcional a fatores da província (sem corte real de árvores) |
| Tempo | Calendário; 1 mês = 10 s a 1×; pausa (espaço), 1×, 2×, 4×, 8× |
| Personagem | Removido; câmera livre (WASD/setas, arrastar com botão do meio/direito, roda, Q/E) |
| Início | Escolher capital entre 5–8 províncias sugeridas no pergaminho; começa pausado |
| Geração | Crescimento de regiões (Dijkstra multi-fonte) com custo alto para cruzar rio/crista/encosta |

## Arquitetura
1. **`src/worldgen/provinces.ts`** (puro): `generateProvinces(map): ProvinceMap`
   - `cellProvince: Int16Array` (−1 = mar), `provinces: Province[]`, `suggestedCapitals: number[]`.
   - `Province`: `id, name, center {x,y} (tiles), cells, neighbors: number[], coastal, biome,
     fertility, forest, rock (0–1.5), slots (3–6), sites: {x,y}[] (um por vaga, tile seco e plano)`.
   - Floresta/rocha **estimadas** pela densidade esperada de árvores/rochas por bioma × área
     (contar árvores reais exigiria gerar todos os chunks).
   - Nomes: gerador de sílabas determinístico, únicos.
   - Gerado no worker logo após o mundo (estágio de progresso `'províncias'`).
2. **`src/sim/`** (puro, serializável): `GameState`, comandos e `tick`.
   - `GameState`: `month` (float), `speed` (0,1,2,4,8), `res {gold,wood,stone}`, `owner: Int8Array→number[]`
     (−1 neutro, 0 jogador), `buildings: (Building|null)[][]` por província/vaga,
     `colonizing: {province, remaining}[]`, `capital`, `log` de eventos.
   - `Building`: `type, level, progress` (meses restantes de obra; 0 = pronto).
   - Comandos devolvem `{ ok: true } | { ok: false, reason: string }`: `chooseCapital`, `colonize`,
     `build(province, slot, type)`, `upgrade(province, slot)`.
   - `tick(state, provinces, dtSeconds)`: avança `dtSeconds × speed / 10` meses; obras e colonizações;
     renda a cada virada de mês.
   - Números em `src/sim/balance.ts`.
3. **Cliente**: câmera livre; fronteiras/cores no 3D (L0/L1) e no pergaminho (com nomes); prédios 3D;
   barra superior (recursos com renda/mês, data, velocidades); painel lateral da província; dica ao
   passar o mouse; mensagens; tela inicial de escolha de capital.

## Regras (calibração inicial, `balance.ts`)
- Início: capital com Vila nível 2; 40 ouro, 110 madeira, 60 pedra (calibrado pelo teste de ritmo).
- Fatores 0–1.5: fertilidade (bioma + bônus rio/costa), floresta, rocha.
- Imposto: +2 ouro/mês por província; +10 na capital.

| Prédio | Requisito | Custo N1 (o/m/p) | Tempo N1 | Rendimento/mês N1/N2/N3 |
|---|---|---|---|---|
| Vila | 1 por província | 60/40/0 | 3 | ouro 4/7/10 × fertilidade |
| Serraria | floresta ≥ 0.3 | 40/20/10 | 2 | madeira 3/5/8 × floresta |
| Pedreira | rocha ≥ 0.3 | 50/30/0 | 3 | pedra 2/4/6 × rocha |
| Mercado | Vila N2 | 80/40/40 | 4 | +25/40/60% do ouro da província |
| Guarnição | — | 60/40/60 | 4 | vizinhas colonizam 25% mais barato/rápido; manutenção 2 ouro |

- Melhoria: N2 custa 1.8×, N3 3×; tempo ×1.5 por nível. Máx. nível 3.
- Colonizar: alvo neutro, terra, vizinho de província sua; ouro `80 × 1.36^(províncias−1)` +
  madeira `50 × 1.15^(províncias−1)`; 5 meses (+1 em montanha/neve/pântano); máx. 2 simultâneas; ao concluir, Vila N1.
  (Custo linear do rascunho dava 20 províncias em 13 min; o exponencial calibrado dá ~2 h.)
- Alvo de ritmo: 1ª colonização entre 3–8 meses; 20 províncias entre 1.5–4 h de jogo a 1×.

## Visual e interface
- Fronteiras: linhas sobre o terreno (L0/L1); tom da cor do reino nas suas; selecionada com contorno.
- Pergaminho: fronteiras tracejadas, aquarela na cor do reino nas suas, nomes à mão (tamanho ∝ área).
- Prédios low-poly em código (vila, serraria, pedreira, mercado, guarnição), andaimes durante a obra,
  bandeira em colonização; árvores/rochas do local e vizinhos ocultadas.
- Barra superior, painel lateral (fatores, vagas, obras, botões com motivo quando desabilitados),
  dica ao passar o mouse, mensagens de evento.
- Tela inicial: selos nas capitais sugeridas; "Fundar capital aqui"; jogo começa pausado.

## Testes
Províncias: 250–350 de terra; cobertura total da terra; contíguas; fronteira em rio/crista acima de
uma divisão Voronoi de controle; áreas entre 30% e 300% da média (ilhas exceção); vizinhança simétrica;
vagas 3–6 com local seco/plano dentro; determinismo e nomes únicos; 5–8 capitais sugeridas afastadas
e acima da mediana.
Simulação: renda; obras no tempo; custos de melhoria; recusas de colonizar/construir com motivo;
guarnição −25%; pausa/velocidades; estado serializável via JSON; teste de ritmo com jogador guloso.
Manual (headless + autor): fluxo completo no navegador.

## Fora do escopo
Tropas, combate, conquista, IA, salvar/carregar, corte real de árvores, estradas, população/comida.
