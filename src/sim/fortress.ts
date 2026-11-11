import type { ProvinceMap } from '../worldgen/provinces';
import { makeRng, subSeed } from '../worldgen/rng';
import { FORTRESS, TROOPS, type TroopType } from './balance';
import { found, logEvent, type Army, type GameState } from './state';
import { inBattle, spawnArmy } from './armies';


/** Saltos no grafo de províncias até a capital sugerida mais próxima (Infinity se não há caminho por terra). */
export function capitalHops(pm: ProvinceMap): number[] {
  const hops = pm.provinces.map(() => Infinity), queue = [...pm.suggestedCapitals];
  for (const c of queue) hops[c] = 0;
  for (let i = 0; i < queue.length; i++) for (const n of pm.provinces[queue[i]].neighbors)
    if (hops[n] === Infinity) { hops[n] = hops[queue[i]] + 1; queue.push(n); }
  return hops;
}

/** A guarnição da fortaleza é um exército neutro parado na cidade, com os batalhões da composição. */
function spawnGarrison(s: GameState, pm: ProvinceMap, province: number, garrison: TroopType[]): Army {
  const site = pm.provinces[province].city;
  return spawnArmy(s, -1, garrison, site.x, site.y, province);
}

export function addFortress(s: GameState, pm: ProvinceMap, province: number, garrison: TroopType[]): void {
  s.fortresses.push({ province, garrison, lastCombat: 0 });
  spawnGarrison(s, pm, province, garrison);
}

/** Fortalezas neutras: fora das capitais sugeridas e das vizinhas delas; mais fortes quanto mais longe do início. */
export function placeFortresses(s: GameState, pm: ProvinceMap, seed: number): void {
  const hops = capitalHops(pm), rng = makeRng(subSeed(seed, 'fortress'));
  const withSites = pm.provinces.filter(p => p.lots.length > 0);
  const candidates = withSites.filter(p => hops[p.id] >= 2 && hops[p.id] < Infinity).map(p => p.id);
  for (let i = candidates.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [candidates[i], candidates[j]] = [candidates[j], candidates[i]]; }
  for (const id of candidates.slice(0, Math.round(FORTRESS.share * withSites.length))) {
    const h = hops[id], n = Math.min(FORTRESS.max, 2 * (h - 1)), archers = Math.floor(n / 3); // um terço de artilharia a partir de 3 tropas
    addFortress(s, pm, id, Array.from({ length: n }, (_, i): TroopType => (i >= n - archers ? 'artillery' : 'line')));
  }
}

/** Combate recente, conquista e recomposição das fortalezas. */
export function fortressStep(s: GameState, pm: ProvinceMap): void {
  const byHome = new Map<number, Army>();
  for (const a of s.armies) if (a.owner === -1) byHome.set(a.home, a);
  for (const f of [...s.fortresses]) {
    const army = byHome.get(f.province);
    if (!army) {
      s.fortresses.splice(s.fortresses.indexOf(f), 1);
      found(s, f.province);
      logEvent(s, `Fortaleza de ${pm.provinces[f.province].name} conquistada`);
    } else if (inBattle(s, army.id)) f.lastCombat = s.clock;
    else if (s.clock - f.lastCombat >= FORTRESS.regenMonths && (army.battalions.length < f.garrison.length || army.battalions.some(b => b.soldiers < TROOPS[b.type].soldiers))) {
      army.battalions = f.garrison.map(type => ({ type, soldiers: TROOPS[type].soldiers })); // recompõe no mesmo exército
    }
  }
}
