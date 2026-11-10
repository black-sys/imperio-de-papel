import { CELL } from '../../worldgen/constants';
import type { ProvinceMap } from '../../worldgen/provinces';
import type { GameState } from '../../sim/state';
import { toScreen, toWorld, type View } from './view';

export const REALM_COLORS = ['#a8342a'], NEUTRAL = '#7a7468', INK = '#3e2a18', PAPER = '#f3e7c9', GOLD = '#f7d774';
/** Tamanhos dos marcadores na tela (px), compartilhados com o desenho. */
export const TROOP_W = 30, TROOP_H = 20, CITY_R = 14, FORT_R = 15;

export function provinceAtTile(pm: ProvinceMap, x: number, y: number): number {
  const S = Math.round(Math.sqrt(pm.cellProvince.length));
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return cx < 0 || cy < 0 || cx >= S || cy >= S ? -1 : pm.cellProvince[cy * S + cx];
}

/** Posição da cidade da província (a vila), ou null se não houver. */
export function cityAt(s: GameState, pm: ProvinceMap, id: number): { x: number; y: number } | null {
  const slot = s.buildings[id]?.findIndex(b => b?.type === 'village') ?? -1;
  const site = slot >= 0 ? pm.provinces[id].sites[slot] : null;
  return site ? { x: site.x, y: site.y } : null;
}

export type Pick = { kind: 'troop'; id: number } | { kind: 'city' | 'fortress' | 'province'; province: number } | null;

/** O que está sob o ponto da tela: tropa > cidade > fortaleza > província. */
export function pickAt(s: GameState, pm: ProvinceMap, v: View, sx: number, sy: number, mineOnly = true): Pick {
  const PAD = 14; // folga além do retângulo da tropa (acima fica o número)
  let best: { id: number; d: number } | null = null;
  for (const t of s.troops) {
    if (mineOnly && t.owner !== 0) continue;
    const [px, py] = toScreen(v, t.x, t.y), dx = Math.abs(px - sx), dy = Math.abs(py - sy);
    if (dx > TROOP_W / 2 + PAD || dy > TROOP_H / 2 + PAD) continue;
    const d = dx + dy;
    if (!best || d < best.d) best = { id: t.id, d };
  }
  if (best) return { kind: 'troop', id: best.id };
  const near = (x: number, y: number, r: number) => { const [px, py] = toScreen(v, x, y); return Math.hypot(px - sx, py - sy) <= r; };
  for (let id = 0; id < s.owner.length; id++) { const c = s.owner[id] >= 0 ? cityAt(s, pm, id) : null; if (c && near(c.x, c.y, CITY_R)) return { kind: 'city', province: id }; }
  for (const f of s.fortresses) { const c = pm.provinces[f.province].sites[0]; if (c && near(c.x, c.y, FORT_R)) return { kind: 'fortress', province: f.province }; }
  const [x, y] = toWorld(v, sx, sy), p = provinceAtTile(pm, x, y);
  return p >= 0 ? { kind: 'province', province: p } : null;
}

/** Tropas do jogador com o centro dentro do retângulo da tela (qualquer ordem dos cantos). */
export function troopsInRect(s: GameState, v: View, x0: number, y0: number, x1: number, y1: number): number[] {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  return s.troops.filter(t => { if (t.owner !== 0) return false; const [px, py] = toScreen(v, t.x, t.y); return px >= ax && px <= bx && py >= ay && py <= by; }).map(t => t.id);
}
