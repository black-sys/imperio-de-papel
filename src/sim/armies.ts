import type { ProvinceMap } from '../worldgen/provinces';
import { CELL } from '../worldgen/constants';
import { battleStep } from './battle';
import { fortressStep } from './fortress';
import { updateRoutes, updateSupply } from './routes';
import { REFILL, TROOPS, TROOP_CAP, type TroopType } from './balance';
import { cellAt, type MoveGrid } from './movegrid';
import { activeLevel, type Army, type Battalion, type GameState } from './state';

/** Batalhões que o reino sustenta: soma das guarnições do jogador (em melhoria vale o nível anterior). */
export function armyCap(s: GameState): number {
  let cap = 0;
  s.owner.forEach((o, id) => { if (o === 0) for (const b of s.lots[id]) if (b?.type === 'garrison') cap += TROOP_CAP[activeLevel(b)]; });
  return cap;
}

/** Batalhões de um dono (vivos). */
export const battalionCount = (s: GameState, owner = 0) => s.armies.reduce((n, a) => n + (a.owner === owner ? a.battalions.length : 0), 0);
/** Homens do exército. */
export const men = (a: Army) => a.battalions.reduce((n, b) => n + b.soldiers, 0);
/** Velocidade do batalhão mais lento (tiles/mês). */
export const armySpeed = (a: Army) => Math.min(...a.battalions.map(b => TROOPS[b.type].speed));

export function spawnArmy(s: GameState, owner: number, battalions: (Battalion | TroopType)[], x: number, y: number, home = -1, name?: string): Army {
  const bats = battalions.map(b => (typeof b === 'string' ? { type: b, soldiers: TROOPS[b].soldiers } : { ...b }));
  const a: Army = {
    id: s.nextArmyId++, owner, battalions: bats, x, y, path: [], morale: 1, routedUntil: 0, home, supply: null, supplied: true,
    name: name ?? (owner === 0 ? `${++s.armyNumber}º Exército` : owner === -1 ? 'Guarnição da fortaleza' : 'Exército'),
  };
  s.armies.push(a);
  return a;
}

export const provinceAt = (pm: ProvinceMap, grid: MoveGrid, x: number, y: number) => { const c = cellAt(grid, x, y); return c < 0 ? -1 : pm.cellProvince[c]; };
export const inBattle = (s: GameState, id: number) => s.battles.some(b => b.armyIds.includes(id));

/** Um passo fixo da simulação dos exércitos (`dt` em meses). */
export function troopStep(s: GameState, pm: ProvinceMap, grid: MoveGrid, dt: number): void {
  for (const a of s.armies) march(a, grid, dt);
  updateRoutes(s, pm, grid);
  updateSupply(s, pm, grid, dt);
  battleStep(s, pm, grid, dt);
  for (const a of s.armies) refill(s, pm, grid, a, dt);
  fortressStep(s, pm);
}

/** Anda de centro em centro de célula no passo do batalhão mais lento; a célula de chegada dita o custo do trecho (rio 3×, difícil 2×). */
function march(a: Army, grid: MoveGrid, dt: number): void {
  if (!a.battalions.length) return;
  const speed = armySpeed(a);
  while (a.path.length && dt > 1e-9) {
    const c = a.path[0], tx = (c % grid.size) * CELL + CELL / 2, ty = Math.floor(c / grid.size) * CELL + CELL / 2;
    const v = speed / Math.max(1, grid.cost[c]);
    const d = Math.hypot(tx - a.x, ty - a.y), reach = v * dt;
    if (reach >= d) { a.x = tx; a.y = ty; a.path.shift(); dt -= d / v; }
    else { a.x += ((tx - a.x) / d) * reach; a.y += ((ty - a.y) / d) * reach; dt = 0; }
  }
}

/** Reposição parado em território próprio e abastecido: cada batalhão recupera homens, pagos em dinheiro. */
function refill(s: GameState, pm: ProvinceMap, grid: MoveGrid, a: Army, dt: number): void {
  if (a.morale < 1 && s.clock >= a.routedUntil && !inBattle(s, a.id)) a.morale = 1; // recomposto depois da fuga
  if (a.owner !== 0 || !a.supplied || a.path.length || s.clock < a.routedUntil || inBattle(s, a.id)) return;
  const p = provinceAt(pm, grid, a.x, a.y);
  if (p < 0 || s.owner[p] !== 0) return;
  const rate = s.lots[p].some(b => b?.type === 'garrison' && activeLevel(b) > 0) ? REFILL.garrisonRate : REFILL.rate;
  for (const b of a.battalions) {
    const add = Math.min(TROOPS[b.type].soldiers - b.soldiers, rate * dt), money = add * REFILL.money;
    if (add <= 0 || s.res.money < money) continue;
    s.res.money -= money;
    b.soldiers += add;
  }
}
