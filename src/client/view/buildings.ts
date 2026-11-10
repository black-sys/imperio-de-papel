import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { BuildingType } from '../../sim/balance';
import type { GameState } from '../../sim/state';
import type { ProvinceMap } from '../../worldgen/provinces';

function part(g: THREE.BufferGeometry, color: number, x = 0, y = 0, z = 0, ry = 0): THREE.BufferGeometry {
  if (g.index) g = g.toNonIndexed();
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}
const box = (w: number, h: number, d: number, c: number, x = 0, y = 0, z = 0, ry = 0) => part(new THREE.BoxGeometry(w, h, d), c, x, y + h / 2, z, ry);
const roof = (w: number, h: number, c: number, x = 0, y = 0, z = 0, ry = 0) => part(new THREE.ConeGeometry(w * 0.75, h, 4).rotateY(Math.PI / 4), c, x, y + h / 2, z, ry);
const cyl = (r: number, h: number, c: number, x = 0, y = 0, z = 0, seg = 6) => part(new THREE.CylinderGeometry(r, r, h, seg), c, x, y + h / 2, z);

const WALL = 0xe8dcc0, ROOF = [0xa84a32, 0x8a5a3a, 0xb8643a], WOOD = 0x7a5232, STONE = 0x9a948a;
const house = (x: number, z: number, k: number) => [box(0.9, 0.7, 0.9, WALL, x, 0, z, k * 0.7), roof(0.95, 0.6, ROOF[k % 3], x, 0.7, z, k * 0.7)];

function model(type: BuildingType, level: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  if (type === 'village') {
    const spots = [[0, 0], [1.3, 0.4], [-1.1, 0.6], [0.4, -1.3], [-0.6, -1.2], [1.4, -1.0]];
    spots.slice(0, level * 2).forEach(([x, z], k) => parts.push(...house(x, z, k)));
    if (level >= 3) for (let a = 0; a < 16; a++) { const t = (a / 16) * Math.PI * 2; parts.push(cyl(0.08, 0.6, WOOD, Math.cos(t) * 2.4, 0, Math.sin(t) * 2.4, 4)); }
  } else if (type === 'sawmill') {
    parts.push(box(1.6, 0.8, 1.0, WOOD), roof(1.7, 0.5, 0x5a3a22, 0, 0.8, 0));
    for (let i = 0; i < 3 + level; i++) parts.push(part(new THREE.CylinderGeometry(0.15, 0.15, 1.4, 6).rotateZ(Math.PI / 2), 0x8a6238, 0, 0.15 + (i % 2) * 0.28, 1.0 + Math.floor(i / 2) * 0.3));
  } else if (type === 'quarry') {
    for (let i = 0; i < 2 + level * 2; i++) parts.push(box(0.5, 0.4, 0.5, STONE, (i % 3) * 0.6 - 0.6, Math.floor(i / 3) * 0.4, 0.6));
    parts.push(box(0.12, 1.8, 0.12, WOOD, -0.8, 0, -0.4), part(new THREE.BoxGeometry(1.4, 0.1, 0.1).rotateZ(-0.3), WOOD, -0.2, 1.7, -0.4));
  } else if (type === 'market') {
    const cols = [0xc0392b, 0xe0b040, 0x2e7d9a, 0x6a9a3a];
    for (let i = 0; i < 1 + level; i++) { const x = (i % 2) * 1.1 - 0.5, z = Math.floor(i / 2) * 1.1 - 0.5; parts.push(box(0.8, 0.4, 0.8, WOOD, x, 0, z), part(new THREE.ConeGeometry(0.65, 0.6, 6), cols[i % 4], x, 0.7, z)); }
  } else {
    parts.push(cyl(0.45, 1.6 + level * 0.3, STONE, 0, 0, 0, 8), part(new THREE.ConeGeometry(0.6, 0.7, 8), 0x6a3a2a, 0, 1.95 + level * 0.3, 0));
    for (let a = 0; a < 14; a++) { const t = (a / 14) * Math.PI * 2; parts.push(cyl(0.09, 0.7, WOOD, Math.cos(t) * 1.6, 0, Math.sin(t) * 1.6, 4)); }
  }
  return mergeGeometries(parts)!;
}
const SCAFFOLD = mergeGeometries([
  ...[[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]].map(([x, z]) => box(0.07, 1.4, 0.07, 0xc8a060, x, 0, z)),
  box(1.9, 0.06, 1.9, 0xc8a060, 0, 0.7, 0), box(1.9, 0.06, 1.9, 0xc8a060, 0, 1.35, 0),
])!;
const FLAG = mergeGeometries([cyl(0.04, 2.2, 0xd8d0c0), box(0.02, 0.5, 0.8, 0xb3261e, 0, 1.6, 0.42)])!;
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const geoCache = new Map<string, THREE.BufferGeometry>();
const geo = (t: BuildingType, l: number) => { const k = `${t}${l}`; if (!geoCache.has(k)) geoCache.set(k, model(t, l)); return geoCache.get(k)!; };

/** Prédios do jogo no mundo 3D: um grupo por província, refeito quando os prédios dela mudam. */
export class BuildingsView {
  private groups = new Map<number, { key: string; group: THREE.Group; sites: { x: number; y: number }[] }>();
  constructor(private scene: THREE.Scene) {}

  clear(): void { for (const id of [...this.groups.keys()]) this.remove(id); }

  sync(s: GameState, pm: ProvinceMap, heightAt: (x: number, y: number) => number): void {
    s.buildings.forEach((slots, id) => {
      const col = s.colonizing.some(c => c.province === id);
      if (!col && slots.every(b => !b)) { if (this.groups.has(id)) this.remove(id); return; }
      // só o que muda o desenho (tipo, nível, em obra ou não): `remaining` muda a cada quadro
      const key = slots.map(b => (b ? `${b.type}${b.level}${b.remaining > 0 ? 'o' : ''}` : '-')).join(',') + col;
      if (this.groups.get(id)?.key === key) return;
      this.remove(id);
      const g = new THREE.Group(), sites = pm.provinces[id].sites;
      slots.forEach((b, slot) => {
        if (!b || !sites[slot]) return;
        const shown = b.remaining > 0 ? b.level - 1 : b.level;
        const holder = new THREE.Group();
        holder.position.set(sites[slot].x, 0, sites[slot].y);
        holder.rotation.y = ((id * 7 + slot * 3) % 8) * (Math.PI / 4);
        if (shown > 0) holder.add(this.mesh(geo(b.type, shown)));
        if (b.remaining > 0) holder.add(this.mesh(SCAFFOLD));
        g.add(holder);
      });
      if (col && sites[0]) { const f = this.mesh(FLAG); const h = new THREE.Group(); h.position.set(sites[0].x, 0, sites[0].y); h.add(f); g.add(h); }
      this.scene.add(g);
      this.groups.set(id, { key, group: g, sites });
    });
    // altura acompanha o terreno (chunks carregam depois dos prédios aparecerem)
    for (const { group } of this.groups.values()) for (const h of group.children) h.position.y = heightAt(h.position.x, h.position.z);
  }

  private mesh(g: THREE.BufferGeometry): THREE.Mesh {
    const m = new THREE.Mesh(g, MAT);
    m.castShadow = m.receiveShadow = true;
    return m;
  }

  private remove(id: number): void {
    const e = this.groups.get(id);
    if (!e) return;
    this.scene.remove(e.group); // geometrias são compartilhadas (cache): não descartar
    this.groups.delete(id);
  }
}

/** Tiles reservados (raio 3 em volta de cada local de construção): sem árvores, rochas nem plantas. */
export function siteClearings(pm: ProvinceMap): Set<number> {
  const out = new Set<number>();
  for (const p of pm.provinces) for (const s of p.sites)
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) out.add((Math.floor(s.y) + dy) * 4096 + Math.floor(s.x) + dx);
  return out;
}
