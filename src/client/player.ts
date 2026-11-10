import * as THREE from 'three';
import type { Pt } from './astar';

const SPEED = 5; // tiles/s

export interface Terrain { walkAt(x: number, y: number): number; heightAt(x: number, y: number): number }

/** Boneco low-poly; WASD (direção já em coords de mundo) ou caminho do A*. */
export class Player {
  readonly mesh = new THREE.Group();
  position = { x: 0, y: 0 };
  private dir = { x: 0, y: 0 };
  private path: Pt[] = [];

  constructor(scene: THREE.Scene) {
    const mat = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.8, 6), mat(0x3a6fd8));
    body.position.y = 0.4;
    const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2, 0), mat(0xf1c9a5));
    head.position.y = 0.98;
    const hat = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.35, 6), mat(0xc0392b));
    hat.position.y = 1.25;
    this.mesh.add(body, head, hat);
    for (const m of [body, head, hat]) m.castShadow = true;
    scene.add(this.mesh);
  }

  /** Direção WASD em coords de mundo (x, y do tile); zero para parar. Cancela o caminho. */
  moveDir(dx: number, dy: number): void {
    this.dir = { x: dx, y: dy };
    if (dx || dy) this.path = [];
  }

  goTo(path: Pt[]): void { this.path = path.slice(1).map(p => ({ x: p.x + 0.5, y: p.y + 0.5 })); }

  teleport(tile: Pt): void { this.position = { x: tile.x + 0.5, y: tile.y + 0.5 }; this.path = []; }

  update(dt: number, t: Terrain): void {
    const here = t.walkAt(Math.floor(this.position.x), Math.floor(this.position.y));
    const step = SPEED * (here === 2 ? 0.5 : 1) * dt;
    let vx = this.dir.x, vy = this.dir.y;
    if (!vx && !vy && this.path.length) {
      const n = this.path[0];
      vx = n.x - this.position.x; vy = n.y - this.position.y;
      const d = Math.hypot(vx, vy);
      if (d <= step) { this.position = { ...n }; this.path.shift(); vx = vy = 0; }
    }
    const len = Math.hypot(vx, vy);
    if (len > 0) {
      const mx = (vx / len) * step, my = (vy / len) * step;
      // tenta mover nos dois eixos; se bloqueado, desliza em um só
      for (const [ax, ay] of [[mx, my], [mx, 0], [0, my]]) {
        const nx = this.position.x + ax, ny = this.position.y + ay;
        if ((ax || ay) && t.walkAt(Math.floor(nx), Math.floor(ny)) !== 0) { this.position = { x: nx, y: ny }; break; }
      }
      this.mesh.rotation.y = Math.atan2(vx, vy);
    }
    this.mesh.position.set(this.position.x, t.heightAt(this.position.x, this.position.y), this.position.y);
  }
}
