import { describe, expect, test } from 'vitest';
import { chooseCapital } from '../src/sim/commands';
import { newGame, type Bent, type GameState } from '../src/sim/state';
import { men, spawnArmy } from '../src/sim/armies';
import { aiWarRoll, declareWar, hostile } from '../src/sim/war';
import { game, run, world } from './troopworld';

const { pm } = world;
/** Nação `id` sem território (só para ter exércitos) ou com a província `capital`. */
const addNation = (s: GameState, id: number, capital = -1, bent: Bent = 'industrial') => {
  s.nations.push({ ...s.nations[0], history: [], id, name: `Nação de X${id}`, bent, ai: true, capital, res: { ...s.nations[0].res }, atWar: [], founded: 0 });
  if (capital >= 0) { s.owner[capital] = id; s.city[capital] = { level: 2, remaining: 0 }; s.connected[capital] = true; }
};
/** Jogador na província 0 e rival (nação 1) na província 1. */
const two = (bent: Bent = 'industrial', seed = 0) => {
  const s = newGame(pm, seed);
  chooseCapital(s, pm, 0);
  addNation(s, 1, 1, bent);
  return s;
};

describe('paz e declaração', () => {
  test('em paz, lado a lado, não lutam', () => {
    const s = two(), a = spawnArmy(s, 0, ['line'], 100, 80), b = spawnArmy(s, 1, ['line'], 104, 80);
    run(s, 1);
    expect(s.battles).toEqual([]);
    expect(men(a)).toBe(20);
    expect(men(b)).toBeCloseTo(19, 6); // só o desgaste: em território alheio não há suprimento
  });
  test('declarar guerra: os dois lados, evento, pausa; recusas', () => {
    const s = two();
    s.speed = 4;
    expect(declareWar(s, 1, 0, pm)).toEqual({ ok: true });
    expect(s.nations[0].atWar).toEqual([1]);
    expect(s.nations[1].atWar).toEqual([0]);
    expect(s.events.at(-1)!.text).toBe('A Nação de X1 declarou guerra à Nação de P0');
    expect(s.speed).toBe(0);
    expect(hostile(s, 0, 1)).toBe(true);
    expect(declareWar(s, 0, 1, pm)).toEqual({ ok: false, reason: 'Já em guerra' });
    expect(declareWar(s, 0, 0, pm)).toEqual({ ok: false, reason: 'Não pode declarar guerra a si mesma' });
    expect(declareWar(s, 0, 9, pm)).toEqual({ ok: false, reason: 'Nação inválida' });
    s.nations[1].alive = false;
    expect(declareWar(s, 0, 1, pm)).toEqual({ ok: false, reason: 'Nação inválida' });
  });
  test('em guerra, os mesmos exércitos lutam', () => {
    const s = two(), a = spawnArmy(s, 0, ['line'], 100, 80), b = spawnArmy(s, 1, ['line'], 104, 80);
    declareWar(s, 0, 1, pm);
    run(s, 0.1);
    expect(s.battles.length).toBe(1);
    expect(men(a) + men(b)).toBeLessThan(40);
  });
  test('fortaleza é hostil a todos', () => {
    const s = two();
    expect(hostile(s, -1, 1)).toBe(true);
    expect(hostile(s, 0, -1)).toBe(true);
    expect(hostile(s, 1, 1)).toBe(false);
  });
});

describe('três lados', () => {
  test('1 e 2 em guerra; o jogador em paz ao lado não entra nem perde homens', () => {
    const s = two();
    addNation(s, 2);
    const a = spawnArmy(s, 1, ['line'], 180, 80), b = spawnArmy(s, 2, ['line'], 184, 80), me = spawnArmy(s, 0, ['line'], 182, 84);
    declareWar(s, 1, 2, pm);
    run(s, 0.3);
    expect(s.battles.length).toBe(1);
    expect(s.battles[0].armyIds).not.toContain(me.id);
    expect(men(me)).toBeCloseTo(19.7, 6); // só o desgaste (território alheio), nenhum dano de batalha
    expect(men(a) + men(b)).toBeLessThan(40);
  });
});

describe('rotas e suprimento por nação', () => {
  test('exército de quem está em paz não corta a rota; em guerra corta', () => {
    const s = game(1, true); // já traz a nação 1 em guerra; a 2 está em paz
    addNation(s, 2);
    const c = s.routes[0].path[Math.floor(s.routes[0].path.length / 2)];
    spawnArmy(s, 2, ['line'], (c % world.grid.size) * 4 + 2, Math.floor(c / world.grid.size) * 4 + 2);
    run(s, 0.05);
    expect(s.routes[0].cut).toBe(false);
    declareWar(s, 0, 2, pm);
    run(s, 0.05);
    expect(s.routes[0].cut).toBe(true);
  });
  test('exército de rival sem rede perde homens, sem aviso no feed do jogador', () => {
    const s = two();
    addNation(s, 2);
    const t = spawnArmy(s, 2, ['line'], 180, 200);
    run(s, 2);
    expect(men(t)).toBeLessThan(20);
    expect(s.events.some(e => e.text.includes('sem suprimento'))).toBe(false);
  });
});

describe('a IA declara pela inclinação', () => {
  /** Primeiro mês (≤ 300) em que o rival 1 declara guerra ao jogador; Infinity se nunca. */
  const firstWar = (bent: Bent, seed: number, rivalBats: number, playerBats = 1) => {
    const s = two(bent, seed);
    spawnArmy(s, 1, Array.from({ length: rivalBats }, () => 'line' as const), 180, 80);
    spawnArmy(s, 0, Array.from({ length: playerBats }, () => 'line' as const), 60, 80);
    for (let m = 0; m <= 300; m++) {
      s.month = m;
      aiWarRoll(s, pm, 1);
      if (s.nations[1].atWar.includes(0)) return m;
    }
    return Infinity;
  };
  test('Industrial nunca declara', () => {
    expect(firstWar('industrial', 1, 8)).toBe(Infinity);
  });
  test('ninguém declara na carência de 24 meses; mesma semente, mesmo mês', () => {
    for (let seed = 0; seed < 10; seed++) expect(firstWar('militarist', seed, 8)).toBeGreaterThanOrEqual(24);
    expect(firstWar('militarist', 7, 8)).toBe(firstWar('militarist', 7, 8));
  });
  test('Expansionista só declara com mais batalhões que o vizinho', () => {
    expect(firstWar('expansionist', 3, 1, 2)).toBe(Infinity);
    expect(firstWar('expansionist', 3, 3, 2)).toBeLessThan(Infinity);
  });
  test('na média, a Militarista declara antes da Expansionista', () => {
    const mean = (bent: Bent) => { let t = 0; for (let seed = 0; seed < 20; seed++) t += Math.min(300, firstWar(bent, seed, 5, 2)); return t / 20; };
    expect(mean('militarist')).toBeLessThan(mean('expansionist'));
  });
  /** Fronteira que só aparece no mês `meet` (nação já fundada há muito): mês da declaração, ou Infinity. */
  const afterContact = (bent: Bent, seed: number, rivalBats: number, playerBats: number, meet = 100) => {
    const s = two(bent, seed);
    spawnArmy(s, 1, Array.from({ length: rivalBats }, () => 'line' as const), 180, 80);
    spawnArmy(s, 0, Array.from({ length: playerBats }, () => 'line' as const), 60, 80);
    for (let m = meet; m <= meet + 300; m++) {
      s.month = m;
      aiWarRoll(s, pm, 1);
      if (s.nations[1].atWar.includes(0)) return m - meet;
    }
    return Infinity;
  };
  test('Militarista forte não ataca no primeiro ano de fronteira, mas ataca depois', () => {
    const t = Array.from({ length: 20 }, (_, seed) => afterContact('militarist', seed, 8, 1));
    for (const m of t) expect(m).toBeGreaterThanOrEqual(12);
    expect(t.filter(m => m < Infinity).length).toBeGreaterThanOrEqual(15); // continua agressiva
    expect(t.reduce((a, m) => a + Math.min(300, m), 0) / 20).toBeLessThan(80);
  });
  test('Militarista mais fraca (ou quase sem exército) não declara', () => {
    expect(afterContact('militarist', 1, 3, 3)).toBe(Infinity);
    expect(afterContact('militarist', 1, 3, 1)).toBe(Infinity); // 3 batalhões: abaixo do mínimo
  });
});
