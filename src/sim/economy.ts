import type { ProvinceMap, VeinKind } from '../worldgen/provinces';
import { Biome } from '../worldgen/types';
import {
  BUILDINGS, CITY, COLONIZE, GARRISON_UPKEEP, GRAIN_SHORT_TAX, RES_KEYS, RES_NAMES, STALL_WARN_MONTHS, START_BASE, START_NO_VEIN, STEEL_ON_N3,
  TROOPS, TROOP_GROWTH, UPGRADE_COST, UPGRADE_TIME, zeroRes, type BuildingType, type Res, type TroopType,
} from './balance';
import { activeLevel, cityLevel, logEvent, type GameState } from './state';

export function buildCost(type: BuildingType, level: number): Partial<Res> & { months: number } {
  const b = BUILDINGS[type], k = UPGRADE_COST[level], c: Partial<Res> & { months: number } = { months: b.months * UPGRADE_TIME ** (level - 1) };
  for (const [key, v] of Object.entries(b.cost) as [keyof Res, number][]) c[key] = v * k;
  if (level === 3) c.steel = (c.steel ?? 0) + STEEL_ON_N3;
  return c;
}

const owned = (s: GameState) => s.owner.filter(o => o === 0).length;
const hasGarrison = (s: GameState, id: number) => s.lots[id].some(b => b?.type === 'garrison' && activeLevel(b) > 0);

export function colonizeCost(s: GameState, pm: ProvinceMap, id: number): Partial<Res> & { months: number } {
  const p = pm.provinces[id];
  const hard = p.biome === Biome.Mountain || p.biome === Biome.Snow || p.biome === Biome.Swamp;
  const k = p.neighbors.some(n => s.owner[n] === 0 && hasGarrison(s, n)) ? 1 - COLONIZE.garrisonDiscount : 1;
  return {
    money: COLONIZE.money * COLONIZE.growth ** (owned(s) - 1) * k, wood: COLONIZE.wood * COLONIZE.woodGrowth ** (owned(s) - 1) * k,
    months: (COLONIZE.months + (hard ? COLONIZE.hardExtra : 0)) * k,
  };
}

const VEIN_RES: Record<VeinKind, keyof Res> = { grain: 'grain', wood: 'wood', coal: 'coal', iron: 'iron' };

/** Estoque inicial: base × riqueza média dos veios de cada recurso na capital + vizinhas (piso sem veio); dinheiro × fertilidade. */
export function startingStock(pm: ProvinceMap, capital: number): Res {
  const p = pm.provinces[capital], veins = [p, ...p.neighbors.map(n => pm.provinces[n])].flatMap(q => q.veins);
  const r: Res = { ...START_BASE, money: START_BASE.money * p.fertility };
  for (const kind of ['grain', 'wood', 'coal', 'iron'] as VeinKind[]) {
    const of = veins.filter(v => v.kind === kind), k = of.length ? of.reduce((a, v) => a + v.richness, 0) / of.length : START_NO_VEIN;
    r[VEIN_RES[kind]] = START_BASE[VEIN_RES[kind]] * k;
  }
  return r;
}

export interface MonthReport {
  net: Res; // variação do estoque no mês
  lines: Record<keyof Res, [string, number][]>; // origem/destino por recurso (para a dica da barra)
  stalled: { province: number; lot: number; missing: keyof Res }[]; // fábricas que não produziram tudo
  grainShort: boolean;
}

/**
 * A virada do mês, na ordem: impostos → veios → siderúrgicas → fábricas de armas → grãos das cidades → manutenção.
 * Com `apply` grava o estoque, a falta de grãos e os avisos; sem ele é a projeção que a interface mostra.
 * `only` restringe a uma província (sem tropas), para o painel.
 */
export function runMonth(s: GameState, pm: ProvinceMap, apply: boolean, only = -1): MonthReport {
  const r = { ...s.res }, lines = Object.fromEntries(RES_KEYS.map(k => [k, []])) as unknown as MonthReport['lines'], stalled: MonthReport['stalled'] = [];
  const add = (k: keyof Res, label: string, v: number) => {
    if (!v) return;
    r[k] += v;
    const l = lines[k].find(e => e[0] === label);
    if (l) l[1] += v; else lines[k].push([label, v]);
  };
  const mine = s.owner.map((o, id) => o === 0 && (only < 0 || id === only) && !!s.city[id]);
  // impostos
  mine.forEach((m, id) => {
    if (!m) return;
    const market = Math.max(0, ...s.lots[id].map(b => (b?.type === 'market' ? BUILDINGS.market.out[activeLevel(b)] : 0)));
    const tax = (CITY.tax[cityLevel(s, id)] * pm.provinces[id].fertility + (s.capital === id ? CITY.capitalTax : 0)) * (1 + market) * (s.grainShort ? GRAIN_SHORT_TAX : 1);
    add('money', 'Impostos', tax);
  });
  // veios
  mine.forEach((m, id) => {
    if (m) s.veins[id].forEach((b, v) => { const l = activeLevel(b); if (b && l) add(BUILDINGS[b.type].product!, BUILDINGS[b.type].plural, BUILDINGS[b.type].out[l] * pm.provinces[id].veins[v].richness); });
  });
  // fábricas: siderúrgicas antes das de armas (o aço do mês já vira arma); produzem o que o estoque permitir
  for (const type of ['steelworks', 'arms_factory'] as const) {
    const def = BUILDINGS[type], uses = Object.entries(def.uses!) as [keyof Res, number][];
    mine.forEach((m, id) => {
      if (m) s.lots[id].forEach((b, lot) => {
        const l = activeLevel(b);
        if (b?.type !== type || !l) return;
        let units = def.out[l], missing: keyof Res | null = null;
        for (const [k, per] of uses) { const can = Math.floor(Math.max(0, r[k]) / per + 1e-9); if (can < units) { units = can; missing = k; } }
        for (const [k, per] of uses) add(k, def.plural, -units * per);
        add(def.product!, def.plural, units);
        if (missing) stalled.push({ province: id, lot, missing });
      });
    });
  }
  // grãos das cidades
  mine.forEach((m, id) => { if (m) add('grain', 'Cidades', -CITY.grain[cityLevel(s, id)]); });
  // manutenção
  mine.forEach((m, id) => { if (m) for (const b of s.lots[id]) if (b?.type === 'garrison' && activeLevel(b)) add('money', 'Guarnições', -GARRISON_UPKEEP); });
  if (only < 0) for (const t of s.troops) if (t.owner === 0) for (const [k, v] of Object.entries(TROOPS[t.type].upkeep) as [keyof Res, number][]) add(k, 'Tropas', -v);
  const grainShort = r.grain <= 0 && mine.some(Boolean);
  if (r.grain < 0) r.grain = 0;
  const net = zeroRes();
  for (const k of RES_KEYS) net[k] = r[k] - s.res[k];
  if (apply) {
    if (grainShort && !s.grainShort) logEvent(s, 'Sem grãos: impostos pela metade');
    s.res = r; s.grainShort = grainShort;
    for (const st of stalled) {
      const key = `${st.province}:${st.lot}`;
      if (s.month - (s.stallWarned[key] ?? -Infinity) < STALL_WARN_MONTHS) continue;
      s.stallWarned[key] = s.month;
      logEvent(s, `${BUILDINGS[s.lots[st.province][st.lot]!.type].name} parada em ${pm.provinces[st.province].name}: falta ${RES_NAMES[st.missing]}`);
    }
  }
  return { net, lines, stalled, grainShort };
}

export const monthlyIncome = (s: GameState, pm: ProvinceMap): Res => runMonth(s, pm, false).net;

/** Custo de treinar a próxima tropa: cresce com as que o reino já tem (vivas ou em treino). */
export function recruitCost(s: GameState, type: TroopType): Partial<Res> {
  const k = TROOP_GROWTH ** (s.troops.filter(t => t.owner === 0).length + s.recruiting.length), c: Partial<Res> = {};
  for (const [key, v] of Object.entries(TROOPS[type].cost) as [keyof Res, number][]) c[key] = v * k;
  return c;
}
