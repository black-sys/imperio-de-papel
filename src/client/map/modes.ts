import { relation } from '../../sim/diplomacy';
import type { GameState } from '../../sim/state';
import { GOLD, NEUTRAL, REALM_COLORS } from './pick';

export type MapMode = 'political' | 'stability' | 'network' | 'diplomacy' | 'resources';
export const MODES: MapMode[] = ['political', 'stability', 'network', 'diplomacy', 'resources'];
export const MODE_NAME: Record<MapMode, string> = { political: 'Político', stability: 'Estabilidade', network: 'Rede', diplomacy: 'Diplomacia', resources: 'Recursos' };

const RED = '#b3261e', ORANGE = '#c8641e', AMBER = '#c9a227', GREEN = '#4f7a3a';

/** Cor da província no modo (null = sem cor: neutra, alheia na Rede, ou tudo nos Recursos). */
export function provinceFill(s: GameState, id: number, mode: MapMode): string | null {
  const o = s.owner[id];
  if (o === undefined || o < 0) return null;
  switch (mode) {
    case 'political': return REALM_COLORS[o] ?? REALM_COLORS[0];
    case 'stability': { const v = s.stability[id]; return v < 15 ? RED : v < 40 ? ORANGE : v < 60 ? AMBER : GREEN; }
    case 'network': return o !== 0 ? null : s.connected[id] ? GREEN : RED;
    case 'diplomacy': {
      if (!s.nations[0]?.alive) return null;
      if (o === 0) return GOLD;
      const r = relation(s, 0, o);
      return r >= 15 ? GREEN : r > -15 ? NEUTRAL : RED;
    }
    case 'resources': return null;
  }
}

export const MODE_LEGEND: Record<MapMode, [color: string, label: string][]> = {
  political: [],
  stability: [[RED, 'Em revolta'], [ORANGE, 'Tensa'], [AMBER, 'Inquieta'], [GREEN, 'Estável']],
  network: [[GREEN, 'Ligada'], [RED, 'Desligada'], [AMBER, 'Alcance de suprimento']],
  diplomacy: [[GOLD, 'Você'], [GREEN, 'Amistosa/cordial'], [NEUTRAL, 'Neutra'], [RED, 'Fria/hostil']],
  resources: [['#3e2a18', 'Veio livre'], [REALM_COLORS[0], 'Veio explorado']],
};
