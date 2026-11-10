import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHUNK } from '../../worldgen/constants';
import { Biome, type ChunkData } from '../../worldgen/types';

export type FloraKind = 'grass' | 'bush' | 'flower' | 'reed' | 'cactus';
export interface FloraItem { kind: FloraKind; x: number; y: number; s: number }

/** Chance por tile de cada planta decorativa, por bioma (juncos só na beira d'água). */
const BY_BIOME: Partial<Record<Biome, [FloraKind, number][]>> = {
  [Biome.Grassland]: [['grass', 0.6], ['flower', 0.15]],
  [Biome.Savanna]: [['grass', 0.45], ['bush', 0.04]],
  [Biome.TemperateForest]: [['grass', 0.35], ['bush', 0.12], ['flower', 0.08]],
  [Biome.Taiga]: [['bush', 0.1], ['grass', 0.15]],
  [Biome.Jungle]: [['bush', 0.3], ['grass', 0.3]],
  [Biome.Swamp]: [['reed', 0.35], ['grass', 0.3]],
  [Biome.Desert]: [['cactus', 0.04]],
};
const REED_NEAR_WATER = 0.5;

const hash = (x: number, y: number, k: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(k, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Plantas só decorativas (sem ID, não bloqueiam): posição por hash do tile, fora da água e de tiles com recurso. */
export function placeFlora(c: ChunkData, density: number): FloraItem[] {
  if (density <= 0) return [];
  const out: FloraItem[] = [];
  const taken = new Set(c.resources.map(r => (Math.floor(r.y) - c.cy * CHUNK) * CHUNK + Math.floor(r.x) - c.cx * CHUNK));
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const t = y * CHUNK + x;
    if (c.water[t] || taken.has(t)) continue;
    const gx = c.cx * CHUNK + x, gy = c.cy * CHUNK + y;
    const list = [...(BY_BIOME[c.biome[t] as Biome] ?? [])];
    const nearWater = [t - 1, t + 1, t - CHUNK, t + CHUNK].some(n => n >= 0 && n < CHUNK * CHUNK && c.water[n]);
    if (nearWater && c.biome[t] !== Biome.Desert && c.biome[t] !== Biome.Snow) list.push(['reed', REED_NEAR_WATER]);
    list.forEach(([kind, p], k) => {
      if (hash(gx, gy, k) >= p * density) return;
      out.push({ kind, x: gx + 0.15 + hash(gx, gy, k + 11) * 0.7, y: gy + 0.15 + hash(gx, gy, k + 23) * 0.7, s: 0.7 + hash(gx, gy, k + 37) * 0.6 });
    });
  }
  return out;
}

function part(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  if (g.index) g = g.toNonIndexed();
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const blade = (x: number, z: number, h: number, c: number) => part(new THREE.ConeGeometry(0.05, h, 3), c, x, h / 2, z);
const GEOMS: Record<FloraKind, THREE.BufferGeometry> = {
  grass: mergeGeometries([blade(0, 0, 0.35, 0x6f9a3f), blade(0.08, 0.05, 0.28, 0x7fae4a), blade(-0.06, 0.06, 0.3, 0x5f8a35)])!,
  bush: mergeGeometries([part(new THREE.IcosahedronGeometry(0.3, 0), 0x4c7a36, 0, 0.22, 0), part(new THREE.IcosahedronGeometry(0.22, 0), 0x5a8a3e, 0.2, 0.18, 0.05)])!,
  flower: mergeGeometries([blade(0, 0, 0.25, 0x5f8a35), part(new THREE.IcosahedronGeometry(0.07, 0), 0xe8c33a, 0, 0.27, 0), blade(0.1, 0.04, 0.22, 0x5f8a35), part(new THREE.IcosahedronGeometry(0.06, 0), 0xd9534f, 0.1, 0.24, 0.04)])!,
  reed: mergeGeometries([blade(0, 0, 0.7, 0x7d8a45), blade(0.07, 0.04, 0.6, 0x8a9550), blade(-0.05, -0.05, 0.65, 0x6f7d3d)])!,
  cactus: part(new THREE.CylinderGeometry(0.07, 0.08, 0.4, 5), 0x5f8f4f, 0, 0.2, 0),
};
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

/** Instâncias de plantas por chunk L0. */
export class Flora {
  private groups = new Map<string, THREE.Group>();
  constructor(private scene: THREE.Scene) {}

  add(key: string, c: ChunkData, density: number, heightAt: (x: number, y: number) => number, hidden?: Set<number>): void {
    this.remove(key);
    const items = placeFlora(c, density).filter(it => !hidden?.has(Math.floor(it.y) * 4096 + Math.floor(it.x)));
    if (!items.length) return;
    const g = new THREE.Group(), byKind = new Map<FloraKind, FloraItem[]>();
    for (const it of items) (byKind.get(it.kind) ?? byKind.set(it.kind, []).get(it.kind)!).push(it);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [kind, list] of byKind) {
      const inst = new THREE.InstancedMesh(GEOMS[kind], MAT, list.length);
      list.forEach((it, i) => {
        q.setFromAxisAngle(up, (it.x * 7.3 + it.y * 3.1) % (Math.PI * 2));
        inst.setMatrixAt(i, m.compose(p.set(it.x, heightAt(it.x, it.y), it.y), q, s.setScalar(it.s)));
      });
      inst.computeBoundingSphere();
      inst.receiveShadow = true;
      g.add(inst);
    }
    this.scene.add(g);
    this.groups.set(key, g);
  }

  remove(key: string): void {
    const g = this.groups.get(key);
    if (!g) return;
    this.scene.remove(g);
    for (const o of g.children) (o as THREE.InstancedMesh).dispose();
    this.groups.delete(key);
  }
}
