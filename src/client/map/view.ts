import { WORLD_TILES } from '../../worldgen/constants';

export const TILE_PX = 192, LEVELS = 7, MAX_SCALE = 12, MIN_SCALE = MAX_SCALE / 2 ** (LEVELS - 1); // 12 → 0,1875 px/tile

/** Vista do mapa: centro em tiles, escala em px por tile, tamanho da tela em px. */
export interface View { cx: number; cy: number; scale: number; w: number; h: number }
export interface TileId { L: number; x: number; y: number }

/** Zoom mínimo para esta tela: o de sempre, ou menor se a tela for baixa demais para o continente inteiro. */
export const minScale = (v: { w: number; h: number }) => Math.min(MIN_SCALE, Math.min(v.w, v.h) / WORLD_TILES);

export const toScreen = (v: View, x: number, y: number): [number, number] => [(x - v.cx) * v.scale + v.w / 2, (y - v.cy) * v.scale + v.h / 2];
export const toWorld = (v: View, sx: number, sy: number): [number, number] => [(sx - v.w / 2) / v.scale + v.cx, (sy - v.h / 2) / v.scale + v.cy];

/**
 * Zoom mínimo: continente centrado. Acima dele, o centro da vista só precisa ficar dentro do mundo (a borda chega no
 * máximo ao meio da tela). Prender mais que isso faria o zoom arrastar o ponto sob o mouse perto da costa — e as
 * capitais sugeridas ficam quase todas na costa.
 */
export function clampView(v: View): View {
  const lo = minScale(v), scale = Math.min(MAX_SCALE, Math.max(lo, v.scale));
  const axis = (c: number) => (scale <= lo ? WORLD_TILES / 2 : Math.min(WORLD_TILES, Math.max(0, c)));
  return { ...v, scale, cx: axis(v.cx), cy: axis(v.cy) };
}

/** Zoom mantendo fixo o ponto do mundo sob (sx, sy). */
export function zoomAt(v: View, sx: number, sy: number, factor: number): View {
  const [wx, wy] = toWorld(v, sx, sy), scale = Math.min(MAX_SCALE, Math.max(minScale(v), v.scale * factor));
  return clampView({ ...v, scale, cx: wx - (sx - v.w / 2) / scale, cy: wy - (sy - v.h / 2) / scale });
}

/** Maior nível cuja escala ainda é ≥ a da tela: o ladrilho só é reduzido, nunca ampliado. */
export function levelFor(scale: number): number {
  let L = 0;
  while (L < LEVELS - 1 && MAX_SCALE / 2 ** (L + 1) >= scale) L++;
  return L;
}

export const tileSpan = (L: number) => (TILE_PX / MAX_SCALE) * 2 ** L; // tiles do mundo por ladrilho (16 no nível 0, um chunk a 3 px/tile)

export function visibleTiles(v: View, L: number): TileId[] {
  const span = tileSpan(L), n = WORLD_TILES / span, [x0, y0] = toWorld(v, 0, 0), [x1, y1] = toWorld(v, v.w, v.h), out: TileId[] = [];
  const lo = (a: number) => Math.max(0, Math.floor(a / span)), hi = (a: number) => Math.min(n - 1, Math.floor(a / span));
  for (let y = lo(y0); y <= hi(y1); y++) for (let x = lo(x0); x <= hi(x1); x++) out.push({ L, x, y });
  return out;
}

export const fallbackFor = (t: TileId): TileId | null => (t.L >= LEVELS - 1 ? null : { L: t.L + 1, x: t.x >> 1, y: t.y >> 1 });
