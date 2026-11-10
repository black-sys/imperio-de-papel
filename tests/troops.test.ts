import { describe, expect, test } from 'vitest';
import { checkColonize, checkRecruit, checkUpgrade, moveTroops, recruit, setSpeed, upgrade } from '../src/sim/commands';
import { monthlyIncome } from '../src/sim/economy';
import type { GameState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { labelLand, type MoveGrid } from '../src/sim/movegrid';
import { spawnTroop, troopCap } from '../src/sim/troops';
import { game, makeTestWorld, run, world } from './troopworld';

const { pm, grid } = world;
const garrison = (level = 1) => ({ type: 'garrison' as const, level, remaining: 0 });

describe('recrutamento', () => {
  test('recusas: sem guarnição, nível, fila ocupada', () => {
    const s = game();
    expect(checkRecruit(s, pm, 0, 0, 'spear')).toEqual({ ok: false, reason: 'Precisa de uma Guarnição' });
    expect(checkRecruit(s, pm, 1, 0, 'spear')).toEqual({ ok: false, reason: 'Esta província não é sua' });
    expect(checkRecruit(s, pm, 0, 1, 'archer')).toEqual({ ok: false, reason: 'Requer Guarnição N2' });
    expect(checkRecruit(s, pm, 0, 1, 'cavalry')).toEqual({ ok: false, reason: 'Requer Guarnição N3' });
    expect(recruit(s, pm, 0, 1, 'spear')).toEqual({ ok: true });
    expect(s.res).toEqual({ gold: 960, wood: 980, stone: 1000 });
    expect(recruit(s, pm, 0, 1, 'spear')).toEqual({ ok: false, reason: 'Já está treinando uma tropa' });
  });
  test('guarnição em obra não treina', () => {
    const s = game();
    s.buildings[0][1] = { type: 'garrison', level: 1, remaining: 2 };
    expect(checkRecruit(s, pm, 0, 1, 'spear')).toEqual({ ok: false, reason: 'Precisa de uma Guarnição' });
  });
  test('falta de recurso', () => {
    const s = game();
    s.res.gold = 10;
    expect(checkRecruit(s, pm, 0, 1, 'spear')).toEqual({ ok: false, reason: 'Falta 30 de ouro' });
  });
  test('a tropa nasce no local do prédio depois de 2 meses', () => {
    const s = game();
    recruit(s, pm, 0, 1, 'spear');
    run(s, 1.9);
    expect(s.troops.length).toBe(0);
    run(s, 0.2);
    expect(s.troops).toMatchObject([{ owner: 0, type: 'spear', soldiers: 20, x: 80, y: 84, morale: 1 }]);
    expect(s.recruiting).toEqual([]);
    expect(s.events.at(-1)!.text).toBe('Lanceiros treinados em P0');
  });
  test('teto: guarnição N1 sustenta 2, N2 3, N3 4; tropa em treino conta', () => {
    const s = game();
    expect(troopCap(s)).toBe(2);
    spawnTroop(s, 0, 'spear', 80, 80);
    recruit(s, pm, 0, 1, 'spear');
    s.buildings[0][2] = garrison(); // o teto é do reino: soma das guarnições
    expect(troopCap(s)).toBe(4);
    s.buildings[0][2] = null;
    expect(checkRecruit({ ...s, recruiting: [] }, pm, 0, 1, 'spear')).toEqual({ ok: true });
    spawnTroop(s, 0, 'spear', 80, 80);
    expect(checkRecruit({ ...s, recruiting: [] }, pm, 0, 1, 'spear')).toEqual({ ok: false, reason: 'Teto de tropas atingido' });
    expect(troopCap(game(2))).toBe(3);
    expect(troopCap(game(3))).toBe(4);
  });
  test('guarnição em melhoria mantém o teto do nível anterior', () => {
    const s = game();
    s.buildings[0][1] = { type: 'garrison', level: 2, remaining: 3 };
    expect(troopCap(s)).toBe(2);
  });
});

describe('metas de nível da guarnição', () => {
  test('N2 exige 3 guarnições no reino', () => {
    const s = game();
    s.buildings[0][2] = garrison();
    expect(checkUpgrade(s, pm, 0, 1)).toEqual({ ok: false, reason: 'Guarnições: 2/3' });
    s.buildings[0][3] = garrison();
    expect(upgrade(s, pm, 0, 1)).toEqual({ ok: true });
  });
  test('N3 exige 3 guarnições N2 ou maiores', () => {
    const s = game(2);
    s.buildings[0][2] = garrison(2); s.buildings[0][3] = garrison(1);
    expect(checkUpgrade(s, pm, 0, 1)).toEqual({ ok: false, reason: 'Guarnições nível 2: 2/3' });
    s.buildings[0][3] = garrison(3);
    expect(upgrade(s, pm, 0, 1)).toEqual({ ok: true });
  });
  test('outros prédios não têm meta', () => {
    expect(checkUpgrade(game(), pm, 0, 0)).toEqual({ ok: true });
  });
});

test('fortaleza não pode ser colonizada', () => {
  const s = game();
  expect(checkColonize(s, pm, 1)).toEqual({ ok: true });
  s.fortresses.push({ province: 1, garrison: ['spear'], lastCombat: 0 });
  expect(checkColonize(s, pm, 1)).toEqual({ ok: false, reason: 'Fortaleza: só cai com tropas' });
});

test('manutenção das tropas sai da renda', () => {
  const s = game(), before = monthlyIncome(s, pm).gold;
  spawnTroop(s, 0, 'spear', 80, 80);
  spawnTroop(s, 0, 'cavalry', 80, 80);
  spawnTroop(s, -1, 'spear', 80, 80, 1); // fortaleza não custa
  expect(monthlyIncome(s, pm).gold).toBe(before - 4);
});

test('estado com tropas faz ida e volta pelo JSON', () => {
  const s = game();
  recruit(s, pm, 0, 1, 'spear');
  spawnTroop(s, 0, 'spear', 80, 80);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});

/** Meses até a tropa parar (ticks de 0.01 mês). */
const timeToStop = (s: GameState, id: number) => {
  const t = s.troops.find(t => t.id === id)!, m0 = s.clock;
  setSpeed(s, 1);
  for (let i = 0; i < 5000 && t.path.length; i++) tick(s, pm, 0.1, grid);
  return s.clock - m0;
};

describe('ordens e movimento', () => {
  test('lanceiros andam 40 tiles em campo aberto em 40/150 mês', () => {
    const s = game(), t = spawnTroop(s, 0, 'spear', 10, 102);
    expect(moveTroops(s, grid, [t.id], 50, 102)).toEqual({ ok: true });
    expect(Math.abs(timeToStop(s, t.id) - 40 / 150)).toBeLessThan(0.03);
    expect([t.x, t.y]).toEqual([50, 102]);
  });
  test('cavaleiros são mais rápidos', () => {
    const s = game(), t = spawnTroop(s, 0, 'cavalry', 10, 102);
    moveTroops(s, grid, [t.id], 50, 102);
    expect(Math.abs(timeToStop(s, t.id) - 40 / 240)).toBeLessThan(0.03);
  });
  test('cruzar o rio é mais lento que a mesma distância em campo aberto', () => {
    const s = game(), a = spawnTroop(s, 0, 'spear', 118, 162);
    moveTroops(s, grid, [a.id], 138, 162);
    const river = timeToStop(s, a.id);
    expect(a.x).toBe(138);
    const s2 = game(), b2 = spawnTroop(s2, 0, 'spear', 18, 162);
    moveTroops(s2, grid, [b2.id], 38, 162);
    expect(river).toBeGreaterThan(timeToStop(s2, b2.id) + 0.03);
  });
  test('recusas: sem tropas, água, fora do mapa, tropa alheia', () => {
    const s = game(), t = spawnTroop(s, 0, 'spear', 10, 102), f = spawnTroop(s, -1, 'spear', 180, 80, 1);
    expect(moveTroops(s, grid, [], 50, 102)).toEqual({ ok: false, reason: 'Nenhuma tropa selecionada' });
    expect(moveTroops(s, grid, [f.id, 999], 50, 102)).toEqual({ ok: false, reason: 'Nenhuma tropa selecionada' });
    expect(moveTroops(s, grid, [t.id], 180, 180)).toEqual({ ok: false, reason: 'Destino na água' });
    expect(moveTroops(s, grid, [t.id], -5, 102)).toEqual({ ok: false, reason: 'Destino na água' });
    expect(moveTroops(s, grid, [t.id], 5000, 102)).toEqual({ ok: false, reason: 'Destino na água' });
    expect(t.path).toEqual([]);
  });
  test('destino inalcançável não trava a tropa', () => {
    const { grid: g } = makeTestWorld(), s = game(), t = spawnTroop(s, 0, 'spear', 10, 102);
    for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) if (d || e) g.cost[(20 + e) * 64 + 20 + d] = 0;
    expect(moveTroops(s, g, [t.id], 82, 82)).toEqual({ ok: false, reason: 'Caminho impossível' });
    expect(t.path).toEqual([]);
  });
  test('grupo chega em formação, sem empilhar', () => {
    const s = game(), ts = [0, 1, 2, 3].map(i => spawnTroop(s, 0, 'spear', 10 + i * 4, 102));
    expect(moveTroops(s, grid, ts.map(t => t.id), 60, 160)).toEqual({ ok: true });
    for (const t of ts) timeToStop(s, t.id);
    for (const a of ts) for (const b of ts) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(8);
    for (const t of ts) expect(Math.hypot(t.x - 60, t.y - 160)).toBeLessThan(16);
  });
  test('mesmo resultado a 1× e a 8×', () => {
    const go = (speed: number) => {
      const s = game(), t = spawnTroop(s, 0, 'spear', 10, 102);
      moveTroops(s, grid, [t.id], 138, 162);
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
    if (!withGarrison) s.buildings[0][1] = null;
    const t = spawnTroop(s, 0, 'spear', x, y);
    t.soldiers = 10;
    return { s, t };
  };
  test('1 soldado por mês em província sua, a 2 de ouro cada', () => {
    const { s, t } = hurt(60, 100, false), c = hurt(60, 100, false);
    c.t.soldiers = 20; // controle: tropa cheia não gasta
    run(s, 1); run(c.s, 1);
    expect(t.soldiers).toBeCloseTo(11, 5);
    expect(c.s.res.gold - s.res.gold).toBeCloseTo(2, 5);
  });
  test('3 por mês com Guarnição; nunca passa do tamanho da tropa', () => {
    const { s, t } = hurt(60, 100, true);
    run(s, 1);
    expect(t.soldiers).toBeCloseTo(13, 5);
    run(s, 5);
    expect(t.soldiers).toBe(20);
  });
  test('não repõe fora do reino, andando ou sem ouro', () => {
    const a = hurt(180, 100, true);
    run(a.s, 1);
    expect(a.t.soldiers).toBe(10);
    const b = hurt(60, 100, true);
    b.s.res.gold = 0;
    run(b.s, 0.9); // antes da renda do mês
    expect(b.t.soldiers).toBe(10);
    expect(b.s.res.gold).toBe(0);
    const c = hurt(10, 102, true);
    moveTroops(c.s, grid, [c.t.id], 110, 102);
    run(c.s, 0.3);
    expect(c.t.soldiers).toBe(10);
  });
  test('ouro negativo na virada do mês dispersa a tropa mais cara', () => {
    const s = game();
    spawnTroop(s, 0, 'spear', 60, 100); spawnTroop(s, 0, 'cavalry', 60, 100);
    s.res.gold = -500;
    run(s, 1);
    expect(s.troops.map(t => t.type)).toEqual(['spear']);
    expect(s.events.at(-1)!.text).toBe('Cavaleiros dispersos por falta de ouro');
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
    const s = game(), ids = Array.from({ length: 10 }, (_, i) => spawnTroop(s, 0, 'spear', 40 + i * 8, 40).id);
    const t = performance.now();
    expect(moveTroops(s, big, ids, 2002, 2002)).toEqual({ ok: false, reason: 'Caminho impossível' });
    expect(performance.now() - t).toBeLessThan(50);
    expect(s.troops.some(t => t.path.length === 0)).toBe(true); // as vagas da formação na ilhota ficam sem rota
    // vaga da formação que cai na ilhota não custa uma busca: o grupo vai para o alvo em terra
    const t2 = performance.now();
    expect(moveTroops(s, big, ids, 2002, 2016)).toEqual({ ok: true });
    expect(performance.now() - t2).toBeLessThan(400);
  });
});
