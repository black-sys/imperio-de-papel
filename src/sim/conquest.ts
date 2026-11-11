import type { ProvinceMap } from '../worldgen/provinces';
import { DIPLO, OCCUPY, zeroRes } from './balance';
import { relate } from './diplomacy';
import type { MoveGrid } from './movegrid';
import { men, provinceAt } from './armies';
import { activeLevel, logEvent, type Building, type GameState } from './state';
import { hostile } from './war';

/** Meses de ocupação para a província cair: Guarnição ativa alonga; capital de alguma nação, mais ainda. */
export function occupyMonths(s: GameState, province: number): number {
  const lvl = Math.max(0, ...s.lots[province].map(b => (b?.type === 'garrison' ? activeLevel(b) : 0)));
  const capital = s.nations.some(n => n.alive && n.capital === province);
  return (lvl ? OCCUPY.garrison[lvl] : OCCUPY.base) + (capital ? OCCUPY.capital : 0);
}

/**
 * Passo fixo: província com dono onde há exército (fora de fuga) de nação em guerra com o dono e nenhum exército do
 * dono acumula meses de ocupação; com o dono presente a contagem para; sem ocupante, some. Ao completar, cai.
 */
export function occupationStep(s: GameState, pm: ProvinceMap, grid: MoveGrid, dt: number): void {
  const held = new Set<number>(), occupiers = new Map<number, Map<number, number>>();
  for (const a of s.armies) {
    if (a.owner < 0 || s.clock < a.routedUntil) continue;
    const p = provinceAt(pm, grid, a.x, a.y), o = p < 0 ? -1 : s.owner[p];
    if (o < 0) continue;
    if (o === a.owner) { held.add(p); continue; }
    if (!hostile(s, a.owner, o)) continue;
    const m = occupiers.get(p) ?? new Map<number, number>();
    m.set(a.owner, (m.get(a.owner) ?? 0) + men(a));
    occupiers.set(p, m);
  }
  s.occupations = s.occupations.filter(e => occupiers.get(e.province)?.has(e.nation));
  for (const [p, m] of [...occupiers].sort((x, y) => x[0] - y[0])) {
    let e = s.occupations.find(x => x.province === p);
    if (!e) {
      const [nation] = [...m].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0]; // mais homens; empate: menor id
      s.occupations.push(e = { province: p, nation, progress: 0 });
      if (s.owner[p] === 0) logEvent(s, `${pm.provinces[p].name} sob ocupação da ${s.nations[nation].name}`);
    }
    if (held.has(p)) continue;
    e.progress += dt;
    if (e.progress >= occupyMonths(s, p) - 1e-9) fall(s, pm, p, e.nation);
  }
}

/** Dano de guerra num prédio: perde um nível; N1 ou em obra é destruído. */
const hurt = (b: Building | null): Building | null => (!b || b.remaining > 0 || b.level <= 1 ? null : { ...b, level: b.level - 1 });

/** A província cai para a nação `n` com dano de guerra (`damage` false: cessão num tratado); se era capital, a dona é eliminada. */
export function fall(s: GameState, pm: ProvinceMap, province: number, n: number, damage = true): void {
  const prev = s.owner[province], name = pm.provinces[province].name;
  if (damage) {
    s.lots[province] = s.lots[province].map(hurt);
    s.veins[province] = s.veins[province].map(hurt);
    const c = s.city[province];
    s.city[province] = { level: Math.max(1, (c?.level ?? 1) - 1), remaining: 0 };
  }
  if (prev >= 0) relate(s, prev, n, DIPLO.events.province);
  s.recruiting = s.recruiting.filter(r => r.province !== province);
  s.colonizing = s.colonizing.filter(x => x.province !== province);
  s.routes = s.routes.filter(r => r.a !== province && r.b !== province);
  for (const a of s.armies) if (a.supply?.from === province) a.supply = null;
  s.occupations = s.occupations.filter(e => e.province !== province);
  s.connected[province] = false;
  s.owner[province] = n;
  if (n === 0 && s.nations[prev]) logEvent(s, `${name} tomada da ${s.nations[prev].name}`);
  if (prev === 0) logEvent(s, `${name} perdida para a ${s.nations[n].name}`);
  if (s.nations[prev]?.alive && s.nations[prev].capital === province) eliminate(s, pm, prev, n);
}

/** A nação sai do jogo: exércitos dispersos; as províncias que restam viram neutras, sem prédios nem rotas. */
export function eliminate(s: GameState, pm: ProvinceMap, loser: number, by: number): void {
  const L = s.nations[loser];
  if (!L?.alive) return;
  L.alive = false;
  L.atWar = [];
  for (const n of s.nations) n.atWar = n.atWar.filter(x => x !== loser);
  s.armies = s.armies.filter(a => a.owner !== loser);
  s.recruiting = s.recruiting.filter(r => s.owner[r.province] !== loser);
  s.colonizing = s.colonizing.filter(c => c.nation !== loser);
  s.routes = s.routes.filter(r => r.owner !== loser);
  s.owner.forEach((o, id) => {
    if (o !== loser) return;
    s.owner[id] = -1; s.city[id] = null; s.connected[id] = false; s.depot[id] = zeroRes();
    s.lots[id] = s.lots[id].map(() => null); s.veins[id] = s.veins[id].map(() => null);
  });
  s.occupations = s.occupations.filter(e => e.nation !== loser && s.owner[e.province] >= 0);
  logEvent(s, `A ${L.name} foi eliminada pela ${s.nations[by]?.name ?? 'guerra'}`);
  if (s.result) return;
  if (loser === 0) s.result = 'defeat';
  else if (s.nations[0].alive && s.nations.slice(1).every(n => !n.alive)) s.result = 'victory';
}
