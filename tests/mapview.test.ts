import { describe, expect, test } from 'vitest';
import { clampView, fallbackFor, LEVELS, levelFor, MAX_SCALE, MIN_SCALE, minScale, tileSpan, toScreen, toWorld, visibleTiles, zoomAt, type View } from '../src/client/map/view';

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
    expect([a.cx, a.cy]).toEqual([2048, 2048]); // zoom mínimo: continente centrado
  });
  test('perto, o centro da vista não sai do mundo (a borda chega no máximo ao meio da tela)', () => {
    const a = clampView(v({ cx: -500, cy: -500, scale: 3 }));
    expect([a.cx, a.cy]).toEqual([0, 0]);
    expect(toScreen(a, 0, 0)).toEqual([640, 400]);
    const b = clampView(v({ cx: 9000, cy: 9000, scale: 3 }));
    expect([b.cx, b.cy]).toEqual([4096, 4096]);
  });
  test('zoom perto da costa mantém o ponto sob o mouse', () => {
    let a = clampView(v({ scale: MIN_SCALE }));
    const [wx, wy] = toWorld(a, 980, 420); // dentro do continente, perto da borda leste do mundo
    for (let i = 0; i < 20; i++) a = zoomAt(a, 980, 420, 1.15);
    const [x, y] = toWorld(a, 980, 420);
    expect(x).toBeCloseTo(wx, 6); expect(y).toBeCloseTo(wy, 6);
  });
  test('redimensionar mantém as invariantes', () => {
    const a = clampView({ ...clampView(v({ cx: -10, cy: 10, scale: 2 })), w: 1920, h: 1080 });
    expect(a.cx).toBe(0);
    const tiny = clampView({ ...v({ cx: 9999, scale: 0.25 }), w: 400, h: 300 });
    expect(tiny.cx).toBe(4096);
  });
});

test('levelFor: o ladrilho nunca é ampliado', () => {
  expect(MAX_SCALE).toBe(12); // zoom de perto até 12 px por tile
  expect([12, 8, 6, 3, 2, 1.5, 1, 0.75, 0.2, 0.1875, 0.05].map(levelFor)).toEqual([0, 0, 1, 2, 2, 3, 3, 4, 5, 6, 6]);
  expect(tileSpan(0)).toBe(16); // 16 tiles × 12 px = 192 px
  expect(tileSpan(2)).toBe(64); // a 3 px/tile o ladrilho continua sendo um chunk
});

test('ladrilhos visíveis cobrem a tela', () => {
  for (let i = 0; i < 20; i++) {
    const view = clampView(v({ cx: rng() * 4096, cy: rng() * 4096, scale: MIN_SCALE + rng() * 11.8 })), L = levelFor(view.scale), span = tileSpan(L);
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
  expect(fallbackFor({ L: LEVELS - 1, x: 1, y: 1 })).toBeNull();
});

test('tela baixa: o zoom mínimo diminui para caber o continente inteiro', () => {
  const small = { cx: 2048, cy: 2048, scale: 0.01, w: 1366, h: 650 };
  expect(minScale(small)).toBeCloseTo(650 / 4096, 9);
  const a = clampView(small);
  expect(a.scale).toBeCloseTo(650 / 4096, 9);
  expect(toScreen(a, 0, 0)[1]).toBeGreaterThanOrEqual(-1e-9);
  expect(toScreen(a, 4096, 4096)[1]).toBeLessThanOrEqual(650 + 1e-9);
  expect(minScale({ ...small, h: 1080, w: 1920 })).toBe(MIN_SCALE); // tela comum: o mínimo de sempre
  expect(levelFor(650 / 4096)).toBe(6);
});
