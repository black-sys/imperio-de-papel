import { CELL, CHUNK, CHUNKS_PER_SIDE, HEIGHT_SCALE, SEA_LEVEL } from './constants';
import { fbm } from './noise';
import { finishChunk } from './resources';
import { subSeed } from './rng';
import { Biome, type ChunkData, type WorldMap } from './types';

const V = CHUNK + 1;
// tiles extras em volta. Cada passada que lê vizinhos encolhe a faixa válida em 1: classificação [0,P-1],
// afundamento [1,P-2], teto do rio [2,P-3], vértices [3,P-3]. Os vértices do chunk ([PAD, PAD+CHUNK]) precisam
// estar na faixa final, senão chunks vizinhos discordam (fendas).
const PAD = 3;
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
  const tTop = new Float32Array(P * P), tH = new Float32Array(P * P), tType = new Uint8Array(P * P), tLevel = new Float32Array(P * P), tWidth = new Float32Array(P * P), tBiome = new Uint8Array(P * P);
  const segs = riverSegments(map, cx, cy);
  // alturas cruas dos vértices com borda: vértice (i,j) = canto superior-esquerdo do tile (i,j)
  const PV = P + 1, raw = new Float32Array(PV * PV);
  for (let j = 0; j < PV; j++) for (let i = 0; i < PV; i++) raw[j * PV + i] = heightAt(map, seed, ox + i - PAD, oy + j - PAD);
  for (let ty = 0; ty < P; ty++) for (let tx = 0; tx < P; tx++) {
    const gx = ox + tx - PAD + 0.5, gy = oy + ty - PAD + 0.5, k = ty * P + tx;
    const jx = gx + (fbm(gx / 9, gy / 9, seed + 1, 3) - 0.5) * 6;
    const jy = gy + (fbm(gx / 9, gy / 9, seed + 2, 3) - 0.5) * 6;
    const cell = cellIndex(map, jx, jy);
    tBiome[k] = map.biome[cell];
    const c0 = raw[ty * PV + tx], c1 = raw[ty * PV + tx + 1], c2 = raw[(ty + 1) * PV + tx], c3 = raw[(ty + 1) * PV + tx + 1];
    const h = (c0 + c1 + c2 + c3) / 4, top = Math.max(c0, c1, c2, c3);
    tH[k] = h;
    // água parada decidida pelo canto mais alto do tile: tile seco sempre tem um canto acima do nível
    tTop[k] = top;
    const lakeL = lakeLevel(map, gx, gy);
    if (top < 0 && nearOcean(map, gx, gy)) { tType[k] = 1; tLevel[k] = 0; }
    else if (lakeL !== null && top < lakeL) { tType[k] = 2; tLevel[k] = lakeL; }
    else {
      const r = coveringRiver(segs, gx, gy);
      // nível limitado ao terreno: a água nunca fica acima da margem
      if (r) { tType[k] = 3; tLevel[k] = Math.min((r.surface - SEA_LEVEL) * HEIGHT_SCALE, h - 0.3); tWidth[k] = r.width; }
    }
    if (tType[k] === 1 || tType[k] === 2) tBiome[k] = Biome.Ocean;
    else if (tBiome[k] === Biome.Ocean) tBiome[k] = Biome.Beach; // terra seca que o jitter puxou de uma célula de mar
  }

  // tile seco com os 4 cantos encostando em água afundaria inteiro (cantos rebaixados): vira a água vizinha mais baixa
  const sunk: [number, number][] = [];
  const wet = (k: number) => tType[k] !== 0;
  for (let ty = 1; ty < P - 1; ty++) for (let tx = 1; tx < P - 1; tx++) {
    const k = ty * P + tx;
    if (tType[k] !== 0) continue;
    const tl = wet(k - 1) || wet(k - P) || wet(k - P - 1), tr = wet(k + 1) || wet(k - P) || wet(k - P + 1);
    const bl = wet(k - 1) || wet(k + P) || wet(k + P - 1), br = wet(k + 1) || wet(k + P) || wet(k + P + 1);
    if (!(tl && tr && bl && br)) continue;
    let src = -1;
    for (const n of [k - P - 1, k - P, k - P + 1, k - 1, k + 1, k + P - 1, k + P, k + P + 1])
      if (tType[n] && (src < 0 || tLevel[n] < tLevel[src])) src = n;
    sunk.push([k, src]);
  }
  for (const [k, n] of sunk) { tType[k] = tType[n]; tLevel[k] = tLevel[n]; tWidth[k] = tWidth[n]; if (tType[k] !== 3) tBiome[k] = Biome.Ocean; }

  // [2, P-3] borda de lago sobre terreno mais baixo: nível local ≤ canto mais alto do vizinho seco + 0.15
  const rim: [number, number][] = [];
  for (let ty = 2; ty < P - 2; ty++) for (let tx = 2; tx < P - 2; tx++) {
    const k = ty * P + tx;
    if (tType[k] !== 2) continue;
    let lv = tLevel[k];
    for (const n of [k - 1, k + 1, k - P, k + P]) if (!tType[n]) lv = Math.min(lv, tTop[n] + 0.15);
    if (lv < tLevel[k]) rim.push([k, lv]);
  }
  for (const [k, lv] of rim) tLevel[k] = lv;

  // rio em encosta: nível nunca acima do terreno dos vizinhos secos (senão a água "flutua" sobre a margem baixa)
  const capped: [number, number][] = [];
  for (let ty = 2; ty < P - 2; ty++) for (let tx = 2; tx < P - 2; tx++) {
    const k = ty * P + tx;
    if (tType[k] !== 3) continue;
    let lv = tLevel[k];
    for (const n of [k - 1, k + 1, k - P, k + P]) if (!tType[n]) lv = Math.min(lv, tH[n] - 0.3);
    if (lv < tLevel[k]) capped.push([k, lv]);
  }
  for (const [k, lv] of capped) tLevel[k] = lv;

  const heights = new Float32Array(V * V);
  for (let vy = 0; vy < V; vy++) for (let vx = 0; vx < V; vx++) {
    // encostando em terra seca, o vértice desce só até o nível da água (margem rasa, o tile seco não afunda);
    // cercado de água, desce até o fundo
    let h = raw[(vy + PAD) * PV + vx + PAD], shore = Infinity, deep = Infinity, dry = false;
    for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
      const k = (vy + PAD + dy) * P + (vx + PAD + dx), t = tType[k];
      if (!t) { dry = true; continue; }
      shore = Math.min(shore, tLevel[k]); deep = Math.min(deep, tLevel[k] - DEPTH[t]);
    }
    if (shore !== Infinity) h = Math.min(h, dry ? shore : deep);
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

/** Alguma célula de oceano num raio de 2 células. */
function nearOcean(map: WorldMap, gx: number, gy: number): boolean {
  const cx = Math.floor(gx / CELL), cy = Math.floor(gy / CELL), s = map.size;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x >= 0 && y >= 0 && x < s && y < s && map.water[y * s + x] === 1) return true;
  }
  return false;
}

/** Nível (altura de mundo) do lago mais alto entre as células de lago num raio de 2 células, ou null. */
function lakeLevel(map: WorldMap, gx: number, gy: number): number | null {
  const cx = Math.floor(gx / CELL), cy = Math.floor(gy / CELL), s = map.size;
  let best = -1;
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = cx + dx, y = cy + dy;
    if (x >= 0 && y >= 0 && x < s && y < s && map.water[y * s + x] === 2) best = Math.max(best, map.lakeSurface[y * s + x]);
  }
  return best < 0 ? null : (best - SEA_LEVEL) * HEIGHT_SCALE;
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

const MEANDER_AMP = 9, MEANDER_WAVE = 16, MOUTH_TAPER = 12; // tiles (fbm concentra perto de 0.5: deslocamento típico ~±3)
const pathCache = new WeakMap<WorldMap, number[][][]>();

/**
 * Rios finais em tiles: polilinha global suavizada (Chaikin) e deformada por um campo suave de posição.
 * O campo depende só de (x,y), então pontos de junção compartilhados se movem igual nos dois rios.
 * Cada ponto: [x, y, fluxo, superfície].
 */
export function riverPaths(map: WorldMap): number[][][] {
  const hit = pathCache.get(map);
  if (hit) return hit;
  const s = subSeed(map.seed, 'meandro');
  const paths = map.rivers.map(r => {
    // ponto final fica na célula de mar/lago, onde o fluxo é 0: herda o anterior para a foz não afinar
    let pts = Array.from({ length: r.points.length / 2 }, (_, i) => [r.points[2 * i], r.points[2 * i + 1], r.flow[i] || (i > 0 ? r.flow[i - 1] : 0), r.surface[i]]);
    for (let it = 0; it < 2; it++) pts = chaikin(pts);
    // foz em mar/lago: o meandro some nos últimos pontos para a ponta cair na água parada
    const last = r.points.length - 2;
    const endsInWater = map.water[Math.floor(r.points[last + 1] / CELL) * map.size + Math.floor(r.points[last] / CELL)] !== 0;
    return pts.map(([x, y, f, sf], i) => {
      const a = endsInWater ? Math.min(1, (pts.length - 1 - i) / MOUTH_TAPER) : 1;
      return [
        x + (fbm(x / MEANDER_WAVE, y / MEANDER_WAVE, s, 3) - 0.5) * 2 * MEANDER_AMP * a,
        y + (fbm(x / MEANDER_WAVE, y / MEANDER_WAVE, s + 1, 3) - 0.5) * 2 * MEANDER_AMP * a,
        f, sf,
      ];
    });
  });
  pathCache.set(map, paths);
  return paths;
}

function buildRiverIndex(map: WorldMap): Map<number, Seg[]> {
  const idx = new Map<number, Seg[]>();
  const M = 10 + MEANDER_AMP; // margem em tiles (meia largura máx + PAD + meandro)
  for (const pts of riverPaths(map)) {
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

/** Entre os trechos que cobrem o ponto (dist < largura/2), o mais largo; superfície do trecho mais próximo. */
function coveringRiver(segs: Seg[], x: number, y: number): { width: number; surface: number } | null {
  let width = 0, surface = 0, best = Infinity;
  for (const s of segs) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - s.ax) * dx + (y - s.ay) * dy) / l2));
    const px = s.ax + dx * t - x, py = s.ay + dy * t - y;
    const dist = Math.sqrt(px * px + py * py);
    const w = Math.min(8, 1 + Math.sqrt(s.fa + (s.fb - s.fa) * t) * 0.3);
    if (dist >= w / 2) continue;
    if (w > width) width = w;
    if (dist < best) { best = dist; surface = s.sa + (s.sb - s.sa) * t; }
  }
  return width > 0 ? { width, surface } : null;
}

// ---- usados pelo chunk grosso (LOD): mesmas regras do chunk completo ----

/** Altura de terreno (sem água) num ponto global em tiles, idêntica à do chunk completo. */
export function terrainHeight(map: WorldMap, gx: number, gy: number): number {
  return heightAt(map, subSeed(map.seed, 'chunk'), gx, gy);
}

/** Mar/lago que cobre um tile/bloco com o canto mais alto `top`, ou null. */
export function standingWaterAt(map: WorldMap, gx: number, gy: number, top: number): { type: 1 | 2; level: number } | null {
  if (top < 0 && nearOcean(map, gx, gy)) return { type: 1, level: 0 };
  const l = lakeLevel(map, gx, gy);
  return l !== null && top < l ? { type: 2, level: l } : null;
}
