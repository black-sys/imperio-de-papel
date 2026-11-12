# Ciclo 7 — Clareza da interface (economia e arrumação) — Design

Data: 2026-11-11
Status: aprovado em conversa
Base: ciclos 1–6 na `main` + build de teste (Electron).

## Objetivo
Tornar o fluxo de recursos legível: de onde vem e para onde vai cada recurso, o que cada ação vai mudar no saldo, o que
parou ou vai faltar (e o que fazer), e a tendência ao longo do tempo. Junto, reorganizar a barra superior e o painel
da província e dar ao jogador novo um roteiro de primeiros passos.

## Decisões
| Tema | Decisão |
|---|---|
| Detalhamento | Painel "📒 Contas" (por recurso, por categoria, por província) + dica resumida na barra |
| Efeito das ações | Calculado de verdade numa cópia do estado (`runMonth` antes/depois), em todo botão de ação |
| Alertas | Faixa fixa abaixo da barra, agrupada, clicável, com sugestão; derivada do estado |
| Tendência | Histórico de 24 meses por recurso no estado; gráfico e "acaba em N meses" |
| Escopo extra | Barra reorganizada, painel da província com seções e resumo, primeiros passos |
| Fora | Pele couro/latão, mapa por era, áudio (ficam para depois) |

## 1. Livro de contas e histórico
### Simulação
- `Nation.history: { stock: Res; net: Res }[]` — na virada do mês (`runMonth(..., apply=true)`), grava o estoque final
  e o saldo do mês; mantém os últimos 24 (`UI.historyMonths = 24`). Serializável, determinístico.
- `runMonth` passa a incluir, nas linhas por recurso, `"Comércio"` (entregas recebidas e dadas dos acordos de
  comércio da nação, limitadas ao que o estoque permite, na mesma regra de `diplomacyMonth`) e `"Pão e circo"`
  (−`LAWS.bread.perCity` por cidade). A projeção (apply=false) passa a bater com o que a virada aplica; a virada
  continua aplicando comércio e Pão e circo onde já aplica hoje (sem cobrar duas vezes).
- `MonthReport.byProvince: Record<keyof Res, Record<string, [label, provinceOrArmy, value][]>>` — para cada recurso e
  categoria, as parcelas por província (`p:<id>`) ou exército (`a:<id>`), para o detalhe do painel.

### Painel "📒 Contas"
Um bloco por recurso (dinheiro, grãos, madeira, carvão, ferro, aço, armas):
- Cabeçalho: ícone, nome, estoque, saldo do mês (verde/vermelho), situação: "sobe", "estável" (|saldo| < 0,05) ou
  "acaba em N meses" (estoque ÷ déficit, arredondado para cima).
- Gráfico de linha do estoque nos 24 meses guardados + projeção tracejada de 6 meses pelo saldo atual (SVG inline).
- Entradas e saídas por categoria, maiores primeiro; cada categoria expande para a lista por província/exército;
  clicar numa província centraliza o mapa e abre o painel dela.
- Linha "Em depósito: N (cidades desligadas) — ligue por rota para receber" quando houver.

### Dica da barra
Ao passar o mouse num recurso: estoque, saldo, situação, maior entrada, maior saída e "📒 ver nas Contas".

## 2. Efeito das ações no saldo
### `src/sim/preview.ts`
- `previewMonth(s, pm, n, action): { before: Res; after: Res }` — copia o estado (`structuredClone`), aplica a
  ação na cópia como pronta e devolve o saldo mensal (`runMonth(..., false, n).net`) antes e depois. Não muda o estado
  real; não sorteia.
- `Action` = `{ kind: 'build'; province; place; type }` | `{ kind: 'upgrade'; province; place }` |
  `{ kind: 'upgradeCity'; province }` | `{ kind: 'recruit'; province; lot; type }` | `{ kind: 'colonize'; province }` |
  `{ kind: 'route'; a; b }` | `{ kind: 'trade'; to; give; get }` | `{ kind: 'law'; law }`.
  Na cópia: prédio pronto no nível novo; cidade no nível novo; batalhão existente (exército novo na cidade);
  província fundada (ligada se uma rota pronta a alcança); rota pronta; acordo de comércio assinado; lei decretada.
- Memória: `previewCached(s, pm, n, action)` guarda por chave `<mês>|<eventCount>|<ação>`; o painel chama à vontade.

### Nos botões
- Linha "por mês:" abaixo do custo com os recursos cuja variação é ≥ 0,1 (verde/vermelho, com ícone).
- Dica (title) com cada recurso afetado: "⛓ Ferro: +4,0 → −2,0/mês ⚠ acaba em 15 meses" (aviso quando o saldo depois
  é negativo).
- Vale para: construir/melhorar prédio, melhorar cidade, recrutar, colonizar, prévia da rota, formulário de comércio,
  leis. Também nos botões desabilitados.

## 3. Alertas
### `src/sim/alerts.ts`
`alerts(s, pm, n): Alert[]`, `Alert = { kind; severity: 'red' | 'amber'; text; hint; target: { province?: number; army?: number } }`:
| kind | Condição | Texto — sugestão |
|---|---|---|
| `stalled` | fábrica em `stalled` na conta do mês | "<Fábrica> de <prov> parada: falta <recurso>" — "explore um veio de <recurso> ou compre <recurso> (Comércio)"; sem rota: "trace uma rota até a capital (R)"; greve: "espere a greve acabar ou reprima" |
| `running-out` | saldo < 0 e estoque ÷ déficit ≤ 6 | "<Recurso> acaba em N meses" — grãos: "fazendas ou Racionamento"; dinheiro: "mercados ou menos tropas"; outros: "explore um veio ou compre (Comércio)" (âmbar; vermelho se ≤ 2) |
| `money-negative` | dinheiro + 3 × saldo < 0 | "Dinheiro negativo em N meses — batalhões serão dispersos" — "corte tropas ou aumente impostos (Mercados)" (vermelho) |
| `famine` | `grainShort` | "Sem grãos: impostos pela metade e estabilidade −25" — "fazendas ou Racionamento" (vermelho) |
| `disconnected` | cidade da nação com `connected` falso | "<prov> desligada da capital" — "trace uma rota (R)" (âmbar) |
| `unsupplied` | exército da nação com `supplied` falso | "<exército> sem suprimento" — "abasteça (linha) ou volte ao território" (âmbar) |
| `revolt` / `strike` | registro ativo | "Revolta em <prov>: N batalhões rebeldes" — "derrote-os em N meses" (vermelho) / "Greve em <prov>" — "espere N meses ou reprima" (âmbar) |
| `cap` | batalhões + treino ≥ teto e há Guarnição livre de treino | "Teto de batalhões" — "erga ou melhore Guarnições" (âmbar) |

### Na tela
Faixa abaixo da barra superior: ícones agrupados por tipo com contador; hover lista os alertas do grupo; clique num
alerta centraliza o alvo e abre o painel dele; "✕" silencia o tipo até ele acontecer de novo depois de resolvido.
Recalculada no máximo 2×/s, reaproveitando a conta do mês da barra.

## 4. Barra, painel da província e primeiros passos
- Barra superior em faixa única: esquerda dinheiro + básicos (🌾 🪵 ⚫ ⛓) + avançados (⚙ 🔫), cada um com estoque e,
  abaixo, saldo mensal colorido com seta (▲ ▼ ▬); centro ⚔ batalhões/teto e ☮ estabilidade; direita 📒 Contas ·
  Nações · ✉ Cartas · Leis · 📰 Jornal · data · velocidades. A caixa da semente/dificuldade fica abaixo; depois de
  fundar a capital encolhe para "Semente <n> · Novo mundo".
- Painel da província: "Esta província por mês" no topo (do `byProvince`); seções recolhíveis (Cidade, Rotas, Lotes,
  Veios, Estabilidade) com o estado lembrado no navegador; custo e "por mês" em linha própria; motivo de recusa em
  cinza menor abaixo do botão.
- Primeiros passos: cartão no canto inferior esquerdo com 6 passos que se marcam sozinhos (capital fundada; um veio
  explorado; uma colonização iniciada; uma rota traçada; um batalhão treinado; Contas aberto); "Pular dicas" lembrado
  no navegador.

## Testes
- Sim: histórico de 24 meses (JSON, 1× = 8×); `runMonth` com "Comércio" e "Pão e circo" e projeção igual ao aplicado;
  `byProvince` soma o total da categoria; `previewMonth` (siderúrgica, recrutar, colonizar; estado real intacto;
  memória); cada alerta na condição certa e some quando ela acaba; textos e sugestões.
- Cliente: "acaba em N meses" e seta; passos de primeiros passos.
- Navegador: Contas expandido até a província; prévia de siderúrgica; alerta clicado leva à província; barra sem
  sobreposição em 1400 px e 1920 px; primeiros passos; capturas.
- Desempenho: painel da província com prévias < 30 ms na primeira vez, instantâneo com memória.

## Fora do escopo
Pele couro/latão, mapa por era (fuligem, ferrovias, trincheiras), áudio, tutorial interativo guiado.
