import { describe, expect, test } from 'vitest';
import { buildCost, colonizeCost, monthlyIncome } from '../src/sim/economy';
import { build, chooseCapital, colonize, setSpeed, upgrade } from '../src/sim/commands';
import { newGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import type { Province, ProvinceMap } from '../src/worldgen/provinces';
import { Biome } from '../src/worldgen/types';

const prov = (id: number, neighbors: number[], o: Partial<Province> = {}): Province => ({
  id, name: `P${id}`, center: { x: id * 100, y: 0 }, cells: 1000, neighbors, coastal: false, biome: Biome.Grassland,
  fertility: 1, forest: 1, rock: 1, slots: 4, sites: [], ...o,
});
// 0-1-2-3 em cadeia; 4 isolada; 2 é montanha (colonizar demora mais); 3 sem floresta nem rocha
const pm: ProvinceMap = {
  cellProvince: new Int16Array(0), suggestedCapitals: [0],
  provinces: [prov(0, [1]), prov(1, [0, 2]), prov(2, [1, 3], { biome: Biome.Mountain }), prov(3, [2], { forest: 0, rock: 0 }), prov(4, [])],
};
const game = () => { const s = newGame(pm); expect(chooseCapital(s, pm, 0).ok).toBe(true); return s; };
const run = (s: ReturnType<typeof newGame>, months: number) => { setSpeed(s, 1); for (let i = 0; i < months * 10; i++) tick(s, pm, 1); };

describe('início', () => {
  test('capital com Vila N2 e recursos iniciais', () => {
    const s = game();
    expect(s.owner[0]).toBe(0);
    expect(s.buildings[0][0]).toEqual({ type: 'village', level: 2, remaining: 0 });
    expect(s.res).toEqual({ gold: 40, wood: 110, stone: 60 });
    expect(chooseCapital(s, pm, 1)).toEqual({ ok: false, reason: 'A capital já foi escolhida' });
  });
  test('começa pausado e o tempo não anda', () => {
    const s = game();
    tick(s, pm, 100);
    expect(s.month).toBe(0);
  });
});

describe('renda', () => {
  test('capital: imposto 2 + capital 10 + vila N2 7×fertilidade', () => {
    expect(monthlyIncome(game(), pm)).toEqual({ gold: 19, wood: 0, stone: 0 });
  });
  test('serraria, pedreira, mercado e guarnição', () => {
    const s = game();
    s.buildings[0][1] = { type: 'sawmill', level: 2, remaining: 0 };
    s.buildings[0][2] = { type: 'quarry', level: 1, remaining: 0 };
    s.buildings[0][3] = { type: 'market', level: 1, remaining: 0 };
    // ouro da província = 2 + 10 + 7 = 19; mercado +25% = 4.75
    expect(monthlyIncome(s, pm)).toEqual({ gold: 23.75, wood: 5, stone: 2 });
    s.buildings[0][3] = { type: 'garrison', level: 1, remaining: 0 };
    expect(monthlyIncome(s, pm).gold).toBe(17);
  });
  test('obra em andamento não rende; renda cai a cada virada de mês', () => {
    const s = game();
    s.buildings[0][1] = { type: 'sawmill', level: 1, remaining: 2 };
    expect(monthlyIncome(s, pm).wood).toBe(0);
    run(s, 1);
    expect(s.res.gold).toBe(59);
  });
});

describe('construir', () => {
  test('custo, tempo e conclusão', () => {
    const s = game();
    expect(build(s, pm, 0, 1, 'sawmill')).toEqual({ ok: true });
    expect(s.res).toEqual({ gold: 0, wood: 90, stone: 50 });
    run(s, 1.9);
    expect(s.buildings[0][1]!.remaining).toBeGreaterThan(0);
    run(s, 0.2);
    expect(s.buildings[0][1]!.remaining).toBe(0);
    expect(s.events.some(e => e.text.includes('Serraria'))).toBe(true);
  });
  test('melhoria custa 1.8× e 3×, demora 1.5× por nível', () => {
    expect(buildCost('sawmill', 2)).toEqual({ gold: 72, wood: 36, stone: 18, months: 3 });
    expect(buildCost('sawmill', 3)).toEqual({ gold: 120, wood: 60, stone: 30, months: 4.5 });
    const s = game();
    s.res = { gold: 1000, wood: 1000, stone: 1000 };
    expect(upgrade(s, pm, 0, 0)).toEqual({ ok: true }); // vila N2 → N3
    expect(s.buildings[0][0]).toEqual({ type: 'village', level: 3, remaining: buildCost('village', 3).months });
    expect(upgrade(s, pm, 0, 0).ok).toBe(false); // em obra
  });
  test.each([
    ['província inválida', -1, 0, 'sawmill', 'Província inválida'],
    ['província alheia', 1, 0, 'sawmill', 'Esta província não é sua'],
    ['vaga ocupada', 0, 0, 'sawmill', 'Vaga ocupada'],
    ['vaga inexistente', 0, 9, 'sawmill', 'Vaga inválida'],
    ['tipo desconhecido', 0, 1, 'castelo', 'Prédio desconhecido'],
    ['segunda vila', 0, 1, 'village', 'Já existe uma vila nesta província'],
  ] as const)('recusa: %s', (_, id, slot, type, reason) => {
    expect(build(game(), pm, id, slot, type as never)).toEqual({ ok: false, reason });
  });
  test('requisitos de floresta, rocha e mercado', () => {
    const s = game();
    s.owner[3] = 0; s.buildings[3][0] = { type: 'village', level: 1, remaining: 0 };
    s.res = { gold: 1000, wood: 1000, stone: 1000 };
    expect(build(s, pm, 3, 1, 'sawmill')).toEqual({ ok: false, reason: 'Precisa de floresta (≥ 0.3)' });
    expect(build(s, pm, 3, 1, 'quarry')).toEqual({ ok: false, reason: 'Precisa de rocha (≥ 0.3)' });
    expect(build(s, pm, 3, 1, 'market')).toEqual({ ok: false, reason: 'Precisa de Vila nível 2' });
  });
  test('falta de recurso diz qual', () => {
    const s = game();
    s.res.wood = 5;
    expect(build(s, pm, 0, 1, 'sawmill')).toEqual({ ok: false, reason: 'Falta 15 de madeira' });
  });
});

describe('colonizar', () => {
  test('custo cresce exponencialmente com províncias; conclui com Vila N1', () => {
    const s = game();
    s.res.gold = 500;
    expect(colonizeCost(s, pm, 1)).toEqual({ gold: 80, wood: 50, stone: 0, months: 5 });
    expect(colonize(s, pm, 1)).toEqual({ ok: true });
    run(s, 5.05);
    expect(s.owner[1]).toBe(0);
    expect(s.buildings[1][0]).toEqual({ type: 'village', level: 1, remaining: 0 });
    expect(colonizeCost(s, pm, 2).gold).toBeCloseTo(80 * 1.36);
    expect(colonizeCost(s, pm, 2).wood).toBeCloseTo(50 * 1.15);
    expect(colonizeCost(s, pm, 2).months).toBe(6); // montanha +1
  });
  test.each([
    ['não vizinha', 3, 'Precisa ser vizinha de uma província sua'],
    ['já é sua', 0, 'Esta província não é neutra'],
    ['inválida', 99, 'Província inválida'],
  ] as const)('recusa: %s', (_, id, reason) => expect(colonize(game(), pm, id)).toEqual({ ok: false, reason }));
  test('no máximo 2 simultâneas e não repete', () => {
    const s = game();
    s.res = { gold: 9999, wood: 9999, stone: 0 };
    s.owner[2] = 0;
    expect(colonize(s, pm, 1).ok).toBe(true);
    expect(colonize(s, pm, 1)).toEqual({ ok: false, reason: 'Já está sendo colonizada' });
    expect(colonize(s, pm, 3).ok).toBe(true);
    s.owner[4] = -1;
    expect(colonize(s, pm, 4)).toEqual({ ok: false, reason: 'Já há 2 colonizações em andamento' });
  });
  test('guarnição vizinha: 25% mais barato e rápido', () => {
    const s = game();
    s.buildings[0][1] = { type: 'garrison', level: 1, remaining: 0 };
    expect(colonizeCost(s, pm, 1)).toEqual({ gold: 60, wood: 37.5, stone: 0, months: 3.75 });
  });
});

describe('tempo e estado', () => {
  test('8× com dt grande processa todas as viradas de mês', () => {
    const s = game();
    setSpeed(s, 8);
    tick(s, pm, 50); // 40 meses
    expect(s.month).toBeCloseTo(40);
    expect(s.res.gold).toBeCloseTo(40 + 40 * 19);
  });
  test('estado sobrevive a JSON e continua jogável', () => {
    const s = game();
    build(s, pm, 0, 1, 'sawmill');
    const c = JSON.parse(JSON.stringify(s));
    expect(c).toEqual(s);
    run(c, 3);
    expect(c.buildings[0][1].remaining).toBe(0);
  });
});

describe('verificações sem efeito', () => {
  test('check* não altera o estado e concorda com o comando', async () => {
    const { checkBuild, checkColonize, checkUpgrade } = await import('../src/sim/commands');
    const s = game(), before = JSON.stringify(s);
    expect(checkBuild(s, pm, 0, 1, 'sawmill')).toEqual({ ok: true });
    expect(checkColonize(s, pm, 1)).toEqual({ ok: false, reason: 'Falta 40 de ouro' });
    expect(checkUpgrade(s, pm, 0, 0).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
});
