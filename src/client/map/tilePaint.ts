import { generateChunk } from '../../worldgen/chunk';
import { CELL, CHUNK, HEIGHT_SCALE, SEA_LEVEL } from '../../worldgen/constants';
import { finishChunk } from '../../worldgen/resources';
import { Biome, type ChunkData, type WorldMap } from '../../worldgen/types';
import { MAX_SCALE, TILE_PX, tileSpan } from './view';

type RGB = [number, number, number];
const CHUNK_SCALE = 1.5; // px/tile a partir do qual os ladrilhos usam os dados de chunk (por tile)
const PAPER: RGB = [240, 228, 198], FRESH: RGB = [110, 145, 160], INK: RGB = [62, 42, 24];
const TINT: Record<number, RGB> = {
  [Biome.Ocean]: [150, 178, 180], [Biome.Beach]: [226, 208, 160], [Biome.Snow]: [236, 234, 226], [Biome.Taiga]: [92, 114, 92],
  [Biome.TemperateForest]: [104, 136, 78], [Biome.Grassland]: [204, 205, 150], [Biome.Swamp]: [138, 150, 118], [Biome.Savanna]: [214, 196, 140],
  [Biome.Desert]: [226, 200, 150], [Biome.Jungle]: [88, 140, 78], [Biome.Mountain]: [180, 168, 150],
};

/** Cor do alto-mar como `paintTile` a produz longe da costa (média da textura): fundo de fora do mundo. */
export const OPEN_SEA = 'rgb(196,209,211)'; // medido no navegador ao lado do fundo

const hash = (x: number, y: number) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** LRU de chunks completos (com árvores), compartilhado pelos níveis 0 e 1. */
export function makeChunkCache(map: WorldMap, max = 256): (cx: number, cy: number) => ChunkData {
  const cache = new Map<number, ChunkData>();
  return (cx, cy) => {
    const k = cy * 4096 + cx;
    let c = cache.get(k);
    if (c) { cache.delete(k); cache.set(k, c); return c; }
    c = finishChunk(map, generateChunk(map, cx, cy));
    cache.set(k, c);
    if (cache.size > max) cache.delete(cache.keys().next().value!);
    return c;
  };
}

// distância (em tiles) de cada célula de oceano até a terra, para o mar clarear longe da costa
const seaDist = new WeakMap<WorldMap, Float32Array>();
function seaDistance(map: WorldMap): Float32Array {
  let d = seaDist.get(map);
  if (d) return d;
  const S = map.size;
  d = new Float32Array(S * S).fill(1e9);
  for (let i = 0; i < S * S; i++) if (map.water[i] !== 1) d[i] = 0;
  for (let pass = 0; pass < 2; pass++) for (let k = 0; k < S * S; k++) {
    const i = pass ? S * S - 1 - k : k, x = i % S, y = (i / S) | 0, s = pass ? 1 : -1;
    for (const [dx, dy, c] of [[s, 0, 1], [0, s, 1], [s, s, 1.414], [-s, s, 1.414]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < S && ny < S && d[ny * S + nx] + c < d[i]) d[i] = d[ny * S + nx] + c;
    }
  }
  for (let i = 0; i < d.length; i++) d[i] *= CELL;
  seaDist.set(map, d);
  return d;
}

/**
 * Grade local da região do ladrilho na resolução da fonte (1 nó por tile nos níveis 0–1, por célula nos demais),
 * com folga (PAD) para o bilinear, o gradiente e os borrões. Por pixel só se interpola: rápido e igual dos dois lados de uma emenda.
 */
interface Grid { res: number; ox: number; oy: number; n: number; wet: Float32Array; river: Float32Array; shade: Float32Array; tr: Float32Array; tg: Float32Array; tb: Float32Array }

function buildGrid(map: WorldMap, L: number, x0: number, y0: number, span: number, chunk: (cx: number, cy: number) => ChunkData): Grid {
  // folga: 2 nós (bilinear + gradiente) + o alcance dos borrões abaixo, para a emenda sair igual dos dois lados
  const res = MAX_SCALE / 2 ** L >= CHUNK_SCALE ? 1 : CELL, HB = res === 1 ? 4 : 1, PAD = 2 + 2 * HB, n = Math.ceil(span / res) + 2 * PAD;
  const gx0 = Math.floor(x0 / res) - PAD, gy0 = Math.floor(y0 / res) - PAD, N = n * n;
  const wet = new Float32Array(N), river = new Float32Array(N), height = new Float32Array(N), biome = new Uint8Array(N), shade = new Float32Array(N);
  if (res === 1) {
    let c: ChunkData | null = null;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const tx = gx0 + i, ty = gy0 + j, cx = Math.floor(tx / CHUNK), cy = Math.floor(ty / CHUNK);
      if (!c || c.cx !== cx || c.cy !== cy) c = chunk(cx, cy);
      const lx = tx - cx * CHUNK, ly = ty - cy * CHUNK, t = ly * CHUNK + lx, W = CHUNK + 1, v = ly * W + lx, H = c.heights, k = j * n + i;
      wet[k] = c.water[t] === 1 || c.water[t] === 2 ? 1 : 0; river[k] = c.water[t] === 3 ? 1 : 0; biome[k] = c.biome[t];
      height[k] = (H[v] + H[v + 1] + H[v + W] + H[v + W + 1]) / 4;
    }
  } else {
    const S = map.size;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = Math.min(S - 1, Math.max(0, gx0 + i)), cy = Math.min(S - 1, Math.max(0, gy0 + j)), c = cy * S + cx, k = j * n + i;
      wet[k] = map.water[c] ? 1 : 0; river[k] = map.river[c] && !map.water[c] ? 1 : 0; biome[k] = map.biome[c];
      height[k] = (map.elevation[c] - SEA_LEVEL) * HEIGHT_SCALE;
    }
  }
  // a erosão deixa sulcos retos de uma célula (4 tiles) que a luz rasante vira faixas: o relevo é sombreado já sem eles
  blur(height, n, HB); blur(height, n, HB);
  // relevo: luz de noroeste; mais suave de longe
  const hk = 0.18 * Math.min(1, (MAX_SCALE / 2 ** L) * 1.5);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const at = (a: number, b: number) => height[Math.min(n - 1, Math.max(0, b)) * n + Math.min(n - 1, Math.max(0, a))];
    const gx = (at(i + 1, j) - at(i - 1, j)) / (2 * res), gy = (at(i, j + 1) - at(i, j - 1)) / (2 * res);
    shade[j * n + i] = Math.max(0.62, Math.min(1.12, 1 - (gx + gy) * hk));
  }
  // cor do bioma por nó, interpolada depois por pixel: de perto a troca de bioma vira uma passagem suave, não quadrados
  const tr = new Float32Array(N), tg = new Float32Array(N), tb = new Float32Array(N);
  for (let k = 0; k < N; k++) { const t = TINT[biome[k]] ?? TINT[Biome.Grassland]; tr[k] = t[0]; tg[k] = t[1]; tb[k] = t[2]; }
  // o bioma vem por célula (4 tiles): sem borrão, a borda vira degraus
  for (const a of [tr, tg, tb]) blur(a, n, res === 1 ? 3 : 1);
  // na resolução de tile, água e rio passam por um borrão 3×3: o contorno sai arredondado em vez de em degraus
  if (res === 1) for (const a of [wet, river]) {
    const src = a.slice();
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
      let sum = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) sum += src[(j + dj) * n + i + di] * (di || dj ? (di && dj ? 1 : 2) : 4);
      a[j * n + i] = sum / 16;
    }
  }
  return { res, ox: gx0 * res + res / 2, oy: gy0 * res + res / 2, n, wet, river, shade, tr, tg, tb };
}

/**
 * Ladrilho TILE_PX² do nível L (escala 3/2^L px/tile) na posição (tx, ty) da grade do nível.
 * De 1,5 px/tile para perto usa chunks (costa, rios e árvores no detalhe do tile); mais longe, o mapa global.
 */
export function paintTile(map: WorldMap, L: number, tx: number, ty: number, chunk: (cx: number, cy: number) => ChunkData): Uint8ClampedArray {
  const scale = MAX_SCALE / 2 ** L, span = tileSpan(L), x0 = tx * span, y0 = ty * span, k = 1 / scale;
  const G = buildGrid(map, L, x0, y0, span, chunk), dist = seaDistance(map), S = map.size, n = G.n;
  const P = TILE_PX + 2, out = new Uint8ClampedArray(TILE_PX * TILE_PX * 4);
  // amostra bilinear da grade no ponto do mundo (x, y): pesos em `wt`, índice do canto em `base`
  let base = 0, fx = 0, fy = 0;
  const locate = (x: number, y: number) => {
    const gx = (x - G.ox) / G.res, gy = (y - G.oy) / G.res, i = Math.floor(gx), j = Math.floor(gy);
    fx = gx - i; fy = gy - j; base = j * n + i;
  };
  const bil = (a: Float32Array) => a[base] * (1 - fx) * (1 - fy) + a[base + 1] * fx * (1 - fy) + a[base + n] * (1 - fx) * fy + a[base + n + 1] * fx * fy;
  // máscara com 1 px de borda: a linha de costa é igual dos dois lados da emenda
  const water = new Uint8Array(P * P);
  for (let py = 0; py < P; py++) for (let px = 0; px < P; px++) {
    locate(x0 + (px - 0.5) * k, y0 + (py - 0.5) * k);
    water[py * P + px] = bil(G.wet) > 0.5 ? 1 : bil(G.river) > (G.res === 1 ? 0.3 : 0.45) ? 2 : 0; // rio borrado: limiar menor para não afinar
  }
  for (let py = 0; py < TILE_PX; py++) for (let px = 0; px < TILE_PX; px++) {
    const x = x0 + (px + 0.5) * k, y = y0 + (py + 0.5) * k, wx = Math.floor(x * scale), wy = Math.floor(y * scale);
    const g = 0.94 + hash(wx, wy) * 0.06 - hash(wx >> 4, wy >> 4) * 0.04;
    const m = water[(py + 1) * P + px + 1], o = (py * TILE_PX + px) * 4;
    let t0: number, t1: number, t2: number;
    if (m === 1) {
      const d = dist[Math.min(S - 1, Math.max(0, Math.floor(y / CELL))) * S + Math.min(S - 1, Math.max(0, Math.floor(x / CELL)))];
      if (d > 0) { t0 = 150 + Math.min(40, d); t1 = 178 + Math.min(30, d * 0.8); t2 = 186 + Math.min(30, d * 0.8); } // mar: azul-acinzentado clareando
      else { t0 = FRESH[0]; t1 = FRESH[1]; t2 = FRESH[2]; } // distância 0 = lago
    } else if (m === 2) { t0 = FRESH[0]; t1 = FRESH[1]; t2 = FRESH[2]; }
    else {
      locate(x, y);
      const sh = bil(G.shade);
      t0 = bil(G.tr) * sh; t1 = bil(G.tg) * sh; t2 = bil(G.tb) * sh;
    }
    const w = (m ? 0.8 : 0.55) + 0.1 * hash(wx >> 3, wy >> 3); // água pede mais tinta: o papel quente apagaria o azul
    let r = PAPER[0] * g * (1 - w) + t0 * w, gg = PAPER[1] * g * (1 - w) + t1 * w, b = PAPER[2] * g * (1 - w) + t2 * w;
    // costa em tinta: terra encostando em mar/lago
    const q = (py + 1) * P + px + 1;
    if (m === 0 && (water[q + 1] === 1 || water[q - 1] === 1 || water[q + P] === 1 || water[q - P] === 1)) { r = r * 0.15 + INK[0] * 0.85; gg = gg * 0.15 + INK[1] * 0.85; b = b * 0.15 + INK[2] * 0.85; }
    out[o] = r; out[o + 1] = gg; out[o + 2] = b; out[o + 3] = 255;
  }
  return out;
}

/** Borrão de caixa separável de raio r nós, no lugar (bordas presas). */
function blur(a: Float32Array, n: number, r: number): void {
  const tmp = new Float32Array(a.length), w = 1 / (2 * r + 1);
  for (const [src, dst, sx, sy] of [[a, tmp, 1, n], [tmp, a, n, 1]] as const)
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let d = -r; d <= r; d++) { const q = Math.min(n - 1, Math.max(0, i + d)); sum += src[j * sy + q * sx]; }
      dst[j * sy + i * sx] = sum * w;
    }
}
