import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { TroopType } from '../../sim/balance';
import type { GameState, Troop } from '../../sim/state';
import type { ProvinceMap } from '../../worldgen/provinces';
import { REALM_COLOR } from './borders';
import { MAT, box, cyl, part } from './buildings';

const SPACING = 0.9;
/** Acima desta largura de vista (tiles) os soldados somem e fica só o estandarte com o número. */
export const SOLDIERS_MAX_VIEW = 250;
export const TROOP_ICON: Record<TroopType, string> = { spear: '🔱', archer: '🏹', cavalry: '🐎' };

/** Posições dos soldados em volta da tropa (fileiras voltadas para `facing`, a da frente primeiro), em tiles. */
export function formationSlots(n: number, facing: number): { x: number; z: number }[] {
  const cols = Math.ceil(Math.sqrt(n * 1.25)), rows = Math.ceil(n / cols), sin = Math.sin(facing), cos = Math.cos(facing);
  return Array.from({ length: n }, (_, i) => {
    const lx = ((i % cols) - (cols - 1) / 2) * SPACING, lz = ((rows - 1) / 2 - Math.floor(i / cols)) * SPACING;
    return { x: lx * cos + lz * sin, z: -lx * sin + lz * cos };
  });
}

const PLAYER = (REALM_COLOR[0] << 16) | (REALM_COLOR[1] << 8) | REALM_COLOR[2], NEUTRAL = 0x7d7d78;
const SKIN = 0xe0b890, WOOD = 0x7a5232, IRON = 0xb8bcc0, HORSE = 0x6a4a30;
// modelos voltados para +Z, pés em y=0
function soldier(type: TroopType, tunic: number): THREE.BufferGeometry {
  const man = (y = 0) => [box(0.3, 0.45, 0.2, tunic, 0, y + 0.25), box(0.1, 0.25, 0.12, 0x4a3a2a, -0.08, y), box(0.1, 0.25, 0.12, 0x4a3a2a, 0.08, y), box(0.18, 0.18, 0.18, SKIN, 0, y + 0.7)];
  if (type === 'spear') return mergeGeometries([...man(), cyl(0.025, 1.4, WOOD, 0.22, 0, 0.05, 4), box(0.06, 0.14, 0.06, IRON, 0.22, 1.4, 0.05), box(0.05, 0.34, 0.28, tunic, -0.2, 0.3, 0.08)])!;
  if (type === 'archer') return mergeGeometries([...man(), box(0.03, 0.7, 0.03, WOOD, 0.2, 0.2, 0.14), box(0.12, 0.3, 0.08, 0x5a4a32, 0, 0.35, -0.14)])!;
  return mergeGeometries([
    box(0.32, 0.4, 0.95, HORSE, 0, 0.4), box(0.2, 0.4, 0.25, HORSE, 0, 0.7, 0.5), box(0.16, 0.18, 0.3, HORSE, 0, 1.0, 0.68),
    ...[[-0.11, -0.35], [0.11, -0.35], [-0.11, 0.35], [0.11, 0.35]].map(([x, z]) => box(0.08, 0.4, 0.08, HORSE, x, 0, z)),
    box(0.3, 0.45, 0.2, tunic, 0, 0.8), box(0.18, 0.18, 0.18, SKIN, 0, 1.25), cyl(0.025, 1.6, WOOD, 0.24, 0.5, 0.1, 4),
  ])!;
}
const banner = (color: number) => mergeGeometries([cyl(0.05, 2.6, 0xd8d0c0), box(0.04, 0.7, 1.0, color, 0, 1.8, 0.52)])!;
const RING = part(new THREE.RingGeometry(2.6, 3.0, 24).rotateX(-Math.PI / 2), 0xfff2c0, 0, 0.15);
const FORT = mergeGeometries([
  ...Array.from({ length: 22 }, (_, a) => { const t = (a / 22) * Math.PI * 2; return cyl(0.16, 1.5, WOOD, Math.cos(t) * 3.4, 0, Math.sin(t) * 3.4, 5); }),
  box(1.2, 2.6, 1.2, 0x8a8478, 0, 0, -1.6), part(new THREE.ConeGeometry(1.1, 0.9, 4).rotateY(Math.PI / 4), 0x5a3a2a, 0, 3.05, -1.6),
])!;
const RING_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false });

/** InstancedMesh que cresce sob demanda; `add` empilha uma instância por quadro. */
class Pool {
  mesh: THREE.InstancedMesh;
  private n = 0;
  constructor(private scene: THREE.Scene, private geo: THREE.BufferGeometry, private mat: THREE.Material, private shadow: boolean, cap = 256) { this.mesh = this.make(cap); }
  private make(cap: number): THREE.InstancedMesh {
    const m = new THREE.InstancedMesh(this.geo, this.mat, cap);
    m.frustumCulled = false; // as instâncias se espalham pelo mapa; quem filtra é o sync
    m.castShadow = this.shadow; m.count = 0;
    this.scene.add(m);
    return m;
  }
  begin(): void { this.n = 0; }
  add(matrix: THREE.Matrix4): void {
    if (this.n === this.mesh.instanceMatrix.count) {
      const old = this.mesh;
      this.mesh = this.make(old.instanceMatrix.count * 2);
      this.mesh.instanceMatrix.array.set(old.instanceMatrix.array);
      this.scene.remove(old); old.dispose();
    }
    this.mesh.setMatrixAt(this.n++, matrix);
  }
  end(): void { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; }
  dispose(): void { this.scene.remove(this.mesh); this.mesh.dispose(); }
}

export interface TroopsCam { x: number; y: number; width: number; camera: THREE.Camera }

/** Tropas, estandartes, fortalezas e batalhas no 3D. Só desenha o que está perto da câmera. */
export class TroopsView {
  private pools = new Map<string, Pool>();
  private facing = new Map<number, number>();
  private dummy = new THREE.Object3D();
  private labels: HTMLDivElement[] = [];
  private v = new THREE.Vector3();
  constructor(private scene: THREE.Scene, private labelsEl: HTMLElement | null = null) {}

  private pool(key: string, geo: () => THREE.BufferGeometry, mat: THREE.Material = MAT, shadow = true): Pool {
    let p = this.pools.get(key);
    if (!p) this.pools.set(key, p = new Pool(this.scene, geo(), mat, shadow));
    return p;
  }

  clear(): void {
    for (const p of this.pools.values()) p.dispose();
    this.pools.clear(); this.facing.clear(); this.prev.clear();
    for (const l of this.labels) l.style.display = 'none';
  }

  sync(s: GameState, pm: ProvinceMap, heightAt: (x: number, y: number) => number, cam: TroopsCam, selected: Set<number>, time: number): void {
    for (const p of this.pools.values()) p.begin();
    const d = this.dummy, range = cam.width * 1.3, near = (x: number, y: number) => Math.abs(x - cam.x) < range && Math.abs(y - cam.y) < range;
    const place = (pool: Pool, x: number, y: number, z: number, ry = 0, scale = 1) => {
      d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.setScalar(scale); d.updateMatrix();
      pool.add(d.matrix);
    };
    const detail = cam.width <= SOLDIERS_MAX_VIEW, big = Math.max(1, cam.width / 110); // estandarte cresce com o zoom para não sumir
    let nl = 0;
    const label = (x: number, y: number, z: number, html: string, cls: string) => {
      if (!this.labelsEl) return;
      this.v.set(x, y, z).project(cam.camera);
      if (Math.abs(this.v.x) > 1.05 || Math.abs(this.v.y) > 1.05) return;
      let el = this.labels[nl];
      if (!el) { el = this.labels[nl] = document.createElement('div'); this.labelsEl.appendChild(el); }
      nl++;
      if (el.className !== cls) el.className = cls;
      if (el.dataset.h !== html) { el.innerHTML = html; el.dataset.h = html; }
      el.style.display = 'block';
      el.style.left = `${((this.v.x + 1) / 2) * innerWidth}px`; el.style.top = `${((1 - this.v.y) / 2) * innerHeight}px`;
    };
    const alive = new Set<number>();
    for (const t of s.troops) {
      alive.add(t.id);
      if (!near(t.x, t.y)) continue;
      const face = this.face(s, t), kind = t.owner === 0 ? 'p' : 'n', color = t.owner === 0 ? PLAYER : NEUTRAL, h = heightAt(t.x, t.y);
      if (detail) {
        const pool = this.pool(`${t.type}${kind}`, () => soldier(t.type, color)), slots = formationSlots(Math.ceil(t.soldiers), face), moving = t.path.length > 0;
        slots.forEach((p, i) => place(pool, t.x + p.x, heightAt(t.x + p.x, t.y + p.z) + (moving ? Math.abs(Math.sin(time * 9 + i * 1.7)) * 0.08 : 0), t.y + p.z, face));
      }
      place(this.pool(`banner${kind}`, () => banner(color)), t.x, h, t.y, face, big);
      if (selected.has(t.id)) place(this.pool('ring', () => RING, RING_MAT, false), t.x, h, t.y, 0, big);
      if (!detail || selected.has(t.id)) label(t.x, h + 3.2 * big, t.y, `${TROOP_ICON[t.type]} ${Math.ceil(t.soldiers)}`, t.owner === 0 ? 'troop mine' : 'troop');
    }
    for (const id of this.facing.keys()) if (!alive.has(id)) { this.facing.delete(id); this.prev.delete(id); }
    for (const f of s.fortresses) {
      const site = pm.provinces[f.province].sites[0];
      if (site && near(site.x, site.y)) place(this.pool('fort', () => FORT), site.x, heightAt(site.x, site.y), site.y, f.province);
    }
    for (const b of s.battles) {
      if (!near(b.x, b.y)) continue;
      const bars = b.sides.map(side => `<i><b class="${side.owner === 0 ? 'mine' : ''}" style="width:${Math.round(side.morale * 100)}%"></b></i>`).join('');
      label(b.x, heightAt(b.x, b.y) + 5 * big, b.y, `⚔${bars}`, 'battle');
    }
    for (let i = nl; i < this.labels.length; i++) this.labels[i].style.display = 'none';
    for (const p of this.pools.values()) p.end();
  }

  /** Direção da tropa: para a batalha, senão para onde anda, senão a última. */
  private face(s: GameState, t: Troop): number {
    const b = s.battles.find(b => b.troopIds.includes(t.id));
    let a = this.facing.get(t.id) ?? (t.id * 2.4) % (Math.PI * 2);
    if (b && (b.x !== t.x || b.y !== t.y)) a = Math.atan2(b.x - t.x, b.y - t.y);
    else if (t.path.length) {
      const prev = this.prev.get(t.id);
      if (prev && (prev.x !== t.x || prev.y !== t.y)) a = Math.atan2(t.x - prev.x, t.y - prev.y);
    }
    this.prev.set(t.id, { x: t.x, y: t.y });
    this.facing.set(t.id, a);
    return a;
  }
  private prev = new Map<number, { x: number; y: number }>();
}
