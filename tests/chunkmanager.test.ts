import * as THREE from 'three';
import { expect, test } from 'vitest';
import { ChunkManager } from '../src/client/view/chunks';
import type { WorldClient } from '../src/client/worldClient';
import { CHUNK } from '../src/worldgen/constants';

const N = CHUNK * CHUNK, V = (CHUNK + 1) ** 2;
const full = (cx: number, cy: number) => ({ cx, cy, heights: new Float32Array(V), biome: new Uint8Array(N), water: new Uint8Array(N), waterLevel: new Float32Array(N), riverWidth: new Float32Array(N), walk: new Uint8Array(N), resources: [] });
const coarse = (cx: number, cy: number, step: number) => { const B = CHUNK / step; return { cx, cy, step, heights: new Float32Array((B + 1) ** 2), biome: new Uint8Array(B * B), water: new Uint8Array(B * B), waterLevel: new Float32Array(B * B) }; };

/**
 * Cliente falso: como o real, rejeita o pedido anterior da mesma chave ("duplicado").
 * Responde tudo na hora, menos o chunk X (2,2), que fica em voo para sempre.
 */
function fakeClient() {
  const pending = new Map<string, (e: Error) => void>();
  const calls: Record<string, number> = {};
  const req = <T>(k: string, data: () => T, hang: boolean) => {
    calls[k] = (calls[k] ?? 0) + 1;
    return new Promise<T>((resolve, reject) => {
      pending.get(k)?.(new Error('duplicado'));
      pending.set(k, reject);
      if (!hang) queueMicrotask(() => { pending.delete(k); resolve(data()); });
    });
  };
  const client = {
    chunk: (cx: number, cy: number) => req(`${cx},${cy}`, () => full(cx, cy), cx === 2 && cy === 2),
    coarse: (cx: number, cy: number, s: number) => req(`${cx},${cy},${s}`, () => coarse(cx, cy, s), cx === 2 && cy === 2),
  } as unknown as WorldClient;
  return { client, calls };
}
const tick = () => new Promise(r => setTimeout(r, 0));
const X_REQUESTS = (c: Record<string, number>) => (c['2,2'] ?? 0) + (c['2,2,2'] ?? 0);

test('ir e voltar entre níveis não inunda o worker com pedidos repetidos do mesmo chunk', async () => {
  const { client, calls } = fakeClient();
  const m = new ChunkManager(client, new THREE.Scene());
  // qualidade baixa: L0 até distância 1. Centro alterna entre chunk (0,0) [X a dist 2 → L1] e (1,1) [X a dist 1 → L0]
  const at = (c: number) => [c * CHUNK + 32, c * CHUNK + 32] as const;
  for (let i = 0; i < 6; i++) { m.update(...at(i % 2), 2, 'low'); await tick(); }
  const before = X_REQUESTS(calls);
  for (let i = 0; i < 20; i++) { m.update(...at(1), 2, 'low'); await tick(); }
  expect(X_REQUESTS(calls) - before).toBeLessThanOrEqual(1);
});
