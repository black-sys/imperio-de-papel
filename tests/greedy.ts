import { BUILDINGS } from '../src/sim/balance';
import { chooseCapital, setSpeed } from '../src/sim/commands';
import { runMonth } from '../src/sim/economy';
import { placeFortresses } from '../src/sim/fortress';
import { makeMoveGrid } from '../src/sim/movegrid';
import { newGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import type { ProvinceMap } from '../src/worldgen/provinces';
import type { WorldMap } from '../src/worldgen/types';

/**
 * O jogador (nação 0) jogado pela IA dos rivais, Expansionista, sozinho no mapa com as fortalezas. Devolve marcos em
 * meses: 1ª colonização, 1º aço produzido, 1ª fortaleza tomada, 20 províncias.
 */
export function greedy(pm: ProvinceMap, maxMonths: number, map: WorldMap) {
  const s = newGame(pm, map.seed), grid = makeMoveGrid(map);
  placeFortresses(s, pm, map.seed);
  chooseCapital(s, pm, pm.suggestedCapitals[0]);
  s.nations[0].ai = true;
  s.nations[0].bent = 'expansionist';
  setSpeed(s, 1);
  let firstColonize = -1, reach20 = -1, firstSteel = -1, firstFortress = -1, taken = 0;
  // joga até medir todos os marcos (ou o limite)
  for (let m = 0; m < maxMonths && (reach20 < 0 || firstSteel < 0 || firstFortress < 0); m++) {
    // a virada deste mês produz aço? (siderúrgica pronta com carvão e ferro no estoque)
    const makesSteel = runMonth(s, pm, false).lines.steel.some(([label, v]) => label === BUILDINGS.steelworks.plural && v > 0);
    const before = s.fortresses.length;
    for (let k = 0; k < 10; k++) {
      tick(s, pm, 1, grid);
      if (firstColonize < 0 && s.colonizing.length) firstColonize = s.month;
    }
    if (firstSteel < 0 && makesSteel) firstSteel = s.month;
    if (s.fortresses.length < before) { taken += before - s.fortresses.length; if (firstFortress < 0) firstFortress = s.month; }
    if (reach20 < 0 && s.owner.filter(o => o === 0).length >= 20) reach20 = s.month;
  }
  return { firstColonize, reach20, firstSteel, firstFortress, taken, state: s };
}
