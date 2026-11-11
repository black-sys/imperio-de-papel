import { CELL } from '../worldgen/constants';
import type { ProvinceMap } from '../worldgen/provinces';
import { findCellPath } from './astar';
import { RES_NAMES, ROUTE, type Res } from './balance';
import { cellAt, type MoveGrid } from './movegrid';
import type { GameState, Route } from './state';

type Result = { ok: true } | { ok: false; reason: string };
const no = (reason: string) => ({ ok: false as const, reason });

/** Custo de traçado por célula: água e território de outro reino bloqueiam; perto de fortaleza encarece (desvia sozinho). */
export function routeGrid(s: GameState, pm: ProvinceMap, grid: MoveGrid, realm = 0): Uint8Array {
  const cost = new Uint8Array(grid.cost);
  for (let i = 0; i < cost.length; i++) { const p = pm.cellProvince[i]; if (p >= 0 && s.owner[p] !== realm && s.owner[p] !== -1) cost[i] = 0; }
  const r = Math.ceil(ROUTE.fortressAvoidTiles / CELL);
  for (const t of s.troops) {
    if (t.owner !== -1) continue;
    const c = cellAt(grid, t.x, t.y);
    if (c < 0) continue;
    const cx = c % grid.size, cy = Math.floor(c / grid.size);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= grid.size || y >= grid.size) continue;
      const i = y * grid.size + x;
      if (cost[i]) cost[i] = Math.min(255, cost[i] * ROUTE.fortressAvoidCost);
    }
  }
  return cost;
}

const cityCell = (pm: ProvinceMap, grid: MoveGrid, id: number) => cellAt(grid, pm.provinces[id].city.x, pm.provinces[id].city.y);
const mineCity = (s: GameState, id: number) => s.owner[id] === 0 && !!s.city[id];

/** Caminho, custo e tempo de uma rota entre as cidades de `a` e `b`, ou o motivo da recusa. */
export function planRoute(s: GameState, pm: ProvinceMap, grid: MoveGrid, a: number, b: number):
  { ok: true; path: number[]; cost: Partial<Res>; months: number } | { ok: false; reason: string } {
  if (a === b || !mineCity(s, a) || !mineCity(s, b)) return no('Escolha duas cidades suas');
  if (s.routes.some(r => (r.a === a && r.b === b) || (r.a === b && r.b === a))) return no('Já existe uma rota entre essas cidades');
  const from = cityCell(pm, grid, a), to = cityCell(pm, grid, b);
  const path = findCellPath({ ...grid, cost: routeGrid(s, pm, grid) }, from, to);
  if (!path) return no(findCellPath(grid, from, to) ? 'Atravessa território de outro reino' : 'Não há caminho por terra');
  let tiles = 0, money = 0, wood = 0;
  for (const c of path) { const k = grid.cost[c] >= 2 ? ROUTE.hardMult : 1; tiles += CELL; money += CELL * ROUTE.money * k; wood += CELL * ROUTE.wood * k; }
  return { ok: true, path, cost: { money, wood }, months: Math.max(ROUTE.minMonths, tiles / ROUTE.tilesPerMonth) };
}

export function checkRoute(s: GameState, pm: ProvinceMap, grid: MoveGrid, a: number, b: number): Result {
  const plan = planRoute(s, pm, grid, a, b);
  if (!plan.ok) return plan;
  for (const [k, v] of Object.entries(plan.cost) as [keyof Res, number][])
    if (s.res[k] < v) return no(`Falta ${Math.ceil(v - s.res[k])} de ${RES_NAMES[k]}`);
  return { ok: true };
}

export function buildRoute(s: GameState, pm: ProvinceMap, grid: MoveGrid, a: number, b: number): Result {
  const chk = checkRoute(s, pm, grid, a, b);
  if (!chk.ok) return chk;
  const plan = planRoute(s, pm, grid, a, b);
  if (!plan.ok) return plan;
  for (const [k, v] of Object.entries(plan.cost) as [keyof Res, number][]) s.res[k] -= v;
  s.routes.push({ id: s.nextRouteId++, a, b, path: plan.path, remaining: plan.months, cut: false });
  return { ok: true };
}

export function removeRoute(s: GameState, id: number): Result {
  const i = s.routes.findIndex(r => r.id === id);
  if (i < 0) return no('Rota inexistente');
  s.routes.splice(i, 1);
  return { ok: true };
}

// célula → ids das rotas que passam por ela; derivado do estado (fora do save), refeito quando as rotas mudam
const indexCache = new WeakMap<GameState, { sig: string; index: Map<number, number[]> }>();
export function routeIndex(s: GameState): Map<number, number[]> {
  const sig = s.routes.map(r => `${r.id}:${r.path.length}`).join(',');
  const hit = indexCache.get(s);
  if (hit && hit.sig === sig) return hit.index;
  const index = new Map<number, number[]>();
  for (const r of s.routes) for (const c of r.path) { const l = index.get(c); if (l) l.push(r.id); else index.set(c, [r.id]); }
  indexCache.set(s, { sig, index });
  return index;
}

/** Ligada = alcançável a partir da capital por rotas prontas e não cortadas. */
export function recomputeConnected(s: GameState): void {
  const on = s.owner.map(() => false);
  if (s.capital >= 0) {
    on[s.capital] = true;
    const ready = (r: Route) => r.remaining <= 0 && !r.cut && s.owner[r.a] === 0 && s.owner[r.b] === 0;
    for (const queue = [s.capital]; queue.length; ) {
      const p = queue.shift()!;
      for (const r of s.routes) {
        if (!ready(r)) continue;
        const q = r.a === p ? r.b : r.b === p ? r.a : -1;
        if (q >= 0 && !on[q]) { on[q] = true; queue.push(q); }
      }
    }
  }
  s.connected = on;
}

/** A cada passo fixo das tropas: cortes, ligação com a capital e entrega de depósitos. */
export function updateRoutes(s: GameState, _pm: ProvinceMap, _grid: MoveGrid): void {
  recomputeConnected(s);
}
