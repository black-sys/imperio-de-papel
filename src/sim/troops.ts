import { TROOPS, TROOP_CAP, type TroopType } from './balance';
import { activeLevel, type GameState, type Troop } from './state';

/** Tropas que o reino sustenta: soma das guarnições do jogador (em melhoria vale o nível anterior). */
export function troopCap(s: GameState): number {
  let cap = 0;
  s.owner.forEach((o, id) => { if (o === 0) for (const b of s.buildings[id]) if (b?.type === 'garrison') cap += TROOP_CAP[activeLevel(b)]; });
  return cap;
}

export function spawnTroop(s: GameState, owner: number, type: TroopType, x: number, y: number, home = -1): Troop {
  const t: Troop = { id: s.nextTroopId++, owner, type, soldiers: TROOPS[type].soldiers, x, y, path: [], morale: 1, routedUntil: 0, home };
  s.troops.push(t);
  return t;
}
