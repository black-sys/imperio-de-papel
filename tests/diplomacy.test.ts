import { describe, expect, test } from 'vitest';
import { chooseCapital } from '../src/sim/commands';
import { addPact, advantage, answerLetter, checkPropose, diplomacyMonth, evaluate, leaveAlliance, pactBetween, propose, relate, relation, relationLabel, sign } from '../src/sim/diplomacy';
import { eliminate } from '../src/sim/conquest';
import { fall } from '../src/sim/conquest';
import { spawnArmy } from '../src/sim/armies';
import { newGame, type Bent, type GameState } from '../src/sim/state';
import { aiWarRoll, declareWar } from '../src/sim/war';
import { makeRouteWorld } from './troopworld';

const { pm } = makeRouteWorld(); // R0, R1, R2 em faixa (vizinhas em cadeia)
/** Três nações: 0 (jogador) em R0, 1 em R1, 2 em R2. */
export const trio = (bent: Bent = 'industrial'): GameState => {
  const s = newGame(pm);
  chooseCapital(s, pm, 0);
  for (const id of [1, 2]) {
    s.nations.push({ ...s.nations[0], id, name: `Nação de R${id}`, bent, ai: true, capital: id, res: { ...s.nations[0].res }, atWar: [], founded: 0 });
    s.owner[id] = id; s.city[id] = { level: 2, remaining: 0 }; s.connected[id] = true;
  }
  s.relations = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  return s;
};
const texts = (s: GameState) => s.events.map(e => e.text);

describe('relação', () => {
  test('começa em 0, é simétrica e limitada', () => {
    const s = trio();
    expect(relation(s, 0, 1)).toBe(0);
    relate(s, 0, 1, 30);
    expect(relation(s, 1, 0)).toBe(30);
    relate(s, 0, 1, 500);
    expect(relation(s, 0, 1)).toBe(100);
    relate(s, 0, 1, -900);
    expect(relation(s, 0, 1)).toBe(-100);
  });
  test('rótulos', () => {
    expect([50, 15, 14, 0, -14, -15, -50, -51].map(relationLabel)).toEqual(['amistosa', 'cordial', 'neutra', 'neutra', 'neutra', 'fria', 'fria', 'hostil']);
  });
});

describe('guerra com pactos', () => {
  test('declarar guerra custa −30 de relação com o alvo', () => {
    const s = trio();
    declareWar(s, 1, 2, pm);
    expect(relation(s, 1, 2)).toBe(-30);
  });
  test('trair um pacto de não agressão: −50 com a vítima, −25 com as outras, o pacto acaba', () => {
    const s = trio();
    addPact(s, 'nonaggression', 1, 2, 60);
    expect(declareWar(s, 1, 2, pm)).toEqual({ ok: true });
    expect(relation(s, 1, 2)).toBe(-50 - 30);
    expect(relation(s, 1, 0)).toBe(-25);
    expect(pactBetween(s, 1, 2, 'nonaggression')).toBeUndefined();
    expect(texts(s)).toContain('A Nação de R1 traiu o pacto com a Nação de R2');
  });
  test('trégua também conta como traição', () => {
    const s = trio();
    addPact(s, 'truce', 0, 1, 60);
    declareWar(s, 0, 1, pm);
    expect(relation(s, 0, 2)).toBe(-25);
  });
  test('aliado não pode ser atacado; o aliado do alvo entra na guerra', () => {
    const s = trio();
    addPact(s, 'alliance', 1, 2, null);
    expect(declareWar(s, 1, 2, pm)).toEqual({ ok: false, reason: 'Desfaça a aliança antes' });
    expect(declareWar(s, 0, 1, pm)).toEqual({ ok: true });
    expect(s.nations[2].atWar).toContain(0);
    expect(s.nations[0].atWar.sort()).toEqual([1, 2]);
    expect(texts(s)).toContain('A Nação de R2 entra na guerra ao lado da Nação de R1');
  });
  test('aliança defensiva não se propaga em cadeia', () => {
    const s = trio();
    s.nations.push({ ...s.nations[1], id: 3, name: 'Nação de X3', capital: -1, atWar: [] });
    s.relations = s.relations.map(r => [...r, 0]).concat([[0, 0, 0, 0]]);
    addPact(s, 'alliance', 1, 2, null);
    addPact(s, 'alliance', 2, 3, null);
    declareWar(s, 0, 1, pm);
    expect(s.nations[2].atWar).toContain(0);
    expect(s.nations[3].atWar).not.toContain(0);
  });
  test('a guerra cancela o comércio do par', () => {
    const s = trio();
    addPact(s, 'trade', 1, 2, 60, { aGives: ['iron', 10], bGives: ['money', 25] });
    declareWar(s, 1, 2, pm);
    expect(pactBetween(s, 1, 2, 'trade')).toBeUndefined();
  });
});

describe('conquista e relação', () => {
  test('província tomada: −20; cessão sem dano mantém os níveis', () => {
    const s = trio();
    s.lots[1][0] = { type: 'market', level: 2, remaining: 0 };
    s.owner[2] = 2;
    fall(s, pm, 2, 0, false); // capital do 2 cedida sem dano (ainda elimina)
    expect(relation(s, 0, 2)).toBe(-20);
    const t = trio();
    t.lots[1][0] = { type: 'market', level: 2, remaining: 0 };
    t.nations[1].capital = 2; // R1 não é capital
    fall(t, pm, 1, 0, false);
    expect(t.lots[1][0]).toEqual({ type: 'market', level: 2, remaining: 0 });
    expect(t.city[1]).toEqual({ level: 2, remaining: 0 });
  });
});

describe('a IA respeita a relação ao declarar', () => {
  const firstWar = (setup: (s: GameState) => void) => {
    for (let m = 24; m <= 400; m++) {
      const s = trio('militarist');
      spawnArmy(s, 1, Array.from({ length: 8 }, () => 'line' as const), 190, 32);
      setup(s);
      s.month = m;
      aiWarRoll(s, pm, 1);
      if (s.nations[1].atWar.length) return m;
    }
    return Infinity;
  };
  test('com relação cordial ou aliado, não declara', () => {
    expect(firstWar(s => { relate(s, 1, 0, 20); relate(s, 1, 2, 20); })).toBe(Infinity);
    expect(firstWar(s => { addPact(s, 'alliance', 1, 0, null); addPact(s, 'alliance', 1, 2, null); })).toBe(Infinity);
    expect(firstWar(() => {})).toBeLessThan(Infinity);
  });
  test('com não agressão só trai se a relação for hostil', () => {
    expect(firstWar(s => { addPact(s, 'nonaggression', 1, 0, 999); addPact(s, 'nonaggression', 1, 2, 999); })).toBe(Infinity);
    expect(firstWar(s => { addPact(s, 'nonaggression', 1, 0, 999); addPact(s, 'nonaggression', 1, 2, 999); relate(s, 1, 2, -60); })).toBeLessThan(Infinity);
  });
});

test('JSON com relações e pactos', () => {
  const s = trio();
  addPact(s, 'trade', 1, 2, 60, { aGives: ['iron', 10], bGives: ['money', 25] });
  relate(s, 0, 2, -12);
  expect(JSON.parse(JSON.stringify(s))).toEqual(s);
});

describe('propostas', () => {
  test('recusas de checkPropose', () => {
    const s = trio();
    expect(checkPropose(s, pm, 0, 0, { kind: 'alliance' })).toEqual({ ok: false, reason: 'Nação inválida' });
    expect(checkPropose(s, pm, 0, 7, { kind: 'alliance' })).toEqual({ ok: false, reason: 'Nação inválida' });
    expect(checkPropose(s, pm, 0, 1, { kind: 'peace', cede: [], money: 0, payer: 0 })).toEqual({ ok: false, reason: 'Só há paz para quem está em guerra' });
    addPact(s, 'trade', 0, 1, 60, { aGives: ['iron', 1], bGives: ['money', 2] });
    expect(checkPropose(s, pm, 0, 1, { kind: 'trade', give: ['iron', 5], get: ['money', 9] })).toEqual({ ok: false, reason: 'Já há um acordo de comércio' });
    expect(checkPropose(s, pm, 0, 2, { kind: 'trade', give: ['gold' as never, 5], get: ['money', 9] })).toEqual({ ok: false, reason: 'Recurso inválido' });
    expect(checkPropose(s, pm, 0, 2, { kind: 'trade', give: ['iron', 0], get: ['money', 9] })).toEqual({ ok: false, reason: 'Quantidade inválida' });
    expect(checkPropose(s, pm, 0, 2, { kind: 'trade', give: ['iron', 1000], get: ['money', 9] })).toEqual({ ok: false, reason: 'Quantidade inválida' });
    declareWar(s, 0, 2, pm);
    expect(checkPropose(s, pm, 0, 2, { kind: 'nonaggression' })).toEqual({ ok: false, reason: 'Em guerra: proponha paz primeiro' });
    expect(checkPropose(s, pm, 0, 2, { kind: 'peace', cede: [1], money: 0, payer: 0 })).toEqual({ ok: false, reason: 'Província não ocupada por quem a recebe' });
    expect(checkPropose(s, pm, 0, 2, { kind: 'peace', cede: [], money: 1e9, payer: 0 })).toEqual({ ok: false, reason: 'Indenização acima do estoque' });
  });
  test('do jogador: pendência respondida depois; a mesma proposta duas vezes é recusada', () => {
    const s = trio();
    expect(propose(s, pm, 0, 1, { kind: 'nonaggression' })).toEqual({ ok: true });
    expect(s.pending).toEqual([{ to: 1, proposal: { kind: 'nonaggression' }, answerAt: 1 }]);
    expect(propose(s, pm, 0, 1, { kind: 'nonaggression' })).toEqual({ ok: false, reason: 'Proposta já enviada' });
  });
  test('ao jogador vira carta; entre rivais resolve na hora', () => {
    const s = trio();
    expect(propose(s, pm, 1, 0, { kind: 'nonaggression' })).toEqual({ ok: true });
    expect(s.letters).toEqual([{ id: 1, from: 1, proposal: { kind: 'nonaggression' }, expires: 3 }]);
    expect(texts(s)).toContain('Carta da Nação de R1: proposta de não agressão');
    expect(propose(s, pm, 1, 2, { kind: 'nonaggression' })).toEqual({ ok: true }); // Industrial aceita com relação neutra
    expect(pactBetween(s, 1, 2, 'nonaggression')!.until).toBe(60);
    expect(answerLetter(s, pm, 1, true)).toEqual({ ok: true });
    expect(pactBetween(s, 0, 1, 'nonaggression')).toBeDefined();
    expect(s.letters).toEqual([]);
    expect(answerLetter(s, pm, 1, true)).toEqual({ ok: false, reason: 'Carta inválida' });
  });
  test('desfazer aliança: −30', () => {
    const s = trio();
    expect(leaveAlliance(s, 0, 1)).toEqual({ ok: false, reason: 'Não há aliança' });
    addPact(s, 'alliance', 0, 1, null);
    expect(leaveAlliance(s, 0, 1)).toEqual({ ok: true });
    expect(relation(s, 0, 1)).toBe(-30);
    expect(pactBetween(s, 0, 1, 'alliance')).toBeUndefined();
  });
});

describe('paz', () => {
  const atWar = () => {
    const s = trio();
    s.nations[1].capital = 2; s.owner[2] = 1; // R1 e R2 da nação 1; R1 não é capital
    s.lots[1][0] = { type: 'market', level: 2, remaining: 0 };
    declareWar(s, 0, 1, pm);
    declareWar(s, 2, 1, pm);
    s.occupations.push({ province: 1, nation: 0, progress: 0.3 });
    return s;
  };
  test('acaba só a guerra do par, cria trégua, cede sem dano e paga indenização', () => {
    const s = atWar(), m0 = s.nations[0].res.money, m1 = s.nations[1].res.money;
    expect(sign(s, pm, 0, 1, { kind: 'peace', cede: [1], money: 20, payer: 1 })).toEqual({ ok: true });
    expect(s.nations[0].atWar).toEqual([]);
    expect(s.nations[1].atWar).toEqual([2]);
    expect(pactBetween(s, 0, 1, 'truce')!.until).toBe(60);
    expect(s.owner[1]).toBe(0);
    expect(s.lots[1][0]).toEqual({ type: 'market', level: 2, remaining: 0 });
    expect([s.nations[0].res.money - m0, m1 - s.nations[1].res.money]).toEqual([20, 20]);
    expect(texts(s)).toContain('Paz entre a Nação de R0 e a Nação de R1');
  });
  test('carta de paz aceita depois que a ocupação acabou: recusada, nada muda', () => {
    const s = atWar();
    // a nação 0 é o jogador (sem IA): a carta da nação 1 é dela
    s.letters.push({ id: 9, from: 1, proposal: { kind: 'peace', cede: [1], money: 0, payer: 1 }, expires: 3 });
    s.occupations = [];
    expect(answerLetter(s, pm, 9, true)).toEqual({ ok: false, reason: 'Província não ocupada por quem a recebe' });
    expect(s.owner[1]).toBe(1);
    expect(s.nations[0].atWar).toContain(1);
  });
});

describe('a IA avalia', () => {
  const bats = (k: number) => Array.from({ length: k }, () => 'line' as const);
  test('não agressão: Industrial aceita neutra; desconfiança; Militarista forte recusa', () => {
    const s = trio('industrial');
    expect(evaluate(s, pm, 1, 0, { kind: 'nonaggression' })).toEqual({ ok: true });
    relate(s, 0, 1, -20);
    expect(evaluate(s, pm, 1, 0, { kind: 'nonaggression' })).toEqual({ ok: false, reason: 'Não confiamos em vocês' });
    const m = trio('militarist');
    spawnArmy(m, 1, bats(3), 190, 32); spawnArmy(m, 0, bats(2), 60, 64);
    expect(evaluate(m, pm, 1, 0, { kind: 'nonaggression' })).toEqual({ ok: false, reason: 'Não precisamos disso' });
  });
  test('comércio: 90% aceito, 85% recusado (Industrial aceita 85%); sem o recurso, recusa', () => {
    const e = trio('expansionist'), i = trio('industrial');
    // quem propõe dá dinheiro (que sobra a quem aceita: sem bônus de falta) e pede 10 ferro (valor 20)
    expect(evaluate(e, pm, 1, 0, { kind: 'trade', give: ['money', 18], get: ['iron', 10] })).toEqual({ ok: true });
    expect(evaluate(e, pm, 1, 0, { kind: 'trade', give: ['money', 17], get: ['iron', 10] })).toEqual({ ok: false, reason: 'Troca desvantajosa' });
    expect(evaluate(i, pm, 1, 0, { kind: 'trade', give: ['money', 17], get: ['iron', 10] })).toEqual({ ok: true });
    e.nations[1].res.steel = 0;
    expect(evaluate(e, pm, 1, 0, { kind: 'trade', give: ['money', 99], get: ['steel', 10] })).toEqual({ ok: false, reason: 'Não temos esse recurso' });
  });
  test('aliança exige relação ≥ 40', () => {
    const s = trio();
    relate(s, 0, 1, 30);
    expect(evaluate(s, pm, 1, 0, { kind: 'alliance' })).toEqual({ ok: false, reason: 'Ainda não somos tão próximos' });
    relate(s, 0, 1, 20); declareWar(s, 2, 0, pm); declareWar(s, 2, 1, pm); // inimigo em comum
    relate(s, 0, 1, 30);
    expect(evaluate(s, pm, 1, 0, { kind: 'alliance' })).toEqual({ ok: true });
  });
  test('paz: quem perde aceita a branca; quem ganha recusa; o cansaço faz aceitar', () => {
    const s = trio();
    declareWar(s, 0, 1, pm);
    spawnArmy(s, 0, bats(6), 60, 64); spawnArmy(s, 1, bats(2), 190, 32);
    const white = { kind: 'peace' as const, cede: [], money: 0, payer: 0 };
    expect(advantage(s, pm, 1, 0)).toBeLessThan(0);
    expect(evaluate(s, pm, 1, 0, white)).toEqual({ ok: true });
    expect(evaluate(s, pm, 0, 1, white)).toEqual({ ok: false, reason: 'Estamos vencendo' });
    s.month = 60;
    expect(evaluate(s, pm, 0, 1, white)).toEqual({ ok: true });
  });
});

describe('virada do mês', () => {
  const month = (s: GameState, k = 1) => { for (let i = 0; i < k; i++) { s.month += 1; diplomacyMonth(s, pm); } };
  test('variação mensal da relação', () => {
    const s = trio();
    month(s);
    expect([relation(s, 0, 1), relation(s, 1, 2), relation(s, 0, 2)]).toEqual([-1, -1, 0]); // fronteiras 0–1 e 1–2
    const w = trio();
    declareWar(w, 1, 2, pm); // −30
    addPact(w, 'nonaggression', 0, 1, 99);
    month(w);
    expect(relation(w, 1, 2)).toBe(-33); // guerra −3 (sem o −1 de fronteira)
    expect(relation(w, 0, 1)).toBe(1); // pacto +1, sem fronteira
    expect(relation(w, 0, 2)).toBe(0);
    const t2 = trio();
    addPact(t2, 'trade', 0, 1, 99, { aGives: ['iron', 1], bGives: ['money', 1] });
    addPact(t2, 'alliance', 1, 2, null);
    declareWar(t2, 0, 2, pm); // 1 e 0 não são inimigos; aliado 1 entra contra 0? não: aliado do alvo (2) é 1 → 1 contra 0
    expect(t2.nations[1].atWar).toContain(0);
  });
  test('inimigo em comum: +1', () => {
    const s = trio();
    s.nations.push({ ...s.nations[1], id: 3, name: 'Nação de X3', capital: -1, atWar: [] });
    s.relations = s.relations.map(r => [...r, 0]).concat([[0, 0, 0, 0]]);
    declareWar(s, 3, 0, pm); declareWar(s, 3, 2, pm);
    month(s);
    expect(relation(s, 0, 2)).toBe(1);
  });
  test('comércio troca na virada; falta entrega o que tem; 3 meses sem entregar rompem (−10)', () => {
    const s = trio();
    addPact(s, 'trade', 0, 1, 99, { aGives: ['iron', 10], bGives: ['money', 25] });
    const i0 = s.nations[0].res.iron, m0 = s.nations[0].res.money, i1 = s.nations[1].res.iron, m1 = s.nations[1].res.money;
    month(s);
    expect([s.nations[0].res.iron, s.nations[0].res.money, s.nations[1].res.iron, s.nations[1].res.money]).toEqual([i0 - 10, m0 + 25, i1 + 10, m1 - 25]);
    s.nations[0].res.iron = 4;
    month(s);
    expect(s.nations[0].res.iron).toBe(0);
    expect(pactBetween(s, 0, 1, 'trade')!.missed).toBe(1);
    month(s, 2);
    expect(pactBetween(s, 0, 1, 'trade')).toBeUndefined();
    expect(relation(s, 0, 1)).toBe(2 * 4 - 10);
    expect(texts(s)).toContain('Comércio com a Nação de R1 rompido: entregas em falta');
  });
  test('acordos vencem; cartas expiram', () => {
    const s = trio();
    addPact(s, 'nonaggression', 0, 1, 2);
    s.letters.push({ id: 1, from: 1, proposal: { kind: 'alliance' }, expires: 3 });
    month(s, 2);
    expect(pactBetween(s, 0, 1, 'nonaggression')).toBeUndefined();
    expect(texts(s)).toContain('Acordo de não agressão com a Nação de R1 venceu');
    expect(s.letters.length).toBe(1);
    month(s);
    expect(s.letters).toEqual([]);
  });
  test('proposta do jogador: resposta no mês seguinte (aceite e recusa com motivo)', () => {
    const s = trio();
    propose(s, pm, 0, 1, { kind: 'nonaggression' });
    relate(s, 0, 2, -20);
    propose(s, pm, 0, 2, { kind: 'nonaggression' });
    month(s);
    expect(s.pending).toEqual([]);
    expect(pactBetween(s, 0, 1, 'nonaggression')).toBeDefined();
    expect(texts(s)).toContain('A Nação de R1 aceitou: não agressão');
    expect(texts(s)).toContain('A Nação de R2 recusou: Não confiamos em vocês');
  });
  test('nação eliminada leva pactos, cartas e pendências', () => {
    const s = trio();
    addPact(s, 'trade', 0, 1, 99, { aGives: ['iron', 1], bGives: ['money', 1] });
    s.letters.push({ id: 1, from: 1, proposal: { kind: 'alliance' }, expires: 3 });
    propose(s, pm, 0, 1, { kind: 'alliance' });
    eliminate(s, pm, 1, 2);
    expect([s.pacts, s.letters, s.pending]).toEqual([[], [], []]);
    month(s);
  });
});
