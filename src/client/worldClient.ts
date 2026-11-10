import type { ChunkData, WorldMap } from '../worldgen/types';
import type { WorkerIn } from './worker';

type Out =
  | { type: 'progress'; stage: string; pct: number; token: number }
  | { type: 'world'; map: WorldMap; token: number }
  | { type: 'chunk'; data: ChunkData; token: number }
  | { type: 'error'; message: string; seed: number; token: number };

/** Lado principal do worker. Cada generate() invalida respostas de mundos anteriores. */
export class WorldClient {
  private worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  private token = 0;
  private pendingWorld: { resolve: (m: WorldMap) => void; reject: (e: Error) => void; onProgress: (s: string, p: number) => void } | null = null;
  private pendingChunks = new Map<string, { resolve: (c: ChunkData) => void; reject: (e: Error) => void }>();

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

  private post(m: WorkerIn) { this.worker.postMessage(m); }
}
