import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ChunkData, ResourceKind } from '../../worldgen/types';
import { chunkHeight } from './terrainMesh';

function part(g: THREE.BufferGeometry, color: number, y: number): THREE.BufferGeometry {
  if (g.index) g = g.toNonIndexed();
  g.translate(0, y, 0);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const GEOMS: Record<ResourceKind, THREE.BufferGeometry> = {
  pine: mergeGeometries([part(new THREE.CylinderGeometry(0.1, 0.12, 0.6, 5), 0x6b4a2f, 0.3), part(new THREE.ConeGeometry(0.55, 1.1, 6), 0x2f5f3f, 1.0), part(new THREE.ConeGeometry(0.4, 0.8, 6), 0x386b48, 1.5)])!,
  tree: mergeGeometries([part(new THREE.CylinderGeometry(0.1, 0.14, 0.7, 5), 0x6b4a2f, 0.35), part(new THREE.IcosahedronGeometry(0.6, 0), 0x4f8f3f, 1.15)])!,
  cactus: mergeGeometries([part(new THREE.CylinderGeometry(0.14, 0.16, 1.2, 6), 0x5f8f4f, 0.6), part(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 5), 0x5f8f4f, 0.8).translate(0.25, 0, 0)])!,
  rock: part(new THREE.DodecahedronGeometry(0.45, 0).scale(1, 0.6, 1), 0x8a857e, 0.15),
};
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return (h >>> 0) / 4294967296; };

/** Árvores/rochas via InstancedMesh, um grupo por chunk. */
export class Decor {
  private groups = new Map<string, THREE.Group>();
  constructor(private scene: THREE.Scene) {}

  add(key: string, c: ChunkData): void {
    const g = new THREE.Group();
    const byKind = new Map<ResourceKind, typeof c.resources>();
    for (const r of c.resources) (byKind.get(r.kind) ?? byKind.set(r.kind, []).get(r.kind)!).push(r);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [kind, list] of byKind) {
      const inst = new THREE.InstancedMesh(GEOMS[kind], MAT, list.length);
      list.forEach((r, i) => {
        const h = hash(r.id), sc = 0.8 + h * 0.6;
        q.setFromAxisAngle(up, h * Math.PI * 2);
        s.set(sc, sc * (0.85 + hash(r.id + 'y') * 0.4), sc);
        p.set(r.x, chunkHeight(c, r.x, r.y), r.y);
        inst.setMatrixAt(i, m.compose(p, q, s));
      });
      inst.computeBoundingSphere();
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
