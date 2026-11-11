import type { ProvinceMap } from '../worldgen/provinces';
import { CELL } from '../worldgen/constants';
import { battleStep } from './battle';
import { occupationStep } from './conquest';
import { fortressStep } from './fortress';
import { reinforceStep, updateRoutes, updateSupply } from './routes';
import { AI, ARMY, BATTLE, REFILL, TROOPS, TROOP_CAP, type TroopType } from './balance';
import { aiStep } from './ai';
import { aiWarRoll } from './war';
import { cellAt, type MoveGrid } from './movegrid';
import { activeLevel, logFor, type Army, type Battalion, type GameState } from './state';

/** Batalhões que a nação sustenta: soma das guarnições dela (em melhoria vale o nível anterior). */
export function armyCap(s: GameState, n = 0): number {
  let cap = 0;
  s.owner.forEach((o, id) => { if (o === n) for (const b of s.lots[id]) if (b?.type === 'garrison') cap += TROOP_CAP[activeLevel(b)]; });
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
    name: name ?? (owner >= 0 && s.nations[owner] ? `${++s.nations[owner].armyNumber}º Exército` : owner === -1 ? 'Guarnição da fortaleza' : 'Exército'),
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
  occupationStep(s, pm, grid, dt);
  // excesso (reforço pela linha) se separa quando o exército sai da batalha e da fuga, mesmo que tenha fugido
  for (const a of [...s.armies]) if (a.owner >= 0 && a.battalions.length > ARMY.maxBattalions && s.clock >= a.routedUntil && !inBattle(s, a.id)) splitOverflow(s, a);
  reinforceStep(s, dt, pm);
  for (const a of s.armies) refill(s, pm, grid, a, dt);
  fortressStep(s, pm);
  // IA: uma vez por mês por nação, cada uma numa fase diferente do mês (o custo se espalha)
  const perMonth = Math.round(1 / BATTLE.step), k = Math.round(s.clock / BATTLE.step) % perMonth;
  for (const n of s.nations) if (n.alive && n.ai && k === (n.id * AI.phaseSteps) % perMonth) { aiStep(s, pm, grid, n.id); aiWarRoll(s, pm, n.id); }
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
  if (a.owner < 0 || !a.supplied || a.path.length || s.clock < a.routedUntil || inBattle(s, a.id)) return;
  const p = provinceAt(pm, grid, a.x, a.y);
  if (p < 0 || s.owner[p] !== a.owner) return;
  const res = s.nations[a.owner].res;
  const rate = s.lots[p].some(b => b?.type === 'garrison' && activeLevel(b) > 0) ? REFILL.garrisonRate : REFILL.rate;
  for (const b of a.battalions) {
    const add = Math.min(TROOPS[b.type].soldiers - b.soldiers, rate * dt), money = add * REFILL.money;
    if (add <= 0 || res.money < money) continue;
    res.money -= money;
    b.soldiers += add;
  }
}

type Result = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Result => ({ ok: false, reason });
const mine = (s: GameState, id: number, n: number) => s.armies.find(a => a.id === id && a.owner === n);
const busy = (s: GameState, a: Army): string | null => (inBattle(s, a.id) ? 'Em batalha' : s.clock < a.routedUntil ? 'Em fuga' : null);

/** Junta `from` em `into`: exércitos seus a ≤ joinTiles, fora de batalha e de fuga, até maxBattalions. */
export function mergeArmies(s: GameState, intoId: number, fromId: number, n = 0): Result {
  const into = mine(s, intoId, n), from = mine(s, fromId, n);
  if (!into || !from || into === from) return no('Escolha dois exércitos seus');
  const why = busy(s, into) ?? busy(s, from);
  if (why) return no(why);
  if (Math.hypot(into.x - from.x, into.y - from.y) > ARMY.joinTiles) return no('Longe demais para juntar');
  if (into.battalions.length + from.battalions.length > ARMY.maxBattalions) return no(`Passaria de ${ARMY.maxBattalions} batalhões`);
  into.battalions.push(...from.battalions);
  if (!into.supply && from.supply) into.supply = from.supply;
  s.armies.splice(s.armies.indexOf(from), 1);
  logFor(s, n, 'Exércitos unidos');
  return { ok: true };
}

/** Os batalhões de índices `indices` formam um exército novo ao lado. */
export function splitArmy(s: GameState, id: number, indices: number[], n = 0): Result {
  const a = mine(s, id, n);
  if (!a) return no('Exército inválido');
  const why = busy(s, a);
  if (why) return no(why);
  const pick = [...new Set(indices)].filter(i => Number.isInteger(i) && i >= 0 && i < a.battalions.length);
  if (!pick.length || pick.length !== new Set(indices).size) return no('Escolha os batalhões que vão sair');
  if (pick.length === a.battalions.length) return no('Fica pelo menos um batalhão');
  const out = pick.sort((x, y) => x - y).map(i => a.battalions[i]);
  a.battalions = a.battalions.filter((_, i) => !pick.includes(i));
  spawnArmy(s, n, out, a.x + 6, a.y);
  logFor(s, n, `${a.name} dividido`);
  return { ok: true };
}

export function renameArmy(s: GameState, id: number, name: string, n = 0): Result {
  const a = mine(s, id, n), v = name.trim();
  if (!a) return no('Exército inválido');
  if (!v) return no('Nome vazio');
  if (v.length > 40) return no('Nome longo demais (máx. 40)');
  a.name = v;
  return { ok: true };
}

/** Exército com mais de maxBattalions (reforço pela linha numa batalha) separa o excesso num exército novo ao lado. */
export function splitOverflow(s: GameState, a: Army): void {
  if (a.battalions.length <= ARMY.maxBattalions) return;
  const extra = a.battalions.splice(ARMY.maxBattalions);
  spawnArmy(s, a.owner, extra, a.x + 6, a.y);
}
