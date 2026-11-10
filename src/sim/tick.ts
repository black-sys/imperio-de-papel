import type { ProvinceMap } from '../worldgen/provinces';
import { BUILDINGS, MONTH_SECONDS } from './balance';
import { monthlyIncome } from './economy';
import { logEvent, type GameState } from './state';

const EPS = 1e-9;

/** Avança o tempo real `dtSeconds` na velocidade atual; paga a renda em cada virada de mês atravessada. */
export function tick(s: GameState, pm: ProvinceMap, dtSeconds: number): void {
  let months = (dtSeconds * s.speed) / MONTH_SECONDS;
  while (months > EPS) {
    const toBoundary = Math.floor(s.month + EPS) + 1 - s.month;
    const boundary = months >= toBoundary - EPS;
    const step = boundary ? toBoundary : months;
    advance(s, pm, step);
    s.month = boundary ? Math.round(s.month + step) : s.month + step;
    months -= step;
    if (boundary) {
      const inc = monthlyIncome(s, pm);
      s.res.gold += inc.gold; s.res.wood += inc.wood; s.res.stone += inc.stone;
    }
  }
}

function advance(s: GameState, pm: ProvinceMap, step: number): void {
  s.buildings.forEach((slots, id) => slots.forEach(b => {
    if (!b || b.remaining <= 0) return;
    b.remaining -= step;
    if (b.remaining <= EPS) {
      b.remaining = 0;
      logEvent(s, `${BUILDINGS[b.type].name}${b.level > 1 ? ` nível ${b.level}` : ''} pronta em ${pm.provinces[id].name}`);
    }
  }));
  for (const c of [...s.colonizing]) {
    c.remaining -= step;
    if (c.remaining > EPS) continue;
    s.colonizing.splice(s.colonizing.indexOf(c), 1);
    s.owner[c.province] = 0;
    s.buildings[c.province][0] = { type: 'village', level: 1, remaining: 0 };
    logEvent(s, `Colonização de ${pm.provinces[c.province].name} concluída`);
  }
}
