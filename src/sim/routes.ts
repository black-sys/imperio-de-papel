import { CELL } from '../worldgen/constants';
import type { ProvinceMap } from '../worldgen/provinces';
import { findCellPath } from './astar';
import { BATTLE, REINFORCE, RES_KEYS, RES_NAMES, ROUTE, SUPPLY, TROOPS, type Res } from './balance';
import { cellAt, type MoveGrid } from './movegrid';
import { hostile } from './war';
import { activeLevel, logFor, type Army, type GameState, type Route } from './state';

type Result = { ok: true } | { ok: false; reason: string };
const no = (reason: string) => ({ ok: false as const, reason });

// grade de traçado guardada por estado: só muda quando donos ou tropas de fortaleza mudam
const gridCache = new WeakMap<GameState, Map<number, { sig: number; cost: Uint8Array }>>();

/** Custo de traçado por célula: água e território de outro reino bloqueiam; perto de fortaleza encarece (desvia sozinho). */
export function routeGrid(s: GameState, pm: ProvinceMap, grid: MoveGrid, n = 0, enemyOk = false): Uint8Array {
  let sig = 0;
  for (const o of s.owner) sig = (Math.imul(sig, 31) + o + 2) | 0;
  for (const t of s.armies) if (t.owner === -1) sig = (Math.imul(sig, 31) + (t.x | 0) * 4099 + (t.y | 0)) | 0;
  let per = gridCache.get(s);
  if (!per) gridCache.set(s, per = new Map());
  for (const x of s.nations) for (const w of x.atWar) sig = (Math.imul(sig, 31) + x.id * 8 + w + 1) | 0; // guerras mudam o que é passável
  const key = n * 2 + (enemyOk ? 1 : 0), hit = per.get(key);
  if (hit && hit.sig === sig) return hit.cost;
  const cost = new Uint8Array(grid.cost);
  // território de outra nação bloqueia; com `enemyOk` (linhas de suprimento) a terra de quem está em guerra conosco não
  for (let i = 0; i < cost.length; i++) { const p = pm.cellProvince[i]; if (p >= 0 && s.owner[p] !== n && s.owner[p] !== -1 && !(enemyOk && hostile(s, s.owner[p], n))) cost[i] = 0; }
  const r = Math.ceil(ROUTE.fortressAvoidTiles / CELL);
  for (const t of s.armies) {
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
  per.set(key, { sig, cost });
  return cost;
}

const cityCell = (pm: ProvinceMap, grid: MoveGrid, id: number) => cellAt(grid, pm.provinces[id].city.x, pm.provinces[id].city.y);
const mineCity = (s: GameState, id: number, n: number) => s.owner[id] === n && !!s.city[id];

/** Caminho, custo e tempo de uma rota entre as cidades de `a` e `b`, ou o motivo da recusa. */
export function planRoute(s: GameState, pm: ProvinceMap, grid: MoveGrid, a: number, b: number, n = 0):
  { ok: true; path: number[]; cost: Partial<Res>; months: number; threatened: boolean } | { ok: false; reason: string } {
  if (a === b || !mineCity(s, a, n) || !mineCity(s, b, n)) return no('Escolha duas cidades suas');
  if (s.routes.some(r => (r.a === a && r.b === b) || (r.a === b && r.b === a))) return no('Já existe uma rota entre essas cidades');
  const from = cityCell(pm, grid, a), to = cityCell(pm, grid, b);
  const path = findCellPath({ ...grid, cost: routeGrid(s, pm, grid, n) }, from, to);
  if (!path) return no(findCellPath(grid, from, to) ? 'Atravessa território de outro reino' : 'Não há caminho por terra');
  let tiles = 0, money = 0, wood = 0;
  for (const c of path) { const k = grid.cost[c] >= 2 ? ROUTE.hardMult : 1; tiles += CELL; money += CELL * ROUTE.money * k; wood += CELL * ROUTE.wood * k; }
  // sem desvio possível, o caminho pode passar a ≤ cutTiles de uma fortaleza: nasceria cortado (a interface avisa)
  const threat = threatAt(s, grid, n);
  return { ok: true, path, cost: { money, wood }, months: Math.max(ROUTE.minMonths, tiles / ROUTE.tilesPerMonth), threatened: path.some(threat) };
}

export function checkRoute(s: GameState, pm: ProvinceMap, grid: MoveGrid, a: number, b: number, n = 0): Result {
  const plan = planRoute(s, pm, grid, a, b, n);
  if (!plan.ok) return plan;
  const res = s.nations[n].res;
  for (const [k, v] of Object.entries(plan.cost) as [keyof Res, number][])
    if (res[k] < v) return no(`Falta ${Math.ceil(v - res[k])} de ${RES_NAMES[k]}`);
  return { ok: true };
}

export function buildRoute(s: GameState, pm: ProvinceMap, grid: MoveGrid, a: number, b: number, n = 0): Result {
  const chk = checkRoute(s, pm, grid, a, b, n);
  if (!chk.ok) return chk;
  const plan = planRoute(s, pm, grid, a, b, n);
  if (!plan.ok) return plan;
  for (const [k, v] of Object.entries(plan.cost) as [keyof Res, number][]) s.nations[n].res[k] -= v;
  s.routes.push({ id: s.nextRouteId++, owner: n, a, b, path: plan.path, remaining: plan.months, cut: false });
  return { ok: true };
}

export function removeRoute(s: GameState, id: number, pm?: ProvinceMap, n = 0): Result {
  const i = s.routes.findIndex(r => r.id === id && r.owner === n);
  if (i < 0) return no('Rota inexistente');
  s.routes.splice(i, 1);
  recomputeConnected(s, pm); // na hora, mesmo com o jogo pausado (painel e mapa não mostram ligação que já não existe)
  return { ok: true };
}

/**
 * Ligada = alcançável a partir da capital da dona por rotas prontas, não cortadas, dela e com as duas pontas dela.
 * Com `pm`, avisa quem se desligou e entrega ao estoque da dona o depósito de quem religou.
 */
export function recomputeConnected(s: GameState, pm?: ProvinceMap): void {
  const before = s.connected, on = s.owner.map(() => false);
  for (const n of s.nations) {
    if (!n.alive || s.owner[n.capital] !== n.id) continue;
    on[n.capital] = true;
    const ready = (r: Route) => r.owner === n.id && r.remaining <= 0 && !r.cut && s.owner[r.a] === n.id && s.owner[r.b] === n.id;
    for (const queue = [n.capital]; queue.length; ) {
      const p = queue.shift()!;
      for (const r of s.routes) {
        if (!ready(r)) continue;
        const q = r.a === p ? r.b : r.b === p ? r.a : -1;
        if (q >= 0 && !on[q]) { on[q] = true; queue.push(q); }
      }
    }
  }
  s.connected = on;
  if (!pm) return;
  on.forEach((now, id) => {
    const o = s.owner[id], n = s.nations[o];
    if (now === before[id] || !n || id === n.capital) return;
    if (!now) { logFor(s, o, `${pm.provinces[id].name} desligada da capital`); return; }
    const d = s.depot[id];
    if (RES_KEYS.some(k => d[k] > 0)) {
      for (const k of RES_KEYS) { n.res[k] += d[k]; d[k] = 0; }
      logFor(s, o, `Carga de ${pm.provinces[id].name} chegou ao estoque`);
    }
  });
}

/** A cada passo fixo das tropas: cortes, ligação com a capital e entrega de depósitos. */
export function updateRoutes(s: GameState, pm: ProvinceMap, grid: MoveGrid): void {
  markCuts(s, pm, grid);
  recomputeConnected(s, pm);
}

/**
 * Por célula, um bit por dono de exército a ≤ cutTiles (bit 0 = fortaleza, bit k+1 = nação k). Uma pintura por passo
 * serve a todas as nações; refeita só quando algum exército muda de lugar (fortalezas ficam paradas).
 */
const presenceCache = new WeakMap<GameState, { sig: number; clock: number; mask: Uint16Array; painted: number[] }>();
function presence(s: GameState, grid: MoveGrid): Uint16Array {
  const S = grid.size, hit = presenceCache.get(s);
  let sig = 0;
  for (const t of s.armies) sig = (Math.imul(sig, 31) + ((t.x * 4) | 0) * 7919 + ((t.y * 4) | 0) + t.owner * 104729) | 0;
  if (hit && hit.sig === sig && hit.mask.length === S * S) { hit.clock = s.clock; return hit.mask; }
  // reusa o buffer (o mapa inteiro tem ~1 M células): apaga só o que foi pintado da última vez
  const reuse = hit && hit.mask.length === S * S, mask = reuse ? hit.mask : new Uint16Array(S * S), painted = reuse ? hit.painted : [];
  for (const i of painted) mask[i] = 0;
  painted.length = 0;
  const r = Math.ceil((ROUTE.cutTiles + CELL) / CELL);
  for (const t of s.armies) {
    const c = cellAt(grid, t.x, t.y), bit = 1 << (t.owner + 1);
    if (c < 0) continue;
    const cx = c % S, cy = Math.floor(c / S);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx, y = cy + dy;
      const ex = x * CELL + CELL / 2 - t.x, ey = y * CELL + CELL / 2 - t.y; // sem Math.hypot: lento neste laço quente
      if (x >= 0 && y >= 0 && x < S && y < S && ex * ex + ey * ey <= ROUTE.cutTiles * ROUTE.cutTiles) {
        const i = y * S + x;
        if (!mask[i]) painted.push(i);
        mask[i] |= bit;
      }
    }
  }
  presenceCache.set(s, { sig, clock: s.clock, mask, painted });
  return mask;
}
/** A célula está a ≤ cutTiles de algum exército hostil à nação `n`? */
function threatAt(s: GameState, grid: MoveGrid, n: number): (c: number) => boolean {
  const mask = presence(s, grid);
  let foes = 1; // fortalezas
  for (const x of s.nations) if (hostile(s, x.id, n)) foes |= 1 << (x.id + 1);
  return c => (mask[c] & foes) !== 0;
}

/** Rota cortada: tropa hostil (fortaleza ou outro reino) a ≤ cutTiles de alguma célula dela, ou passa por província de outro reino. */
function markCuts(s: GameState, pm: ProvinceMap, grid: MoveGrid): void {
  if (!s.routes.length) return;
  const threats = new Map<number, (c: number) => boolean>(); // uma consulta por nação no passo, não por rota
  for (const route of s.routes) {
    const n = route.owner;
    if (!threats.has(n)) threats.set(n, threatAt(s, grid, n));
    // terra de nação em guerra corta; de nação em paz, não (como os exércitos dela)
    const threat = threats.get(n)!, foreign = (c: number) => { const p = pm.cellProvince[c]; return p >= 0 && s.owner[p] >= 0 && hostile(s, s.owner[p], n); };
    const now = route.path.some(c => threat(c) || foreign(c));
    if (now === route.cut) continue;
    route.cut = now;
    if (route.remaining <= 0) logFor(s, n, `Rota ${pm.provinces[route.a].name}–${pm.provinces[route.b].name} ${now ? 'cortada' : 'religada'}`);
  }
}

// ---- suprimento das tropas ----

const cellCenter = (grid: MoveGrid, c: number) => ({ x: (c % grid.size) * CELL + CELL / 2, y: Math.floor(c / grid.size) * CELL + CELL / 2 });

/** Cidade ligada mais próxima da tropa (em linha reta) e o caminho dela até a tropa. */
function traceLine(s: GameState, pm: ProvinceMap, grid: MoveGrid, x: number, y: number, n: number): { path: number[]; from: number } | null {
  const cities = s.connected.map((on, id) => (on && s.owner[id] === n && s.city[id] ? id : -1)).filter(id => id >= 0)
    .sort((a, b) => Math.hypot(pm.provinces[a].city.x - x, pm.provinces[a].city.y - y) - Math.hypot(pm.provinces[b].city.x - x, pm.provinces[b].city.y - y));
  const to = cellAt(grid, x, y), cost = routeGrid(s, pm, grid, n, true);
  for (const from of cities.slice(0, 3)) {
    const path = findCellPath({ ...grid, cost }, cellAt(grid, pm.provinces[from].city.x, pm.provinces[from].city.y), to);
    if (path) return { path, from };
  }
  return null;
}

export function checkSupply(s: GameState, pm: ProvinceMap, grid: MoveGrid, troopId: number, n = 0): Result {
  const t = s.armies.find(t => t.id === troopId && t.owner === n);
  if (!t) return no('Exército inválido');
  if (s.clock < t.routedUntil) return no('Exército em fuga');
  if (t.supply) return no('Já tem linha de suprimento');
  return traceLine(s, pm, grid, t.x, t.y, n) ? { ok: true } : no('Nenhuma cidade ligada alcança este exército');
}

export function supplyArmy(s: GameState, pm: ProvinceMap, grid: MoveGrid, troopId: number, n = 0): Result {
  const chk = checkSupply(s, pm, grid, troopId, n);
  if (!chk.ok) return chk;
  const t = s.armies.find(t => t.id === troopId)!, line = traceLine(s, pm, grid, t.x, t.y, n)!;
  t.supply = { ...line, at: s.clock, cut: false };
  return { ok: true };
}

export function dropSupply(s: GameState, troopId: number, n = 0): Result {
  const t = s.armies.find(t => t.id === troopId && t.owner === n);
  if (!t?.supply) return no('Sem linha de suprimento');
  t.supply = null;
  return { ok: true };
}

/**
 * A cada passo: refaz linhas que ficaram para trás, marca linhas cortadas e calcula quem está abastecido (linha não
 * cortada, província sua ligada, ou a ≤ range de cidade ligada ou de rota ligada). Tropas do jogador sem suprimento
 * perdem homens. Fortalezas e outros reinos (ainda sem rede própria, ciclo 4) contam como abastecidos.
 */
export function updateSupply(s: GameState, pm: ProvinceMap, grid: MoveGrid, dt: number): void {
  const threats = new Map<number, (c: number) => boolean>(); // uma consulta por nação no passo, não por exército
  for (const t of s.armies) {
    if (t.owner < 0) { t.supplied = true; continue; } // fortalezas sempre
    const n = t.owner, cover = coverageMask(s, pm, grid, n);
    if (t.supply) {
      const end = cellCenter(grid, t.supply.path.at(-1) ?? 0);
      let lost = false; // ficou para trás e não há como retraçar: a linha não chega (não abastece com o traçado velho)
      if (Math.hypot(end.x - t.x, end.y - t.y) > SUPPLY.repathTiles && s.clock - t.supply.at >= SUPPLY.repathMonths - 1e-9) {
        const line = traceLine(s, pm, grid, t.x, t.y, n);
        if (line) t.supply = { ...line, at: s.clock, cut: false };
        else { lost = true; t.supply.at = s.clock; }
      }
      // inimigo lutando com a própria tropa não corta a linha: ignora o trecho final, a ≤ join tiles dela
      if (!threats.has(n)) threats.set(n, threatAt(s, grid, n));
      const threat = threats.get(n)!, away = (c: number) => { const p = cellCenter(grid, c); return Math.hypot(p.x - t.x, p.y - t.y) > BATTLE.join; };
      t.supply.cut = lost || !s.connected[t.supply.from] || t.supply.path.some(c => threat(c) && away(c));
    }
    let ok = !!t.supply && !t.supply.cut;
    // dentro de província sua ligada à capital (defender a própria fronteira não desgasta)
    // (ou perto da rede ligada: cidades e rotas)
    if (!ok) { const c = cellAt(grid, t.x, t.y), p = c < 0 ? -1 : pm.cellProvince[c]; ok = (p >= 0 && s.owner[p] === n && s.connected[p]) || (c >= 0 && cover[c] === 1); }
    t.supplied = ok;
    if (ok) continue;
    for (const b of t.battalions) b.soldiers -= SUPPLY.attrition * dt;
    const key = `t${t.id}`;
    if (s.clock - (s.stallWarned[key] ?? -Infinity) >= SUPPLY.warnMonths) { s.stallWarned[key] = s.clock; logFor(s, n, `${t.name} sem suprimento`); }
  }
}

/** Células a ≤ SUPPLY.range de cidade ligada ou de rota pronta, ligada e não cortada. Refeito só quando a rede muda. */
const coverCache = new WeakMap<GameState, Map<number, { sig: string; clock: number; mask: Uint8Array }>>();
export function coverageMask(s: GameState, pm: ProvinceMap, grid: MoveGrid, n: number): Uint8Array {
  const memo = coverCache.get(s)?.get(n);
  if (memo && memo.clock === s.clock && memo.mask.length === grid.size * grid.size) return memo.mask; // a rede não muda dentro do passo
  const live = s.routes.filter(r => r.owner === n && r.remaining <= 0 && !r.cut && s.connected[r.a] && s.connected[r.b]);
  const sig = `${live.map(r => r.id).join(',')}|${s.connected.map((c, id) => (c && s.owner[id] === n ? 1 : 0)).join('')}`;
  let per = coverCache.get(s);
  if (!per) coverCache.set(s, per = new Map());
  const hit = per.get(n);
  if (hit && hit.sig === sig && hit.mask.length === grid.size * grid.size) { hit.clock = s.clock; return hit.mask; }
  const S = grid.size, mask = new Uint8Array(S * S), R = Math.ceil(SUPPLY.range / CELL) + 1;
  const paint = (px: number, py: number) => { // disco de raio SUPPLY.range tiles em volta de (px, py)
    const cx = Math.floor(px / CELL), cy = Math.floor(py / CELL);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x >= 0 && y >= 0 && x < S && y < S && Math.hypot(x * CELL + CELL / 2 - px, y * CELL + CELL / 2 - py) <= SUPPLY.range) mask[y * S + x] = 1;
    }
  };
  s.connected.forEach((on, id) => { if (on && s.owner[id] === n && s.city[id]) paint(pm.provinces[id].city.x, pm.provinces[id].city.y); });
  for (const r of live) for (const c of r.path) { const p = cellCenter(grid, c); paint(p.x, p.y); }
  per.set(n, { sig, clock: s.clock, mask });
  return mask;
}

// ---- reforço pela linha de suprimento ----

/** Província de onde chega reforço para o exército, ou null: linha de pé, cidade ligada com Guarnição ativa e exército em batalha. */
export function reinforcing(s: GameState, a: Army): number | null {
  const l = a.supply;
  if (a.owner < 0 || !l || l.cut || !s.connected[l.from] || !s.battles.some(b => b.armyIds.includes(a.id))) return null;
  return s.lots[l.from].some(b => b?.type === 'garrison' && activeLevel(b) > 0) ? l.from : null;
}

/** Repõe homens dos exércitos reforçados, pagando por homem do estoque; faltando recurso repõe o que der e avisa. */
export function reinforceStep(s: GameState, dt: number, pm?: ProvinceMap): void {
  const per: [keyof Res, number][] = [['money', REINFORCE.money], ['grain', REINFORCE.grain], ['arms', REINFORCE.arms]];
  for (const a of s.armies) {
    const from = reinforcing(s, a);
    if (from === null) continue;
    const res = s.nations[a.owner].res;
    let short: keyof Res | null = null;
    for (const b of a.battalions) {
      let add = Math.min(TROOPS[b.type].soldiers - b.soldiers, REINFORCE.rate * dt);
      if (add <= 1e-9) continue;
      for (const [k, cost] of per) if (res[k] < add * cost) { add = Math.max(0, res[k] / cost); short = k; }
      for (const [k, cost] of per) res[k] -= add * cost;
      b.soldiers += add;
    }
    const key = `r${a.id}`;
    if (short && s.clock - (s.stallWarned[key] ?? -Infinity) >= SUPPLY.warnMonths) {
      s.stallWarned[key] = s.clock;
      logFor(s, a.owner, `Reforço de ${pm ? pm.provinces[from].name : `R${from}`} parado: faltam ${RES_NAMES[short]}`);
    }
  }
}
