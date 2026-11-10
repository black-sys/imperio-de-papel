import { afterEach, expect, test, vi } from 'vitest';
import { loadQuality, lodFor, QUALITY, saveQuality } from '../src/client/quality';

test.each([
  ['high', 0, 0], ['high', 3, 0], ['high', 3.5, 1], ['high', 7, 1], ['high', 7.5, 2],
  ['medium', 2, 0], ['medium', 2.5, 1], ['medium', 6, 1], ['medium', 6.5, 2],
  ['low', 1, 0], ['low', 1.5, 1], ['low', 5, 1], ['low', 5.5, 2],
] as const)('lodFor(%s, %f) = %i', (q, d, l) => expect(lodFor(d, q)).toBe(l));

test('presets', () => {
  expect(QUALITY.high.shadow).toBe(2048);
  expect(QUALITY.medium.shadow).toBe(1024);
  expect(QUALITY.low.shadow).toBe(0);
  expect([QUALITY.high.flora, QUALITY.medium.flora, QUALITY.low.flora]).toEqual([1, 0.5, 0]);
});

afterEach(() => vi.unstubAllGlobals());
test('sem localStorage: padrão alto, salvar não lança', () => {
  vi.stubGlobal('localStorage', { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } });
  expect(loadQuality()).toBe('high');
  expect(() => saveQuality('low')).not.toThrow();
});
test('valor salvo inválido → alto; válido → ele', () => {
  const store: Record<string, string> = {};
  vi.stubGlobal('localStorage', { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; } });
  store.quality = 'ultra';
  expect(loadQuality()).toBe('high');
  saveQuality('medium');
  expect(loadQuality()).toBe('medium');
});
