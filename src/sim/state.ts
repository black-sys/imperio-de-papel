import type { ProvinceMap } from '../worldgen/provinces';
import { zeroRes, type BuildingType, type Res, type TroopType } from './balance';

/** Prédio num lote ou veio. `remaining` > 0 = em obra no nível `level` (novo ou melhoria); rende no nível anterior até lá. */
export interface Building { type: BuildingType; level: number; remaining: number }

/** Tropa: uma peça no mapa. `owner` 0 jogador, −1 fortaleza neutra (`home` = província dela; −1 nas demais). */
export interface Troop {
  id: number; owner: number; type: TroopType; soldiers: number;
  x: number; y: number; // tiles
  path: number[]; // células ainda a percorrer
  morale: number; // 0–1, espelha a moral do lado na batalha
  routedUntil: number; // em fuga (sem obedecer) até este `clock`
  home: number;
}
/** Cidade: `remaining` > 0 = subindo para `level` (vale o nível anterior até lá). */
export interface CityState { level: number; remaining: number }
export interface Battle { x: number; y: number; start: number; troopIds: number[]; sides: { owner: number; initial: number; morale: number }[] }

/** Estado da partida: só dados simples (serializável em JSON para salvar/carregar). */
export interface GameState {
  month: number;
  speed: number;
  res: Res;
  owner: number[]; // por província: −1 neutra, 0 jogador
  city: (CityState | null)[]; // por província; null = sem cidade (neutra)
  lots: (Building | null)[][]; // por província, um por lote gerado (só os liberados pelo nível da cidade aceitam obra)
  veins: (Building | null)[][]; // por província, um por veio
  grainShort: boolean; // o último mês terminou sem grãos: impostos pela metade no seguinte
  stallWarned: Record<string, number>; // "província:lote" → mês do último aviso de fábrica parada
  colonizing: { province: number; remaining: number }[];
  capital: number;
  events: { month: number; text: string }[]; // últimos 50
  eventCount: number; // total já registrado (a interface compara com ele para achar os novos)
  troops: Troop[];
  nextTroopId: number;
  recruiting: { province: number; lot: number; type: TroopType; remaining: number }[];
  fortresses: { province: number; garrison: TroopType[]; lastCombat: number }[]; // `garrison` = força total, para regenerar
  battles: Battle[];
  clock: number; // meses já simulados em passos fixos (datas de tropas e batalhas)
  stepAcc: number; // sobra de tempo ainda não simulada
}

export function newGame(pm: ProvinceMap): GameState {
  return {
    month: 0, speed: 0, res: zeroRes(), capital: -1, colonizing: [], events: [], eventCount: 0,
    troops: [], nextTroopId: 1, recruiting: [], fortresses: [], battles: [], clock: 0, stepAcc: 0,
    grainShort: false, stallWarned: {},
    owner: pm.provinces.map(() => -1),
    city: pm.provinces.map(() => null),
    lots: pm.provinces.map(p => new Array<Building | null>(p.lots.length).fill(null)),
    veins: pm.provinces.map(p => new Array<Building | null>(p.veins.length).fill(null)),
  };
}

export const activeLevel = (b: Building | CityState | null | undefined) => (!b ? 0 : b.remaining > 0 ? b.level - 1 : b.level);
export const cityLevel = (s: GameState, id: number) => activeLevel(s.city[id]);
/** Prédios do reino do jogador (lotes e veios), com a província. */
export function* ownBuildings(s: GameState): Generator<[number, Building]> {
  for (let id = 0; id < s.owner.length; id++) {
    if (s.owner[id] !== 0) continue;
    for (const b of s.lots[id]) if (b) yield [id, b];
    for (const b of s.veins[id]) if (b) yield [id, b];
  }
}

export function logEvent(s: GameState, text: string): void {
  s.events.push({ month: s.month, text });
  s.eventCount++;
  if (s.events.length > 50) s.events.shift();
}

/** A província passa ao jogador com cidade nível 1 e lugares vazios. */
export function found(s: GameState, id: number): void {
  s.owner[id] = 0;
  s.city[id] = { level: 1, remaining: 0 };
  s.lots[id] = s.lots[id].map(() => null);
  s.veins[id] = s.veins[id].map(() => null);
}
