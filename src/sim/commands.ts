import type { ProvinceMap } from '../worldgen/provinces';
import { BUILDINGS, COLONIZE, MAX_LEVEL, MIN_FOREST, MIN_ROCK, SPEEDS, type BuildingType, type Res } from './balance';
import { buildCost, colonizeCost } from './economy';
import { activeLevel, logEvent, type GameState } from './state';

export type Result = { ok: true } | { ok: false; reason: string };
const no = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };
const RES_NAMES: Record<keyof Res, string> = { gold: 'ouro', wood: 'madeira', stone: 'pedra' };

const validProvince = (pm: ProvinceMap, id: number) => Number.isInteger(id) && id >= 0 && id < pm.provinces.length;

function afford(s: GameState, c: Res): Result {
  for (const k of ['gold', 'wood', 'stone'] as const)
    if (s.res[k] < c[k]) return no(`Falta ${Math.ceil(c[k] - s.res[k])} de ${RES_NAMES[k]}`);
  return OK;
}
function pay(s: GameState, c: Res): void { s.res.gold -= c.gold; s.res.wood -= c.wood; s.res.stone -= c.stone; }

export function chooseCapital(s: GameState, pm: ProvinceMap, id: number): Result {
  if (s.capital >= 0) return no('A capital já foi escolhida');
  if (!validProvince(pm, id)) return no('Província inválida');
  s.capital = id; s.owner[id] = 0;
  s.buildings[id][0] = { type: 'village', level: 2, remaining: 0 };
  logEvent(s, `Capital fundada em ${pm.provinces[id].name}`);
  return OK;
}

export function setSpeed(s: GameState, v: number): Result {
  if (!(SPEEDS as readonly number[]).includes(v)) return no('Velocidade inválida');
  s.speed = v;
  return OK;
}

export function colonize(s: GameState, pm: ProvinceMap, id: number): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== -1) return no('Esta província não é neutra');
  if (s.colonizing.some(c => c.province === id)) return no('Já está sendo colonizada');
  if (s.colonizing.length >= COLONIZE.max) return no(`Já há ${COLONIZE.max} colonizações em andamento`);
  if (!pm.provinces[id].neighbors.some(n => s.owner[n] === 0)) return no('Precisa ser vizinha de uma província sua');
  const c = colonizeCost(s, pm, id), a = afford(s, c);
  if (!a.ok) return a;
  pay(s, c);
  s.colonizing.push({ province: id, remaining: c.months });
  logEvent(s, `Colonização de ${pm.provinces[id].name} iniciada`);
  return OK;
}

export function build(s: GameState, pm: ProvinceMap, id: number, slot: number, type: BuildingType): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== 0) return no('Esta província não é sua');
  if (!Number.isInteger(slot) || slot < 0 || slot >= s.buildings[id].length) return no('Vaga inválida');
  if (!(type in BUILDINGS)) return no('Prédio desconhecido');
  if (s.buildings[id][slot]) return no('Vaga ocupada');
  const p = pm.provinces[id], here = s.buildings[id];
  if (type === 'village' && here.some(b => b?.type === 'village')) return no('Já existe uma vila nesta província');
  if (type === 'sawmill' && p.forest < MIN_FOREST) return no(`Precisa de floresta (≥ ${MIN_FOREST})`);
  if (type === 'quarry' && p.rock < MIN_ROCK) return no(`Precisa de rocha (≥ ${MIN_ROCK})`);
  if (type === 'market' && !here.some(b => b?.type === 'village' && activeLevel(b) >= 2)) return no('Precisa de Vila nível 2');
  const c = buildCost(type, 1), a = afford(s, c);
  if (!a.ok) return a;
  pay(s, c);
  here[slot] = { type, level: 1, remaining: c.months };
  return OK;
}

export function upgrade(s: GameState, pm: ProvinceMap, id: number, slot: number): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== 0) return no('Esta província não é sua');
  const b = s.buildings[id]?.[slot];
  if (!b) return no('Vaga vazia');
  if (b.remaining > 0) return no('Já está em obra');
  if (b.level >= MAX_LEVEL) return no('Nível máximo');
  const c = buildCost(b.type, b.level + 1), a = afford(s, c);
  if (!a.ok) return a;
  pay(s, c);
  b.level++; b.remaining = c.months;
  return OK;
}
