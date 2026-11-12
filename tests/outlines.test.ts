import { describe, expect, test } from 'vitest';
import { borderSegments, provinceRings } from '../src/client/map/outlines';
import { CELL, GLOBAL_SIZE } from '../src/worldgen/constants';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';

const pm = generateProvinces(generateWorld(860)), rings = provinceRings(pm), segs = borderSegments(pm);
const provAt = (x: number, y: number) => (x < 0 || y < 0 || x >= 4096 || y >= 4096 ? -1 : pm.cellProvince[Math.floor(y / CELL) * GLOBAL_SIZE + Math.floor(x / CELL)]);
const area = (r: number[]) => { let a = 0; for (let i = 0; i + 3 < r.length; i += 2) a += r[i] * r[i + 3] - r[i + 2] * r[i + 1]; return a / 2; };

describe('contornos das províncias', { timeout: 60000 }, () => {
  test('um conjunto de anéis por província; todos fechados', () => {
    expect(rings.length).toBe(pm.provinces.length);
    for (const rs of rings) {
      expect(rs.length).toBeGreaterThan(0);
      for (const r of rs) {
        expect(r.length).toBeGreaterThanOrEqual(10); // ≥ 4 vértices + o ponto de fechamento
        expect([r.at(-2), r.at(-1)]).toEqual([r[0], r[1]]);
        for (const v of r) expect(v % CELL).toBe(0);
      }
    }
  });
  test('área interna = células da província (buracos descontados)', () => {
    for (const p of pm.provinces.slice(0, 40)) {
      // anéis externos e buracos giram em sentidos opostos: a soma com sinal dá a área líquida
      const a = Math.abs(rings[p.id].reduce((s, r) => s + area(r), 0));
      expect(a).toBe(p.cells * CELL * CELL);
    }
  });
  test('fronteira entre duas províncias aparece uma vez e separa províncias diferentes', () => {
    const seen = new Set<string>();
    for (let i = 0; i < segs.length; i += 4) {
      const [x0, y0, x1, y1] = [segs[i], segs[i + 1], segs[i + 2], segs[i + 3]];
      const k = x0 < x1 || (x0 === x1 && y0 < y1) ? `${x0},${y0},${x1},${y1}` : `${x1},${y1},${x0},${y0}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, vertical = x0 === x1;
      const a = vertical ? provAt(mx - 0.5, my) : provAt(mx, my - 0.5), b = vertical ? provAt(mx + 0.5, my) : provAt(mx, my + 0.5);
      expect(a).toBeGreaterThanOrEqual(0); expect(b).toBeGreaterThanOrEqual(0); expect(a).not.toBe(b);
    }
    expect(segs.length).toBeGreaterThan(1000);
  });
  test('fronteira por grupo: só onde o grupo muda, e é subconjunto da fronteira de províncias', () => {
    const owner = pm.provinces.map(p => (p.id % 3 === 0 ? 1 : -1));
    const g = (p: number) => owner[p];
    const nat = borderSegments(pm, g);
    expect(nat.length).toBeGreaterThan(0);
    expect(nat.length).toBeLessThan(segs.length);
    for (let i = 0; i < nat.length; i += 4) {
      const mx = (nat[i] + nat[i + 2]) / 2, my = (nat[i + 1] + nat[i + 3]) / 2, vertical = nat[i] === nat[i + 2];
      const a = vertical ? provAt(mx - 1, my) : provAt(mx, my - 1), b = vertical ? provAt(mx + 1, my) : provAt(mx, my + 1);
      expect(g(a)).not.toBe(g(b));
    }
    expect(borderSegments(pm, p => p)).toEqual(segs);
  });
});
