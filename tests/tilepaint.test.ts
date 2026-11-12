import { describe, expect, test } from 'vitest';
import { OPEN_SEA, makeChunkCache, paintTile } from '../src/client/map/tilePaint';
import { TILE_PX, tileSpan } from '../src/client/map/view';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';
import { hashArrays } from '../src/worldgen/rng';

const map = generateWorld(860), pm = generateProvinces(map), chunk = makeChunkCache(map);
const cap = pm.provinces[pm.suggestedCapitals[0]].center;
const tileOf = (L: number, x: number, y: number) => ({ L, x: Math.floor(x / tileSpan(L)), y: Math.floor(y / tileSpan(L)) });
const px = (img: Uint8ClampedArray, x: number, y: number) => Array.from(img.subarray((y * TILE_PX + x) * 4, (y * TILE_PX + x) * 4 + 4));

describe('ladrilho em aquarela', { timeout: 60000 }, () => {
  test('determinístico e opaco', () => {
    const t = tileOf(0, cap.x, cap.y), a = paintTile(map, 0, t.x, t.y, chunk);
    expect(a.length).toBe(TILE_PX * TILE_PX * 4);
    expect(hashArrays(paintTile(map, 0, t.x, t.y, chunk))).toBe(hashArrays(a));
    for (let i = 3; i < a.length; i += 4) if (a[i] !== 255) throw new Error('alfa');
  });
  test.each([0, 1, 2, 3, 4, 5])('vizinhos casam na borda (nível %i)', L => {
    const t = tileOf(L, cap.x, cap.y), a = paintTile(map, L, t.x, t.y, chunk), r = paintTile(map, L, t.x + 1, t.y, chunk), d = paintTile(map, L, t.x, t.y + 1, chunk);
    // a emenda não pode destoar mais que o pior par de colunas vizinhas do interior (textura, árvores e relevo variam)
    let sh = 0, sv = 0, ih = 0, iv = 0;
    for (let k = 0; k < TILE_PX; k++) for (let c = 0; c < 3; c++) {
      sh += Math.abs(px(a, TILE_PX - 1, k)[c] - px(r, 0, k)[c]);
      sv += Math.abs(px(a, k, TILE_PX - 1)[c] - px(d, k, 0)[c]);
    }
    for (const j of [31, 63, 95, 127, 159]) {
      let h = 0, w = 0;
      for (let k = 0; k < TILE_PX; k++) for (let c = 0; c < 3; c++) { h += Math.abs(px(a, j, k)[c] - px(a, j + 1, k)[c]); w += Math.abs(px(a, k, j)[c] - px(a, k, j + 1)[c]); }
      ih = Math.max(ih, h); iv = Math.max(iv, w);
    }
    expect(sh).toBeLessThan(ih * 1.6 + TILE_PX * 3);
    expect(sv).toBeLessThan(iv * 1.6 + TILE_PX * 3);
  });
  test('cores: mar aberto azulado, capital em terra, rio azulado', () => {
    // um ladrilho L4 só de mar (todas as células de oceano)
    const span = tileSpan(4) / 4, n = 4096 / tileSpan(4);
    let sea: { x: number; y: number } | null = null;
    for (let y = 0; y < n && !sea; y++) for (let x = 0; x < n && !sea; x++) {
      let all = true;
      for (let cy = y * span; cy < (y + 1) * span && all; cy++) for (let cx = x * span; cx < (x + 1) * span; cx++) if (map.water[cy * map.size + cx] !== 1) { all = false; break; }
      if (all) sea = { x, y };
    }
    expect(sea).not.toBeNull();
    const s = paintTile(map, 4, sea!.x, sea!.y, chunk);
    for (let i = 0; i < s.length; i += 4 * 97) expect(s[i + 2]).toBeGreaterThan(s[i] + 4);
    const t = tileOf(2, cap.x, cap.y), c = paintTile(map, 2, t.x, t.y, chunk), [r, , b] = px(c, Math.floor((cap.x % 64) * 3), Math.floor((cap.y % 64) * 3));
    expect(b).toBeLessThan(r);
    // um tile de rio em L0
    const rc = chunk(Math.floor(cap.x / 64), Math.floor(cap.y / 64));
    let found = false;
    for (let cy = -3; cy <= 3 && !found; cy++) for (let cx = -3; cx <= 3 && !found; cx++) {
      const ch = chunk(Math.floor(cap.x / 64) + cx, Math.floor(cap.y / 64) + cy);
      for (let i = 0; i < 64 * 64; i++) {
        // tile de rio com vizinhos de rio dos dois lados (largo o bastante)
        const x = i % 64, y = (i / 64) | 0;
        if (ch.water[i] !== 3 || x < 1 || x > 62 || ch.water[i - 1] !== 3 || ch.water[i + 1] !== 3) continue;
        const img = paintTile(map, 2, ch.cx, ch.cy, chunk), p = px(img, x * 3 + 1, y * 3 + 1); // nível 2 = 3 px/tile, ladrilho = chunk
        expect(p[2]).toBeGreaterThan(p[0]);
        found = true; break;
      }
    }
    expect(rc).toBeTruthy();
    expect(found).toBe(true);
  });
  test('desempenho: < 15 ms por ladrilho (chunks já gerados)', () => {
    const t0 = tileOf(0, cap.x, cap.y), ts = Array.from({ length: 12 }, (_, i) => ({ x: t0.x - 2 + (i % 4), y: t0.y - 1 + Math.floor(i / 4) }));
    for (const t of ts) paintTile(map, 0, t.x, t.y, chunk); // aquece os chunks
    let t = performance.now();
    for (const q of ts) paintTile(map, 0, q.x, q.y, chunk);
    expect((performance.now() - t) / ts.length).toBeLessThan(15);
    const t5 = tileOf(5, cap.x, cap.y);
    t = performance.now();
    for (let i = 0; i < 12; i++) paintTile(map, 5, (t5.x + i) % 8, t5.y, chunk);
    expect((performance.now() - t) / 12).toBeLessThan(15);
  });
});

describe('mapa limpo (ciclo 8)', { timeout: 120000 }, () => {
  const map2 = generateWorld(2209734144), pm2 = generateProvinces(map2), chunk2 = makeChunkCache(map2);
  const capital = pm2.provinces.find(p => p.name === 'Valimoronddor')!.city;
  const lum = (img: Uint8ClampedArray, x: number, y: number) => { const p = px(img, x, y); return p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11; };
  test('floresta sem pontinhos nem degraus: quase nenhum salto brusco entre pixels vizinhos', () => {
    // ladrilho L0 na borda floresta/planície ao lado da capital (as capturas do teste)
    const t = tileOf(0, capital.x - 16, capital.y), img = paintTile(map2, 0, t.x, t.y, chunk2);
    let sharp = 0;
    for (let y = 0; y < TILE_PX; y++) for (let x = 0; x < TILE_PX - 1; x++) if (Math.abs(lum(img, x, y) - lum(img, x + 1, y)) > 10) sharp++;
    expect(sharp / (TILE_PX * TILE_PX)).toBeLessThan(0.01); // com os pontinhos de árvore: ~3%
  });
  test('sem faixas verticais: a ondulação das colunas não se repete de cima para baixo', () => {
    // planície ao norte da capital (3×2 ladrilhos L0), onde a erosão deixou sulcos retos norte–sul
    const t0 = tileOf(0, capital.x - 32, capital.y - 42), C = 3, R = 2, W = C * TILE_PX, Hh = R * TILE_PX;
    const tiles = Array.from({ length: C * R }, (_, i) => paintTile(map2, 0, t0.x + (i % C), t0.y + Math.floor(i / C), chunk2));
    const L = (x: number, y: number) => lum(tiles[Math.floor(y / TILE_PX) * C + Math.floor(x / TILE_PX)], x % TILE_PX, y % TILE_PX);
    const prof = (n: number, m: number, f: (i: number, k: number) => number) => Array.from({ length: n }, (_, i) => { let s = 0; for (let k = 0; k < m; k++) s += f(i, k); return s / m; });
    // faixa = a mesma ondulação de colunas na metade de cima e na de baixo; textura e árvores não se repetem
    const detr = (a: number[]) => a.map((v, i) => { let m = 0, n = 0; for (let d = -15; d <= 15; d++) if (a[i + d] !== undefined) { m += a[i + d]; n++; } return v - m / n; });
    const top = detr(prof(W, TILE_PX / 2, (x, y) => L(x, y))), bot = detr(prof(W, TILE_PX / 2, (x, y) => L(x, y + TILE_PX / 2)));
    const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0), corr = dot(top, bot) / Math.sqrt(dot(top, top) * dot(bot, bot));
    expect(corr).toBeLessThan(0.3);
  });
  test('fora do mundo é alto-mar: o fundo casa com o mar aberto dos ladrilhos', () => {
    const img = paintTile(map2, 3, 0, 0, chunk2), m = OPEN_SEA.match(/\d+/g)!.map(Number); // canto do mundo: só mar
    for (const [x, y] of [[5, 5], [100, 40], [180, 180]]) { const p = px(img, x, y); for (let c = 0; c < 3; c++) expect(Math.abs(p[c] - m[c])).toBeLessThanOrEqual(8); }
  });
});
