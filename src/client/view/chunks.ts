import * as THREE from 'three';
import { CHUNK, CHUNKS_PER_SIDE } from '../../worldgen/constants';
import type { Biome, ChunkData } from '../../worldgen/types';
import type { WorldClient } from '../worldClient';
import { Decor } from './decor';
import { buildTerrain, buildWater, chunkHeight } from './terrainMesh';

const LOAD_R = 2, DROP_R = 3, MAX_IN_FLIGHT = 4;

interface Loaded { data: ChunkData; terrain: THREE.Mesh; water: THREE.Mesh | null }

/** Carrega os chunks num raio em volta do centro e descarta os distantes. */
export class ChunkManager {
  private loaded = new Map<string, Loaded>();
  private inFlight = new Set<string>();
  private decor: Decor;
  private generation = 0;

  constructor(private client: WorldClient, private scene: THREE.Scene) { this.decor = new Decor(scene); }

  /** Descarta tudo (novo mundo). */
  reset(): void {
    this.generation++;
    for (const k of [...this.loaded.keys()]) this.drop(k);
    this.inFlight.clear();
  }

  update(tx: number, ty: number): void {
    const ccx = Math.floor(tx / CHUNK), ccy = Math.floor(ty / CHUNK);
    for (const [k, l] of this.loaded) if (Math.max(Math.abs(l.data.cx - ccx), Math.abs(l.data.cy - ccy)) > DROP_R) this.drop(k);
    const want: [number, number, number][] = [];
    for (let dy = -LOAD_R; dy <= LOAD_R; dy++) for (let dx = -LOAD_R; dx <= LOAD_R; dx++) {
      const cx = ccx + dx, cy = ccy + dy, k = `${cx},${cy}`;
      if (cx < 0 || cy < 0 || cx >= CHUNKS_PER_SIDE || cy >= CHUNKS_PER_SIDE || this.loaded.has(k) || this.inFlight.has(k)) continue;
      want.push([dx * dx + dy * dy, cx, cy]);
    }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, cx, cy] of want) {
      if (this.inFlight.size >= MAX_IN_FLIGHT) break;
      const k = `${cx},${cy}`, gen = this.generation;
      this.inFlight.add(k);
      this.client.chunk(cx, cy).then(data => {
        if (gen !== this.generation) return;
        this.inFlight.delete(k);
        const terrain = buildTerrain(data), water = buildWater(data);
        this.scene.add(terrain);
        if (water) this.scene.add(water);
        this.decor.add(k, data);
        this.loaded.set(k, { data, terrain, water });
      }, () => { if (gen === this.generation) this.inFlight.delete(k); });
    }
  }

  private get(tx: number, ty: number): ChunkData | null {
    return this.loaded.get(`${Math.floor(tx / CHUNK)},${Math.floor(ty / CHUNK)}`)?.data ?? null;
  }

  /** 0 se o chunk não está carregado. */
  walkAt(tx: number, ty: number): number {
    const c = this.get(tx, ty);
    return c ? c.walk[(Math.floor(ty) - c.cy * CHUNK) * CHUNK + Math.floor(tx) - c.cx * CHUNK] : 0;
  }

  heightAt(x: number, y: number): number {
    const c = this.get(x, y);
    return c ? chunkHeight(c, x, y) : 0;
  }

  biomeAt(tx: number, ty: number): Biome | null {
    const c = this.get(tx, ty);
    return c ? (c.biome[(Math.floor(ty) - c.cy * CHUNK) * CHUNK + Math.floor(tx) - c.cx * CHUNK] as Biome) : null;
  }

  isLoaded(tx: number, ty: number): boolean { return this.get(tx, ty) !== null; }

  terrainMeshes(): THREE.Object3D[] { return [...this.loaded.values()].map(l => l.terrain); }

  private drop(k: string): void {
    const l = this.loaded.get(k);
    if (!l) return;
    this.scene.remove(l.terrain); l.terrain.geometry.dispose();
    if (l.water) { this.scene.remove(l.water); l.water.geometry.dispose(); }
    this.decor.remove(k);
    this.loaded.delete(k);
  }
}
