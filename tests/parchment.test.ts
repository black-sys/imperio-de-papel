import { expect, test } from 'vitest';
import { renderParchment } from '../src/client/parchment';
import { generateWorld } from '../src/worldgen/global/world';
import { hashArrays } from '../src/worldgen/rng';

const map = generateWorld(860), N = 512;
const px = renderParchment(map, N);
const at = (x: number, y: number) => [px[(y * N + x) * 4], px[(y * N + x) * 4 + 1], px[(y * N + x) * 4 + 2], px[(y * N + x) * 4 + 3]];
const cellAt = (x: number, y: number) => Math.floor((y * map.size) / N) * map.size + Math.floor((x * map.size) / N);

test('determinístico e opaco', () => {
  expect(hashArrays(renderParchment(map, N))).toBe(hashArrays(px));
  expect(at(10, 10)[3]).toBe(255);
});
test('mar aberto verde-acinzentado', () => {
  const [r, g, b] = at(8, 8);
  expect(g).toBeGreaterThanOrEqual(r);
  expect(g).toBeGreaterThan(150);
  expect(Math.abs(r - b)).toBeLessThan(20);
});
test('interior seco cor de papel (r > g > b)', () => {
  let ok = 0, n = 0;
  for (let y = 200; y < 320; y += 7) for (let x = 200; x < 320; x += 7) {
    const c = cellAt(x, y);
    if (map.water[c] || map.river[c]) continue;
    const [r, g, b] = at(x, y);
    n++; if (r >= g && g >= b) ok++;
  }
  expect(n).toBeGreaterThan(20);
  expect(ok / n).toBeGreaterThan(0.85);
});
test('litoral contornado escuro', () => {
  let dark = 0, n = 0;
  for (let y = 100; y < 400; y += 5) {
    let x = 0;
    while (x < N - 1 && map.water[cellAt(x, y)] === 1) x++;
    if (x === 0 || x >= N - 1) continue;
    const [r, g, b] = at(x, y);
    n++; if (r + g + b < 360) dark++;
  }
  expect(n).toBeGreaterThan(20);
  expect(dark / n).toBeGreaterThan(0.8);
});
