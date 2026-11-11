import { DIPLO } from './balance';
import type { GameState, Pact, PactKind } from './state';

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
