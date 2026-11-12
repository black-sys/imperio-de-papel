import { CELL } from '../../worldgen/constants';
import type { ProvinceMap } from '../../worldgen/provinces';
import { cityLevel, type GameState } from '../../sim/state';
import { toScreen, toWorld, type View } from './view';

// carmim (jogador), azul-prússia, verde-garrafa, ocre, violeta: tintas de carta antiga
export const REALM_COLORS = ['#a8342a', '#2f4f7f', '#2f5d3a', '#b0802a', '#6a3f7a'], NEUTRAL = '#7a7468', INK = '#3e2a18', PAPER = '#f3e7c9', GOLD = '#f7d774';
/** Tamanhos dos marcadores na tela (px), compartilhados com o desenho. */
export const TROOP_W = 30, TROOP_H = 20, CITY_R = 14, FORT_R = 15;
export const FORT_DETAIL = 0.35; // abaixo desta escala (px/tile) as fortalezas não aparecem

export function provinceAtTile(pm: ProvinceMap, x: number, y: number): number {
  const S = Math.round(Math.sqrt(pm.cellProvince.length));
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return cx < 0 || cy < 0 || cx >= S || cy >= S ? -1 : pm.cellProvince[cy * S + cx];
}

/** Posição da cidade da província, ou null se ela ainda não tem cidade (neutra). */
export function cityAt(s: GameState, pm: ProvinceMap, id: number): { x: number; y: number } | null {
  return s.city[id] ? pm.provinces[id].city : null;
}

export const VEIN_DETAIL = 0.8, LOT_DETAIL = 2.5; // escalas (px/tile) a partir das quais veios livres e lotes aparecem (seus veios explorados: sempre) (lotes ficam a 4–10 tiles da cidade: menos que isso some sob o marcador dela)
export const SPOT_R = 10; // raio de clique de lote e veio (px)

/** Fator dos marcadores pelo zoom: 1 até 0,75 px/tile, dobra até 3 px/tile e para. */
export const markerScale = (scale: number) => Math.min(2, Math.max(1, 1 + (Math.log2(scale) - Math.log2(0.75)) / 2));
/** Lotes ficam a 4–10 tiles da cidade: só crescem quando há espaço (de bem perto). */
export const lotScale = (scale: number) => Math.min(markerScale(scale), Math.max(1, scale / 4));
/** Raio da cidade (px): base maior que a do ciclo 7; cresce com o zoom só até 3/4 da distância do lote mais perto. */
export function cityRadius(level: number, scale: number): number {
  const base = CITY_R + 5 + 2 * level; // nível 1: 21 px, ~1,6× o raio do ciclo 7
  return Math.min(base * markerScale(scale), Math.max(base, 3 * scale));
}
/** Lote na tela: na posição dele, ou empurrado para fora do círculo da cidade (mesma direção) quando ela o cobriria. */
export function lotOnScreen(s: GameState, pm: ProvinceMap, v: View, id: number, lot: number): [number, number] {
  const spot = pm.provinces[id].lots[lot], c = pm.provinces[id].city, [cx, cy] = toScreen(v, c.x, c.y), [x, y] = toScreen(v, spot.x, spot.y);
  const min = cityRadius(cityLevel(s, id), v.scale) + 12 * lotScale(v.scale), d = Math.hypot(x - cx, y - cy);
  if (d >= min) return [x, y];
  const a = d > 0.5 ? Math.atan2(y - cy, x - cx) : (lot / pm.provinces[id].lots.length) * 2 * Math.PI; // em cima da cidade: espalha pelo índice
  return [cx + Math.cos(a) * min, cy + Math.sin(a) * min];
}
/** Veio aparece (e é clicável)? Livre/alheio só de mais perto; o seu explorado sempre. */
export const veinVisible = (s: GameState, province: number, vein: number, scale: number) =>
  scale >= VEIN_DETAIL || (s.owner[province] === 0 && !!s.veins[province]?.[vein]);

export type Pick = { kind: 'army'; id: number } | { kind: 'city' | 'fortress' | 'province'; province: number }
  | { kind: 'lot'; province: number; lot: number } | { kind: 'vein'; province: number; vein: number } | null;

/** O que está sob o ponto da tela: tropa > cidade > fortaleza > província. */
export function pickAt(s: GameState, pm: ProvinceMap, v: View, sx: number, sy: number, mineOnly = true, pins: { x: number; y: number; province?: number }[] = []): Pick {
  const PAD = 14; // folga além do retângulo da tropa (acima fica o número)
  // os seus exércitos vêm antes de tudo; os alheios, depois das cidades (rival parado na própria cidade não a esconde);
  // guarnições de fortaleza nunca (não aparecem: ficam dentro do pentágono)
  let mine: { id: number; d: number } | null = null, other: { id: number; d: number } | null = null;
  for (const t of s.armies) {
    if ((t.owner === -1 && t.home >= 0) || (mineOnly && t.owner !== 0)) continue; // guarnição de fortaleza não; rebeldes sim
    const [px, py] = toScreen(v, t.x, t.y), dx = Math.abs(px - sx), dy = Math.abs(py - sy);
    if (dx > TROOP_W / 2 + PAD || dy > TROOP_H / 2 + PAD) continue;
    const d = dx + dy, cur = t.owner === 0 ? mine : other;
    if (!cur || d < cur.d) { if (t.owner === 0) mine = { id: t.id, d }; else other = { id: t.id, d }; }
  }
  if (mine) return { kind: 'army', id: mine.id };
  const near = (x: number, y: number, r: number) => { const [px, py] = toScreen(v, x, y); return Math.hypot(px - sx, py - sy) <= r; };
  for (let id = 0; id < s.owner.length; id++) { const c = s.owner[id] >= 0 ? cityAt(s, pm, id) : null; if (c && near(c.x, c.y, cityRadius(cityLevel(s, id), v.scale))) return { kind: 'city', province: id }; }
  if (other) return { kind: 'army', id: other.id };
  // lotes só das suas cidades (de perto); veios de qualquer província (é assim que se escolhe o que colonizar)
  if (v.scale >= LOT_DETAIL) for (let id = 0; id < s.owner.length; id++) {
    if (s.owner[id] !== 0) continue;
    const lots = pm.provinces[id].lots;
    for (let lot = 0; lot < lots.length; lot++) { const [lx, ly] = lotOnScreen(s, pm, v, id, lot); if (Math.hypot(lx - sx, ly - sy) <= SPOT_R * lotScale(v.scale)) return { kind: 'lot', province: id, lot }; }
  }
  for (const p of pm.provinces) for (let i = 0; i < p.veins.length; i++) if (veinVisible(s, p.id, i, v.scale) && near(p.veins[i].x, p.veins[i].y, SPOT_R * markerScale(v.scale))) return { kind: 'vein', province: p.id, vein: i };
  if (v.scale >= FORT_DETAIL) for (const f of s.fortresses) { const c = pm.provinces[f.province].city; if (c && near(c.x, c.y, FORT_R * markerScale(v.scale))) return { kind: 'fortress', province: f.province }; }
  // selo de capital sugerida (raio 11 px + folga): vale a província dele, mesmo que o centro caia fora dela
  for (const pin of pins) if (pin.province !== undefined && near(pin.x, pin.y, 13)) return { kind: 'province', province: pin.province };
  const [x, y] = toWorld(v, sx, sy), p = provinceAtTile(pm, x, y);
  return p >= 0 ? { kind: 'province', province: p } : null;
}

/** Tropas do jogador com o centro dentro do retângulo da tela (qualquer ordem dos cantos). */
export function armiesInRect(s: GameState, v: View, x0: number, y0: number, x1: number, y1: number): number[] {
  const [ax, bx] = [Math.min(x0, x1), Math.max(x0, x1)], [ay, by] = [Math.min(y0, y1), Math.max(y0, y1)];
  return s.armies.filter(t => { if (t.owner !== 0) return false; const [px, py] = toScreen(v, t.x, t.y); return px >= ax && px <= bx && py >= ay && py <= by; }).map(t => t.id);
}

/** Alvo do modo de traçar rota: só a província sob o ponteiro (tropas e marcadores não atrapalham o clique na cidade). */
export const routeTargetAt = (pm: ProvinceMap, v: View, sx: number, sy: number): number => provinceAtTile(pm, ...toWorld(v, sx, sy));
