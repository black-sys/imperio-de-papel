import type { ProvinceMap } from '../worldgen/provinces';
import { AI_DIPLO, DIPLO, PRICE, RES_KEYS } from './balance';
import { fall } from './conquest';
import { runMonth } from './economy';
import { logEvent, type GameState, type Pact, type PactKind, type Proposal } from './state';

/** Relação entre duas nações (−100 a 100); 0 para quem não tem linha (nação criada à mão). */
export const relation = (s: GameState, a: number, b: number) => s.relations[a]?.[b] ?? 0;

/** Soma `delta` à relação do par, dos dois lados, limitada a ±100. */
export function relate(s: GameState, a: number, b: number, delta: number): void {
  if (a === b || a < 0 || b < 0 || !s.relations[a] || !s.relations[b]) return;
  const v = Math.max(-100, Math.min(100, relation(s, a, b) + delta));
  s.relations[a][b] = v; s.relations[b][a] = v;
}

export function relationLabel(v: number): string {
  return v >= 50 ? 'amistosa' : v >= 15 ? 'cordial' : v > -15 ? 'neutra' : v >= -50 ? 'fria' : 'hostil';
}

const pair = (p: Pact, a: number, b: number) => (p.a === a && p.b === b) || (p.a === b && p.b === a);
export const pactBetween = (s: GameState, a: number, b: number, kind: PactKind) => s.pacts.find(p => p.kind === kind && pair(p, a, b));
/** Aliados de `n`. */
export const alliesOf = (s: GameState, n: number) => s.pacts.filter(p => p.kind === 'alliance' && (p.a === n || p.b === n)).map(p => (p.a === n ? p.b : p.a));

export function addPact(s: GameState, kind: PactKind, a: number, b: number, until: number | null, trade?: Pact['trade']): Pact {
  const p: Pact = { id: s.nextPactId++, kind, a, b, until, missed: 0, ...(trade ? { trade } : {}) };
  s.pacts.push(p);
  return p;
}
export function endPact(s: GameState, p: Pact): void { s.pacts = s.pacts.filter(x => x !== p); }

export const warKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
export const KIND_LABEL: Record<Proposal['kind'] | PactKind, string> = { peace: 'paz', truce: 'trégua', nonaggression: 'não agressão', trade: 'comércio', alliance: 'aliança' };

type Result = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };
const battalions = (s: GameState, n: number) => s.armies.reduce((k, a) => k + (a.owner === n ? a.battalions.length : 0), 0);
const atWar = (s: GameState, a: number, b: number) => !!s.nations[a]?.atWar.includes(b);
const human = (s: GameState, n: number) => !!s.nations[n] && !s.nations[n].ai;

/**
 * Vale a proposta de `from` a `to`? `fresh` (a proposta está saindo agora) também recusa repetir uma do jogador ainda
 * sem resposta. Revalidada ao assinar: o mundo pode ter mudado desde a carta.
 */
export function checkPropose(s: GameState, pm: ProvinceMap, from: number, to: number, p: Proposal, fresh = true): Result {
  const a = s.nations[from], b = s.nations[to];
  if (!a?.alive || !b?.alive || from === to) return no('Nação inválida');
  if (fresh && human(s, from) && s.pending.some(x => x.to === to && x.proposal.kind === p.kind)) return no('Proposta já enviada');
  if (p.kind === 'peace') {
    if (!atWar(s, from, to)) return no('Só há paz para quem está em guerra');
    for (const id of p.cede) {
      const o = s.owner[id], occ = s.occupations.find(e => e.province === id);
      if ((o !== from && o !== to) || !occ || occ.nation !== (o === from ? to : from)) return no('Província não ocupada por quem a recebe');
    }
    if ((p.payer !== from && p.payer !== to) || !Number.isFinite(p.money) || p.money < 0) return no('Indenização inválida');
    if (p.money > s.nations[p.payer].res.money) return no('Indenização acima do estoque');
    return OK;
  }
  if (atWar(s, from, to)) return no('Em guerra: proponha paz primeiro');
  if (pactBetween(s, from, to, p.kind)) return no(`Já há um acordo de ${KIND_LABEL[p.kind]}`);
  if (p.kind === 'trade') {
    for (const [k, q] of [p.give, p.get]) {
      if (!(RES_KEYS as readonly string[]).includes(k)) return no('Recurso inválido');
      if (!Number.isInteger(q) || q < 1 || q > DIPLO.maxQty) return no('Quantidade inválida');
    }
  }
  return OK;
}

/** Vantagem de `a` na guerra contra `b` (positiva = ganhando): força, províncias ocupadas, menos o cansaço. */
export function advantage(s: GameState, pm: ProvinceMap, a: number, b: number): number {
  const x = battalions(s, a), y = battalions(s, b);
  const occ = s.occupations.reduce((k, e) => k + (e.nation === a && s.owner[e.province] === b ? 1 : e.nation === b && s.owner[e.province] === a ? -1 : 0), 0);
  const since = s.warSince[warKey(a, b)] ?? s.month, tired = AI_DIPLO.exhaustionPer12 * Math.floor((s.month - since) / 12);
  void pm;
  return (x - y) / Math.max(1, x + y) + AI_DIPLO.provinceWeight * occ - tired;
}

/** A nação `n` aceita a proposta de `from`? Relação + interesse + inclinação; a recusa traz o motivo principal. */
export function evaluate(s: GameState, pm: ProvinceMap, n: number, from: number, p: Proposal): Result {
  const me = s.nations[n], rel = relation(s, n, from), mine = battalions(s, n), theirs = battalions(s, from);
  if (p.kind === 'nonaggression') {
    if (rel <= -15) return no('Não confiamos em vocês');
    let score = rel + AI_DIPLO.napBent[me.bent];
    if (theirs > mine) score += AI_DIPLO.napInterest;
    if (mine >= AI_DIPLO.strongRatio * Math.max(1, theirs) && me.bent !== 'industrial') score -= AI_DIPLO.napInterest;
    return score >= 0 ? OK : no('Não precisamos disso');
  }
  if (p.kind === 'trade') {
    if (rel <= -50) return no('Não negociamos com vocês');
    const net = runMonth(s, pm, false, n).net, [gk, gq] = p.get, [rk, rq] = p.give; // ela entrega `get`, recebe `give`
    if (me.res[gk] < gq && net[gk] < gq) return no('Não temos esse recurso');
    const received = PRICE[rk] * rq * (net[rk] <= 0 ? AI_DIPLO.shortBonus : 1), given = PRICE[gk] * gq;
    return received >= (me.bent === 'industrial' ? AI_DIPLO.tradeRatioIndustrial : AI_DIPLO.tradeRatio) * given - 1e-9 ? OK : no('Troca desvantajosa');
  }
  if (p.kind === 'alliance') {
    const common = me.atWar.some(x => s.nations[from].atWar.includes(x));
    const threat = s.nations.some(o => o.alive && o.id !== n && o.id !== from && borders(s, pm, n, o.id) && battalions(s, o.id) >= AI_DIPLO.strongRatio * Math.max(1, mine));
    return rel >= AI_DIPLO.allyRelation && (common || threat) ? OK : no('Ainda não somos tão próximos');
  }
  // paz: perdendo (Militarista precisa perder mais) aceita ceder e pagar até 30% do dinheiro; senão os termos precisam compensar a vantagem
  const adv = advantage(s, pm, n, from), losing = adv < (me.bent === 'militarist' ? AI_DIPLO.peaceLosing : 0);
  const moneyTo = p.payer === from ? p.money : -p.money;
  const provinces = p.cede.reduce((k, id) => k + (s.owner[id] === from ? 1 : -1), 0);
  if (losing) return p.payer === n && p.money > AI_DIPLO.indemnityShare * me.res.money ? no('Termos inaceitáveis') : OK;
  const value = AI_DIPLO.provinceWeight * provinces + moneyTo / Math.max(50, me.res.money);
  if (value >= adv - 1e-9) return OK;
  return no(value <= 0 ? 'Estamos vencendo' : 'Termos inaceitáveis');
}

/** As duas nações têm províncias vizinhas? */
function borders(s: GameState, pm: ProvinceMap, a: number, b: number): boolean {
  return s.owner.some((o, id) => o === a && pm.provinces[id].neighbors.some(q => s.owner[q] === b));
}

/** Assina o acordo entre `a` (quem propôs) e `b`, revalidando os termos. */
export function sign(s: GameState, pm: ProvinceMap, a: number, b: number, p: Proposal): Result {
  const chk = checkPropose(s, pm, a, b, p, false);
  if (!chk.ok) return chk;
  const A = s.nations[a], B = s.nations[b];
  if (p.kind === 'peace') {
    A.atWar = A.atWar.filter(x => x !== b); B.atWar = B.atWar.filter(x => x !== a);
    delete s.warSince[warKey(a, b)];
    for (const id of p.cede) { const occ = s.occupations.find(e => e.province === id)!; fall(s, pm, id, occ.nation, false); }
    const other = p.payer === a ? B : A;
    s.nations[p.payer].res.money -= p.money; other.res.money += p.money;
    addPact(s, 'truce', a, b, s.month + DIPLO.months);
    relate(s, a, b, DIPLO.events.peace);
    logEvent(s, `Paz entre a ${A.name} e a ${B.name}`);
    return OK;
  }
  addPact(s, p.kind, a, b, p.kind === 'alliance' ? null : s.month + DIPLO.months, p.kind === 'trade' ? { aGives: p.give, bGives: p.get } : undefined);
  if (human(s, a) || human(s, b)) logEvent(s, `Acordo de ${KIND_LABEL[p.kind]} entre a ${A.name} e a ${B.name}`);
  return OK;
}

/** Envia a proposta: ao jogador vira carta; do jogador, resposta no mês seguinte; entre rivais, resolve na hora. */
export function propose(s: GameState, pm: ProvinceMap, from: number, to: number, p: Proposal): Result {
  const chk = checkPropose(s, pm, from, to, p);
  if (!chk.ok) return chk;
  if (human(s, to)) {
    s.letters.push({ id: s.nextLetterId++, from, proposal: p, expires: s.month + DIPLO.letterMonths });
    logEvent(s, `Carta da ${s.nations[from].name}: proposta de ${KIND_LABEL[p.kind]}`);
    return OK;
  }
  if (human(s, from)) { s.pending.push({ to, proposal: p, answerAt: Math.floor(s.month + 1e-9) + 1 }); return OK; }
  const r = evaluate(s, pm, to, from, p);
  return r.ok ? sign(s, pm, from, to, p) : r;
}

/** Resposta do jogador a uma carta. */
export function answerLetter(s: GameState, pm: ProvinceMap, id: number, accept: boolean): Result {
  const l = s.letters.find(x => x.id === id);
  if (!l) return no('Carta inválida');
  s.letters = s.letters.filter(x => x !== l);
  return accept ? sign(s, pm, l.from, 0, l.proposal) : OK;
}

export function leaveAlliance(s: GameState, n: number, other: number): Result {
  const p = pactBetween(s, n, other, 'alliance');
  if (!p) return no('Não há aliança');
  endPact(s, p);
  relate(s, n, other, DIPLO.events.leave);
  if (human(s, n) || human(s, other)) logEvent(s, `Aliança entre a ${s.nations[n].name} e a ${s.nations[other].name} desfeita`);
  return OK;
}

/** Virada do mês: relação, trocas do comércio, acordos vencidos, cartas expiradas e respostas às propostas do jogador. */
export function diplomacyMonth(s: GameState, pm: ProvinceMap): void {
  const alive = s.nations.filter(n => n.alive), M = DIPLO.monthly;
  // relação: guerra, pactos, inimigo em comum; fronteira sem pacto desgasta
  for (const a of alive) for (const b of alive) {
    if (b.id <= a.id) continue;
    let d = 0;
    if (a.atWar.includes(b.id)) d += M.war;
    else {
      const pacts = s.pacts.filter(p => (p.a === a.id && p.b === b.id) || (p.a === b.id && p.b === a.id));
      for (const p of pacts) d += p.kind === 'trade' ? M.trade : p.kind === 'alliance' ? M.alliance : M.pact;
      if (!pacts.length && borders(s, pm, a.id, b.id)) d += M.border;
      if (a.atWar.some(x => b.atWar.includes(x))) d += M.commonFoe;
    }
    if (d) relate(s, a.id, b.id, d);
  }
  const mine = (p: Pact) => human(s, p.a) || human(s, p.b), other = (p: Pact) => s.nations[human(s, p.a) ? p.b : p.a].name;
  // comércio: cada lado entrega o que tiver do combinado; faltas seguidas rompem
  for (const p of s.pacts.filter(x => x.kind === 'trade' && x.trade)) {
    let short = false;
    for (const [from, to, [k, q]] of [[p.a, p.b, p.trade!.aGives], [p.b, p.a, p.trade!.bGives]] as const) {
      const give = Math.min(q, Math.max(0, s.nations[from].res[k]));
      if (give < q - 1e-9) short = true;
      s.nations[from].res[k] -= give; s.nations[to].res[k] += give;
    }
    p.missed = short ? p.missed + 1 : 0;
    if (p.missed < DIPLO.tradeMissMax) continue;
    endPact(s, p);
    relate(s, p.a, p.b, DIPLO.events.tradeBroken);
    if (mine(p)) logEvent(s, `Comércio com a ${other(p)} rompido: entregas em falta`);
  }
  // acordos com prazo vencido
  for (const p of s.pacts.filter(x => x.until !== null && x.until <= s.month + 1e-9)) {
    endPact(s, p);
    if (mine(p)) logEvent(s, `Acordo de ${KIND_LABEL[p.kind]} com a ${other(p)} venceu`);
  }
  s.letters = s.letters.filter(l => l.expires > s.month + 1e-9);
  // respostas às propostas do jogador
  const player = s.nations.find(n => n.alive && !n.ai);
  for (const q of s.pending.filter(x => x.answerAt <= s.month + 1e-9)) {
    s.pending = s.pending.filter(x => x !== q);
    if (!player) continue;
    const name = s.nations[q.to].name, r = evaluate(s, pm, q.to, player.id, q.proposal);
    const done = r.ok ? sign(s, pm, player.id, q.to, q.proposal) : r;
    logEvent(s, done.ok ? `A ${name} aceitou: ${KIND_LABEL[q.proposal.kind]}` : `A ${name} recusou: ${done.reason}`);
  }
}
