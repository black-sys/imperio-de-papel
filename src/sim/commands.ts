import type { ProvinceMap } from '../worldgen/provinces';
import { findCellPath } from './astar';
import { cellAt, type MoveGrid } from './movegrid';
import { BATTLE, BUILDINGS, CITY, COLONIZE, MAX_LEVEL, QUOTA, RES_NAMES, SPEEDS, STEEL_TECH_MINES, TROOPS, type BuildingType, type Res, type TroopType } from './balance';
import { buildCost, colonizeCost, recruitCost, startingStock } from './economy';
import { activeLevel, cityLevel, logEvent, ownBuildings, type Building, type GameState } from './state';
import { armyCap, battalionCount } from './armies';

export type Result = { ok: true } | { ok: false; reason: string };
/** Lugar de um prédio na província: um dos lotes junto da cidade ou um dos veios. */
export type Place = { lot: number } | { vein: number };
const no = (reason: string): Result => ({ ok: false, reason });
const OK: Result = { ok: true };
const RES_LABEL: Record<keyof Res, string> = RES_NAMES;

const validProvince = (pm: ProvinceMap, id: number) => Number.isInteger(id) && id >= 0 && id < pm.provinces.length;

function afford(s: GameState, c: Partial<Res>): Result {
  for (const [k, v] of Object.entries(c) as [keyof Res, number][])
    if (k in s.res && s.res[k] < v) return no(`Falta ${Math.ceil(v - s.res[k])} de ${RES_LABEL[k]}`);
  return OK;
}
function pay(s: GameState, c: Partial<Res>): void { for (const [k, v] of Object.entries(c) as [keyof Res, number][]) if (k in s.res) s.res[k] -= v; }

/** O prédio (ou vazio) no lugar; undefined se o lugar não existe. */
function at(s: GameState, id: number, place: Place): Building | null | undefined {
  const list = 'lot' in place ? s.lots[id] : s.veins[id], i = 'lot' in place ? place.lot : place.vein;
  return Number.isInteger(i) && i >= 0 && i < list.length ? list[i] : undefined;
}
function put(s: GameState, id: number, place: Place, b: Building): void {
  if ('lot' in place) s.lots[id][place.lot] = b; else s.veins[id][place.vein] = b;
}

export function chooseCapital(s: GameState, pm: ProvinceMap, id: number): Result {
  if (s.capital >= 0) return no('A capital já foi escolhida');
  if (!validProvince(pm, id)) return no('Província inválida');
  s.capital = id; s.owner[id] = 0;
  s.city[id] = { level: 2, remaining: 0 };
  s.connected[id] = true; // a capital é sempre ligada
  s.res = startingStock(pm, id);
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
  if (pm.provinces[id].lots.length === 0) return no('Não há terra firme para fundar uma cidade');
  if (s.colonizing.some(c => c.province === id)) return no('Já está sendo colonizada');
  if (s.colonizing.length >= COLONIZE.max) return no(`Já há ${COLONIZE.max} colonizações em andamento`);
  if (!pm.provinces[id].neighbors.some(n => s.owner[n] === 0)) return no('Precisa ser vizinha de uma província sua');
  return afford(s, colonizeCost(s, pm, id));
}

export function colonize(s: GameState, pm: ProvinceMap, id: number): Result {
  const chk = checkColonize(s, pm, id);
  if (!chk.ok) return chk;
  const c = colonizeCost(s, pm, id);
  pay(s, { money: c.money, wood: c.wood });
  s.colonizing.push({ province: id, remaining: c.months });
  logEvent(s, `Colonização de ${pm.provinces[id].name} iniciada`);
  return OK;
}

export function checkBuild(s: GameState, pm: ProvinceMap, id: number, place: Place, type: BuildingType): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== 0 || !s.city[id]) return no('Esta província não é sua');
  if (!Object.hasOwn(BUILDINGS, type)) return no('Prédio desconhecido');
  const here = at(s, id, place), def = BUILDINGS[type];
  if (here === undefined) return no('Lugar inválido');
  if (here) return no('Lugar ocupado');
  if ('lot' in place) {
    if (def.place !== 'lot') return no('Lote só aceita fábrica');
    const need = CITY.lots.findIndex(n => n > place.lot);
    if (place.lot >= CITY.lots[cityLevel(s, id)]) return no(`Libera com a cidade nível ${need}`);
    // efeito de mercado/guarnição não acumula na mesma cidade: a segunda só custaria
    if ((type === 'market' || type === 'garrison') && s.lots[id].some(b => b?.type === type)) return no(`Já existe ${type === 'market' ? 'um Mercado' : 'uma Guarnição'} nesta cidade`);
    // tecnologia por cota (como no documento): o aço só aparece com minas suficientes em funcionamento
    if (type === 'steelworks') {
      const mines = [...ownBuildings(s)].filter(([, b]) => activeLevel(b) > 0 && (b.type === 'coal_mine' || b.type === 'iron_mine')).map(([, b]) => b.type);
      if (mines.length < STEEL_TECH_MINES || !mines.includes('coal_mine') || !mines.includes('iron_mine'))
        return no(`Precisa de ${STEEL_TECH_MINES} minas prontas, com carvão e ferro: ${mines.length}/${STEEL_TECH_MINES}`);
    }
  } else {
    const vein = pm.provinces[id].veins[place.vein];
    const right = (Object.keys(BUILDINGS) as BuildingType[]).find(t => BUILDINGS[t].vein === vein.kind)!;
    if (type !== right) return no(`Veio só aceita ${BUILDINGS[right].name}`);
  }
  return afford(s, buildCost(type, 1));
}

export function build(s: GameState, pm: ProvinceMap, id: number, place: Place, type: BuildingType): Result {
  const chk = checkBuild(s, pm, id, place, type);
  if (!chk.ok) return chk;
  const c = buildCost(type, 1);
  pay(s, withoutMonths(c));
  put(s, id, place, { type, level: 1, remaining: c.months });
  return OK;
}

const withoutMonths = (c: Partial<Res> & { months: number }): Partial<Res> => { const { months: _, ...r } = c; return r; };

export function checkUpgrade(s: GameState, pm: ProvinceMap, id: number, place: Place): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== 0) return no('Esta província não é sua');
  const b = at(s, id, place);
  if (b === undefined) return no('Lugar inválido');
  if (!b) return no('Lugar vazio');
  if (b.remaining > 0) return no('Já está em obra');
  if (b.level >= MAX_LEVEL) return no('Nível máximo');
  // cota: prédios do mesmo tipo no reino no nível atual ou maior, contando este
  let n = 0;
  for (const [, o] of ownBuildings(s)) if (o.type === b.type && activeLevel(o) >= b.level) n++;
  if (n < QUOTA) return no(`${BUILDINGS[b.type].plural}${b.level > 1 ? ` nível ${b.level}` : ''}: ${n}/${QUOTA}`);
  return afford(s, buildCost(b.type, b.level + 1));
}

export function upgrade(s: GameState, pm: ProvinceMap, id: number, place: Place): Result {
  const chk = checkUpgrade(s, pm, id, place);
  if (!chk.ok) return chk;
  const b = at(s, id, place)!, c = buildCost(b.type, b.level + 1);
  pay(s, withoutMonths(c));
  b.level++; b.remaining = c.months;
  return OK;
}

export function checkUpgradeCity(s: GameState, pm: ProvinceMap, id: number): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  const c = s.city[id];
  if (s.owner[id] !== 0 || !c) return no('Esta província não é sua');
  if (c.remaining > 0) return no('Já está em obra');
  if (c.level >= MAX_LEVEL) return no('Nível máximo');
  if (c.level + 1 === 3) {
    let n = 0;
    s.owner.forEach((o, p) => { if (o === 0 && cityLevel(s, p) >= 2) n++; });
    if (n < QUOTA) return no(`Cidades nível 2: ${n}/${QUOTA}`);
  }
  return afford(s, CITY.cost[c.level + 1]);
}

export function upgradeCity(s: GameState, pm: ProvinceMap, id: number): Result {
  const chk = checkUpgradeCity(s, pm, id);
  if (!chk.ok) return chk;
  const c = s.city[id]!;
  pay(s, CITY.cost[c.level + 1]);
  c.level++; c.remaining = CITY.months[c.level];
  return OK;
}

export function checkRecruit(s: GameState, pm: ProvinceMap, id: number, lot: number, type: TroopType): Result {
  if (!validProvince(pm, id)) return no('Província inválida');
  if (s.owner[id] !== 0) return no('Esta província não é sua');
  const b = s.lots[id]?.[lot];
  if (b?.type !== 'garrison' || activeLevel(b) === 0) return no('Precisa de uma Guarnição');
  if (!Object.hasOwn(TROOPS, type)) return no('Tropa desconhecida');
  if (activeLevel(b) < TROOPS[type].level) return no(`Requer Guarnição N${TROOPS[type].level}`);
  if (s.recruiting.some(r => r.province === id && r.lot === lot)) return no('Já está treinando uma tropa');
  if (battalionCount(s) + s.recruiting.length >= armyCap(s)) return no('Teto de batalhões atingido');
  return afford(s, recruitCost(s, type));
}

export function recruit(s: GameState, pm: ProvinceMap, id: number, lot: number, type: TroopType): Result {
  const chk = checkRecruit(s, pm, id, lot, type);
  if (!chk.ok) return chk;
  pay(s, recruitCost(s, type));
  s.recruiting.push({ province: id, lot, type, remaining: TROOPS[type].months });
  return OK;
}

/** Manda os exércitos do jogador para (x, y) em tiles, em formação. Os que podem andam; o motivo de alguma recusa volta. */
export function moveArmies(s: GameState, grid: MoveGrid, ids: number[], x: number, y: number): Result {
  const troops = s.armies.filter(t => t.owner === 0 && ids.includes(t.id));
  if (troops.length === 0) return no('Nenhum exército selecionado');
  const target = cellAt(grid, x, y);
  if (target < 0 || grid.cost[target] === 0) return no('Destino na água');
  const cols = Math.ceil(Math.sqrt(troops.length)), rows = Math.ceil(troops.length / cols);
  let result = OK;
  troops.forEach((t, i) => {
    if (s.clock < t.routedUntil) { result = no('Exército em fuga'); return; }
    const spot = cellAt(grid, x + ((i % cols) - (cols - 1) / 2) * BATTLE.formation, y + (Math.floor(i / cols) - (rows - 1) / 2) * BATTLE.formation);
    const from = cellAt(grid, t.x, t.y), land = from < 0 ? 0 : grid.land[from];
    // outra massa de terra: não há caminho, nem adianta procurar (a busca varreria o continente inteiro)
    // tropa em célula de água (land 0, ex.: recém-treinada na margem) cai na busca normal
    const reach = (c: number) => (land && grid.land[c] !== land ? null : findCellPath(grid, from, c));
    // vaga da formação na água ou em outra terra: vai para o alvo
    const path = (spot >= 0 && grid.cost[spot] !== 0 ? reach(spot) : null) ?? reach(target);
    if (path) t.path = path; else result = no('Caminho impossível');
  });
  return result;
}
