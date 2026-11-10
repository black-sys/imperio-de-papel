import { describe, expect, test } from 'vitest';
import { clampView, fallbackFor, levelFor, MAX_SCALE, MIN_SCALE, tileSpan, toScreen, toWorld, visibleTiles, zoomAt, type View } from '../src/client/map/view';

const rng = (() => { let a = 7; return () => ((a = (Math.imul(a, 1103515245) + 12345) >>> 0) / 4294967296); })();
const v = (o: Partial<View> = {}): View => ({ cx: 2048, cy: 2048, scale: 1, w: 1280, h: 800, ...o });

test('tela → mundo → tela', () => {
  for (let i = 0; i < 50; i++) {
    const view = v({ cx: rng() * 4096, cy: rng() * 4096, scale: MIN_SCALE + rng() * 2.8 }), p: [number, number] = [rng() * 4096, rng() * 4096];
    const [x, y] = toWorld(view, ...toScreen(view, ...p));
    expect(x).toBeCloseTo(p[0], 9); expect(y).toBeCloseTo(p[1], 9);
  }
});

test('zoom pela roda mantém fixo o ponto sob o ponteiro', () => {
  for (const f of [1.15, 1 / 1.15]) {
    const a = v({ cx: 1500, cy: 1700, scale: 1 }), [wx, wy] = toWorld(a, 300, 200), b = zoomAt(a, 300, 200, f);
    const [x, y] = toWorld(b, 300, 200);
    expect(x).toBeCloseTo(wx, 6); expect(y).toBeCloseTo(wy, 6);
    expect(b.scale).toBeCloseTo(f, 9);
  }
});

describe('limites', () => {
  test('escala entre o mínimo e o máximo', () => {
    let a = v();
    for (let i = 0; i < 60; i++) a = zoomAt(a, 640, 400, 1.3);
    expect(a.scale).toBe(MAX_SCALE);
    for (let i = 0; i < 60; i++) a = zoomAt(a, 640, 400, 1 / 1.3);
    expect(a.scale).toBe(MIN_SCALE);
    expect([a.cx, a.cy]).toEqual([2048, 2048]); // mundo menor que a tela: centrado
  });
  test('perto, a borda do mundo encosta na borda da tela', () => {
    const a = clampView(v({ cx: 0, cy: 0, scale: 3 }));
    expect(toScreen(a, 0, 0)).toEqual([0, 0]);
    const b = clampView(v({ cx: 4096, cy: 4096, scale: 3 }));
    const [sx, sy] = toScreen(b, 4096, 4096);
    expect(sx).toBeCloseTo(1280, 9); expect(sy).toBeCloseTo(800, 9);
  });
  test('redimensionar mantém as invariantes', () => {
    const a = clampView({ ...clampView(v({ cx: 10, cy: 10, scale: 2 })), w: 1920, h: 1080 });
    expect(toScreen(a, 0, 0)).toEqual([0, 0]);
    const tiny = clampView({ ...v({ scale: 0.25 }), w: 400, h: 300 });
    expect(toScreen(tiny, 0, 0)[0]).toBeLessThanOrEqual(0);
  });
});

test('levelFor: o ladrilho nunca é ampliado', () => {
  expect([3, 2, 1.5, 1, 0.75, 0.2, 0.1875, 0.05].map(levelFor)).toEqual([0, 0, 1, 1, 2, 3, 4, 4]);
});

test('ladrilhos visíveis cobrem a tela', () => {
  for (let i = 0; i < 20; i++) {
    const view = clampView(v({ cx: rng() * 4096, cy: rng() * 4096, scale: MIN_SCALE + rng() * 2.8 })), L = levelFor(view.scale), span = tileSpan(L);
    const ts = visibleTiles(view, L);
    for (const t of ts) { expect(t.L).toBe(L); expect(t.x).toBeGreaterThanOrEqual(0); expect(t.x).toBeLessThan(4096 / span); }
    for (let k = 0; k < 200; k++) {
      const [x, y] = toWorld(view, rng() * view.w, rng() * view.h);
      if (x < 0 || y < 0 || x >= 4096 || y >= 4096) continue;
      expect(ts.some(t => x >= t.x * span && x < (t.x + 1) * span && y >= t.y * span && y < (t.y + 1) * span)).toBe(true);
    }
  }
});

test('substituto: o ladrilho do nível acima que contém este', () => {
  const f = fallbackFor({ L: 0, x: 5, y: 9 })!;
  expect(f).toEqual({ L: 1, x: 2, y: 4 });
  expect(f.x * tileSpan(1) <= 5 * tileSpan(0) && (5 + 1) * tileSpan(0) <= (f.x + 1) * tileSpan(1)).toBe(true);
  expect(fallbackFor({ L: 4, x: 1, y: 1 })).toBeNull();
});
