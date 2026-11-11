import type { ProvinceMap } from '../worldgen/provinces';
import { findCellPath } from './astar';
import { BATTLE, SUPPLY, TROOPS, type TroopType } from './balance';
import { cellAt, type MoveGrid } from './movegrid';
import { logEvent, type Army, type Battalion, type Battle, type GameState } from './state';
import { men } from './armies';

/** Quem cada tipo castiga (+counter de dano). */
const COUNTERS: Record<TroopType, TroopType> = { line: 'cavalry', cavalry: 'artillery', artillery: 'line' };
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const provinceName = (pm: ProvinceMap, grid: MoveGrid, x: number, y: number) => { const c = cellAt(grid, x, y), p = c < 0 ? -1 : pm.cellProvince[c]; return p < 0 ? 'a costa' : pm.provinces[p].name; };

function join(b: Battle, t: Army): void {
  b.armyIds.push(t.id);
  t.path = []; // para e luta; uma ordem nova tira o exército da batalha quando ele se afasta
  let side = b.sides.find(s => s.owner === t.owner);
  if (!side) b.sides.push(side = { owner: t.owner, initial: 0, morale: 1 });
  // mantém as baixas já sofridas ao somar o reforço
  // sem suprimento chega cansada: conta como se já tivesse perdido parte dos homens (moral inicial menor)
  const lost = ((1 - side.morale) / BATTLE.moraleLoss) * side.initial + (t.supplied ? 0 : (men(t) * (1 - SUPPLY.unsuppliedMorale)) / BATTLE.moraleLoss);
  side.initial += men(t);
  side.morale = 1 - (BATTLE.moraleLoss * lost) / side.initial;
}

/** Contato, rodada de dano, moral, fuga e fim das batalhas. Roda depois do movimento, em passo fixo. */
export function battleStep(s: GameState, pm: ProvinceMap, grid: MoveGrid, dt: number): void {
  const routed = (t: Army) => s.clock < t.routedUntil;
  const byId = new Map(s.armies.map(t => [t.id, t]));
  const engaged = new Set<number>();
  for (const b of s.battles) {
    b.armyIds = b.armyIds.filter(id => { const t = byId.get(id); return t && !routed(t) && dist(t, b) <= BATTLE.join; });
    for (const id of b.armyIds) engaged.add(id);
  }
  // contato: exércitos inimigos a ≤ contact abrem (ou entram em) uma batalha
  for (const a of s.armies) {
    if (a.owner === -1 || engaged.has(a.id) || routed(a)) continue; // fortalezas não se enfrentam: todo contato tem um exército móvel
    for (const d of s.armies) {
      if (d.owner === a.owner || routed(d) || dist(a, d) > BATTLE.contact) continue;
      let b = s.battles.find(b => b.armyIds.includes(d.id));
      if (!b) {
        s.battles.push(b = { x: (a.x + d.x) / 2, y: (a.y + d.y) / 2, start: s.clock, armyIds: [], sides: [] });
        join(b, d); engaged.add(d.id);
      }
      join(b, a); engaged.add(a.id);
      break;
    }
  }
  // quem está perto de uma batalha com inimigos entra nela
  for (const b of s.battles) for (const t of s.armies)
    if (!engaged.has(t.id) && !routed(t) && dist(t, b) <= BATTLE.join && b.sides.some(side => side.owner !== t.owner)) { join(b, t); engaged.add(t.id); }

  for (const b of s.battles) {
    const armies = b.armyIds.map(id => byId.get(id)!);
    const opening = s.clock - b.start < BATTLE.openingFire;
    // a conta de sempre, batalhão a batalhão: o batalhão herda a posição, o suprimento e o dono do seu exército
    const units = armies.flatMap(army => army.battalions.map(bat => ({ army, bat })));
    const losses = new Map<Battalion, number>();
    for (const { army: A, bat: a } of units) {
      if (opening && a.type !== 'artillery') continue;
      const foes = units.filter(u => u.army.owner !== A.owner), total = foes.reduce((n, u) => n + u.bat.soldiers, 0);
      if (total <= 0) continue;
      const ca = cellAt(grid, A.x, A.y);
      const power = a.soldiers * TROOPS[a.type].attack * BATTLE.rate * dt * (ca >= 0 && grid.cost[ca] === 3 ? BATTLE.river : 1) * (A.supply && !A.supply.cut ? SUPPLY.lineBonus : 1);
      for (const { army: D, bat: d } of foes) {
        const counter = COUNTERS[a.type] === d.type ? BATTLE.counter : 1;
        const cd = cellAt(grid, D.x, D.y);
        const defense = TROOPS[d.type].defense * (cd >= 0 && grid.cover[cd] ? BATTLE.cover : 1) * (D.owner === -1 ? BATTLE.fortress : 1) * (D.supply && !D.supply.cut ? SUPPLY.lineBonus : 1);
        losses.set(d, (losses.get(d) ?? 0) + (power * (d.soldiers / total) * counter) / defense);
      }
    }
    for (const { army, bat } of units) {
      const n = losses.get(bat);
      if (!n) continue;
      const lost = Math.min(bat.soldiers, n), side = b.sides.find(x => x.owner === army.owner)!;
      bat.soldiers -= lost;
      side.morale = Math.max(0, side.morale - (BATTLE.moraleLoss * lost) / side.initial);
    }
    for (const t of armies) t.morale = b.sides.find(x => x.owner === t.owner)!.morale;
    // moral quebrada: o lado foge (fortalezas lutam até cair)
    for (const side of b.sides) {
      if (side.owner === -1 || side.morale >= BATTLE.breakAt) continue;
      for (const t of armies) if (t.owner === side.owner) flee(s, pm, grid, t);
    }
  }
  // dispersão: batalhão abaixo do mínimo se desfaz; exército sem batalhões some
  for (const a of [...s.armies]) {
    a.battalions = a.battalions.filter(bat => {
      if (bat.soldiers >= BATTLE.minSoldiers) return true;
      if (a.owner === 0) logEvent(s, `Batalhão de ${TROOPS[bat.type].name.toLowerCase()} perdido`);
      return false;
    });
    if (a.battalions.length) continue;
    s.armies.splice(s.armies.indexOf(a), 1);
    if (a.owner === 0) logEvent(s, `${a.name} destruído`);
  }
  // fim: menos de dois lados ainda lutando
  for (const b of [...s.battles]) {
    const left = b.armyIds.map(id => byId.get(id)!).filter(t => s.armies.includes(t) && !routed(t));
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

/** Foge para a província própria mais próxima; sem ter para onde ir, o exército se desfaz. */
function flee(s: GameState, pm: ProvinceMap, grid: MoveGrid, t: Army): void {
  let best = -1, bd = Infinity;
  s.owner.forEach((o, id) => {
    const p = pm.provinces[id];
    if (o !== t.owner || !p.lots.length) return;
    const d = dist(t, p.center);
    if (d < bd) { bd = d; best = id; }
  });
  const site = best < 0 ? null : pm.provinces[best].city;
  const path = site && findCellPath(grid, cellAt(grid, t.x, t.y), cellAt(grid, site.x, site.y));
  if (!path) { for (const b of t.battalions) b.soldiers = 0; return; }
  t.path = path;
  t.routedUntil = s.clock + BATTLE.rout;
}
