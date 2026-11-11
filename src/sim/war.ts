import type { ProvinceMap } from '../worldgen/provinces';
import { makeRng, subSeed } from '../worldgen/rng';
import { WAR } from './balance';
import { logEvent, type GameState } from './state';

type Result = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Result => ({ ok: false, reason });

/** Donos que se enfrentam: fortaleza (−1) contra todos; nações só em guerra. */
export function hostile(s: GameState, a: number, b: number): boolean {
  if (a === b) return false;
  if (a === -1 || b === -1) return true;
  return !!s.nations[a]?.atWar.includes(b);
}

/** `n` declara guerra a `target`: guerra dos dois lados, permanente neste ciclo; contra o jogador o jogo pausa. */
export function declareWar(s: GameState, n: number, target: number, pm?: ProvinceMap): Result {
  const a = s.nations[n], b = s.nations[target];
  if (!a?.alive || !b?.alive) return no('Nação inválida');
  if (n === target) return no('Não pode declarar guerra a si mesma');
  if (a.atWar.includes(target)) return no('Já em guerra');
  a.atWar.push(target);
  b.atWar.push(n);
  logEvent(s, `A ${a.name} declarou guerra à ${b.name}`);
  if (target === 0 && !b.ai) s.speed = 0; // pausa para o jogador humano ler o aviso
  void pm;
  return { ok: true };
}

const battalions = (s: GameState, n: number) => s.armies.reduce((k, a) => k + (a.owner === n ? a.battalions.length : 0), 0);

/** Sorteio mensal de um rival contra cada vizinho de fronteira (no máximo uma declaração por mês). */
export function aiWarRoll(s: GameState, pm: ProvinceMap, n: number): void {
  const me = s.nations[n];
  if (!me?.alive || me.bent === 'industrial' || s.month - me.founded < WAR.graceMonths) return;
  const border = new Set<number>();
  s.owner.forEach((o, id) => { if (o === n) for (const q of pm.provinces[id].neighbors) { const v = s.owner[q]; if (v >= 0 && v !== n) border.add(v); } });
  const mine = battalions(s, n);
  for (const v of [...border].sort((x, y) => x - y)) {
    if (!s.nations[v]?.alive || me.atWar.includes(v)) continue;
    const theirs = battalions(s, v);
    let p = 0;
    if (me.bent === 'militarist') p = WAR.militarist * (mine >= WAR.strongRatio * theirs ? WAR.strongMult : 1);
    else if (mine > theirs) p = WAR.expansionist;
    if (p > 0 && makeRng(subSeed(s.seed, `war:${n}:${s.month}:${v}`))() < p) { declareWar(s, n, v, pm); return; }
  }
}
