import type { ProvinceMap } from '../worldgen/provinces';
import { BUILDINGS, COLONIZE, GARRISON_GOAL, MAX_LEVEL, MIN_FOREST, MIN_ROCK, SPEEDS, TROOPS, type BuildingType, type Res, type TroopType } from './balance';
import { buildCost, colonizeCost } from './economy';
import { activeLevel, logEvent, type GameState } from './state';
import { troopCap } from './troops';

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

/** Verifica sem alterar o estado (a interface usa para mostrar o motivo de botões desabilitados). */
export function checkColonize(s: GameState, pm: ProvinceMap, id: number): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== -1) return no('Esta província não é neutra');
  if (s.fortresses.some(f => f.province === id)) return no('Fortaleza: só cai com tropas');
  if (pm.provinces[id].sites.length === 0) return no('Não há terra firme para fundar uma vila');
  if (s.colonizing.some(c => c.province === id)) return no('Já está sendo colonizada');
  if (s.colonizing.length >= COLONIZE.max) return no(`Já há ${COLONIZE.max} colonizações em andamento`);
  if (!pm.provinces[id].neighbors.some(n => s.owner[n] === 0)) return no('Precisa ser vizinha de uma província sua');
  return afford(s, colonizeCost(s, pm, id));
}

export function colonize(s: GameState, pm: ProvinceMap, id: number): Result {
  const chk = checkColonize(s, pm, id);
  if (!chk.ok) return chk;
  const c = colonizeCost(s, pm, id);
  pay(s, c);
  s.colonizing.push({ province: id, remaining: c.months });
  logEvent(s, `Colonização de ${pm.provinces[id].name} iniciada`);
  return OK;
}

export function checkBuild(s: GameState, pm: ProvinceMap, id: number, slot: number, type: BuildingType): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== 0) return no('Esta província não é sua');
  if (!Number.isInteger(slot) || slot < 0 || slot >= s.buildings[id].length) return no('Vaga inválida');
  if (!Object.hasOwn(BUILDINGS, type)) return no('Prédio desconhecido');
  if (s.buildings[id][slot]) return no('Vaga ocupada');
  const p = pm.provinces[id], here = s.buildings[id];
  if (type === 'village' && here.some(b => b?.type === 'village')) return no('Já existe uma vila nesta província');
  // efeito de mercado/guarnição não acumula: a segunda só custaria
  if (type === 'market' && here.some(b => b?.type === 'market')) return no('Já existe um Mercado nesta província');
  if (type === 'garrison' && here.some(b => b?.type === 'garrison')) return no('Já existe uma Guarnição nesta província');
  if (type === 'sawmill' && p.forest < MIN_FOREST) return no(`Precisa de floresta (≥ ${MIN_FOREST})`);
  if (type === 'quarry' && p.rock < MIN_ROCK) return no(`Precisa de rocha (≥ ${MIN_ROCK})`);
  if (type === 'market' && !here.some(b => b?.type === 'village' && activeLevel(b) >= 2)) return no('Precisa de Vila nível 2');
  return afford(s, buildCost(type, 1));
}

export function build(s: GameState, pm: ProvinceMap, id: number, slot: number, type: BuildingType): Result {
  const chk = checkBuild(s, pm, id, slot, type);
  if (!chk.ok) return chk;
  const c = buildCost(type, 1);
  pay(s, c);
  s.buildings[id][slot] = { type, level: 1, remaining: c.months };
  return OK;
}

export function checkUpgrade(s: GameState, pm: ProvinceMap, id: number, slot: number): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== 0) return no('Esta província não é sua');
  const b = s.buildings[id]?.[slot];
  if (!b) return no('Vaga vazia');
  if (b.remaining > 0) return no('Já está em obra');
  if (b.level >= MAX_LEVEL) return no('Nível máximo');
  if (b.type === 'garrison') {
    // meta além dos insumos: guarnições do reino no nível atual ou maior, contando esta
    const goal = GARRISON_GOAL[b.level + 1];
    let n = 0;
    s.owner.forEach((o, p) => { if (o === 0) for (const g of s.buildings[p]) if (g?.type === 'garrison' && activeLevel(g) >= b.level) n++; });
    if (n < goal) return no(`Guarnições${b.level > 1 ? ` nível ${b.level}` : ''}: ${n}/${goal}`);
  }
  return afford(s, buildCost(b.type, b.level + 1));
}

export function upgrade(s: GameState, pm: ProvinceMap, id: number, slot: number): Result {
  const chk = checkUpgrade(s, pm, id, slot);
  if (!chk.ok) return chk;
  const b = s.buildings[id][slot]!, c = buildCost(b.type, b.level + 1);
  pay(s, c);
  b.level++; b.remaining = c.months;
  return OK;
}

export function checkRecruit(s: GameState, pm: ProvinceMap, id: number, slot: number, type: TroopType): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== 0) return no('Esta província não é sua');
  const b = s.buildings[id]?.[slot];
  if (b?.type !== 'garrison' || activeLevel(b) === 0) return no('Precisa de uma Guarnição');
  if (!Object.hasOwn(TROOPS, type)) return no('Tropa desconhecida');
  if (activeLevel(b) < TROOPS[type].level) return no(`Requer Guarnição N${TROOPS[type].level}`);
  if (s.recruiting.some(r => r.province === id && r.slot === slot)) return no('Já está treinando uma tropa');
  if (s.troops.filter(t => t.owner === 0).length + s.recruiting.length >= troopCap(s)) return no('Teto de tropas atingido');
  return afford(s, TROOPS[type].cost);
}

export function recruit(s: GameState, pm: ProvinceMap, id: number, slot: number, type: TroopType): Result {
  const chk = checkRecruit(s, pm, id, slot, type);
  if (!chk.ok) return chk;
  pay(s, TROOPS[type].cost);
  s.recruiting.push({ province: id, slot, type, remaining: TROOPS[type].months });
  return OK;
}
