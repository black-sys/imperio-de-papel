import type { Res, TroopType } from '../sim/balance';

export type IconName = keyof Res | TroopType | 'gear' | 'flame' | 'supply' | 'cut' | 'battle' | 'capital' | 'ledger' |
  'journal' | 'letter' | 'laws' | 'nations' | 'dove' | 'scales' | 'handshake' | 'hammer' | 'hourglass' | 'chain' |
  'warning' | 'lock' | 'link' | 'flag' | 'pen' | 'map' | 'pause';

/** Ícones gravados a tinta: caminho SVG num quadro 16×16, só traço (o mesmo desenho no HTML e no canvas). */
export const ICON_PATHS: Record<IconName, string> = {
  money: 'M14 8a6 6 0 1 1-12 0a6 6 0 1 1 12 0M11 8a3 3 0 1 1-6 0a3 3 0 1 1 6 0',
  grain: 'M8 15V3M5 15L6.5 4M11 15L9.5 4M8 3L6.5 5M8 3l1.5 2M8 6.5L6.5 8M8 6.5l1.5 1.5',
  wood: 'M8 15V2M3 9l5-7 5 7M4.5 12.5L8 7l3.5 5.5',
  coal: 'M3 11l2-6 5-2 4 4-1 6-6 1zM5 5l3 4 6-2M8 9l-1 5',
  iron: 'M2 12h12l-2-5H4zM4 7l1-2h6l1 2',
  steel: 'M3 3h10M3 13h10M8 3v10M5 3v1.5M11 3v1.5M5 13v-1.5M11 13v-1.5',
  arms: 'M2 12L14 4M2 12l1 2.5M5 10l1.5 1.5M11 6l1 1.5',
  line: 'M2 4h12v8H2zM2 4l12 8M14 4L2 12',
  cavalry: 'M2 4h12v8H2zM2 12L14 4',
  artillery: 'M2 4h12v8H2zM9.5 8a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0',
  gear: 'M10.5 8a2.5 2.5 0 1 1-5 0a2.5 2.5 0 1 1 5 0M8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5M3.4 3.4l1.8 1.8M10.8 10.8l1.8 1.8M3.4 12.6l1.8-1.8M10.8 5.2l1.8-1.8',
  flame: 'M8 15c-3 0-4.5-2-4.5-4.5C3.5 7 7 6 6.5 1.5 9 3 12.5 6 12.5 10.5 12.5 13 11 15 8 15zM8 15c-1.2 0-2-1-2-2.2C6 11 8 10.5 8 8.5c1.5 1.2 2 2.5 2 4.3 0 1.2-.8 2.2-2 2.2z',
  supply: 'M4 2h8c1 2 1 10 0 12H4C3 12 3 4 4 2zM3.5 5.5h9M3.5 10.5h9',
  cut: 'M3 3l10 10M13 3L3 13',
  battle: 'M2.5 2.5l10 10M13.5 2.5l-10 10M10 13.5l3.5-3.5M6 13.5L2.5 10',
  capital: 'M4 14V6h8v8zM4 6V3h2v2h1V3h2v2h1V3h2v3M7 14v-3h2v3',
  ledger: 'M3 2.5h8.5A1.5 1.5 0 0 1 13 4v10H4.5A1.5 1.5 0 0 1 3 12.5zM3 12.5A1.5 1.5 0 0 1 4.5 11H13M6 5.5h4M6 8h4',
  journal: 'M2 3h10v10H3a1 1 0 0 1-1-1zM12 6h2v6a1 1 0 0 1-2 0M4 5.5h6M4 8h6M4 10.5h4',
  letter: 'M1.5 4h13v8.5h-13zM1.5 4L8 9l6.5-5',
  laws: 'M4 2h8v10a2 2 0 0 1-2 2H3a1.5 1.5 0 0 1 0-3h1zM6 5h4M6 7.5h4M6 10h2',
  nations: 'M3.5 15V1.5M3.5 2.5h9l-2 3 2 3h-9',
  dove: 'M2 9c2 0 3-1 4.5-3S10 2.5 12 3c-1 .5-1.5 1.5-1.5 2.5 2 0 3 1 3.5 2-2 0-3 1-3.5 2.5C9.5 12 7 13 4 12.5L2 14l1-3.5C2.5 10 2 9.5 2 9z',
  scales: 'M8 2v12M5 14h6M3 4h10M3 4L1 9h4zM13 4l-2 5h4z',
  handshake: 'M1 6l3-2 4 2 4-2 3 2M1 6v4l3 1M15 6v4l-3 1M4 11l2.5 2a1 1 0 0 0 1.5-1.5M6 9l3 3a1 1 0 0 0 1.5-1.5L7.5 7.5',
  hammer: 'M2 14l7.5-7.5M7 4l2.5-2.5 5 5L12 9z',
  hourglass: 'M3.5 1.5h9M3.5 14.5h9M4.5 1.5c0 4 7 4 7 6.5s-7 2.5-7 6.5M11.5 1.5c0 4-7 4-7 6.5s7 2.5 7 6.5',
  chain: 'M6.5 9.5l-2 2a2.1 2.1 0 0 1-3-3l2-2M9.5 6.5l2-2a2.1 2.1 0 0 1 3 3l-2 2M5 2.5l1 2M2.5 5l2 1M11 13.5l-1-2M13.5 11l-2-1',
  warning: 'M8 1.5L15 14H1zM8 6v4M8 12v.5',
  lock: 'M3.5 7h9v7h-9zM5.5 7V5a2.5 2.5 0 0 1 5 0v2',
  link: 'M7 9a2.5 2.5 0 0 0 3.5 0l2.5-2.5a2.5 2.5 0 0 0-3.5-3.5L8.5 4M9 7a2.5 2.5 0 0 0-3.5 0L3 9.5A2.5 2.5 0 0 0 6.5 13l1-1',
  flag: 'M4 15V2M4 2.5c3-1.5 5 1.5 8 0v6c-3 1.5-5-1.5-8 0',
  pen: 'M11 2l3 3-8.5 8.5L2 14l.5-3.5zM9.5 3.5l3 3',
  map: 'M1.5 3.5l4-1.5 5 2 4-1.5v10l-4 1.5-5-2-4 1.5zM5.5 2v10M10.5 4v10',
  pause: 'M5.5 3v10M10.5 3v10',
};

/** Ícone como SVG inline (HTML): herda a cor do texto. Nunca em dica, toast ou `title` (lá vai texto puro). */
export const icon = (name: IconName): string =>
  `<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="${ICON_PATHS[name]}"/></svg>`;

const paths = new Map<IconName, Path2D>();
/** O mesmo ícone no canvas, centrado em (x, y), com `size` px de lado. */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, x: number, y: number, size: number, color: string): void {
  let p = paths.get(name);
  if (!p) paths.set(name, p = new Path2D(ICON_PATHS[name]));
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(size / 16, size / 16);
  ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(243,231,201,0.9)'; ctx.lineWidth = 4; ctx.stroke(p); // halo de papel: legível sobre o mapa
  ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.stroke(p);
  ctx.restore();
}
