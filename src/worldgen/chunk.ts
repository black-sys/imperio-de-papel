import { CELL, CHUNK, CHUNKS_PER_SIDE, HEIGHT_SCALE, SEA_LEVEL } from './constants';
import { fbm } from './noise';
import { finishChunk } from './resources';
import { subSeed } from './rng';
import { Biome, type ChunkData, type WorldMap } from './types';

const V = CHUNK + 1;
const PAD = 1; // tiles extras em volta: vértices de borda dependem de tiles do vizinho
const P = CHUNK + 2 * PAD;
const DETAIL_AMP: Record<Biome, number> = {
  [Biome.Ocean]: 1.0, [Biome.Beach]: 0.2, [Biome.Snow]: 4, [Biome.Taiga]: 1.5, [Biome.TemperateForest]: 1.2,
  [Biome.Grassland]: 0.6, [Biome.Swamp]: 0.2, [Biome.Savanna]: 0.8, [Biome.Desert]: 1.0, [Biome.Jungle]: 1.2, [Biome.Mountain]: 6,
};
const DEPTH = [0, 1.5, 1.5, 1.0]; // por tipo de água: seco, oceano, lago, rio

/** Chunk (cx,cy). Tudo é função das coordenadas globais de tile, então bordas vizinhas coincidem. */
export function generateChunk(map: WorldMap, cx: number, cy: number): ChunkData {
  if (cx < 0 || cy < 0 || cx >= CHUNKS_PER_SIDE || cy >= CHUNKS_PER_SIDE) return oceanChunk(cx, cy);
  const seed = subSeed(map.seed, 'chunk');
  const ox = cx * CHUNK, oy = cy * CHUNK;

  // tiles com borda de PAD: tipo de água, nível e largura do rio
  const tType = new Uint8Array(P * P), tLevel = new Float32Array(P * P), tWidth = new Float32Array(P * P), tBiome = new Uint8Array(P * P);
  const segs = riverSegments(map, cx, cy);
  for (let ty = 0; ty < P; ty++) for (let tx = 0; tx < P; tx++) {
    const gx = ox + tx - PAD + 0.5, gy = oy + ty - PAD + 0.5, k = ty * P + tx;
    const jx = gx + (fbm(gx / 9, gy / 9, seed + 1, 3) - 0.5) * 6;
    const jy = gy + (fbm(gx / 9, gy / 9, seed + 2, 3) - 0.5) * 6;
    const cell = cellIndex(map, jx, jy);
    tBiome[k] = map.biome[cell];
    if (map.water[cell] === 2) { tType[k] = 2; tLevel[k] = (map.lakeSurface[cell] - SEA_LEVEL) * HEIGHT_SCALE; }
    else if (map.water[cell] === 1 && heightAt(map, seed, gx, gy) < 0.5) { tType[k] = 1; tLevel[k] = 0; }
    else {
      const r = nearestRiver(segs, gx, gy);
      if (r && r.dist < r.width / 2) { tType[k] = 3; tLevel[k] = (r.surface - SEA_LEVEL) * HEIGHT_SCALE; tWidth[k] = r.width; }
    }
    if (tType[k] === 1 || tType[k] === 2) tBiome[k] = Biome.Ocean;
  }

  const heights = new Float32Array(V * V);
  for (let vy = 0; vy < V; vy++) for (let vx = 0; vx < V; vx++) {
    let h = heightAt(map, seed, ox + vx, oy + vy);
    // vértice desce abaixo de qualquer água vizinha (4 tiles ao redor, em coords com PAD)
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const k = (vy + PAD + dy) * P + (vx + PAD + dx), t = tType[k];
      if (t) h = Math.min(h, tLevel[k] - DEPTH[t]);
    }
    heights[vy * V + vx] = h;
  }

  const biome = new Uint8Array(CHUNK * CHUNK), water = new Uint8Array(CHUNK * CHUNK);
  const waterLevel = new Float32Array(CHUNK * CHUNK), riverWidth = new Float32Array(CHUNK * CHUNK);
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const k = (y + PAD) * P + x + PAD, t = y * CHUNK + x;
    biome[t] = tBiome[k]; water[t] = tType[k]; waterLevel[t] = tLevel[k]; riverWidth[t] = tWidth[k];
  }
  const chunk: ChunkData = { cx, cy, heights, biome, water, waterLevel, riverWidth, walk: new Uint8Array(CHUNK * CHUNK), resources: [] };
  return finishChunk(map, chunk);
}

function oceanChunk(cx: number, cy: number): ChunkData {
  const n = CHUNK * CHUNK;
  return {
    cx, cy, heights: new Float32Array(V * V).fill(-HEIGHT_SCALE * 0.2), biome: new Uint8Array(n), water: new Uint8Array(n).fill(1),
    waterLevel: new Float32Array(n), riverWidth: new Float32Array(n), walk: new Uint8Array(n), resources: [],
  };
}

function cellIndex(map: WorldMap, gx: number, gy: number): number {
  const x = Math.min(map.size - 1, Math.max(0, Math.floor(gx / CELL)));
  const y = Math.min(map.size - 1, Math.max(0, Math.floor(gy / CELL)));
  return y * map.size + x;
}

/** Altura de terreno (sem água) num ponto global em tiles. */
function heightAt(map: WorldMap, seed: number, gx: number, gy: number): number {
  const u = gx / CELL - 0.5, v = gy / CELL - 0.5;
  const e = bicubic(map.elevation, map.size, u, v);
  const amp = bilinear(map, u, v);
  return (e - SEA_LEVEL) * HEIGHT_SCALE + (fbm(gx / 6, gy / 6, seed, 4) - 0.5) * amp;
}

function sample(a: Float32Array, size: number, x: number, y: number): number {
  x = x < 0 ? 0 : x >= size ? size - 1 : x;
  y = y < 0 ? 0 : y >= size ? size - 1 : y;
  return a[y * size + x];
}
const cubic = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  p1 + 0.5 * t * (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)));

function bicubic(a: Float32Array, size: number, u: number, v: number): number {
  const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y;
  const r: number[] = [];
  for (let j = -1; j <= 2; j++)
    r.push(cubic(sample(a, size, x - 1, y + j), sample(a, size, x, y + j), sample(a, size, x + 1, y + j), sample(a, size, x + 2, y + j), fx));
  return cubic(r[0], r[1], r[2], r[3], fy);
}

/** Amplitude de detalhe interpolada entre células (sem saltos nas bordas de célula). */
function bilinear(map: WorldMap, u: number, v: number): number {
  const x = Math.floor(u), y = Math.floor(v), fx = u - x, fy = v - y, s = map.size;
  const amp = (cx: number, cy: number) => {
    cx = cx < 0 ? 0 : cx >= s ? s - 1 : cx; cy = cy < 0 ? 0 : cy >= s ? s - 1 : cy;
    return DETAIL_AMP[map.biome[cy * s + cx] as Biome];
  };
  const a = amp(x, y) + (amp(x + 1, y) - amp(x, y)) * fx;
  const b = amp(x, y + 1) + (amp(x + 1, y + 1) - amp(x, y + 1)) * fx;
  return a + (b - a) * fy;
}

// ---- rios: polilinhas suavizadas, indexadas por chunk ----

interface Seg { ax: number; ay: number; bx: number; by: number; fa: number; fb: number; sa: number; sb: number }
const riverIndex = new WeakMap<WorldMap, Map<number, Seg[]>>();

function riverSegments(map: WorldMap, cx: number, cy: number): Seg[] {
  let idx = riverIndex.get(map);
  if (!idx) { idx = buildRiverIndex(map); riverIndex.set(map, idx); }
  return idx.get(cy * CHUNKS_PER_SIDE + cx) ?? [];
}

function buildRiverIndex(map: WorldMap): Map<number, Seg[]> {
  const idx = new Map<number, Seg[]>();
  const M = 10; // margem em tiles (meia largura máx + PAD)
  for (const r of map.rivers) {
    let pts = Array.from({ length: r.points.length / 2 }, (_, i) => [r.points[2 * i], r.points[2 * i + 1], r.flow[i], r.surface[i]]);
    for (let it = 0; it < 2; it++) pts = chaikin(pts);
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay, fa, sa] = pts[i - 1], [bx, by, fb, sb] = pts[i];
      const s: Seg = { ax, ay, bx, by, fa, fb, sa, sb };
      const x0 = Math.floor((Math.min(ax, bx) - M) / CHUNK), x1 = Math.floor((Math.max(ax, bx) + M) / CHUNK);
      const y0 = Math.floor((Math.min(ay, by) - M) / CHUNK), y1 = Math.floor((Math.max(ay, by) + M) / CHUNK);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const key = y * CHUNKS_PER_SIDE + x;
        const list = idx.get(key);
        if (list) list.push(s); else idx.set(key, [s]);
      }
    }
  }
  return idx;
}

/** Chaikin mantendo as pontas; superfície usa o mínimo para nunca subir rio acima. */
function chaikin(p: number[][]): number[][] {
  if (p.length < 3) return p;
  const out = [p[0]];
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i], b = p[i + 1];
    out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25, a[3] * 0.75 + b[3] * 0.25]);
    out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75, a[3] * 0.25 + b[3] * 0.75]);
  }
  out.push(p[p.length - 1]);
  return out;
}

function nearestRiver(segs: Seg[], x: number, y: number): { dist: number; width: number; surface: number } | null {
  let best: { dist: number; width: number; surface: number } | null = null;
  for (const s of segs) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
    const px = s.ax + dx * t - x, py = s.ay + dy * t - y;
    const dist = Math.sqrt(px * px + py * py);
    if (best && dist >= best.dist) continue;
    const flow = s.fa + (s.fb - s.fa) * t;
    best = { dist, width: Math.min(8, 1 + Math.sqrt(flow) * 0.3), surface: s.sa + (s.sb - s.sa) * t };
  }
  return best;
}
