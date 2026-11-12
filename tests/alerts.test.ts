import { describe, expect, test } from 'vitest';
import { alerts } from '../src/sim/alerts';
import { spawnArmy } from '../src/sim/armies';
import { world } from './stabworld';
import { makeRouteWorld } from './troopworld';

const { pm } = makeRouteWorld();
const kinds = (s: ReturnType<typeof world>) => alerts(s, pm, 0).map(a => a.kind);
const plenty = { money: 900, grain: 900, wood: 900, coal: 900, iron: 900, steel: 900, arms: 900 };

describe('alertas', () => {
  test('tudo em ordem: nenhum alerta', () => {
    const s = world();
    s.nations[0].res = { ...plenty };
    expect(alerts(s, pm, 0)).toEqual([]);
  });
  test('fábrica parada por falta de insumo, com sugestão', () => {
    const s = world();
    s.nations[0].res = { ...plenty, coal: 0 };
    s.lots[1][0] = { type: 'steelworks', level: 1, remaining: 0 };
    const a = alerts(s, pm, 0).find(x => x.kind === 'stalled')!;
    expect(a).toMatchObject({ severity: 'amber', text: 'Siderúrgica de R1 parada: falta carvão', hint: 'explore um veio de carvão ou compre carvão (Comércio)', target: { province: 1 } });
  });
  test('greve e desligada ao mesmo tempo: um alerta de fábrica, motivo greve', () => {
    const s = world();
    s.nations[0].res = { ...plenty };
    s.lots[1][0] = { type: 'steelworks', level: 1, remaining: 0 };
    s.connected[1] = false;
    s.strikes.push({ province: 1, until: 5 });
    const st = alerts(s, pm, 0).filter(x => x.kind === 'stalled');
    expect(st.length).toBe(1);
    expect(st[0].hint).toBe('espere a greve acabar ou reprima');
    expect(kinds(s)).toContain('disconnected');
    expect(kinds(s)).toContain('strike');
  });
  test('recurso acabando, dinheiro negativo previsto e fome', () => {
    const s = world();
    s.nations[0].res = { ...plenty, grain: 3 }; // as cidades comem mais que isso por mês
    const g = alerts(s, pm, 0).find(x => x.kind === 'running-out')!;
    expect(g.text).toMatch(/^Grãos acabam em \d+ (mês|meses)$/);
    expect(g.severity).toBe('red');
    s.nations[0].res.money = 1; s.nations[0].incomeMult = 0; // sem impostos: a manutenção afunda o dinheiro
    s.lots[0][2] = { type: 'garrison', level: 1, remaining: 0 }; s.lots[1][1] = { type: 'garrison', level: 1, remaining: 0 };
    spawnArmy(s, 0, ['line', 'line', 'line'], 60, 64);
    expect(kinds(s)).toContain('money-negative');
    s.nations[0].grainShort = true;
    const list = alerts(s, pm, 0);
    expect(list.map(x => x.kind)).toContain('famine');
    const firstAmber = list.findIndex(x => x.severity === 'amber');
    expect(firstAmber < 0 || list.slice(firstAmber).every(x => x.severity === 'amber')).toBe(true); // vermelhos primeiro
  });
  test('cidade desligada, exército sem suprimento, revolta, teto de batalhões', () => {
    const s = world();
    s.nations[0].res = { ...plenty };
    s.connected[1] = false;
    const a = spawnArmy(s, 0, ['line'], 300, 100); a.supplied = false;
    const r = spawnArmy(s, -1, ['line', 'line'], 190, 32, -1, 'Rebeldes de R1');
    s.revolts.push({ province: 1, since: 0, army: r.id });
    const list = alerts(s, pm, 0);
    expect(list.find(x => x.kind === 'disconnected')).toMatchObject({ text: 'R1 desligada da capital', hint: 'trace uma rota (R)' });
    expect(list.find(x => x.kind === 'unsupplied')).toMatchObject({ target: { army: a.id } });
    expect(list.find(x => x.kind === 'revolt')!.text).toBe('Revolta em R1: 2 batalhões rebeldes');
    const t = world();
    t.nations[0].res = { ...plenty };
    t.lots[0][1] = { type: 'garrison', level: 1, remaining: 0 }; // teto 2
    spawnArmy(t, 0, ['line', 'line'], 60, 64);
    expect(kinds(t)).toContain('cap');
  });
  test('nação eliminada: nada', () => {
    const s = world();
    s.nations[1].alive = false;
    expect(alerts(s, pm, 1)).toEqual([]);
  });
});
