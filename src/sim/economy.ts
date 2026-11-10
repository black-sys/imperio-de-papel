import type { ProvinceMap } from '../worldgen/provinces';
import { Biome } from '../worldgen/types';
import { BUILDINGS, CAPITAL_TAX, COLONIZE, GARRISON_UPKEEP, TAX, UPGRADE_COST, UPGRADE_TIME, type BuildingType, type Res } from './balance';
import { activeLevel, type GameState } from './state';

export function buildCost(type: BuildingType, level: number): Res & { months: number } {
  const b = BUILDINGS[type], k = UPGRADE_COST[level];
  return { gold: b.cost.gold * k, wood: b.cost.wood * k, stone: b.cost.stone * k, months: b.months * UPGRADE_TIME ** (level - 1) };
}

const owned = (s: GameState) => s.owner.filter(o => o === 0).length;

export function colonizeCost(s: GameState, pm: ProvinceMap, id: number): Res & { months: number } {
  const p = pm.provinces[id];
  const hard = p.biome === Biome.Mountain || p.biome === Biome.Snow || p.biome === Biome.Swamp;
  const garrison = p.neighbors.some(n => s.owner[n] === 0 && s.buildings[n].some(b => b?.type === 'garrison' && activeLevel(b) > 0));
  const k = garrison ? 1 - COLONIZE.garrisonDiscount : 1;
  return {
    gold: COLONIZE.gold * (1 + COLONIZE.perOwned * owned(s)) * k, wood: COLONIZE.wood * k, stone: 0,
    months: (COLONIZE.months + (hard ? COLONIZE.hardExtra : 0)) * k,
  };
}

/** Renda de uma província sua (ouro inclui imposto, capital, vila, mercado e manutenção). */
export function provinceIncome(s: GameState, pm: ProvinceMap, id: number): Res {
  const p = pm.provinces[id];
  let gold = TAX + (s.capital === id ? CAPITAL_TAX : 0), wood = 0, stone = 0, market = 0, upkeep = 0;
  for (const b of s.buildings[id]) {
    const l = activeLevel(b);
    if (!b || l === 0) continue;
    const y = BUILDINGS[b.type].yields[l];
    if (b.type === 'village') gold += y * p.fertility;
    else if (b.type === 'sawmill') wood += y * p.forest;
    else if (b.type === 'quarry') stone += y * p.rock;
    else if (b.type === 'market') market = Math.max(market, y);
    else if (b.type === 'garrison') upkeep += GARRISON_UPKEEP;
  }
  return { gold: gold * (1 + market) - upkeep, wood, stone };
}

export function monthlyIncome(s: GameState, pm: ProvinceMap): Res {
  const t = { gold: 0, wood: 0, stone: 0 };
  s.owner.forEach((o, id) => { if (o !== 0) return; const r = provinceIncome(s, pm, id); t.gold += r.gold; t.wood += r.wood; t.stone += r.stone; });
  return t;
}
