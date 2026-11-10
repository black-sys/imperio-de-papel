import type { CoarseChunk } from '../worldgen/coarse';
import type { ChunkData, WorldMap } from '../worldgen/types';
import type { WorkerIn } from './worker';

type Out =
  | { type: 'progress'; stage: string; pct: number; token: number }
  | { type: 'world'; map: WorldMap; token: number }
  | { type: 'chunk'; data: ChunkData; token: number }
  | { type: 'coarse'; data: CoarseChunk; token: number }
  | { type: 'parchment'; pixels: Uint8ClampedArray; size: number; token: number }
  | { type: 'error'; message: string; seed: number; token: number };

/** Lado principal do worker. Cada generate() invalida respostas de mundos anteriores. */
export class WorldClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private token = 0;
  private pendingWorld: { resolve: (m: WorldMap) => void; reject: (e: Error) => void; onProgress: (s: string, p: number) => void } | null = null;
  // chave `cx,cy` (completo) ou `cx,cy,step` (grosso)
  private pendingChunks = new Map<string, { resolve: (c: any) => void; reject: (e: Error) => void }>();

  constructor() {
    this.worker.onmessage = (e: MessageEvent<Out>) => {
      const m = e.data;
      if (m.token !== this.token) return;
      if (m.type === 'progress') this.pendingWorld?.onProgress(m.stage, m.pct);
      else if (m.type === 'world') { this.pendingWorld?.resolve(m.map); this.pendingWorld = null; }
      else if (m.type === 'chunk') {
        const k = `${m.data.cx},${m.data.cy}`;
        this.pendingChunks.get(k)?.resolve(m.data);
        this.pendingChunks.delete(k);
      } else if (m.type === 'parchment') {
        this.pendingChunks.get('parchment')?.resolve(m.pixels);
        this.pendingChunks.delete('parchment');
      } else if (m.type === 'coarse') {
        const k = `${m.data.cx},${m.data.cy},${m.data.step}`;
        this.pendingChunks.get(k)?.resolve(m.data);
        this.pendingChunks.delete(k);
      } else {
        const err = new Error(m.message);
        this.pendingWorld?.reject(err); this.pendingWorld = null;
        for (const p of this.pendingChunks.values()) p.reject(err);
        this.pendingChunks.clear();
      }
    };
    this.worker.onerror = e => {
      const err = new Error(e.message || 'falha no worker');
      this.pendingWorld?.reject(err); this.pendingWorld = null;
      for (const p of this.pendingChunks.values()) p.reject(err);
      this.pendingChunks.clear();
    };
  }

  generate(seed: number, onProgress: (stage: string, pct: number) => void): Promise<WorldMap> {
    this.token++;
    this.pendingWorld?.reject(new Error('substituído'));
    for (const p of this.pendingChunks.values()) p.reject(new Error('substituído'));
    this.pendingChunks.clear();
    return new Promise((resolve, reject) => {
      this.pendingWorld = { resolve, reject, onProgress };
      this.post({ type: 'world', seed, token: this.token });
    });
  }

  chunk(cx: number, cy: number): Promise<ChunkData> {
    const k = `${cx},${cy}`;
    return new Promise((resolve, reject) => {
      this.pendingChunks.get(k)?.reject(new Error('duplicado'));
      this.pendingChunks.set(k, { resolve, reject });
      this.post({ type: 'chunk', cx, cy, token: this.token });
    });
  }

  parchment(size: number): Promise<Uint8ClampedArray> {
    return new Promise((resolve, reject) => {
      this.pendingChunks.get('parchment')?.reject(new Error('duplicado'));
      this.pendingChunks.set('parchment', { resolve, reject });
      this.post({ type: 'parchment', size, token: this.token });
    });
  }

  coarse(cx: number, cy: number, step: 2 | 4): Promise<CoarseChunk> {
    const k = `${cx},${cy},${step}`;
    return new Promise((resolve, reject) => {
      this.pendingChunks.get(k)?.reject(new Error('duplicado'));
      this.pendingChunks.set(k, { resolve, reject });
      this.post({ type: 'coarse', cx, cy, step, token: this.token });
    });
  }

  private post(m: WorkerIn) { this.worker.postMessage(m); }
}
