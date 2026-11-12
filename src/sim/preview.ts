import type { ProvinceMap } from '../worldgen/provinces';
import { RES_KEYS, type BuildingType, type Res, type TroopType } from './balance';
import type { Place } from './commands';
import { addPact } from './diplomacy';
import { runMonth } from './economy';
import { recomputeConnected } from './routes';
import { spawnArmy } from './armies';
import { found, type GameState, type LawKind } from './state';

/** Uma ação do jogador cujo efeito no saldo mensal o painel mostra antes de ela ser feita. */
export type Action =
  | { kind: 'build'; province: number; place: Place; type: BuildingType }
  | { kind: 'upgrade'; province: number; place: Place }
  | { kind: 'upgradeCity'; province: number }
  | { kind: 'recruit'; province: number; lot: number; type: TroopType }
  | { kind: 'colonize'; province: number }
  | { kind: 'route'; a: number; b: number }
  | { kind: 'trade'; to: number; give: [keyof Res, number]; get: [keyof Res, number] }
  | { kind: 'law'; law: LawKind };

/** Aplica a ação numa cópia do estado como se já estivesse pronta (sem pagar nada nem conferir regras). */
function apply(c: GameState, pm: ProvinceMap, n: number, a: Action): void {
  const slot = (id: number, place: Place) => ('lot' in place ? [c.lots[id], place.lot] : [c.veins[id], place.vein]) as [(GameState['lots'][0][0])[], number];
  if (a.kind === 'build') { const [list, i] = slot(a.province, a.place); list[i] = { type: a.type, level: 1, remaining: 0 }; }
  else if (a.kind === 'upgrade') { const [list, i] = slot(a.province, a.place), b = list[i]; if (b) list[i] = { ...b, level: Math.min(3, b.level + 1), remaining: 0 }; }
  else if (a.kind === 'upgradeCity') { const ct = c.city[a.province]; if (ct) c.city[a.province] = { level: Math.min(3, ct.level + 1), remaining: 0 }; }
  else if (a.kind === 'recruit') { const p = pm.provinces[a.province].city; spawnArmy(c, n, [a.type], p.x, p.y); }
  else if (a.kind === 'colonize') found(c, a.province, n);
  else if (a.kind === 'route') { c.routes.push({ id: c.nextRouteId++, owner: n, a: a.a, b: a.b, path: [], remaining: 0, cut: false }); recomputeConnected(c); }
  else if (a.kind === 'trade') addPact(c, 'trade', n, a.to, null, { aGives: a.give, bGives: a.get });
  else if (!c.nations[n].laws.includes(a.law)) c.nations[n].laws.push(a.law);
}

/** Saldo mensal da nação antes e depois da ação (a ação é feita numa cópia: o estado real não muda). */
export function previewMonth(s: GameState, pm: ProvinceMap, n: number, a: Action): { before: Res; after: Res } {
  const before = runMonth(s, pm, false, n).net;
  if (!s.nations[n]?.alive) return { before, after: { ...before } };
  const c = structuredClone(s);
  apply(c, pm, n, a);
  return { before, after: runMonth(c, pm, false, n).net };
}

// memória por estado: a mesma ação no mesmo mês, com o mesmo estoque, não é recalculada (o painel se refaz várias vezes por segundo)
const cache = new WeakMap<GameState, { key: string; map: Map<string, { before: Res; after: Res }> }>();
export function previewCached(s: GameState, pm: ProvinceMap, n: number, a: Action): { before: Res; after: Res } {
  const res = s.nations[n]?.res, key = `${s.month}|${s.eventCount}|${res ? RES_KEYS.map(k => Math.floor(res[k])).join(',') : ''}`;
  let hit = cache.get(s);
  if (!hit || hit.key !== key) cache.set(s, hit = { key, map: new Map() });
  const id = `${n}|${JSON.stringify(a)}`;
  let r = hit.map.get(id);
  if (!r) hit.map.set(id, r = previewMonth(s, pm, n, a));
  return r;
}
