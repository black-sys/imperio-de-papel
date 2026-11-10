import type { ProvinceMap } from '../worldgen/provinces';
import { START_RES, type BuildingType, type Res } from './balance';

/** Prédio numa vaga. `remaining` > 0 = em obra no nível `level` (novo ou melhoria); rende no nível anterior até lá. */
export interface Building { type: BuildingType; level: number; remaining: number }

/** Estado da partida: só dados simples (serializável em JSON para salvar/carregar). */
export interface GameState {
  month: number;
  speed: number;
  res: Res;
  owner: number[]; // por província: −1 neutra, 0 jogador
  buildings: (Building | null)[][];
  colonizing: { province: number; remaining: number }[];
  capital: number;
  events: { month: number; text: string }[];
}

export function newGame(pm: ProvinceMap): GameState {
  return {
    month: 0, speed: 0, res: { ...START_RES }, capital: -1, colonizing: [], events: [],
    owner: pm.provinces.map(() => -1),
    buildings: pm.provinces.map(p => new Array<Building | null>(p.slots).fill(null)),
  };
}

export const activeLevel = (b: Building | null) => (!b ? 0 : b.remaining > 0 ? b.level - 1 : b.level);

export function logEvent(s: GameState, text: string): void {
  s.events.push({ month: s.month, text });
  if (s.events.length > 50) s.events.shift();
}
