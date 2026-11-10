import type { ProvinceMap } from '../worldgen/provinces';
import { makeRng, subSeed } from '../worldgen/rng';
import { FORTRESS, TROOPS, type TroopType } from './balance';
import { logEvent, type GameState } from './state';
import { inBattle, spawnTroop } from './troops';

const SPOTS = [[0, 3], [3, 0], [-3, 0], [0, -3]];

/** Saltos no grafo de províncias até a capital sugerida mais próxima (Infinity se não há caminho por terra). */
export function capitalHops(pm: ProvinceMap): number[] {
  const hops = pm.provinces.map(() => Infinity), queue = [...pm.suggestedCapitals];
  for (const c of queue) hops[c] = 0;
  for (let i = 0; i < queue.length; i++) for (const n of pm.provinces[queue[i]].neighbors)
    if (hops[n] === Infinity) { hops[n] = hops[queue[i]] + 1; queue.push(n); }
  return hops;
}

function spawnGarrison(s: GameState, pm: ProvinceMap, province: number, garrison: TroopType[]): void {
  const site = pm.provinces[province].sites[0];
  garrison.forEach((type, i) => spawnTroop(s, -1, type, site.x + SPOTS[i % 4][0], site.y + SPOTS[i % 4][1], province));
}

export function addFortress(s: GameState, pm: ProvinceMap, province: number, garrison: TroopType[]): void {
  s.fortresses.push({ province, garrison, lastCombat: 0 });
  spawnGarrison(s, pm, province, garrison);
}

/** Fortalezas neutras: fora das capitais sugeridas e das vizinhas delas; mais fortes quanto mais longe do início. */
export function placeFortresses(s: GameState, pm: ProvinceMap, seed: number): void {
  const hops = capitalHops(pm), rng = makeRng(subSeed(seed, 'fortress'));
  const withSites = pm.provinces.filter(p => p.sites.length > 0);
  const candidates = withSites.filter(p => hops[p.id] >= 2 && hops[p.id] < Infinity).map(p => p.id);
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  for (const id of candidates.slice(0, Math.round(FORTRESS.share * withSites.length))) {
    const h = hops[id], n = Math.min(4, 1 + Math.floor((h - 2) / 3)), archers = h >= 11 ? 2 : h >= 8 ? 1 : 0;
    addFortress(s, pm, id, Array.from({ length: n }, (_, i): TroopType => (i >= n - archers ? 'archer' : 'spear')));
  }
}

/** Combate recente, conquista e recomposição das fortalezas. */
export function fortressStep(s: GameState, pm: ProvinceMap): void {
  for (const f of [...s.fortresses]) {
    const alive = s.troops.filter(t => t.owner === -1 && t.home === f.province);
    if (alive.length === 0) {
      s.fortresses.splice(s.fortresses.indexOf(f), 1);
      s.owner[f.province] = 0;
      s.buildings[f.province][0] = { type: 'village', level: 1, remaining: 0 };
      logEvent(s, `Fortaleza de ${pm.provinces[f.province].name} conquistada`);
    } else if (alive.some(t => inBattle(s, t.id))) f.lastCombat = s.clock;
    else if (s.clock - f.lastCombat >= FORTRESS.regenMonths && (alive.length < f.garrison.length || alive.some(t => t.soldiers < TROOPS[t.type].soldiers))) {
      s.troops = s.troops.filter(t => !alive.includes(t));
      spawnGarrison(s, pm, f.province, f.garrison);
    }
  }
}
