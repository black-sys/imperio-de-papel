import * as THREE from 'three';
import { CHUNK } from '../../worldgen/constants';
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
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, terrainMat);
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
