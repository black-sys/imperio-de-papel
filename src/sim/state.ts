import type { ProvinceMap } from '../worldgen/provinces';
import { START_RES, type BuildingType, type Res, type TroopType } from './balance';

/** Prédio numa vaga. `remaining` > 0 = em obra no nível `level` (novo ou melhoria); rende no nível anterior até lá. */
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
export interface Battle { x: number; y: number; start: number; troopIds: number[]; sides: { owner: number; initial: number; morale: number }[] }

/** Estado da partida: só dados simples (serializável em JSON para salvar/carregar). */
export interface GameState {
  month: number;
  speed: number;
  res: Res;
  owner: number[]; // por província: −1 neutra, 0 jogador
  buildings: (Building | null)[][];
  colonizing: { province: number; remaining: number }[];
  capital: number;
  events: { month: number; text: string }[]; // últimos 50
  eventCount: number; // total já registrado (a interface compara com ele para achar os novos)
  troops: Troop[];
  nextTroopId: number;
  recruiting: { province: number; slot: number; type: TroopType; remaining: number }[];
  fortresses: { province: number; garrison: TroopType[]; lastCombat: number }[]; // `garrison` = força total, para regenerar
  battles: Battle[];
  clock: number; // meses já simulados em passos fixos (datas de tropas e batalhas)
  stepAcc: number; // sobra de tempo ainda não simulada
}

export function newGame(pm: ProvinceMap): GameState {
  return {
    month: 0, speed: 0, res: { ...START_RES }, capital: -1, colonizing: [], events: [], eventCount: 0,
    troops: [], nextTroopId: 1, recruiting: [], fortresses: [], battles: [], clock: 0, stepAcc: 0,
    owner: pm.provinces.map(() => -1),
    buildings: pm.provinces.map(p => new Array<Building | null>(p.slots).fill(null)),
  };
}

export const activeLevel = (b: Building | null) => (!b ? 0 : b.remaining > 0 ? b.level - 1 : b.level);

export function logEvent(s: GameState, text: string): void {
  s.events.push({ month: s.month, text });
  s.eventCount++;
  if (s.events.length > 50) s.events.shift();
}
