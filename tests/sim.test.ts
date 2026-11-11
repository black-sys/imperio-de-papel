import { describe, expect, test } from 'vitest';
import { START_BASE } from '../src/sim/balance';
import { build, checkBuild, checkColonize, checkUpgrade, checkUpgradeCity, chooseCapital, colonize, setSpeed, upgrade, upgradeCity } from '../src/sim/commands';
import { CITY } from '../src/sim/balance';
import { buildCost, cityTax, colonizeCost, runMonth, startingStock } from '../src/sim/economy';
import { newGame, type GameState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import type { Province, ProvinceMap, Vein } from '../src/worldgen/provinces';
import { Biome } from '../src/worldgen/types';

const veins = (r = 1.2): Vein[] => [
  { kind: 'grain', richness: r, x: 30, y: 0 }, { kind: 'wood', richness: r, x: 0, y: 30 },
  { kind: 'coal', richness: r, x: -30, y: 0 }, { kind: 'iron', richness: r, x: 0, y: -30 },
];
const prov = (id: number, neighbors: number[], o: Partial<Province> = {}): Province => ({
  id, name: `P${id}`, center: { x: id * 100, y: 0 }, cells: 1000, neighbors, coastal: false, biome: Biome.Grassland,
  fertility: 1, forest: 1, rock: 1, city: { x: id * 100, y: 0 }, lots: [0, 1, 2, 3].map(i => ({ x: id * 100 + 5 + i, y: 5 })), veins: veins(), ...o,
});
// 0-1-2-3 em cadeia; 4 isolada; 2 é montanha (colonizar demora mais); 3 sem lote (não colonizável)
const pm: ProvinceMap = {
  cellProvince: new Int16Array(0), suggestedCapitals: [0],
  provinces: [prov(0, [1]), prov(1, [0, 2]), prov(2, [1, 3], { biome: Biome.Mountain }), prov(3, [2], { lots: [] }), prov(4, [])],
};
const rich = { money: 5000, grain: 500, wood: 500, coal: 500, iron: 500, steel: 500, arms: 500 };
const game = () => { const s = newGame(pm); expect(chooseCapital(s, pm, 0).ok).toBe(true); return s; };
const run = (s: GameState, months: number) => { setSpeed(s, 1); for (let i = 0; i < months * 10; i++) tick(s, pm, 1, null); };
const ready = (type: Parameters<typeof build>[4], level = 1) => ({ type, level, remaining: 0 });

describe('início', () => {
  test('capital com cidade nível 2 e estoque pelo território', () => {
    const s = game();
    expect(s.city[0]).toEqual({ level: 2, remaining: 0 });
    expect(s.owner[0]).toBe(0);
    expect(s.res).toEqual({ ...START_BASE, grain: START_BASE.grain * 1.2, wood: START_BASE.wood * 1.2, coal: START_BASE.coal * 1.2, iron: START_BASE.iron * 1.2 });
    expect(chooseCapital(s, pm, 1)).toEqual({ ok: false, reason: 'A capital já foi escolhida' });
  });
  test('estoque proporcional à riqueza média; sem veio do recurso, metade', () => {
    const poor: ProvinceMap = { ...pm, provinces: pm.provinces.map(p => ({ ...p, veins: [{ kind: 'iron', richness: 0.6, x: 0, y: 0 }, { kind: 'iron', richness: 1.0, x: 0, y: 0 }], fertility: 0.5 })) };
    const st = startingStock(poor, 0);
    expect(st.iron).toBeCloseTo(START_BASE.iron * 0.8, 9);
    expect(st.coal).toBeCloseTo(START_BASE.coal * 0.5, 9);
    expect(st.money).toBeCloseTo(START_BASE.money * 0.5, 9);
    expect(st.steel).toBe(0);
  });
  test('começa pausado e o tempo não anda', () => {
    const s = game();
    tick(s, pm, 100, null);
    expect(s.month).toBe(0);
  });
});

describe('virada do mês', () => {
  test('impostos: nível 2 = 8 × fertilidade + 10 da capital; mercado +25%; sem grãos, metade', () => {
    const s = game();
    s.res = { ...rich };
    expect(runMonth(s, pm, false).net.money).toBeCloseTo(18, 9);
    s.lots[0][0] = ready('market');
    expect(runMonth(s, pm, false).net.money).toBeCloseTo(18 * 1.25, 9);
    s.grainShort = true;
    expect(runMonth(s, pm, false).net.money).toBeCloseTo(18 * 1.25 * 0.5, 9);
  });
  test('veios produzem por riqueza', () => {
    const s = game();
    s.res = { ...rich };
    s.veins[0] = [ready('farm'), ready('sawmill'), ready('coal_mine'), ready('iron_mine', 2)];
    const n = runMonth(s, pm, false).net;
    expect(n.grain).toBeCloseTo(4 * 1.2 - 2, 9); // menos o consumo da cidade nível 2
    expect(n.wood).toBeCloseTo(3 * 1.2 + 2, 9); // + lenhadores da capital
    expect(n.coal).toBeCloseTo(2 * 1.2, 9);
    expect(n.iron).toBeCloseTo(4 * 1.2, 9);
  });
  test('siderúrgica produz o que o estoque permite; fábrica de armas usa o aço do mesmo mês', () => {
    const s = game();
    s.res = { ...rich, iron: 10, coal: 3, steel: 0, wood: 50 };
    s.lots[0][0] = ready('steelworks'); s.lots[0][1] = ready('arms_factory');
    const r = runMonth(s, pm, true);
    expect(s.res.coal).toBeCloseTo(1, 9); // 3 − 2
    expect(s.res.iron).toBeCloseTo(8, 9);
    expect(s.res.steel).toBeCloseTo(0, 9); // o aço do mês virou arma
    expect(s.res.arms).toBeCloseTo(501, 9);
    expect(r.stalled).toEqual([{ province: 0, lot: 0, missing: 'coal' }, { province: 0, lot: 1, missing: 'steel' }]);
    for (const k of Object.keys(s.res) as (keyof GameState['res'])[]) expect(s.res[k]).toBeGreaterThanOrEqual(0);
  });
  test('sem grãos: aviso e impostos pela metade no mês seguinte; volta quando há grãos', () => {
    const s = game();
    s.res = { ...rich, grain: 1 };
    runMonth(s, pm, true);
    expect(s.grainShort).toBe(true);
    expect(s.res.grain).toBe(0);
    expect(s.events.at(-1)!.text).toBe('Sem grãos: impostos pela metade');
    s.res.grain = 100;
    runMonth(s, pm, true);
    expect(s.grainShort).toBe(false);
  });
  test('sem madeira e sem veio de madeira, a capital ainda junta madeira para colonizar (sem beco sem saída)', () => {
    const noWood: ProvinceMap = { ...pm, provinces: pm.provinces.map(p => ({ ...p, veins: p.veins.filter(v => v.kind !== 'wood') })) };
    const s = newGame(noWood);
    chooseCapital(s, noWood, 0);
    s.res.wood = 0;
    setSpeed(s, 1);
    for (let i = 0; i < 300; i++) tick(s, noWood, 1, null); // 30 meses
    expect(s.res.wood).toBeGreaterThanOrEqual(colonizeCost(s, noWood, 1).wood!);
  });
  test('cidade em obra de melhoria: impostos e grãos do nível anterior', () => {
    const s = game();
    s.res = { ...rich };
    s.city[0] = { level: 3, remaining: 4 };
    expect(cityTax(s, pm, 0)).toBeCloseTo(18, 9);
    expect(runMonth(s, pm, false).net.grain).toBeCloseTo(-CITY.grain[2], 9);
  });
  test('produção por lote vem da conta nacional (duas siderúrgicas, ferro para uma só)', () => {
    const s = game();
    s.res = { ...rich, iron: 4, coal: 100 };
    s.owner[1] = 0; s.city[1] = { level: 2, remaining: 0 };
    s.lots[0][0] = ready('steelworks'); s.lots[1][0] = ready('steelworks');
    const r = runMonth(s, pm, false);
    expect(r.produced['0:0']).toBe(2);
    expect(r.produced['1:0']).toBe(0);
    expect(r.stalled).toEqual([{ province: 1, lot: 0, missing: 'iron' }]);
  });
  test('manutenção: guarnição custa dinheiro', () => {
    const s = game();
    s.res = { ...rich };
    s.lots[0][1] = ready('garrison');
    expect(runMonth(s, pm, false).net.money).toBeCloseTo(18 - 2, 9);
  });
  test('a projeção não muda o estado e bate com a aplicação real', () => {
    const s = game();
    s.res = { ...rich };
    s.veins[0][0] = ready('farm'); s.lots[0][0] = ready('steelworks');
    const before = JSON.stringify(s), proj = runMonth(s, pm, false);
    expect(JSON.stringify(s)).toBe(before);
    const res0 = { ...s.res };
    runMonth(s, pm, true);
    for (const k of Object.keys(res0) as (keyof typeof res0)[]) expect(s.res[k] - res0[k]).toBeCloseTo(proj.net[k], 9);
  });
  test('aviso de fábrica parada no máximo a cada 6 meses', () => {
    const s = game();
    s.res = { ...rich, coal: 0 };
    s.lots[0][0] = ready('steelworks');
    run(s, 12);
    expect(s.events.filter(e => e.text === 'Siderúrgica parada em P0: falta carvão').length).toBe(2);
  });
});

describe('construir', () => {
  test('lotes liberados pelo nível da cidade', () => {
    const s = game();
    s.res = { ...rich };
    s.veins[0][2] = ready('coal_mine'); s.veins[0][3] = ready('iron_mine'); s.veins[0][1] = null;
    s.owner[4] = 0; s.city[4] = { level: 1, remaining: 0 }; s.veins[4][2] = ready('coal_mine');
    expect(build(s, pm, 0, { lot: 1 }, 'steelworks')).toEqual({ ok: true });
    expect(checkBuild(s, pm, 0, { lot: 2 }, 'steelworks')).toEqual({ ok: false, reason: 'Libera com a cidade nível 3' });
    s.city[0] = { level: 3, remaining: 5 }; // em obra: ainda vale o nível 2
    expect(checkBuild(s, pm, 0, { lot: 2 }, 'steelworks')).toEqual({ ok: false, reason: 'Libera com a cidade nível 3' });
    s.city[1] = { level: 1, remaining: 0 }; s.owner[1] = 0;
    expect(checkBuild(s, pm, 1, { lot: 1 }, 'market')).toEqual({ ok: false, reason: 'Libera com a cidade nível 2' });
  });
  test('veio só aceita o seu prédio; lote só fábrica; lugar ocupado ou inválido', () => {
    const s = game();
    s.res = { ...rich };
    expect(checkBuild(s, pm, 0, { vein: 3 }, 'farm')).toEqual({ ok: false, reason: 'Veio só aceita Mina de ferro' });
    expect(checkBuild(s, pm, 0, { lot: 0 }, 'farm')).toEqual({ ok: false, reason: 'Lote só aceita fábrica' });
    expect(checkBuild(s, pm, 0, { vein: 9 }, 'farm')).toEqual({ ok: false, reason: 'Lugar inválido' });
    expect(build(s, pm, 0, { vein: 0 }, 'farm')).toEqual({ ok: true });
    expect(checkBuild(s, pm, 0, { vein: 0 }, 'farm')).toEqual({ ok: false, reason: 'Lugar ocupado' });
    expect(checkBuild(s, pm, 1, { vein: 0 }, 'farm')).toEqual({ ok: false, reason: 'Esta província não é sua' });
  });
  test('custo, obra no tempo e evento', () => {
    const s = game();
    s.res = { ...rich };
    build(s, pm, 0, { vein: 3 }, 'iron_mine');
    expect(s.res.money).toBe(5000 - 40);
    expect(s.res.wood).toBe(500 - 15);
    run(s, 2.9);
    expect(s.veins[0][3]!.remaining).toBeGreaterThan(0);
    run(s, 0.2);
    expect(s.veins[0][3]!.remaining).toBe(0);
    expect(s.events.some(e => e.text === 'Mina de ferro pronta em P0')).toBe(true);
  });
  test('siderúrgica exige 3 minas prontas no reino, com carvão e ferro (tecnologia por cota)', () => {
    const s = game();
    s.res = { ...rich };
    expect(checkBuild(s, pm, 0, { lot: 0 }, 'steelworks')).toEqual({ ok: false, reason: 'Precisa de 3 minas prontas, com carvão e ferro: 0/3' });
    s.owner[1] = 0; s.city[1] = { level: 1, remaining: 0 };
    s.veins[0][2] = ready('coal_mine'); s.veins[1][2] = ready('coal_mine'); s.veins[0][3] = { type: 'iron_mine', level: 1, remaining: 1 }; // em obra não conta
    expect(checkBuild(s, pm, 0, { lot: 0 }, 'steelworks')).toEqual({ ok: false, reason: 'Precisa de 3 minas prontas, com carvão e ferro: 2/3' });
    s.veins[1][3] = ready('coal_mine'); // 3 minas, mas nenhuma de ferro
    expect(checkBuild(s, pm, 0, { lot: 0 }, 'steelworks').ok).toBe(false);
    s.veins[0][3] = ready('iron_mine');
    expect(checkBuild(s, pm, 0, { lot: 0 }, 'steelworks')).toEqual({ ok: true });
  });
  test('sem madeira ainda dá para erguer serraria (sem beco sem saída)', () => {
    const s = game();
    s.res = { ...rich, wood: 0 };
    expect(checkBuild(s, pm, 0, { vein: 1 }, 'sawmill')).toEqual({ ok: true });
  });
  test('falta de recurso com motivo', () => {
    const s = game();
    s.res = { ...rich, steel: 5 };
    expect(checkBuild(s, pm, 0, { lot: 0 }, 'arms_factory')).toEqual({ ok: false, reason: 'Falta 5 de aço' });
  });
});

describe('melhorar e cotas', () => {
  test('N2 exige 3 do mesmo tipo; N3 exige 3 no N2; N3 leva aço', () => {
    const s = game();
    s.res = { ...rich };
    s.owner[1] = 0; s.city[1] = { level: 1, remaining: 0 };
    s.veins[0][0] = ready('farm'); s.veins[1][0] = ready('farm');
    expect(checkUpgrade(s, pm, 0, { vein: 0 })).toEqual({ ok: false, reason: 'Fazendas: 2/3' });
    s.owner[2] = 0; s.city[2] = { level: 1, remaining: 0 }; s.veins[2][0] = ready('farm');
    expect(upgrade(s, pm, 0, { vein: 0 })).toEqual({ ok: true });
    expect(s.veins[0][0]).toMatchObject({ level: 2 });
    s.veins[0][0]!.remaining = 0;
    expect(checkUpgrade(s, pm, 0, { vein: 0 })).toEqual({ ok: false, reason: 'Fazendas nível 2: 1/3' });
    s.veins[1][0] = ready('farm', 2); s.veins[2][0] = ready('farm', 2);
    expect(buildCost('farm', 3).steel).toBeGreaterThan(0);
    expect(upgrade(s, pm, 0, { vein: 0 })).toEqual({ ok: true });
  });
  test('melhoria rende no nível anterior até terminar', () => {
    const s = game();
    s.res = { ...rich };
    s.veins[0][0] = { type: 'farm', level: 2, remaining: 3 };
    expect(runMonth(s, pm, false).net.grain).toBeCloseTo(4 * 1.2 - 2, 9);
  });
  test('cidade: nível 3 exige 3 cidades nível 2', () => {
    const s = game();
    s.res = { ...rich };
    s.owner[1] = 0; s.city[1] = { level: 2, remaining: 0 };
    expect(checkUpgradeCity(s, pm, 0)).toEqual({ ok: false, reason: 'Cidades nível 2: 2/3' });
    s.owner[2] = 0; s.city[2] = { level: 2, remaining: 0 };
    expect(upgradeCity(s, pm, 0)).toEqual({ ok: true });
    expect(s.city[0]).toEqual({ level: 3, remaining: 8 });
    expect(checkBuild(s, pm, 0, { lot: 3 }, 'market')).toEqual({ ok: false, reason: 'Libera com a cidade nível 3' });
    run(s, 8.1);
    expect(s.events.some(e => e.text === 'Cidade de P0 chegou ao nível 3')).toBe(true);
    expect(checkBuild(s, pm, 0, { lot: 3 }, 'market')).toEqual({ ok: true });
  });
});

describe('colonizar', () => {
  test('custo em dinheiro e madeira; ao concluir, cidade nível 1 e lugares vazios', () => {
    const s = game();
    s.res = { ...rich };
    const c = colonizeCost(s, pm, 1);
    expect(colonize(s, pm, 1)).toEqual({ ok: true });
    expect(s.res.money).toBeCloseTo(5000 - c.money!, 9);
    run(s, 5.1);
    expect(s.owner[1]).toBe(0);
    expect(s.city[1]).toEqual({ level: 1, remaining: 0 });
    expect(s.lots[1]).toEqual([null, null, null, null]);
    expect(s.veins[1]).toEqual([null, null, null, null]);
  });
  test('recusas', () => {
    const s = game();
    s.res = { ...rich };
    expect(checkColonize(s, pm, 2)).toEqual({ ok: false, reason: 'Precisa ser vizinha de uma província sua' });
    s.owner[2] = 0;
    expect(checkColonize(s, pm, 3)).toEqual({ ok: false, reason: 'Não há terra firme para fundar uma cidade' });
    s.res.money = 0;
    expect(checkColonize(s, pm, 1).ok).toBe(false);
  });
});

test('estado faz ida e volta pelo JSON', () => {
  const s = game();
  s.res = { ...rich };
  build(s, pm, 0, { vein: 0 }, 'farm');
  colonize(s, pm, 1);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});
