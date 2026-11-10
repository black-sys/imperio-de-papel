import { generateChunk } from '../worldgen/chunk';
import { generateCoarseChunk } from '../worldgen/coarse';
import { renderParchment } from './parchment';
import { makeChunkCache, paintTile } from './map/tilePaint';
import type { ChunkData } from '../worldgen/types';
import { generateWorld } from '../worldgen/global/world';
import { generateProvinces } from '../worldgen/provinces';
import type { WorldMap } from '../worldgen/types';

export type WorkerIn =
  | { type: 'world'; seed: number; token: number }
  | { type: 'chunk'; cx: number; cy: number; token: number }
  | { type: 'coarse'; cx: number; cy: number; step: 2 | 4; token: number }
  | { type: 'parchment'; size: number; token: number }
  | { type: 'tile'; L: number; x: number; y: number; token: number };

let map: WorldMap | null = null;
let current = -1;
let chunks: ((cx: number, cy: number) => ChunkData) | null = null; // cache de chunks dos ladrilhos, um por mundo

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data;
  try {
    if (msg.type === 'world') {
      current = msg.token;
      map = generateWorld(msg.seed, (stage, pct) => postMessage({ type: 'progress', stage, pct, token: msg.token }));
      chunks = makeChunkCache(map);
      postMessage({ type: 'progress', stage: 'províncias', pct: 0.95, token: msg.token });
      const provinces = generateProvinces(map);
      postMessage({ type: 'world', map, provinces, token: msg.token }); // cópia; o worker mantém o original para os chunks
    } else if (msg.type === 'tile') {
      if (!map || !chunks || msg.token !== current) return;
      const pixels = paintTile(map, msg.L, msg.x, msg.y, chunks);
      postMessage({ type: 'tile', L: msg.L, x: msg.x, y: msg.y, pixels, token: msg.token }, { transfer: [pixels.buffer] });
    } else if (msg.type === 'parchment') {
      if (!map || msg.token !== current) return;
      const pixels = renderParchment(map, msg.size);
      postMessage({ type: 'parchment', pixels, size: msg.size, token: msg.token }, { transfer: [pixels.buffer] });
    } else if (msg.type === 'coarse') {
      if (!map || msg.token !== current) return;
      const data = generateCoarseChunk(map, msg.cx, msg.cy, msg.step);
      postMessage({ type: 'coarse', data, token: msg.token }, { transfer: [data.heights, data.biome, data.water, data.waterLevel].map(a => a.buffer) });
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
