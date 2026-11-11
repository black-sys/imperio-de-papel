import { describe, expect, test } from 'vitest';
import { checkColonize, checkRecruit, checkUpgrade, moveArmies, recruit, setSpeed, upgrade } from '../src/sim/commands';
import { TROOP_GROWTH } from '../src/sim/balance';
import { monthlyIncome, recruitCost } from '../src/sim/economy';
import type { GameState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { labelLand, type MoveGrid } from '../src/sim/movegrid';
import { armyCap, armySpeed, men, mergeArmies, renameArmy, spawnArmy, splitArmy } from '../src/sim/armies';
import { game, makeTestWorld, run, world } from './troopworld';

const { pm, grid } = world;
const garrison = (level = 1) => ({ type: 'garrison' as const, level, remaining: 0 });

describe('recrutamento', () => {
  test('recusas: sem guarnição, nível, fila ocupada', () => {
    const s = game();
    expect(checkRecruit(s, pm, 0, 0, 'line')).toEqual({ ok: false, reason: 'Precisa de uma Guarnição' });
    expect(checkRecruit(s, pm, 1, 0, 'line')).toEqual({ ok: false, reason: 'Esta província não é sua' });
    expect(checkRecruit(s, pm, 0, 1, 'artillery')).toEqual({ ok: false, reason: 'Requer Guarnição N2' });
    expect(checkRecruit(s, pm, 0, 1, 'cavalry')).toEqual({ ok: false, reason: 'Requer Guarnição N3' });
    expect(recruit(s, pm, 0, 1, 'line')).toEqual({ ok: true });
    expect(s.res).toMatchObject({ money: 970, grain: 990, arms: 988, wood: 1000 }); // infantaria: 30 dinheiro, 10 grãos, 12 armas
    expect(recruit(s, pm, 0, 1, 'line')).toEqual({ ok: false, reason: 'Já está treinando uma tropa' });
  });
  test('guarnição em obra não treina', () => {
    const s = game();
    s.lots[0][1] = { type: 'garrison', level: 1, remaining: 2 };
    expect(checkRecruit(s, pm, 0, 1, 'line')).toEqual({ ok: false, reason: 'Precisa de uma Guarnição' });
  });
  test('falta de recurso: infantaria sem armas; artilharia sem aço; cavalaria sem ferro', () => {
    const s = game(3);
    s.res.money = 10;
    expect(checkRecruit(s, pm, 0, 1, 'line')).toEqual({ ok: false, reason: 'Falta 20 de dinheiro' });
    s.res.money = 1000; s.res.arms = 0;
    expect(checkRecruit(s, pm, 0, 1, 'line')).toEqual({ ok: false, reason: 'Falta 12 de armas' });
    s.res.arms = 1000; s.res.steel = 0;
    expect(checkRecruit(s, pm, 0, 1, 'artillery')).toEqual({ ok: false, reason: 'Falta 10 de aço' });
    s.res.iron = 0;
    expect(checkRecruit(s, pm, 0, 1, 'cavalry')).toEqual({ ok: false, reason: 'Falta 10 de ferro' });
  });
  test('a tropa nasce no local do prédio depois de 2 meses', () => {
    const s = game();
    recruit(s, pm, 0, 1, 'line');
    run(s, 1.9);
    expect(s.armies.length).toBe(0);
    run(s, 0.2);
    expect(s.armies).toMatchObject([{ owner: 0, battalions: [{ type: 'line', soldiers: 20 }], x: 80, y: 84, morale: 1 }]);
    expect(s.recruiting).toEqual([]);
    expect(s.events.at(-1)!.text).toBe('Infantaria de linha treinada em P0');
  });
  test('teto: guarnição N1 sustenta 2, N2 3, N3 4; tropa em treino conta', () => {
    const s = game();
    expect(armyCap(s)).toBe(2);
    spawnArmy(s, 0, ['line'], 80, 80);
    recruit(s, pm, 0, 1, 'line');
    s.lots[0][2] = garrison(); // o teto é do reino: soma das guarnições
    expect(armyCap(s)).toBe(4);
    s.lots[0][2] = null;
    expect(checkRecruit({ ...s, recruiting: [] }, pm, 0, 1, 'line')).toEqual({ ok: true });
    spawnArmy(s, 0, ['line'], 80, 80);
    expect(checkRecruit({ ...s, recruiting: [] }, pm, 0, 1, 'line')).toEqual({ ok: false, reason: 'Teto de batalhões atingido' });
    expect(armyCap(game(2))).toBe(3);
    expect(armyCap(game(3))).toBe(4);
  });
  test('custo cresce com o tamanho do exército (tropas + em treino); fortalezas não contam', () => {
    const s = game(3);
    expect(recruitCost(s, 'line')).toEqual({ money: 30, grain: 10, arms: 12 });
    spawnArmy(s, 0, ['line'], 80, 80);
    spawnArmy(s, -1, ['line'], 180, 80, 1);
    expect(recruit(s, pm, 0, 1, 'cavalry')).toEqual({ ok: true }); // 2ª tropa: base × growth
    expect(s.res.money).toBeCloseTo(1000 - 70 * TROOP_GROWTH, 6);
    expect(s.res.iron).toBeCloseTo(1000 - 10 * TROOP_GROWTH, 6);
    const c = recruitCost(s, 'line'); // 3ª tropa
    expect(c.money).toBeCloseTo(30 * TROOP_GROWTH ** 2, 6);
    expect(c.arms).toBeCloseTo(12 * TROOP_GROWTH ** 2, 6);
    expect(TROOP_GROWTH).toBeGreaterThan(1);
  });
  test('guarnição em melhoria mantém o teto do nível anterior', () => {
    const s = game();
    s.lots[0][1] = { type: 'garrison', level: 2, remaining: 3 };
    expect(armyCap(s)).toBe(2);
  });
});

describe('metas de nível da guarnição', () => {
  test('N2 exige 3 guarnições no reino', () => {
    const s = game();
    s.lots[0][2] = garrison();
    expect(checkUpgrade(s, pm, 0, { lot: 1 })).toEqual({ ok: false, reason: 'Guarnições: 2/3' });
    s.lots[0][3] = garrison();
    expect(upgrade(s, pm, 0, { lot: 1 })).toEqual({ ok: true });
  });
  test('N3 exige 3 guarnições N2 ou maiores', () => {
    const s = game(2);
    s.lots[0][2] = garrison(2); s.lots[0][3] = garrison(1);
    expect(checkUpgrade(s, pm, 0, { lot: 1 })).toEqual({ ok: false, reason: 'Guarnições nível 2: 2/3' });
    s.lots[0][3] = garrison(3);
    expect(upgrade(s, pm, 0, { lot: 1 })).toEqual({ ok: true });
  });
  test('a cota vale para os outros prédios também', () => {
    const s = game();
    s.veins[0][0] = { type: 'farm', level: 1, remaining: 0 };
    expect(checkUpgrade(s, pm, 0, { vein: 0 })).toEqual({ ok: false, reason: 'Fazendas: 1/3' });
  });
});

test('fortaleza não pode ser colonizada', () => {
  const s = game();
  expect(checkColonize(s, pm, 1)).toEqual({ ok: true });
  s.fortresses.push({ province: 1, garrison: ['line'], lastCombat: 0 });
  expect(checkColonize(s, pm, 1)).toEqual({ ok: false, reason: 'Fortaleza: só cai com tropas' });
});

test('manutenção das tropas sai da renda: dinheiro e grãos', () => {
  const s = game(), before = monthlyIncome(s, pm);
  spawnArmy(s, 0, ['line'], 80, 80);
  spawnArmy(s, 0, ['cavalry'], 80, 80);
  spawnArmy(s, -1, ['line'], 80, 80, 1); // fortaleza não custa
  const after = monthlyIncome(s, pm);
  expect(after.money).toBeCloseTo(before.money - 3, 9); // infantaria 1 + cavalaria 2
  expect(after.grain).toBeCloseTo(before.grain - 2.5, 9); // 1 + 1.5
});

test('estado com tropas faz ida e volta pelo JSON', () => {
  const s = game();
  recruit(s, pm, 0, 1, 'line');
  spawnArmy(s, 0, ['line'], 80, 80);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});

/** Meses até a tropa parar (ticks de 0.01 mês). */
const timeToStop = (s: GameState, id: number) => {
  const t = s.armies.find(t => t.id === id)!, m0 = s.clock;
  setSpeed(s, 1);
  for (let i = 0; i < 5000 && t.path.length; i++) tick(s, pm, 0.1, grid);
  return s.clock - m0;
};

describe('ordens e movimento', () => {
  test('lanceiros andam 40 tiles em campo aberto em 40/150 mês', () => {
    const s = game(), t = spawnArmy(s, 0, ['line'], 10, 102);
    expect(moveArmies(s, grid, [t.id], 50, 102)).toEqual({ ok: true });
    expect(Math.abs(timeToStop(s, t.id) - 40 / 150)).toBeLessThan(0.03);
    expect([t.x, t.y]).toEqual([50, 102]);
  });
  test('cavaleiros são mais rápidos', () => {
    const s = game(), t = spawnArmy(s, 0, ['cavalry'], 10, 102);
    moveArmies(s, grid, [t.id], 50, 102);
    expect(Math.abs(timeToStop(s, t.id) - 40 / 240)).toBeLessThan(0.03);
  });
  test('cruzar o rio é mais lento que a mesma distância em campo aberto', () => {
    const s = game(), a = spawnArmy(s, 0, ['line'], 118, 162);
    moveArmies(s, grid, [a.id], 138, 162);
    const river = timeToStop(s, a.id);
    expect(a.x).toBe(138);
    const s2 = game(), b2 = spawnArmy(s2, 0, ['line'], 18, 162);
    moveArmies(s2, grid, [b2.id], 38, 162);
    expect(river).toBeGreaterThan(timeToStop(s2, b2.id) + 0.03);
  });
  test('recusas: sem tropas, água, fora do mapa, tropa alheia', () => {
    const s = game(), t = spawnArmy(s, 0, ['line'], 10, 102), f = spawnArmy(s, -1, ['line'], 180, 80, 1);
    expect(moveArmies(s, grid, [], 50, 102)).toEqual({ ok: false, reason: 'Nenhum exército selecionado' });
    expect(moveArmies(s, grid, [f.id, 999], 50, 102)).toEqual({ ok: false, reason: 'Nenhum exército selecionado' });
    expect(moveArmies(s, grid, [t.id], 180, 180)).toEqual({ ok: false, reason: 'Destino na água' });
    expect(moveArmies(s, grid, [t.id], -5, 102)).toEqual({ ok: false, reason: 'Destino na água' });
    expect(moveArmies(s, grid, [t.id], 5000, 102)).toEqual({ ok: false, reason: 'Destino na água' });
    expect(t.path).toEqual([]);
  });
  test('destino inalcançável não trava a tropa', () => {
    const { grid: g } = makeTestWorld(), s = game(), t = spawnArmy(s, 0, ['line'], 10, 102);
    for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) if (d || e) g.cost[(20 + e) * 64 + 20 + d] = 0;
    expect(moveArmies(s, g, [t.id], 82, 82)).toEqual({ ok: false, reason: 'Caminho impossível' });
    expect(t.path).toEqual([]);
  });
  test('grupo chega em formação, sem empilhar', () => {
    const s = game(), ts = [0, 1, 2, 3].map(i => spawnArmy(s, 0, ['line'], 10 + i * 4, 102));
    expect(moveArmies(s, grid, ts.map(t => t.id), 60, 160)).toEqual({ ok: true });
    for (const t of ts) timeToStop(s, t.id);
    for (const a of ts) for (const b of ts) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(8);
    for (const t of ts) expect(Math.hypot(t.x - 60, t.y - 160)).toBeLessThan(16);
  });
  test('mesmo resultado a 1× e a 8×', () => {
    const go = (speed: number) => {
      const s = game(), t = spawnArmy(s, 0, ['line'], 10, 102);
      moveArmies(s, grid, [t.id], 138, 162);
      run(s, 0.4, speed);
      return [t.x, t.y, s.clock].map(v => +v.toFixed(6));
    };
    expect(go(8)).toEqual(go(1));
    expect(go(1)[2]).toBe(0.4);
  });
});

describe('reposição e manutenção', () => {
  const hurt = (x: number, y: number, withGarrison: boolean) => {
    const s = game();
    if (!withGarrison) s.lots[0][1] = null;
    const t = spawnArmy(s, 0, ['line'], x, y);
    t.battalions[0].soldiers = 10;
    return { s, t };
  };
  test('1 soldado por mês em província sua, a 2 de dinheiro cada', () => {
    const { s, t } = hurt(60, 100, false), c = hurt(60, 100, false);
    c.t.battalions[0].soldiers = 20; // controle: tropa cheia não gasta
    run(s, 1); run(c.s, 1);
    expect(men(t)).toBeCloseTo(11, 5);
    expect(c.s.res.money - s.res.money).toBeCloseTo(2, 5);
  });
  test('3 por mês com Guarnição; nunca passa do tamanho da tropa', () => {
    const { s, t } = hurt(60, 100, true);
    run(s, 1);
    expect(men(t)).toBeCloseTo(13, 5);
    run(s, 5);
    expect(men(t)).toBe(20);
  });
  test('não repõe fora do reino, andando ou sem dinheiro', () => {
    const a = hurt(180, 100, true);
    run(a.s, 1);
    expect(men(a.t)).toBeLessThanOrEqual(10); // fora do reino não repõe (e, sem suprimento, ainda desgasta)
    const b = hurt(60, 100, true);
    b.s.res.money = 0;
    run(b.s, 0.9); // antes da renda do mês
    expect(men(b.t)).toBe(10);
    expect(b.s.res.money).toBe(0);
    const c = hurt(10, 102, true);
    moveArmies(c.s, grid, [c.t.id], 110, 102);
    run(c.s, 0.3);
    expect(men(c.t)).toBe(10);
  });
  test('dinheiro negativo na virada do mês dispersa a tropa mais cara', () => {
    const s = game();
    spawnArmy(s, 0, ['line'], 60, 100); spawnArmy(s, 0, ['cavalry'], 60, 100);
    s.res.money = -500;
    run(s, 1);
    expect(s.armies.flatMap(a => a.battalions.map(b => b.type))).toEqual(['line']);
    expect(s.events.at(-1)!.text).toBe('Batalhão de cavalaria disperso por falta de dinheiro');
  });
});

describe('massas de terra', () => {
  test('labelLand: mesma terra, mesmo rótulo; água 0; ilhas diferentes', () => {
    const { grid: g } = makeTestWorld();
    for (let x = 0; x < 64; x++) g.cost[20 * 64 + x] = 0; // canal: norte e sul viram terras separadas
    const land = labelLand(g.size, g.cost);
    expect(land[20 * 64 + 5]).toBe(0);
    expect(land[5 * 64 + 5]).toBe(land[10 * 64 + 60]);
    expect(land[5 * 64 + 5]).not.toBe(land[30 * 64 + 5]);
    expect(land[5 * 64 + 5]).toBeGreaterThan(0);
  });
  test('ordem para outra ilha é recusada sem varrer o continente (10 tropas, mapa 1024²)', () => {
    const size = 1024, cost = new Uint8Array(size * size).fill(1);
    for (let d = -2; d <= 2; d++) for (let e = -2; e <= 2; e++) if (Math.max(Math.abs(d), Math.abs(e)) === 2) cost[(500 + e) * size + 500 + d] = 0; // ilhota 3×3 cercada de água
    const big: MoveGrid = { size, cost, cover: new Uint8Array(size * size), land: labelLand(size, cost) };
    const s = game(), ids = Array.from({ length: 10 }, (_, i) => spawnArmy(s, 0, ['line'], 40 + i * 8, 40).id);
    const t = performance.now();
    expect(moveArmies(s, big, ids, 2002, 2002)).toEqual({ ok: false, reason: 'Caminho impossível' });
    expect(performance.now() - t).toBeLessThan(300); // a varredura do continente levava ~1700 ms; folga para máquina carregada
    expect(s.armies.some(t => t.path.length === 0)).toBe(true); // as vagas da formação na ilhota ficam sem rota
    // vaga da formação que cai na ilhota não custa uma busca: o grupo vai para o alvo em terra
    const t2 = performance.now();
    expect(moveArmies(s, big, ids, 2002, 2016)).toEqual({ ok: true });
    expect(performance.now() - t2).toBeLessThan(400);
  });
});

describe('exércitos', () => {
  test('anda no passo do batalhão mais lento (artilharia + cavalaria = 100 tiles/mês)', () => {
    const s = game(), a = spawnArmy(s, 0, ['artillery', 'cavalry'], 10, 102);
    expect(armySpeed(a)).toBe(100);
    moveArmies(s, grid, [a.id], 50, 102);
    run(s, 0.35);
    expect(a.path.length).toBeGreaterThan(0);
    run(s, 0.1);
    expect(a.path.length).toBe(0);
  });
  test('batalhões treinados perto da cidade entram no mesmo exército; cheio, forma outro', () => {
    const s = game(3);
    recruit(s, pm, 0, 1, 'line');
    run(s, 2.1);
    recruit(s, pm, 0, 1, 'line');
    run(s, 2.1);
    const mine = s.armies.filter(a => a.owner === 0);
    expect(mine.length).toBe(1);
    expect(mine[0].battalions.length).toBe(2);
    expect(mine[0].name).toBe('1º Exército de P0');
    mine[0].battalions.push(...Array.from({ length: 6 }, () => ({ type: 'line' as const, soldiers: 20 })));
    s.lots[0][2] = { type: 'garrison', level: 3, remaining: 0 }; s.lots[0][3] = { type: 'garrison', level: 3, remaining: 0 }; // teto folgado
    s.res = { money: 1e6, grain: 1e6, wood: 1e6, coal: 1e6, iron: 1e6, steel: 1e6, arms: 1e6 }; // o 9º batalhão custa caro
    expect(recruit(s, pm, 0, 1, 'line')).toEqual({ ok: true });
    run(s, 2.1);
    expect(s.armies.filter(a => a.owner === 0).map(a => a.battalions.length)).toEqual([8, 1]);
  });
  test('o teto conta batalhões, não exércitos', () => {
    const s = game(); // guarnição N1: 2 batalhões
    spawnArmy(s, 0, ['line', 'line'], 80, 80);
    expect(checkRecruit(s, pm, 0, 1, 'line')).toEqual({ ok: false, reason: 'Teto de batalhões atingido' });
  });
});

describe('juntar, dividir e renomear', () => {
  test('juntar: até 8 batalhões e a até 10 tiles; recusas', () => {
    const s = game(), a = spawnArmy(s, 0, ['line', 'line'], 80, 80), b = spawnArmy(s, 0, ['cavalry'], 88, 80), far = spawnArmy(s, 0, ['line'], 140, 80);
    expect(mergeArmies(s, a.id, far.id)).toEqual({ ok: false, reason: 'Longe demais para juntar' });
    expect(mergeArmies(s, a.id, b.id)).toEqual({ ok: true });
    expect(a.battalions.map(x => x.type)).toEqual(['line', 'line', 'cavalry']);
    expect(s.armies).not.toContain(b);
    const big = spawnArmy(s, 0, Array.from({ length: 6 }, () => 'line' as const), 82, 82);
    expect(mergeArmies(s, a.id, big.id)).toEqual({ ok: false, reason: 'Passaria de 8 batalhões' });
    const c = spawnArmy(s, 0, ['line'], 84, 80);
    c.routedUntil = 5;
    expect(mergeArmies(s, a.id, c.id)).toEqual({ ok: false, reason: 'Em fuga' });
    expect(mergeArmies(s, a.id, a.id).ok).toBe(false);
  });
  test('juntar em batalha é recusado', () => {
    const s = game(1, true), a = spawnArmy(s, 0, ['line'], 200, 20), b = spawnArmy(s, 0, ['line'], 200, 26);
    spawnArmy(s, -1, ['line'], 204, 20, 1);
    run(s, 0.04);
    expect(mergeArmies(s, a.id, b.id)).toEqual({ ok: false, reason: 'Em batalha' });
  });
  test('dividir: os marcados formam outro exército; recusas', () => {
    const s = game(), a = spawnArmy(s, 0, ['line', 'artillery', 'cavalry'], 80, 80);
    expect(splitArmy(s, a.id, [])).toEqual({ ok: false, reason: 'Escolha os batalhões que vão sair' });
    expect(splitArmy(s, a.id, [0, 1, 2])).toEqual({ ok: false, reason: 'Fica pelo menos um batalhão' });
    expect(splitArmy(s, a.id, [9])).toEqual({ ok: false, reason: 'Escolha os batalhões que vão sair' });
    expect(splitArmy(s, a.id, [1, 2])).toEqual({ ok: true });
    expect(a.battalions.map(x => x.type)).toEqual(['line']);
    const n = s.armies.at(-1)!;
    expect(n.battalions.map(x => x.type)).toEqual(['artillery', 'cavalry']);
    expect(Math.hypot(n.x - a.x, n.y - a.y)).toBeLessThanOrEqual(10);
    expect(s.events.at(-1)!.text).toBe(`${a.name} dividido`);
  });
  test('renomear', () => {
    const s = game(), a = spawnArmy(s, 0, ['line'], 80, 80);
    expect(renameArmy(s, a.id, '  Guarda Real ')).toEqual({ ok: true });
    expect(a.name).toBe('Guarda Real');
    expect(renameArmy(s, a.id, '   ')).toEqual({ ok: false, reason: 'Nome vazio' });
    expect(renameArmy(s, a.id, 'x'.repeat(41)).ok).toBe(false);
  });
  test('ao fim da batalha, batalhões além de 8 formam outro exército ao lado', () => {
    const s = game(1, true), a = spawnArmy(s, 0, Array.from({ length: 10 }, () => 'line' as const), 200, 20);
    spawnArmy(s, -1, ['line'], 204, 20, 1);
    run(s, 2);
    expect(s.battles).toEqual([]);
    const mine = s.armies.filter(x => x.owner === 0);
    expect(mine.map(x => x.battalions.length).sort()).toEqual([2, 8]);
    expect(a.battalions.length).toBe(8);
  });
});
