import type { ProvinceMap } from '../worldgen/provinces';
import { BATTLE, BUILDINGS, MONTH_SECONDS, TROOPS } from './balance';
import type { MoveGrid } from './movegrid';
import { spawnTroop, troopStep } from './troops';
import { monthlyIncome } from './economy';
import { logEvent, type GameState } from './state';

const EPS = 1e-9;

/** Avança o tempo real `dtSeconds` na velocidade atual; paga a renda em cada virada de mês atravessada. */
export function tick(s: GameState, pm: ProvinceMap, dtSeconds: number, grid: MoveGrid | null): void {
  let months = (dtSeconds * s.speed) / MONTH_SECONDS;
  // tropas e batalhas em passos fixos: o resultado não depende da velocidade nem da taxa de quadros
  if (grid) for (s.stepAcc += months; s.stepAcc >= BATTLE.step - EPS; s.stepAcc -= BATTLE.step) {
    troopStep(s, pm, grid, BATTLE.step);
    s.clock = Math.round((s.clock + BATTLE.step) * 1e6) / 1e6;
  }
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
      if (s.res.gold < 0) {
        // sem ouro para pagar: a tropa mais cara debanda (empate: a mais nova)
        const t = s.troops.filter(t => t.owner === 0).sort((a, b) => TROOPS[b.type].upkeep - TROOPS[a.type].upkeep || b.id - a.id)[0];
        if (t) { s.troops.splice(s.troops.indexOf(t), 1); logEvent(s, `${TROOPS[t.type].name} dispersos por falta de ouro`); }
      }
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
  for (const r of [...s.recruiting]) {
    r.remaining -= step;
    if (r.remaining > EPS) continue;
    s.recruiting.splice(s.recruiting.indexOf(r), 1);
    const p = pm.provinces[r.province], site = p.sites[r.slot] ?? p.center;
    spawnTroop(s, 0, r.type, site.x, site.y + 4); // ao lado do prédio, não em cima
    logEvent(s, `${TROOPS[r.type].name} treinados em ${p.name}`);
  }
  for (const c of [...s.colonizing]) {
    c.remaining -= step;
    if (c.remaining > EPS) continue;
    s.colonizing.splice(s.colonizing.indexOf(c), 1);
    s.owner[c.province] = 0;
    s.buildings[c.province][0] = { type: 'village', level: 1, remaining: 0 };
    logEvent(s, `Colonização de ${pm.provinces[c.province].name} concluída`);
  }
}
