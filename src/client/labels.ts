import type { Res } from '../sim/balance';
import type { Vein, VeinKind } from '../worldgen/provinces';

export const RES_ICON: Record<keyof Res, string> = { money: '🪙', grain: '🌾', wood: '🪵', coal: '⚫', iron: '⛓', steel: '🔩', arms: '🔫' };
export const VEIN_NAME: Record<VeinKind, string> = { grain: 'Grãos', wood: 'Madeira', coal: 'Carvão', iron: 'Ferro' };
/** Riqueza 0,5–1,5 em algarismos romanos pequenos. */
export const roman = (richness: number) => (richness < 0.85 ? 'ⅰ' : richness < 1.2 ? 'ⅱ' : 'ⅲ');
export const veinLabel = (v: Vein) => `${VEIN_NAME[v.kind]} ${roman(v.richness)}`;
/** Custo como "🪙30 🌾10 · 2 meses". */
export function costText(c: Partial<Res> & { months?: number }): string {
  const parts = (Object.keys(RES_ICON) as (keyof Res)[]).filter(k => c[k]).map(k => `${RES_ICON[k]}${Math.ceil(c[k]!)}`);
  return parts.join(' ') + (c.months ? ` · ${+c.months.toFixed(1)} meses` : '');
}
