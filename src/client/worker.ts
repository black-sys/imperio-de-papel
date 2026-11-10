import { generateChunk } from '../worldgen/chunk';
import { generateWorld } from '../worldgen/global/world';
import type { WorldMap } from '../worldgen/types';

export type WorkerIn = { type: 'world'; seed: number; token: number } | { type: 'chunk'; cx: number; cy: number; token: number };

let map: WorldMap | null = null;
let current = -1;

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === 'world') {
      current = msg.token;
      map = generateWorld(msg.seed, (stage, pct) => postMessage({ type: 'progress', stage, pct, token: msg.token }));
      postMessage({ type: 'world', map, token: msg.token }); // cópia; o worker mantém o original para os chunks
    } else {
      if (!map || msg.token !== current) return; // pedido de um mundo antigo
      const data = generateChunk(map, msg.cx, msg.cy);
      const buffers = [data.heights, data.biome, data.water, data.waterLevel, data.riverWidth, data.walk].map(a => a.buffer);
      postMessage({ type: 'chunk', data, token: msg.token }, { transfer: buffers });
    }
  } catch (err) {
    postMessage({ type: 'error', message: String(err), seed: map?.seed ?? (msg.type === 'world' ? msg.seed : -1), token: msg.token });
  }
};
