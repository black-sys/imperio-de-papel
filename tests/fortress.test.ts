import { describe, expect, test } from 'vitest';
import { checkColonize } from '../src/sim/commands';
import { addFortress, capitalHops, placeFortresses } from '../src/sim/fortress';
import { newGame } from '../src/sim/state';
import { spawnTroop } from '../src/sim/troops';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';
import { game, run, world } from './troopworld';

const { pm } = world;
const texts = (s: ReturnType<typeof game>) => s.events.map(e => e.text);

describe('distribuição no mundo real', { timeout: 60000 }, () => {
  const real = generateProvinces(generateWorld(860));
  const place = (seed: number) => { const s = newGame(real); placeFortresses(s, real, seed); return s; };
  const s = place(860), hops = capitalHops(real);
  test('~25% das províncias, com local, longe das capitais sugeridas', () => {
    const withSites = real.provinces.filter(p => p.sites.length > 0).length;
    expect(Math.abs(s.fortresses.length - 0.25 * withSites)).toBeLessThanOrEqual(1);
    const near = new Set(real.suggestedCapitals.flatMap(c => [c, ...real.provinces[c].neighbors]));
    for (const f of s.fortresses) {
      expect(near.has(f.province)).toBe(false);
      expect(real.provinces[f.province].sites.length).toBeGreaterThan(0);
      expect(Number.isFinite(hops[f.province])).toBe(true);
      expect(checkColonize(s, real, f.province)).toEqual({ ok: false, reason: 'Fortaleza: só cai com tropas' });
    }
  });
  test('força cresce com a distância: 2 a 10 tropas, um terço de arqueiros nas maiores', () => {
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const size = (pred: (h: number) => boolean) => mean(s.fortresses.filter(f => pred(hops[f.province])).map(f => f.garrison.length));
    for (const f of s.fortresses) {
      expect(f.garrison.length).toBe(Math.min(10, 2 * (hops[f.province] - 1)));
      expect(f.garrison.filter(t => t === 'archer').length).toBe(Math.floor(f.garrison.length / 3));
      expect(f.garrison).not.toContain('cavalry');
      const there = s.troops.filter(t => t.home === f.province);
      expect(there.map(t => t.type).sort()).toEqual([...f.garrison].sort());
      expect(there.every(t => t.owner === -1)).toBe(true);
      expect(new Set(there.map(t => `${t.x},${t.y}`)).size).toBe(there.length); // não empilhadas
    }
    expect(size(h => h === 2)).toBe(2);
    expect(size(h => h >= 5)).toBeGreaterThan(size(h => h <= 3));
  });
  test('determinístico por semente', () => {
    expect(place(860).fortresses).toEqual(s.fortresses);
    expect(place(861).fortresses.map(f => f.province)).not.toEqual(s.fortresses.map(f => f.province));
  });
});

describe('conquista e regeneração', () => {
  test('derrotar a guarnição dá a província com Vila N1', () => {
    const s = game();
    addFortress(s, pm, 1, ['spear']);
    for (let i = 0; i < 3; i++) spawnTroop(s, 0, 'spear', 180, 76 + i * 4); // no local da fortaleza
    run(s, 2);
    expect(s.owner[1]).toBe(0);
    expect(s.buildings[1][0]).toEqual({ type: 'village', level: 1, remaining: 0 });
    expect(s.fortresses).toEqual([]);
    expect(s.troops.every(t => t.owner === 0)).toBe(true);
    expect(texts(s)).toContain('Fortaleza de P1 conquistada');
  });
  test('sem combate há 3 meses, volta à força total; antes disso não', () => {
    const s = game();
    addFortress(s, pm, 1, ['spear', 'spear']);
    spawnTroop(s, 0, 'spear', 180, 80);
    run(s, 1);
    const hurt = () => s.troops.filter(t => t.owner === -1).reduce((n, t) => n + t.soldiers, 0);
    expect(s.owner[1]).toBe(-1);
    expect(hurt()).toBeLessThan(40);
    run(s, 1.5);
    expect(hurt()).toBeLessThan(40);
    run(s, 1.5);
    expect(hurt()).toBe(40);
    expect(s.troops.filter(t => t.owner === -1).length).toBe(2);
  });
  test('tropa da fortaleza morta volta na regeneração', () => {
    const s = game();
    addFortress(s, pm, 1, ['spear', 'spear']);
    s.troops.splice(s.troops.findIndex(t => t.owner === -1), 1);
    run(s, 3.1);
    expect(s.troops.filter(t => t.home === 1).length).toBe(2);
  });
});
