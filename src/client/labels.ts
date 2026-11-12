import { RES_NAMES, type Res, type TroopType } from '../sim/balance';
import { icon } from './icons';
import type { Vein, VeinKind } from '../worldgen/provinces';

const RES_ORDER: (keyof Res)[] = ['money', 'grain', 'wood', 'coal', 'iron', 'steel', 'arms'];
/** Ícones a tinta (HTML) dos recursos e das tropas. */
export const RES_ICON = Object.fromEntries(RES_ORDER.map(k => [k, icon(k)])) as Record<keyof Res, string>;
export const TROOP_ICON: Record<TroopType, string> = { line: icon('line'), artillery: icon('artillery'), cavalry: icon('cavalry') };
export const VEIN_NAME: Record<VeinKind, string> = { grain: 'Grãos', wood: 'Madeira', coal: 'Carvão', iron: 'Ferro' };
/** Riqueza 0,5–1,5 em algarismos romanos pequenos. */
export const roman = (richness: number) => (richness < 0.85 ? 'ⅰ' : richness < 1.2 ? 'ⅱ' : 'ⅲ');
export const veinLabel = (v: Vein) => `${VEIN_NAME[v.kind]} ${roman(v.richness)}`;
/** Custo: em HTML, ícone + número; em texto (dicas, toasts), "30 dinheiro, 10 madeira · 2 meses". */
export function costText(c: Partial<Res> & { months?: number }, mode: 'html' | 'text' = 'html'): string {
  const keys = RES_ORDER.filter(k => c[k]);
  const parts = mode === 'html' ? keys.map(k => `${RES_ICON[k]}${Math.ceil(c[k]!)}`).join(' ') : keys.map(k => `${Math.ceil(c[k]!)} ${RES_NAMES[k]}`).join(', ');
  return parts + (c.months ? ` · ${+c.months.toFixed(1)} meses` : '');
}
