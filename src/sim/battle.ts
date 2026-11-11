import type { ProvinceMap } from '../worldgen/provinces';
import { findCellPath } from './astar';
import { BATTLE, TROOPS, type TroopType } from './balance';
import { cellAt, type MoveGrid } from './movegrid';
import { logEvent, type Battle, type GameState, type Troop } from './state';

/** Quem cada tipo castiga (+counter de dano). */
const COUNTERS: Record<TroopType, TroopType> = { line: 'cavalry', cavalry: 'artillery', artillery: 'line' };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const provinceName = (pm: ProvinceMap, grid: MoveGrid, x: number, y: number) => { const c = cellAt(grid, x, y), p = c < 0 ? -1 : pm.cellProvince[c]; return p < 0 ? 'a costa' : pm.provinces[p].name; };

function join(b: Battle, t: Troop): void {
  b.troopIds.push(t.id);
  t.path = []; // para e luta; uma ordem nova tira a tropa da batalha quando ela se afasta
  let side = b.sides.find(s => s.owner === t.owner);
  if (!side) b.sides.push(side = { owner: t.owner, initial: 0, morale: 1 });
  // mantém as baixas já sofridas ao somar o reforço
  const lost = ((1 - side.morale) / BATTLE.moraleLoss) * side.initial;
  side.initial += t.soldiers;
  side.morale = 1 - (BATTLE.moraleLoss * lost) / side.initial;
}

/** Contato, rodada de dano, moral, fuga e fim das batalhas. Roda depois do movimento, em passo fixo. */
export function battleStep(s: GameState, pm: ProvinceMap, grid: MoveGrid, dt: number): void {
  const routed = (t: Troop) => s.clock < t.routedUntil;
  const byId = new Map(s.troops.map(t => [t.id, t]));
  const engaged = new Set<number>();
  for (const b of s.battles) {
    b.troopIds = b.troopIds.filter(id => { const t = byId.get(id); return t && !routed(t) && dist(t, b) <= BATTLE.join; });
    for (const id of b.troopIds) engaged.add(id);
  }
  // contato: inimigas a ≤ contact abrem (ou entram em) uma batalha
  for (const a of s.troops) {
    if (a.owner === -1 || engaged.has(a.id) || routed(a)) continue; // fortalezas não se enfrentam: todo contato tem uma tropa móvel
    for (const d of s.troops) {
      if (d.owner === a.owner || routed(d) || dist(a, d) > BATTLE.contact) continue;
      let b = s.battles.find(b => b.troopIds.includes(d.id));
      if (!b) {
        s.battles.push(b = { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2, start: s.clock, troopIds: [], sides: [] });
        join(b, d); engaged.add(d.id);
      }
      join(b, a); engaged.add(a.id);
      break;
    }
  }
  // quem está perto de uma batalha com inimigos entra nela
  for (const b of s.battles) for (const t of s.troops)
    if (!engaged.has(t.id) && !routed(t) && dist(t, b) <= BATTLE.join && b.sides.some(side => side.owner !== t.owner)) { join(b, t); engaged.add(t.id); }

  for (const b of s.battles) {
    const troops = b.troopIds.map(id => byId.get(id)!);
    const opening = s.clock - b.start < BATTLE.openingFire;
    const losses = new Map<Troop, number>();
    for (const a of troops) {
      if (opening && a.type !== 'artillery') continue;
      const foes = troops.filter(d => d.owner !== a.owner), total = foes.reduce((n, d) => n + d.soldiers, 0);
      if (total <= 0) continue;
      const ca = cellAt(grid, a.x, a.y);
      const power = a.soldiers * TROOPS[a.type].attack * BATTLE.rate * dt * (ca >= 0 && grid.cost[ca] === 3 ? BATTLE.river : 1);
      for (const d of foes) {
        const counter = COUNTERS[a.type] === d.type ? BATTLE.counter : 1;
        const cd = cellAt(grid, d.x, d.y);
        const defense = TROOPS[d.type].defense * (cd >= 0 && grid.cover[cd] ? BATTLE.cover : 1) * (d.owner === -1 ? BATTLE.fortress : 1);
        losses.set(d, (losses.get(d) ?? 0) + (power * (d.soldiers / total) * counter) / defense);
      }
    }
    for (const [d, n] of losses) {
      const lost = Math.min(d.soldiers, n), side = b.sides.find(x => x.owner === d.owner)!;
      d.soldiers -= lost;
      side.morale = Math.max(0, side.morale - (BATTLE.moraleLoss * lost) / side.initial);
    }
    for (const t of troops) t.morale = b.sides.find(x => x.owner === t.owner)!.morale;
    // moral quebrada: o lado foge (fortalezas lutam até cair)
    for (const side of b.sides) {
      if (side.owner === -1 || side.morale >= BATTLE.breakAt) continue;
      for (const t of troops) if (t.owner === side.owner) flee(s, pm, grid, t);
    }
  }
  // dispersão
  for (const t of [...s.troops]) {
    if (t.soldiers >= BATTLE.minSoldiers) continue;
    s.troops.splice(s.troops.indexOf(t), 1);
    if (t.owner === 0) logEvent(s, `${TROOPS[t.type].name} dispersa`);
  }
  // fim: menos de dois lados ainda lutando
  for (const b of [...s.battles]) {
    const left = b.troopIds.map(id => byId.get(id)!).filter(t => s.troops.includes(t) && !routed(t));
    if (new Set(left.map(t => t.owner)).size >= 2) continue;
    s.battles.splice(s.battles.indexOf(b), 1);
    for (const t of left) t.morale = 1;
    const me = b.sides.find(side => side.owner === 0);
    if (!me) continue;
    const where = provinceName(pm, grid, b.x, b.y);
    if (left.some(t => t.owner === 0)) logEvent(s, `Vitória perto de ${where}`);
    else if (me.morale < BATTLE.breakAt) logEvent(s, `Derrota perto de ${where}`);
  }
}

/** Foge para a província própria mais próxima; sem ter para onde ir, a tropa se dispersa (soldiers = 0). */
function flee(s: GameState, pm: ProvinceMap, grid: MoveGrid, t: Troop): void {
  let best = -1, bd = Infinity;
  s.owner.forEach((o, id) => {
    const p = pm.provinces[id];
    if (o !== t.owner || !p.lots.length) return;
    const d = dist(t, p.center);
    if (d < bd) { bd = d; best = id; }
  });
  const site = best < 0 ? null : pm.provinces[best].city;
  const path = site && findCellPath(grid, cellAt(grid, t.x, t.y), cellAt(grid, site.x, site.y));
  if (!path) { t.soldiers = 0; return; }
  t.path = path;
  t.routedUntil = s.clock + BATTLE.rout;
}
