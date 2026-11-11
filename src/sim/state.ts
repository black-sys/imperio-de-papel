import type { ProvinceMap } from '../worldgen/provinces';
import { zeroRes, type BuildingType, type Res, type TroopType } from './balance';

/** Prédio num lote ou veio. `remaining` > 0 = em obra no nível `level` (novo ou melhoria); rende no nível anterior até lá. */
export interface Building { type: BuildingType; level: number; remaining: number }

export interface Battalion { type: TroopType; soldiers: number }
/**
 * Exército: uma peça no mapa com 1–8 batalhões (mais, por pouco tempo, quando recebe reforço pela linha numa batalha).
 * `owner` 0 jogador, −1 fortaleza neutra (`home` = província dela; −1 nas demais).
 */
export interface Army {
  id: number; owner: number; name: string; battalions: Battalion[];
  x: number; y: number; // tiles
  path: number[]; // células ainda a percorrer
  morale: number; // 0–1, espelha a moral do lado na batalha
  routedUntil: number; // em fuga (sem obedecer) até este `clock`
  home: number;
  supply: { path: number[]; from: number; at: number; cut: boolean } | null; // linha de suprimento da cidade `from`; `at` = clock do traçado
  supplied: boolean; // abastecido neste passo
}
/** Rota da nação `owner` entre as cidades das províncias `a` e `b`. `remaining` > 0 = em obra; `cut` = cortada por tropa hostil ou território inimigo. */
export interface Route { id: number; owner: number; a: number; b: number; path: number[]; remaining: number; cut: boolean }
/** Cidade: `remaining` > 0 = subindo para `level` (vale o nível anterior até lá). */
export interface CityState { level: number; remaining: number }
export type Bent = 'militarist' | 'expansionist' | 'industrial';
/** Proposta diplomática, do ponto de vista de quem propõe (`give` = o que quem propõe entrega no comércio). */
export type Proposal = { kind: 'peace'; cede: number[]; money: number; payer: number }
  | { kind: 'nonaggression' } | { kind: 'alliance' }
  | { kind: 'trade'; give: [keyof Res, number]; get: [keyof Res, number] };
export type PactKind = 'truce' | 'nonaggression' | 'trade' | 'alliance';
/** Acordo em vigor entre `a` e `b` até o mês `until` (null = sem prazo). Comércio: o que cada lado entrega por mês. */
export interface Pact {
  id: number; kind: PactKind; a: number; b: number; until: number | null;
  trade?: { aGives: [keyof Res, number]; bGives: [keyof Res, number] }; missed: number;
}
/** Uma nação (0 = jogador): o que antes era só do jogador vive aqui. `ai` = joga sozinha (rivais; o teste de ritmo liga no 0). */
export interface Nation {
  id: number; name: string; bent: Bent; incomeMult: number; alive: boolean; ai: boolean;
  res: Res; capital: number; grainShort: boolean; armyNumber: number;
  atWar: number[]; founded: number; // mês da fundação (carência para declarar guerra)
}
export interface Battle { x: number; y: number; start: number; armyIds: number[]; sides: { owner: number; initial: number; morale: number }[] }

/** Estado da partida: só dados simples (serializável em JSON para salvar/carregar). */
export interface GameState {
  month: number;
  speed: number;
  seed: number;
  nations: Nation[]; // 0 = jogador; vazia antes de fundar a capital
  owner: number[]; // por província: −1 neutra, senão id da nação
  city: (CityState | null)[]; // por província; null = sem cidade (neutra)
  lots: (Building | null)[][]; // por província, um por lote gerado (só os liberados pelo nível da cidade aceitam obra)
  veins: (Building | null)[][]; // por província, um por veio
  stallWarned: Record<string, number>; // "província:lote" → mês do último aviso de fábrica parada
  colonizing: { province: number; nation: number; remaining: number }[];
  events: { month: number; text: string }[]; // últimos 50
  eventCount: number; // total já registrado (a interface compara com ele para achar os novos)
  armies: Army[];
  nextArmyId: number;
  recruiting: { province: number; lot: number; type: TroopType; remaining: number }[];
  fortresses: { province: number; garrison: TroopType[]; lastCombat: number }[]; // `garrison` = força total, para regenerar
  battles: Battle[];
  routes: Route[];
  nextRouteId: number;
  occupations: { province: number; nation: number; progress: number }[]; // meses de ocupação acumulados
  result: null | 'victory' | 'defeat';
  relations: number[][]; // [a][b] === [b][a], de −100 a 100
  pacts: Pact[];
  nextPactId: number;
  letters: { id: number; from: number; proposal: Proposal; expires: number }[]; // caixa do jogador
  pending: { to: number; proposal: Proposal; answerAt: number }[]; // propostas do jogador aguardando resposta
  nextLetterId: number;
  depot: Res[]; // por província: carga guardada enquanto a cidade está desligada da capital
  connected: boolean[]; // por província: ligada à capital por rotas prontas e não cortadas
  clock: number; // meses já simulados em passos fixos (datas de tropas e batalhas)
  stepAcc: number; // sobra de tempo ainda não simulada
}

export function newGame(pm: ProvinceMap, seed = 0): GameState {
  return {
    month: 0, speed: 0, seed, nations: [], colonizing: [], events: [], eventCount: 0,
    armies: [], nextArmyId: 1, recruiting: [], fortresses: [], battles: [], clock: 0, stepAcc: 0,
    stallWarned: {}, routes: [], nextRouteId: 1, occupations: [], result: null,
    relations: [], pacts: [], nextPactId: 1, letters: [], pending: [], nextLetterId: 1,
    depot: pm.provinces.map(() => zeroRes()), connected: pm.provinces.map(() => false),
    owner: pm.provinces.map(() => -1),
    city: pm.provinces.map(() => null),
    lots: pm.provinces.map(p => new Array<Building | null>(p.lots.length).fill(null)),
    veins: pm.provinces.map(p => new Array<Building | null>(p.veins.length).fill(null)),
  };
}

export const activeLevel = (b: Building | CityState | null | undefined) => (!b ? 0 : b.remaining > 0 ? b.level - 1 : b.level);
export const cityLevel = (s: GameState, id: number) => activeLevel(s.city[id]);
/** Capital do jogador (−1 antes de fundar). */
export const playerCapital = (s: GameState) => s.nations[0]?.capital ?? -1;
/** Prédios da nação `n` (lotes e veios), com a província. */
export function* ownBuildings(s: GameState, n = 0): Generator<[number, Building]> {
  for (let id = 0; id < s.owner.length; id++) {
    if (s.owner[id] !== n) continue;
    for (const b of s.lots[id]) if (b) yield [id, b];
    for (const b of s.veins[id]) if (b) yield [id, b];
  }
}

export function logEvent(s: GameState, text: string): void {
  s.events.push({ month: s.month, text });
  s.eventCount++;
  if (s.events.length > 50) s.events.shift();
}

/** O feed é do jogador: registra só o que é da nação 0. */
export function logFor(s: GameState, n: number, text: string): void { if (n === 0) logEvent(s, text); }

/** A província passa à nação `n` com cidade nível 1, lugares vazios e desligada da capital (até ganhar rota). */
export function found(s: GameState, id: number, n = 0): void {
  s.owner[id] = n;
  s.city[id] = { level: 1, remaining: 0 };
  s.lots[id] = s.lots[id].map(() => null);
  s.veins[id] = s.veins[id].map(() => null);
  s.connected[id] = false;
  s.depot[id] = zeroRes();
}
