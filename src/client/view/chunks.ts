import * as THREE from 'three';
import type { CoarseChunk } from '../../worldgen/coarse';
import { CHUNK, CHUNKS_PER_SIDE } from '../../worldgen/constants';
import type { Biome, ChunkData } from '../../worldgen/types';
import { lodFor, type Quality } from '../quality';
import type { WorldClient } from '../worldClient';
import { Decor } from './decor';
import { buildCoarseTerrain, buildCoarseWater, buildTerrain, buildWater, chunkHeight, coarseHeight } from './terrainMesh';

const MAX_IN_FLIGHT = 6;
type Level = 0 | 1 | 2;

interface Loaded { level: Level; full: ChunkData | null; coarse: CoarseChunk | null; terrain: THREE.Mesh; water: THREE.Mesh | null }

/**
 * Chunks em 3 níveis de detalhe pela distância (em chunks, Chebyshev) do centro.
 * Lógica de jogo (andar, altura do jogador) só usa chunks L0 — os grossos não têm andabilidade.
 */
export class ChunkManager {
  private loaded = new Map<string, Loaded>();
  private inFlight = new Map<string, Level>();
  private decor: Decor;
  private generation = 0;

  constructor(private client: WorldClient, private scene: THREE.Scene) { this.decor = new Decor(scene); }

  reset(): void {
    this.generation++;
    for (const k of [...this.loaded.keys()]) this.drop(k);
    this.inFlight.clear();
  }

  /** `radius`: raio (em chunks) da área visível. */
  update(tx: number, ty: number, radius: number, quality: Quality): void {
    const ccx = Math.floor(tx / CHUNK), ccy = Math.floor(ty / CHUNK);
    for (const [k, l] of this.loaded) {
      const [cx, cy] = k.split(',').map(Number);
      if (Math.max(Math.abs(cx - ccx), Math.abs(cy - ccy)) > radius + 1) this.drop(k);
      void l;
    }
    const want: [number, number, number, Level][] = [];
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      const cx = ccx + dx, cy = ccy + dy, k = `${cx},${cy}`;
      if (cx < 0 || cy < 0 || cx >= CHUNKS_PER_SIDE || cy >= CHUNKS_PER_SIDE) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      let level = lodFor(d, quality);
      const cur = this.loaded.get(k)?.level;
      // histerese: mantém o nível atual se ele ainda vale a ±1 chunk de distância
      if (cur !== undefined && cur !== level && lodFor(Math.max(0, d - 1), quality) <= cur && cur <= lodFor(d + 1, quality)) level = cur;
      if (cur === level || this.inFlight.get(k) === level) continue;
      want.push([d, cx, cy, level]);
    }
    want.sort((a, b) => a[0] - b[0] || a[3] - b[3]);
    for (const [, cx, cy, level] of want) {
      if (this.inFlight.size >= MAX_IN_FLIGHT) break;
      const k = `${cx},${cy}`, gen = this.generation;
      this.inFlight.set(k, level);
      const done = (full: ChunkData | null, coarse: CoarseChunk | null) => {
        if (gen !== this.generation || this.inFlight.get(k) !== level) return;
        this.inFlight.delete(k);
        this.drop(k);
        const terrain = full ? buildTerrain(full) : buildCoarseTerrain(coarse!);
        const water = full ? buildWater(full) : buildCoarseWater(coarse!);
        this.scene.add(terrain);
        if (water) this.scene.add(water);
        if (full) this.decor.add(k, full);
        this.loaded.set(k, { level, full, coarse, terrain, water });
      };
      const fail = () => { if (gen === this.generation && this.inFlight.get(k) === level) this.inFlight.delete(k); };
      if (level === 0) this.client.chunk(cx, cy).then(d => done(d, null), fail);
      else this.client.coarse(cx, cy, level === 1 ? 2 : 4).then(d => done(null, d), fail);
    }
  }

  private get(tx: number, ty: number): Loaded | undefined {
    return this.loaded.get(`${Math.floor(tx / CHUNK)},${Math.floor(ty / CHUNK)}`);
  }
  private full(tx: number, ty: number): ChunkData | null { return this.get(tx, ty)?.full ?? null; }

  /** 0 se o chunk não está carregado em L0. */
  walkAt(tx: number, ty: number): number {
    const c = this.full(tx, ty);
    return c ? c.walk[(Math.floor(ty) - c.cy * CHUNK) * CHUNK + Math.floor(tx) - c.cx * CHUNK] : 0;
  }

  heightAt(x: number, y: number): number {
    const l = this.get(x, y);
    if (!l) return 0;
    return l.full ? chunkHeight(l.full, x, y) : coarseHeight(l.coarse!, x, y);
  }

  biomeAt(tx: number, ty: number): Biome | null {
    const c = this.full(tx, ty);
    return c ? (c.biome[(Math.floor(ty) - c.cy * CHUNK) * CHUNK + Math.floor(tx) - c.cx * CHUNK] as Biome) : null;
  }

  /** Carregado em L0 (pronto para lógica de jogo). */
  isLoaded(tx: number, ty: number): boolean { return this.full(tx, ty) !== null; }

  terrainMeshes(): THREE.Object3D[] { return [...this.loaded.values()].map(l => l.terrain); }

  /** Chunks L0 carregados (para sombras/flora). */
  fullChunks(): ChunkData[] { return [...this.loaded.values()].flatMap(l => (l.full ? [l.full] : [])); }

  private drop(k: string): void {
    const l = this.loaded.get(k);
    if (!l) return;
    this.scene.remove(l.terrain); l.terrain.geometry.dispose();
    if (l.water) { this.scene.remove(l.water); l.water.geometry.dispose(); }
    if (l.full) this.decor.remove(k);
    this.loaded.delete(k);
  }
}
