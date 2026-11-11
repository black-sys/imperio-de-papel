# Ciclo 5 — Diplomacia — Design

Data: 2026-11-11
Status: aprovado em conversa
Base: ciclos 1–4 na `main` (economia industrial, rotas, exércitos, nações rivais com IA e guerra por declaração).

## Objetivo
Acordos entre nações por documentos: paz com termos, trégua, não agressão, comércio e aliança defensiva. Uma relação
entre cada par de nações guarda a memória (pactos cumpridos e quebrados). A IA aceita, recusa e propõe pelo interesse,
pela relação e pela inclinação; a Industrial busca acordos. As propostas da IA chegam ao jogador como cartas.

## Decisões
| Tema | Decisão |
|---|---|
| Escopo | Paz (com termos), trégua, não agressão, comércio, aliança defensiva. Sabotagem, paz armada e cidades-estado ficam para depois |
| Decisão da IA | Relação (−100 a 100, com memória) + interesse do momento + inclinação |
| Propostas ao jogador | Cartas numa caixa (✉), expiram em 3 meses, sem pausar o jogo |
| Paz | Paz branca, cessão de províncias ocupadas (sem dano), indenização em dinheiro; trégua de 60 meses |
| Comércio | Sem rota física: troca mensal fixa entre estoques por 60 meses |
| Aliança | Defensiva, entrada automática; sem prazo; desfazer a qualquer hora |

## Regras (calibração inicial em `balance.ts`)
### Acordos (um de cada tipo por par de nações)
| Acordo | Duração | Efeito | Fim |
|---|---|---|---|
| Paz | — | Encerra a guerra entre as duas (aliados seguem em guerra até assinarem a deles); termos: paz branca, províncias que o vencedor ocupa agora passam a ele sem dano, indenização em dinheiro paga na hora | Cria trégua |
| Trégua | 60 meses | Ninguém declara guerra | Declarar mesmo assim é traição |
| Não agressão | 60 meses | Ninguém declara guerra | Declarar é traição |
| Comércio | 60 meses | Na virada do mês, `a` entrega `aGives` e `b` entrega `bGives` (ex.: 10 ferro ↔ 25 dinheiro); quem não tem entrega o que tiver | Guerra entre as duas cancela; 3 meses seguidos sem entregar tudo rompe (relação −10) |
| Aliança defensiva | Sem prazo | Quem declarar guerra a uma entra em guerra com as duas (evento) | Desfazer a qualquer hora (relação −30); declarar guerra ao aliado é recusado: "Desfaça a aliança antes" |

### Relação
`DIPLO.relation`: entre cada par, de −100 a 100, começa em 0, limitada nas pontas.
- Por mês: fronteira em comum sem pacto −1; em guerra −3; comércio ativo +2; aliança +2; não agressão ou trégua +1;
  inimigo em comum +1.
- Eventos: declarar guerra −30 (com o alvo); província tomada −20 (com quem perdeu); traição (declarar com trégua ou
  não agressão) −50 com a vítima e −25 com todas as outras vivas; desfazer aliança −30 (com o ex-aliado); comércio
  rompido por falta de entrega −10; paz assinada +10.
- Rótulos: ≥ 50 amistosa, ≥ 15 cordial, > −15 neutra, ≥ −50 fria, < −50 hostil.

### IA: aceitar
Nota = relação + interesse + inclinação; aceita com nota ≥ 0; a recusa traz o motivo principal.
- **Não agressão:** exige relação > −15. Interesse +20 se quem propõe é mais forte (batalhões); −20 se ela é ≥ 1,5×
  mais forte e não é Industrial. Inclinação: Industrial +25, Expansionista 0, Militarista −20. Motivos:
  "Não confiamos em vocês", "Não precisamos disso".
- **Comércio:** preços `PRICE = { money: 1, grain: 1, wood: 1, coal: 2, iron: 2, steel: 5, arms: 4 }`. Aceita se o
  valor recebido ≥ 0,9 × o valor entregue (Industrial 0,8), com +20% de valor quando o recurso recebido está em falta
  para ela (produção líquida ≤ 0). Precisa poder entregar: estoque ≥ quantidade ou produção mensal ≥ quantidade.
  Exige relação > −50. Motivos: "Troca desvantajosa", "Não temos esse recurso", "Não negociamos com vocês".
- **Aliança:** exige relação ≥ 40 e um inimigo em comum ou um vizinho de fronteira 1,5× mais forte que ela.
  Motivo: "Ainda não somos tão próximos".
- **Paz:** vantagem = (batalhões dela − deles) / (soma) + 0,1 × (províncias dela que o outro tomou ou ocupa −
  províncias do outro que ela tomou ou ocupa nesta guerra, com sinal a favor de quem ganha) − 0,1 por 12 meses de
  guerra (cansaço). Com vantagem < 0 aceita paz branca, ceder o que está ocupado e pagar até 30% do dinheiro; com
  vantagem ≥ 0 aceita se os termos a favorecem (recebe província ocupada ou indenização) proporcional à vantagem.
  Militarista: limiar −0,2 (precisa perder mais para ceder). Motivos: "Estamos vencendo", "Termos inaceitáveis".

### IA: propor
Uma vez por mês, cada rival faz no máximo uma proposta (sorteio determinístico pela semente quando houver várias):
- Todas: paz quando a vantagem < −0,2 ou depois de 48 meses de guerra sem vantagem > 0,2 (paz branca ou cedendo o
  ocupado); aliança com quem tem relação ≥ 50 e inimigo em comum.
- Industrial: comércio do recurso em que tem sobra (produção líquida > 0 e estoque ≥ 3 meses dela) pelo que lhe
  falta, em quantidades que passam na própria avaliação; não agressão com vizinhos de relação > −15.
- Expansionista: não agressão com vizinhos que não pretende atacar (relação > 0), 1 vez a cada 12 meses no máximo.
- Militarista: só paz e aliança.
Entre rivais a resposta é imediata. Ao jogador a proposta chega como carta.

### IA: declarar guerra
`aiWarRoll` passa a: não declarar com relação ≥ 15; chance ×2 com relação < −50; nunca contra aliado; com trégua ou
não agressão, só a Militarista com relação < −50 (e é traição).

## Arquitetura
### Estado (`src/sim/state.ts`)
```ts
type Proposal = { kind: 'peace'; cede: number[]; money: number; payer: number }
              | { kind: 'nonaggression' } | { kind: 'alliance' }
              | { kind: 'trade'; give: [keyof Res, number]; get: [keyof Res, number] };   // do ponto de vista de quem propõe
interface Pact { id; kind: 'truce' | 'nonaggression' | 'trade' | 'alliance'; a; b; until: number | null;
                 trade?: { aGives: [keyof Res, number]; bGives: [keyof Res, number] }; missed: number }
GameState: relations: number[][]          // [a][b] === [b][a]
           pacts: Pact[]; nextPactId
           letters: { id; from; proposal: Proposal; expires: number }[]   // caixa do jogador
           pending: { to; proposal: Proposal; answerAt: number }[]        // propostas do jogador aguardando resposta
           nextLetterId
```
Tudo serializável. `startGame` cria `relations` N×N com zeros.

### `src/sim/diplomacy.ts` (novo)
- `relate(s, a, b, delta)`; `relationLabel(v)`.
- `checkPropose(s, pm, from, to, p): Result` — recusas: "Nação inválida" (morta, inexistente, a si mesma);
  "Só há paz para quem está em guerra"; "Já há um acordo de <tipo>"; "Em guerra: proponha paz primeiro" (não agressão,
  comércio, aliança); comércio: "Recurso inválido", "Quantidade inválida" (inteiro 1–999); paz: "Província não ocupada
  por quem a recebe", "Indenização acima do estoque".
- `propose(s, pm, from, to, p): Result` — para rival resolve agora (rival→rival) ou no mês seguinte (jogador→rival, via
  `pending`); rival→jogador vira carta (expira em `DIPLO.letterMonths = 3`).
- `evaluate(s, pm, n, from, p): Result` — a nota acima.
- `sign(s, pm, a, b, p)` — aplica (paz: tira a guerra do par, cria trégua, transfere províncias por `fall(…, false)`,
  paga indenização; demais: cria o pacto); relação +10 na paz.
- `answerLetter(s, pm, id, accept): Result`; `leaveAlliance(s, n, other): Result`.
- `diplomacyMonth(s, pm)` na virada do mês: variação da relação, trocas de comércio (falta e rompimento), pactos vencidos,
  cartas expiradas, respostas pendentes, propostas da IA.

### Mudanças
- `war.ts`: `declareWar` — aliado → "Desfaça a aliança antes"; trégua/não agressão → traição (relações, fim do pacto,
  evento "A Nação de X traiu o pacto com a Nação de Y"); comércio do par cancelado; relação −30; aliados do alvo entram
  em guerra com quem declarou (evento). `aiWarRoll` com as regras de relação acima.
- `conquest.ts`: `fall(s, pm, province, n, damage = true)`; província tomada → relação −20.
- `tick.ts`: `diplomacyMonth` na virada do mês (depois das contas das nações).
- Eventos: acordos assinados, recusados (resposta ao jogador), rompidos, vencidos; traições de qualquer nação; aliado
  arrastado para guerra.

## Interface
- Barra superior: "✉ Cartas (n)" ao lado de "Nações".
- Painel de cartas: selo na cor da nação, remetente, texto da proposta ("propõe paz: cede Brenor e paga 120";
  "propõe comércio: 10 ferro por 25 dinheiro ao mês, por 5 anos"; "propõe um pacto de não agressão por 5 anos";
  "propõe uma aliança defensiva"), meses até expirar, "Aceitar" / "Recusar".
- Painel da nação (lista Nações e província rival): relação ("Cordial · +22"), acordos em vigor com o tempo que falta,
  botões "Propor paz…", "Não agressão", "Comércio…", "Aliança", "Desfazer aliança", "Declarar guerra" — desabilitados
  com o motivo de `checkPropose`. A confirmação de "Declarar guerra" avisa traição ("Há um pacto de não agressão:
  todas as nações vão lembrar.").
- "Propor paz…": formulário no painel — províncias ocupadas a exigir (as que você ocupa) ou ceder (as que eles ocupam),
  indenização (valor; o sentido define quem paga), "Enviar".
- "Comércio…": "Damos [recurso] [qtd] · Recebemos [recurso] [qtd]", com sua produção mensal e o estoque deles como
  referência; "Enviar".
- Lista Nações: relação e ícones dos acordos (🕊 trégua/não agressão, ⚖ comércio, 🤝 aliança).
- Mensagens: respostas às suas propostas ("A Nação de X aceitou o comércio" / "recusou: Troca desvantajosa"),
  carta nova ("Carta da Nação de X: proposta de comércio"), acordos rompidos e vencidos, traições, aliado arrastado.

## Testes
- Relação: começa em 0; variações mensais e por evento; limites; rótulos.
- Propostas: cada recusa de `checkPropose`; ao jogador vira carta e expira em 3 meses; do jogador, resposta no mês
  seguinte; entre rivais, imediata.
- Paz: acaba a guerra só do par; trégua de 60 meses; províncias cedidas sem perder nível; indenização paga.
- Não agressão e trégua: declarar é traição (relações, fim do pacto); vencem em 60 meses.
- Comércio: troca na virada; falta entrega o que tem; 3 meses sem entregar rompe (−10); guerra cancela; vence em 60.
- Aliança: declarar ao aliado é recusado; declarar a quem tem aliado arrasta o aliado; desfazer −30.
- Avaliação: Industrial aceita não agressão com relação neutra; Militarista 1,5× mais forte recusa; comércio aceito a
  partir de 0,9 (Industrial 0,8) e recusado sem estoque/produção; paz: quem perde aceita branca, quem ganha recusa;
  cansaço faz aceitar depois de 48 meses.
- IA propõe: Industrial oferece comércio de sobra por falta; quem perde oferece paz; no máximo uma por mês por nação.
- `aiWarRoll`: não declara com relação ≥ 15 nem contra aliado.
- Partida: 5 nações, 600 meses, 4 sementes sem exceção; comércio e pelo menos uma paz acontecem na média.
- Determinismo 1× = 8×; JSON de ida e volta com relações, pactos, cartas e pendências.
- Ritmo: alvos atuais.
- Navegador (headless): carta da IA aceita e comércio rodando; não agressão proposta e respondida; paz com província
  cedida; aliança arrasta o aliado; aviso de traição.

## Fora do escopo
Sabotagem, paz armada, cidades-estado, alianças ofensivas, embargos, vassalagem. Estabilidade (ciclo 6).
