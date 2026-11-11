import type { ProvinceMap } from '../worldgen/provinces';
import { makeRng, subSeed } from '../worldgen/rng';
import { CELL } from '../worldgen/constants';
import { BUILDINGS, HEADLINES, LAWS, REPRESS, STAB, UNREST, zeroRes, type TroopType } from './balance';
import { inBattle, provinceAt, spawnArmy } from './armies';
import type { MoveGrid } from './movegrid';
import { activeLevel, cityLevel, logFor, type GameState, type LawKind } from './state';

/** Grava uma manchete no jornal (as últimas HEADLINES). */
export function headline(s: GameState, text: string): void {
  s.headlines.push({ month: s.month, text });
  if (s.headlines.length > HEADLINES) s.headlines.splice(0, s.headlines.length - HEADLINES);
}

/** Alvo de estabilidade da província e os fatores que o compõem (rótulo, valor), sem os nulos. */
export function stabilityTarget(s: GameState, pm: ProvinceMap, id: number): { target: number; factors: [string, number][] } {
  const n = s.nations[s.owner[id]], M = STAB.mod, f: [string, number][] = [];
  if (!n) return { target: 0, factors: [] };
  const add = (label: string, v: number) => { if (v) f.push([label, v]); };
  const laws = n.laws, lots = s.lots[id];
  if (n.grainShort && !(laws.includes('ration') && n.res.grain > 0)) add('Sem grãos', M.famine);
  if (n.atWar.length) {
    add('Guerra', M.war * n.atWar.length);
    const oldest = Math.min(...n.atWar.map(e => s.warSince[e < n.id ? `${e}:${n.id}` : `${n.id}:${e}`] ?? s.month));
    add('Guerra longa', Math.max(M.longWarMax, M.longWarPer12 * Math.floor((s.month - oldest) / 12)));
  } else add('Paz', M.peace);
  if (!laws.includes('shorter')) add('Fábricas', M.factory * lots.reduce((k, b) => k + (b && (b.type === 'steelworks' || b.type === 'arms_factory') ? activeLevel(b) : 0), 0));
  const lvl = cityLevel(s, id);
  add('Cidade grande', lvl >= 3 ? M.city3 : lvl === 2 ? M.city2 : 0);
  if (!s.connected[id]) add('Desligada', M.disconnected);
  const since = s.month - s.conquered[id];
  if (since < M.conqueredMonths) add('Conquista recente', Math.round(M.conquered * (1 - since / M.conqueredMonths) * 100) / 100);
  const g = Math.max(0, ...lots.map(b => (b?.type === 'garrison' ? activeLevel(b) : 0)));
  if (g) add('Guarnição', M.garrison + M.garrisonPerLevel * (g - 1));
  add('Mercado', M.market * Math.max(0, ...lots.map(b => (b?.type === 'market' ? activeLevel(b) : 0))));
  if (n.capital === id) add('Capital', M.capital);
  if (laws.includes('bread')) add('Pão e circo', M.bread);
  if (laws.includes('ration')) add('Racionamento', M.ration);
  if (laws.includes('martial') && s.armies.some(a => a.owner === n.id && !a.path.length && provinceOf(pm, a.x, a.y) === id)) add('Lei marcial', M.martial);
  if (s.month < s.resentment[id]) add('Ressentimento', M.resentment);
  void pm;
  const target = Math.max(0, Math.min(100, STAB.base + f.reduce((k, [, v]) => k + v, 0)));
  return { target, factors: f };
}

/** Província sob o ponto (tiles), sem precisar da grade de movimento. */
function provinceOf(pm: ProvinceMap, x: number, y: number): number {
  const S = Math.round(Math.sqrt(pm.cellProvince.length)), cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return cx < 0 || cy < 0 || cx >= S || cy >= S ? -1 : pm.cellProvince[cy * S + cx];
}

const FACTORY = new Set(['steelworks', 'arms_factory']);

/** A província vira neutra (revolta vitoriosa): sem cidade, prédios, rotas, treinos nem depósito. */
function lose(s: GameState, id: number): void {
  s.owner[id] = -1; s.city[id] = null; s.connected[id] = false; s.depot[id] = zeroRes(); s.stability[id] = 0;
  s.lots[id] = s.lots[id].map(() => null); s.veins[id] = s.veins[id].map(() => null);
  s.routes = s.routes.filter(r => r.a !== id && r.b !== id);
  s.recruiting = s.recruiting.filter(r => r.province !== id);
  s.occupations = s.occupations.filter(e => e.province !== id);
  s.strikes = s.strikes.filter(x => x.province !== id);
  for (const a of s.armies) if (a.supply?.from === id) a.supply = null;
}

/** Revoltas: rebeldes vencidos acabam com alívio; sobrevivendo, tomam a província (a capital resiste). */
function resolveRevolts(s: GameState, pm: ProvinceMap): void {
  for (const r of [...s.revolts]) {
    const name = pm.provinces[r.province].name, owner = s.owner[r.province];
    if (!s.armies.some(a => a.id === r.army)) {
      s.revolts = s.revolts.filter(x => x !== r);
      s.stability[r.province] = Math.min(100, s.stability[r.province] + UNREST.revolt.relief);
      logFor(s, owner, `Revolta em ${name} vencida`);
      continue;
    }
    if (s.month - r.since < UNREST.revolt.months - 1e-9 || s.nations[owner]?.capital === r.province) continue;
    s.revolts = s.revolts.filter(x => x !== r);
    s.armies = s.armies.filter(a => a.id !== r.army);
    lose(s, r.province);
    if (owner === 0) headline(s, `REBELDES TOMAM ${name.toUpperCase()}`);
    logFor(s, owner, `${name} perdida para os rebeldes`);
  }
}

/** Sorteios do mês em uma província: greve, incêndio, revolta. */
function unrest(s: GameState, pm: ProvinceMap, id: number): void {
  const owner = s.owner[id], name = pm.provinces[id].name, v = s.stability[id];
  // uma semente por sorteio: números seguidos de sementes vizinhas saem correlacionados
  const roll = (what: string) => makeRng(subSeed(s.seed, `${what}:${id}:${s.month}`))();
  const [rs, rf, rr, pick] = [roll('strike'), roll('fire'), roll('revolt'), roll('fire-pick')];
  const factory = s.lots[id].find(b => b && FACTORY.has(b.type) && activeLevel(b) > 0);
  if (v < UNREST.strike.below && factory && rs < UNREST.strike.chance && !s.strikes.some(x => x.province === id)) {
    s.strikes.push({ province: id, until: s.month + UNREST.strike.months });
    if (owner === 0) headline(s, `GREVE PARALISA ${BUILDINGS[factory.type].name.toUpperCase()} DE ${name.toUpperCase()}`);
    logFor(s, owner, `Greve em ${name}: fábricas paradas por ${UNREST.strike.months} meses`);
  }
  const all = [...s.lots[id].map((b, i) => ['lot', i, b] as const), ...s.veins[id].map((b, i) => ['vein', i, b] as const)].filter(x => x[2]);
  if (v < UNREST.fire.below && all.length && rf < UNREST.fire.chance) {
    const [kind, i, b] = all[Math.floor(pick * all.length)], list = kind === 'lot' ? s.lots[id] : s.veins[id];
    const gone = b!.level <= 1 || b!.remaining > 0;
    list[i] = gone ? null : { ...b!, level: b!.level - 1 };
    if (owner === 0) headline(s, `INCÊNDIO ${gone ? 'DESTRÓI' : 'DANIFICA'} ${BUILDINGS[b!.type].name.toUpperCase()} EM ${name.toUpperCase()}`);
    logFor(s, owner, `Incêndio em ${name}: ${BUILDINGS[b!.type].name} ${gone ? 'destruída' : 'danificada'}`);
  }
  if (v < UNREST.revolt.below && rr < UNREST.revolt.chance && !s.revolts.some(x => x.province === id)) {
    const c = pm.provinces[id].city, k = 1 + Math.floor((UNREST.revolt.below - v) / 5) + cityLevel(s, id);
    const a = spawnArmy(s, -1, Array.from({ length: k }, (): TroopType => 'line'), c.x, c.y, -1, `Rebeldes de ${name}`);
    s.revolts.push({ province: id, since: s.month, army: a.id });
    headline(s, owner === 0 ? `REVOLTA EM ${name.toUpperCase()}` : `REVOLTA EM ${name.toUpperCase()} ABALA A ${s.nations[owner].name.toUpperCase()}`);
    logFor(s, owner, `Revolta em ${name}: ${k} batalhões de rebeldes`);
  }
}

/** Virada do mês: revoltas, greves vencidas, aproximação do alvo e sorteios de cada província com dono. */
export function stabilityMonth(s: GameState, pm: ProvinceMap): void {
  s.revolts = s.revolts.filter(r => s.owner[r.province] >= 0);
  resolveRevolts(s, pm);
  // Pão e circo: paga por cidade; sem dinheiro, cai
  for (const n of s.nations) {
    if (!n.alive || !n.laws.includes('bread')) continue;
    const cost = LAWS.bread.perCity * s.owner.filter((o, id) => o === n.id && s.city[id]).length;
    if (n.res.money >= cost) { n.res.money -= cost; continue; }
    n.laws = n.laws.filter(l => l !== 'bread'); n.lawCooldown.bread = s.month + LAWS.cooldown;
    logFor(s, n.id, 'Pão e circo suspenso: falta dinheiro');
  }
  s.strikes = s.strikes.filter(x => x.until > s.month + 1e-9 && s.owner[x.province] >= 0);
  s.owner.forEach((o, id) => { if (o >= 0 && s.city[id]) unrest(s, pm, id); }); // sorteios com a estabilidade do início do mês
  s.owner.forEach((o, id) => {
    if (o < 0 || !s.city[id]) return;
    const { target } = stabilityTarget(s, pm, id), cur = s.stability[id];
    let d = (target - cur) * STAB.approach;
    if (d > 0 && s.month < s.resentment[id]) d /= 2; // ressentimento: a confiança volta devagar
    s.stability[id] = Math.max(0, Math.min(100, cur + d));
  });
}

type Result = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Result => ({ ok: false, reason });
export const LAW_NAME: Record<LawKind, string> = { bread: 'Pão e circo', ration: 'Racionamento', shorter: 'Jornada reduzida', martial: 'Lei marcial' };
const LAW_COST: Record<LawKind, number> = { bread: LAWS.bread.cost, ration: 0, shorter: 0, martial: LAWS.martial.cost };

/** A nação `n` decreta a lei (paga o custo); depois de revogada, só volta em LAWS.cooldown meses. */
export function decree(s: GameState, n: number, law: LawKind): Result {
  const x = s.nations[n];
  if (!x?.alive || !(law in LAW_NAME)) return no('Lei inválida');
  if (x.laws.includes(law)) return no('Lei já em vigor');
  const wait = (x.lawCooldown[law] ?? -Infinity) - s.month;
  if (wait > 1e-9) return no(`Só pode decretar de novo em ${Math.ceil(wait)} meses`);
  if (x.res.money < LAW_COST[law]) return no('Falta dinheiro');
  x.res.money -= LAW_COST[law];
  x.laws.push(law);
  if (!x.ai) headline(s, `${x.name.toUpperCase()} DECRETA ${LAW_NAME[law].toUpperCase()}`);
  return { ok: true };
}

export function repeal(s: GameState, n: number, law: LawKind): Result {
  const x = s.nations[n];
  if (!x?.laws.includes(law)) return no('Lei não está em vigor');
  x.laws = x.laws.filter(l => l !== law);
  x.lawCooldown[law] = s.month + LAWS.cooldown;
  return { ok: true };
}

/** Força bruta: o exército parado reprime a província (fim da greve, +20, ressentimento, homens perdidos). */
export function repress(s: GameState, pm: ProvinceMap, grid: MoveGrid, armyId: number, n = 0): Result {
  const a = s.armies.find(x => x.id === armyId && x.owner === n);
  if (!a) return no('Exército inválido');
  if (inBattle(s, a.id)) return no('Exército em batalha');
  if (a.path.length) return no('Exército em marcha');
  const p = provinceAt(pm, grid, a.x, a.y);
  if (p < 0 || s.owner[p] !== n) return no('Província não é sua');
  if (s.stability[p] >= REPRESS.below) return no('Estabilidade acima de 40');
  if (s.month - s.repressed[p] < REPRESS.every - 1e-9) return no('Reprimida há menos de 12 meses');
  s.strikes = s.strikes.filter(x => x.province !== p);
  s.stability[p] = Math.min(100, s.stability[p] + REPRESS.gain);
  s.resentment[p] = s.month + REPRESS.resentMonths;
  s.repressed[p] = s.month;
  for (const b of a.battalions) b.soldiers = Math.max(0, b.soldiers - REPRESS.men);
  logFor(s, n, `${a.name} reprimiu ${pm.provinces[p].name}`);
  return { ok: true };
}

/**
 * Decisão mensal da IA sobre a ordem interna: Pão e circo com média < 45 e dinheiro para 6 meses; Racionamento na fome;
 * Militarista: Lei marcial e repressão (< 25) onde tem exército parado; Industrial: Jornada reduzida com greve; revoga
 * o que não precisa mais quando a média passa de 60 (Racionamento quando os grãos voltam).
 */
export function aiStability(s: GameState, pm: ProvinceMap, grid: MoveGrid, n: number): void {
  const x = s.nations[n];
  if (!x?.alive) return;
  const own = s.owner.map((o, id) => (o === n && s.city[id] ? id : -1)).filter(id => id >= 0);
  if (!own.length) return;
  const avg = own.reduce((k, id) => k + s.stability[id], 0) / own.length, has = (l: LawKind) => x.laws.includes(l);
  if (x.grainShort && !has('ration')) decree(s, n, 'ration');
  if (!x.grainShort && has('ration') && x.res.grain > 0) repeal(s, n, 'ration');
  if (avg > 60) { for (const l of ['bread', 'martial', 'shorter'] as const) if (has(l)) repeal(s, n, l); return; }
  if (avg < 45 && !has('bread') && x.res.money >= LAWS.bread.cost + 6 * LAWS.bread.perCity * own.length) decree(s, n, 'bread');
  if (x.bent === 'industrial' && !has('shorter') && s.strikes.some(k => s.owner[k.province] === n)) decree(s, n, 'shorter');
  if (x.bent === 'militarist') {
    if (avg < 45 && !has('martial')) decree(s, n, 'martial');
    for (const a of s.armies.filter(a => a.owner === n && !a.path.length)) {
      const p = provinceAt(pm, grid, a.x, a.y);
      if (p >= 0 && s.owner[p] === n && s.stability[p] < 25) repress(s, pm, grid, a.id, n);
    }
  }
}
