import { BUILDINGS, CITY, type BuildingType, type TroopType } from '../../sim/balance';
import { cityLevel } from '../../sim/state';
import { roman } from '../labels';
import type { MoveGrid } from '../../sim/movegrid';
import type { GameState } from '../../sim/state';
import { CELL } from '../../worldgen/constants';
import type { ProvinceMap } from '../../worldgen/provinces';
import { CITY_R, FORT_DETAIL, FORT_R, GOLD, LOT_DETAIL, VEIN_DETAIL, INK, NEUTRAL, PAPER, REALM_COLORS, TROOP_H, TROOP_W, cityAt } from './pick';
import { toScreen, type View } from './view';

export const TROOP_ICON: Record<TroopType, string> = { line: '🎖', artillery: '💣', cavalry: '🐎' };
export interface MarkerOpts { selectedTroops: Set<number>; selectedProvince: number; pins: { x: number; y: number }[]; grid: MoveGrid | null }

const color = (owner: number) => (owner >= 0 ? REALM_COLORS[owner] ?? REALM_COLORS[0] : NEUTRAL);
const onScreen = (v: View, px: number, py: number, m = 40) => px > -m && py > -m && px < v.w + m && py < v.h + m;

/** Chave do que os marcadores mostram: igual enquanto nada visível muda (posições ao pixel de tela). */
export function markersKey(s: GameState, pm: ProvinceMap, v: View, o: MarkerOpts): string {
  const parts: (string | number)[] = [v.cx, v.cy, v.scale, v.w, v.h, o.selectedProvince, o.pins.length, s.capital];
  for (const t of s.troops) {
    const [px, py] = toScreen(v, t.x, t.y);
    if (!onScreen(v, px, py)) continue;
    parts.push(`t${t.id}:${Math.round(px)},${Math.round(py)},${Math.ceil(t.soldiers)},${o.selectedTroops.has(t.id) ? 1 : 0},${t.path.length ? 1 : 0}`);
  }
  const code = (b: { type: string; level: number; remaining: number } | null) => (b ? `${b.type.slice(0, 3)}${b.level}${b.remaining > 0 ? 'o' : ''}` : '-');
  s.city.forEach((c, id) => { if (c) parts.push(`c${id}:${c.level}${c.remaining > 0 ? 'o' : ''}${s.owner[id]}`); });
  s.lots.forEach((l, id) => { if (l.some(b => b)) parts.push(`l${id}:${l.map(code).join('')}`); });
  s.veins.forEach((l, id) => { if (l.some(b => b)) parts.push(`v${id}:${l.map(code).join('')}`); });
  for (const c of s.colonizing) parts.push(`c${c.province}:${Math.ceil(c.remaining)}`);
  if (v.scale >= FORT_DETAIL) for (const f of s.fortresses) parts.push(`f${f.province}:${s.troops.filter(t => t.home === f.province).length}`);
  for (const b of s.battles) parts.push(`w${Math.round(b.x)},${Math.round(b.y)}:${b.sides.map(x => Math.round(x.morale * 20)).join('/')}`);
  return parts.join('|');
}

/** Ícone gravado a tinta de um prédio ou veio, centrado em (x, y) na tela. */
function icon(ctx: CanvasRenderingContext2D, kind: BuildingType | 'grain' | 'wood' | 'coal' | 'iron', x: number, y: number): void {
  ctx.beginPath();
  if (kind === 'farm' || kind === 'grain') { for (const d of [-4, 0, 4]) { ctx.moveTo(x + d, y + 6); ctx.lineTo(x + d * 0.4, y - 6); } } // feixe de trigo
  else if (kind === 'sawmill' || kind === 'wood') { ctx.moveTo(x, y + 7); ctx.lineTo(x, y - 7); ctx.moveTo(x - 6, y); ctx.lineTo(x, y - 7); ctx.lineTo(x + 6, y); } // árvore
  else if (kind === 'coal_mine' || kind === 'iron_mine' || kind === 'coal' || kind === 'iron') { ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); } // picaretas
  else if (kind === 'steelworks') { ctx.rect(x - 7, y - 1, 14, 7); ctx.rect(x + 2, y - 9, 3, 8); } // chaminé
  else if (kind === 'arms_factory') { ctx.moveTo(x - 7, y + 4); ctx.lineTo(x + 7, y - 4); ctx.moveTo(x - 7, y + 4); ctx.lineTo(x - 4, y + 6); } // mosquete
  else if (kind === 'market') { ctx.rect(x - 6, y - 2, 12, 8); ctx.moveTo(x - 7, y - 2); ctx.lineTo(x, y - 8); ctx.lineTo(x + 7, y - 2); } // toldo
  else if (kind === 'garrison') { ctx.rect(x - 6, y - 6, 12, 12); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x - 6, y - 9); ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 9); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x + 6, y - 9); } // torre
  ctx.stroke();
}
const VEIN_INK: Record<string, string> = { grain: '#8a6a10', wood: '#3f5a2a', coal: '#2a2420', iron: '#5a5f66' };

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 11, style = 'bold'): void {
  ctx.font = `${style} ${size}px Georgia, 'Times New Roman', serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(243,231,201,0.85)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = INK; ctx.fillText(text, x, y);
}

/** Desenha todos os marcadores do jogo em tamanho fixo de tela. Pula o que está fora. */
export function drawMarkers(ctx: CanvasRenderingContext2D, s: GameState, pm: ProvinceMap, v: View, o: MarkerOpts): void {
  const P = (x: number, y: number) => toScreen(v, x, y);
  ctx.save();
  // rotas das selecionadas
  if (o.grid) {
    const S = o.grid.size;
    ctx.strokeStyle = 'rgba(62,42,24,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    for (const t of s.troops) {
      if (!o.selectedTroops.has(t.id) || !t.path.length) continue;
      ctx.beginPath(); ctx.moveTo(...P(t.x, t.y));
      t.path.forEach((c, i) => { if (i % 4 === 3 || i === t.path.length - 1) ctx.lineTo(...P((c % S) * CELL + CELL / 2, Math.floor(c / S) * CELL + CELL / 2)); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // veios (de qualquer província) e lotes (das suas cidades, de perto)
  if (v.scale >= VEIN_DETAIL) for (const p of pm.provinces) p.veins.forEach((vein, i) => {
    const [x, y] = P(vein.x, vein.y);
    if (!onScreen(v, x, y)) return;
    const b = s.veins[p.id][i];
    ctx.lineWidth = 1.6;
    if (b && s.owner[p.id] >= 0) { ctx.fillStyle = color(s.owner[p.id]); ctx.globalAlpha = b.remaining > 0 ? 0.35 : 0.8; ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    else { ctx.strokeStyle = INK; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = b ? PAPER : VEIN_INK[vein.kind]; ctx.lineWidth = 2;
    icon(ctx, vein.kind, x, y);
    if (v.scale >= 0.7) label(ctx, roman(vein.richness), x + 12, y - 9, 10);
  });
  if (v.scale >= LOT_DETAIL) s.lots.forEach((lots, id) => {
    if (s.owner[id] !== 0 || !s.city[id]) return;
    const open = CITY.lots[cityLevel(s, id)];
    lots.forEach((b, lot) => {
      const spot = pm.provinces[id].lots[lot], [x, y] = P(spot.x, spot.y);
      if (!onScreen(v, x, y)) return;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
      if (!b) {
        ctx.globalAlpha = lot < open ? 1 : 0.35; ctx.setLineDash([3, 3]); ctx.strokeRect(x - 8, y - 8, 16, 16); ctx.setLineDash([]);
        if (lot >= open) { ctx.strokeRect(x - 3, y - 1, 6, 5); ctx.beginPath(); ctx.arc(x, y - 2, 2.5, Math.PI, 0); ctx.stroke(); } // cadeado
        ctx.globalAlpha = 1;
        return;
      }
      ctx.setLineDash(b.remaining > 0 ? [3, 3] : []); ctx.lineWidth = 2;
      icon(ctx, b.type, x, y);
      ctx.setLineDash([]);
      if (v.scale >= 2) label(ctx, BUILDINGS[b.type].name, x, y + 15, 9, 'italic');
    });
  });
  for (let id = 0; id < s.owner.length; id++) {
    if (s.owner[id] < 0) continue;
    const c = cityAt(s, pm, id);
    if (!c) continue;
    const [x, y] = P(c.x, c.y);
    if (!onScreen(v, x, y)) continue;
    const level = cityLevel(s, id), r = CITY_R - 2 + level;
    ctx.fillStyle = color(s.owner[id]); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.setLineDash(s.city[id]!.remaining > 0 ? [4, 2] : []);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    if (s.capital === id) { ctx.strokeStyle = PAPER; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r - 3, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = PAPER;
    for (let i = 0; i < level; i++) { ctx.beginPath(); ctx.arc(x - (level - 1) * 3.5 + i * 7, y, 2.3, 0, Math.PI * 2); ctx.fill(); }
  }
  // colonizações
  for (const col of s.colonizing) {
    const site = pm.provinces[col.province].city;
    const [x, y] = P(site.x, site.y);
    if (!onScreen(v, x, y)) continue;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.lineTo(x, y - 12); ctx.stroke();
    ctx.fillStyle = REALM_COLORS[0]; ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 12, y - 8); ctx.lineTo(x, y - 4); ctx.fill();
    label(ctx, `${Math.ceil(col.remaining)} m`, x, y + 16, 10);
  }
  // fortalezas (somem no continente inteiro, como os prédios: poluiriam o mapa)
  if (v.scale >= FORT_DETAIL) for (const f of s.fortresses) {
    const site = pm.provinces[f.province].city;
    const [x, y] = P(site.x, site.y);
    if (!onScreen(v, x, y)) continue;
    ctx.fillStyle = NEUTRAL; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; ctx.lineTo(x + Math.cos(a) * FORT_R, y + Math.sin(a) * FORT_R); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAPER; ctx.font = 'bold 11px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(s.troops.filter(t => t.home === f.province).length), x, y + 1);
  }
  // tropas (as da fortaleza ficam dentro do pentágono: não são desenhadas uma a uma)
  for (const t of s.troops) {
    if (t.owner === -1) continue;
    const [x, y] = P(t.x, t.y);
    if (!onScreen(v, x, y)) continue;
    const w = TROOP_W, h = TROOP_H;
    ctx.fillStyle = color(t.owner); ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.fillRect(x - w / 2, y - h / 2, w, h); ctx.strokeRect(x - w / 2, y - h / 2, w, h);
    ctx.strokeStyle = PAPER; ctx.fillStyle = PAPER; ctx.beginPath();
    if (t.type === 'line') { ctx.moveTo(x - w / 2, y - h / 2); ctx.lineTo(x + w / 2, y + h / 2); ctx.moveTo(x + w / 2, y - h / 2); ctx.lineTo(x - w / 2, y + h / 2); ctx.stroke(); }
    else if (t.type === 'cavalry') { ctx.moveTo(x - w / 2, y + h / 2); ctx.lineTo(x + w / 2, y - h / 2); ctx.stroke(); }
    else { ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    if (o.selectedTroops.has(t.id)) { ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.strokeRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8); }
    label(ctx, String(Math.ceil(t.soldiers)), x, y + h / 2 + 9);
  }
  // batalhas
  for (const b of s.battles) {
    const [x, y] = P(b.x, b.y);
    if (!onScreen(v, x, y)) continue;
    ctx.font = 'bold 22px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#7a1d14';
    ctx.fillText('⚔', x, y - 26);
    b.sides.forEach((side, i) => {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 20, y - 12 + i * 6, 40, 4);
      ctx.fillStyle = color(side.owner); ctx.fillRect(x - 20, y - 12 + i * 6, 40 * side.morale, 4);
    });
  }
  // selos das capitais sugeridas (tela inicial)
  for (const p of o.pins) {
    const [x, y] = P(p.x, p.y);
    ctx.fillStyle = '#8a2a20'; ctx.strokeStyle = PAPER; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAPER; ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('♜', x, y + 1);
  }
  ctx.restore();
}
