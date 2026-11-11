import type { ProvinceMap } from '../worldgen/provinces';
import { CELL } from '../worldgen/constants';
import { battleStep } from './battle';
import { fortressStep } from './fortress';
import { updateRoutes, updateSupply } from './routes';
import { REFILL, TROOPS, TROOP_CAP, type TroopType } from './balance';
import { cellAt, type MoveGrid } from './movegrid';
import { activeLevel, type GameState, type Troop } from './state';

/** Tropas que o reino sustenta: soma das guarnições do jogador (em melhoria vale o nível anterior). */
export function troopCap(s: GameState): number {
  let cap = 0;
  s.owner.forEach((o, id) => { if (o === 0) for (const b of s.lots[id]) if (b?.type === 'garrison') cap += TROOP_CAP[activeLevel(b)]; });
  return cap;
}

export function spawnTroop(s: GameState, owner: number, type: TroopType, x: number, y: number, home = -1): Troop {
  const t: Troop = { id: s.nextTroopId++, owner, type, soldiers: TROOPS[type].soldiers, x, y, path: [], morale: 1, routedUntil: 0, home, supply: null, supplied: true };
  s.troops.push(t);
  return t;
}

export const provinceAt = (pm: ProvinceMap, grid: MoveGrid, x: number, y: number) => { const c = cellAt(grid, x, y); return c < 0 ? -1 : pm.cellProvince[c]; };
export const inBattle = (s: GameState, id: number) => s.battles.some(b => b.troopIds.includes(id));

/** Um passo fixo da simulação de tropas (`dt` em meses). */
export function troopStep(s: GameState, pm: ProvinceMap, grid: MoveGrid, dt: number): void {
  for (const t of s.troops) march(t, grid, dt);
  updateRoutes(s, pm, grid);
  updateSupply(s, pm, grid, dt);
  battleStep(s, pm, grid, dt);
  for (const t of s.troops) refill(s, pm, grid, t, dt);
  fortressStep(s, pm);
}

/** Anda de centro em centro de célula; a célula de chegada dita a velocidade do trecho (rio 3×, terreno difícil 2×), como no custo do A*. */
function march(t: Troop, grid: MoveGrid, dt: number): void {
  while (t.path.length && dt > 1e-9) {
    const c = t.path[0], tx = (c % grid.size) * CELL + CELL / 2, ty = Math.floor(c / grid.size) * CELL + CELL / 2;
    const v = TROOPS[t.type].speed / Math.max(1, grid.cost[c]);
    const d = Math.hypot(tx - t.x, ty - t.y), reach = v * dt;
    if (reach >= d) { t.x = tx; t.y = ty; t.path.shift(); dt -= d / v; }
    else { t.x += ((tx - t.x) / d) * reach; t.y += ((ty - t.y) / d) * reach; dt = 0; }
  }
}

function refill(s: GameState, pm: ProvinceMap, grid: MoveGrid, t: Troop, dt: number): void {
  if (t.morale < 1 && s.clock >= t.routedUntil && !inBattle(s, t.id)) t.morale = 1; // recomposta depois da fuga
  const max = TROOPS[t.type].soldiers;
  if (t.owner !== 0 || !t.supplied || t.soldiers >= max || t.path.length || s.clock < t.routedUntil || inBattle(s, t.id)) return;
  const p = provinceAt(pm, grid, t.x, t.y);
  if (p < 0 || s.owner[p] !== 0) return;
  const rate = s.lots[p].some(b => b?.type === 'garrison' && activeLevel(b) > 0) ? REFILL.garrisonRate : REFILL.rate;
  const add = Math.min(max - t.soldiers, rate * dt), money = add * REFILL.money;
  if (s.res.money < money) return;
  s.res.money -= money;
  t.soldiers += add;
}
