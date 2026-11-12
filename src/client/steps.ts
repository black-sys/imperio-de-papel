import { battalionCount } from '../sim/armies';
import type { GameState } from '../sim/state';

/** Roteiro de primeiros passos: cada passo se marca sozinho quando acontece. */
export function firstSteps(s: GameState | null, ledgerSeen: boolean): { text: string; done: boolean }[] {
  const has = !!s && (s.nations[0]?.capital ?? -1) >= 0;
  const mine = (id: number) => !!s && s.owner[id] === 0;
  return [
    { text: 'Funde a capital num selo ♜', done: has },
    { text: 'Explore um veio (fazenda, serraria ou mina) perto da capital', done: !!s && s.veins.some((v, id) => mine(id) && v.some(Boolean)) },
    { text: 'Colonize uma província vizinha', done: !!s && (s.colonizing.some(c => c.nation === 0) || s.owner.filter(o => o === 0).length > 1) },
    { text: 'Ligue a nova cidade à capital por rota (R)', done: !!s && s.routes.some(r => r.owner === 0) },
    { text: 'Erga uma Guarnição e treine um batalhão', done: !!s && has && battalionCount(s) > 0 },
    { text: 'Abra as Contas (barra de cima) para acompanhar a economia', done: ledgerSeen },
  ];
}
