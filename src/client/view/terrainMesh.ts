import * as THREE from 'three';
import { CHUNK } from '../../worldgen/constants';
import type { CoarseChunk } from '../../worldgen/coarse';
import { Biome, type ChunkData } from '../../worldgen/types';
import { BIOME_COLORS } from '../map2d';

const V = CHUNK + 1;
const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const waterMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.78, depthWrite: false });
const BED: [number, number, number] = [150, 140, 105];

const jitter = (n: number) => { // hash → [0,1)
  n = Math.imul(n ^ (n >>> 15), 2246822507); n = Math.imul(n ^ (n >>> 13), 3266489909);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

/** Terreno low-poly: 2 triângulos por tile, cor chapada por triângulo. */
export function buildTerrain(c: ChunkData): THREE.Mesh {
  const pos = new Float32Array(CHUNK * CHUNK * 18), col = new Float32Array(CHUNK * CHUNK * 18);
  const ox = c.cx * CHUNK, oz = c.cy * CHUNK;
  let p = 0;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const t = y * CHUNK + x;
    const h00 = c.heights[y * V + x], h10 = c.heights[y * V + x + 1], h01 = c.heights[(y + 1) * V + x], h11 = c.heights[(y + 1) * V + x + 1];
    const base = c.water[t] === 1 || c.water[t] === 2 ? BED : BIOME_COLORS[c.biome[t] as Biome];
    const tris = [[x, y, h00, x, y + 1, h01, x + 1, y, h10], [x + 1, y, h10, x, y + 1, h01, x + 1, y + 1, h11]];
    for (let k = 0; k < 2; k++) {
      const f = (0.92 + jitter(((ox + x) * 73856093) ^ ((oz + y) * 19349663) ^ k) * 0.16) / 255;
      const tr = tris[k];
      for (let v = 0; v < 3; v++) {
        pos[p] = ox + tr[v * 3]; pos[p + 1] = tr[v * 3 + 2]; pos[p + 2] = oz + tr[v * 3 + 1];
        col[p] = base[0] * f; col[p + 1] = base[1] * f; col[p + 2] = base[2] * f;
        p += 3;
      }
    }
  }
  return meshWithSkirt(pos, col, ox, oz, CHUNK, 1, (i, j) => c.heights[j * V + i]);
}

const SKIRT = 3;
/** Junta a malha com uma "saia" vertical nas 4 bordas (esconde frestas entre níveis de LOD). */
function meshWithSkirt(pos: Float32Array, col: Float32Array, ox: number, oz: number, n: number, step: number, h: (i: number, j: number) => number): THREE.Mesh {
  const sp: number[] = [], sc: number[] = [];
  const edge = (i0: number, j0: number, i1: number, j1: number) => {
    const x0 = ox + i0 * step, z0 = oz + j0 * step, x1 = ox + i1 * step, z1 = oz + j1 * step, a = h(i0, j0), b = h(i1, j1);
    sp.push(x0, a, z0, x1, b, z1, x0, a - SKIRT, z0, x1, b, z1, x1, b - SKIRT, z1, x0, a - SKIRT, z0);
    for (let k = 0; k < 6; k++) sc.push(0.33, 0.29, 0.24);
  };
  for (let i = 0; i < n; i++) { edge(i, 0, i + 1, 0); edge(i + 1, n, i, n); edge(0, i + 1, 0, i); edge(n, i, n, i + 1); }
  const P = new Float32Array(pos.length + sp.length), C = new Float32Array(col.length + sc.length);
  P.set(pos); P.set(sp, pos.length); C.set(col); C.set(sc, col.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.BufferAttribute(C, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, terrainMat);
}

/** Terreno de LOD: 2 triângulos por bloco step×step, cor do bioma do bloco. */
export function buildCoarseTerrain(c: CoarseChunk): THREE.Mesh {
  const B = CHUNK / c.step, N = B + 1, s = c.step;
  const pos = new Float32Array(B * B * 18), col = new Float32Array(B * B * 18);
  const ox = c.cx * CHUNK, oz = c.cy * CHUNK;
  let p = 0;
  for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
    const b = j * B + i, H = (a: number, d: number) => c.heights[(j + d) * N + i + a];
    const base = c.water[b] ? BED : BIOME_COLORS[c.biome[b] as Biome];
    const tris = [[0, 0, 0, 1, 1, 0], [1, 0, 0, 1, 1, 1]];
    for (let k = 0; k < 2; k++) {
      const f = (0.92 + jitter(((ox + i * s) * 73856093) ^ ((oz + j * s) * 19349663) ^ k) * 0.16) / 255, t = tris[k];
      for (let v = 0; v < 3; v++) {
        const a = t[v * 2], d = t[v * 2 + 1];
        pos[p] = ox + (i + a) * s; pos[p + 1] = H(a, d); pos[p + 2] = oz + (j + d) * s;
        col[p] = base[0] * f; col[p + 1] = base[1] * f; col[p + 2] = base[2] * f;
        p += 3;
      }
    }
  }
  return meshWithSkirt(pos, col, ox, oz, B, s, (i, j) => c.heights[j * N + i]);
}

/** Água de LOD: um quad por bloco com mar/lago, sem animação. */
export function buildCoarseWater(c: CoarseChunk): THREE.Mesh | null {
  const B = CHUNK / c.step, s = c.step, pos: number[] = [];
  const ox = c.cx * CHUNK, oz = c.cy * CHUNK;
  for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
    const b = j * B + i;
    if (!c.water[b]) continue;
    const h = c.waterLevel[b] - 0.15, X = ox + i * s, Z = oz + j * s;
    pos.push(X, h, Z, X, h, Z + s, X + s, h, Z, X + s, h, Z, X, h, Z + s, X + s, h, Z + s);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, k) => [0.24, 0.45, 0.78][k % 3]), 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, waterMat);
  m.renderOrder = 1;
  return m;
}

/** Altura bilinear num chunk grosso. */
export function coarseHeight(c: CoarseChunk, x: number, y: number): number {
  const N = CHUNK / c.step + 1;
  const lx = Math.min(CHUNK - 1e-6, Math.max(0, x - c.cx * CHUNK)) / c.step, ly = Math.min(CHUNK - 1e-6, Math.max(0, y - c.cy * CHUNK)) / c.step;
  const ix = Math.floor(lx), iy = Math.floor(ly), fx = lx - ix, fy = ly - iy, h = c.heights;
  const a = h[iy * N + ix] + (h[iy * N + ix + 1] - h[iy * N + ix]) * fx;
  const b = h[(iy + 1) * N + ix] + (h[(iy + 1) * N + ix + 1] - h[(iy + 1) * N + ix]) * fx;
  return a + (b - a) * fy;
}

/** Superfície da água: um quad por tile com água, no nível do tile. */
export function buildWater(c: ChunkData): THREE.Mesh | null {
  const pos: number[] = [], col: number[] = [];
  const ox = c.cx * CHUNK, oz = c.cy * CHUNK;
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const t = y * CHUNK + x;
    if (!c.water[t]) continue;
    const h = c.waterLevel[t] - 0.15, X = ox + x, Z = oz + y;
    pos.push(X, h, Z, X, h, Z + 1, X + 1, h, Z, X + 1, h, Z, X, h, Z + 1, X + 1, h, Z + 1);
    const f = 0.95 + jitter((X * 31) ^ (Z * 977)) * 0.1;
    const rgb = c.water[t] === 3 ? [0.29, 0.52, 0.86] : [0.24, 0.45, 0.78];
    for (let i = 0; i < 6; i++) col.push(rgb[0] * f, rgb[1] * f, rgb[2] * f);
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, waterMat);
  m.renderOrder = 1;
  return m;
}

/** Altura bilinear do terreno dentro de um chunk (coords globais em tiles). */
export function chunkHeight(c: ChunkData, x: number, y: number): number {
  const lx = Math.min(CHUNK - 1e-6, Math.max(0, x - c.cx * CHUNK)), ly = Math.min(CHUNK - 1e-6, Math.max(0, y - c.cy * CHUNK));
  const ix = Math.floor(lx), iy = Math.floor(ly), fx = lx - ix, fy = ly - iy, h = c.heights;
  const a = h[iy * V + ix] + (h[iy * V + ix + 1] - h[iy * V + ix]) * fx;
  const b = h[(iy + 1) * V + ix] + (h[(iy + 1) * V + ix + 1] - h[(iy + 1) * V + ix]) * fx;
  return a + (b - a) * fy;
}
