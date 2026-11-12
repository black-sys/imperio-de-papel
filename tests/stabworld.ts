import { chooseCapital } from '../src/sim/commands';
import { found, newGame, type GameState } from '../src/sim/state';
import { makeRouteWorld } from './troopworld';

const { pm } = makeRouteWorld();
/** Jogador com capital em R0 e R1 (cidade N1, ligada); rival (nação 1) em R2. */
export const world = (): GameState => {
  const s = newGame(pm);
  chooseCapital(s, pm, 0);
  found(s, 1); s.connected[1] = true;
  s.nations.push({ ...s.nations[0], history: [], id: 1, name: 'Nação de R2', ai: true, capital: 2, res: { ...s.nations[0].res }, atWar: [], laws: [], lawCooldown: {} });
  s.owner[2] = 1; s.city[2] = { level: 2, remaining: 0 }; s.connected[2] = true; s.stability[2] = 70;
  s.relations = [[0, 0], [0, 0]];
  return s;
};
