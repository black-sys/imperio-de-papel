import { expect, test } from 'vitest';
import { firstSteps } from '../src/client/steps';
import { chooseCapital } from '../src/sim/commands';
import { spawnArmy } from '../src/sim/armies';
import { newGame } from '../src/sim/state';
import { makeRouteWorld } from './troopworld';

const { pm } = makeRouteWorld();
test('primeiros passos se marcam sozinhos', () => {
  const s = newGame(pm);
  expect(firstSteps(s, false).map(x => x.done)).toEqual([false, false, false, false, false, false]);
  chooseCapital(s, pm, 0);
  s.veins[0][0] = { type: 'farm', level: 1, remaining: 2 };
  s.colonizing.push({ province: 1, nation: 0, remaining: 3 });
  s.routes.push({ id: 1, owner: 0, a: 0, b: 1, path: [], remaining: 2, cut: false });
  spawnArmy(s, 0, ['line'], 60, 64);
  expect(firstSteps(s, true).map(x => x.done)).toEqual([true, true, true, true, true, true]);
});
