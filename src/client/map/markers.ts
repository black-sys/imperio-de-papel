import { ARMY, BUILDINGS, CITY, MAX_LEVEL, QUOTA, type BuildingType, type TroopType } from '../../sim/balance';
import { activeLevel, cityLevel, playerCapital, type Building } from '../../sim/state';
import { occupyMonths } from '../../sim/conquest';
import { afford } from '../../sim/commands';
import { buildCost } from '../../sim/economy';
import { roman } from '../labels';
import type { MoveGrid } from '../../sim/movegrid';
import type { GameState } from '../../sim/state';
import { CELL } from '../../worldgen/constants';
import type { ProvinceMap } from '../../worldgen/provinces';
import { FORT_DETAIL, FORT_R, GOLD, LOT_DETAIL, VEIN_DETAIL, INK, NEUTRAL, PAPER, REALM_COLORS, TROOP_H, TROOP_W, cityAt, cityRadius, lotOnScreen, lotScale, markerScale, veinVisible } from './pick';
import { toScreen, type View } from './view';

export const TROOP_ICON: Record<TroopType, string> = { line: '🎖', artillery: '💣', cavalry: '🐎' };
export interface MarkerOpts {
  selectedArmies: Set<number>; selectedProvince: number; pins: { x: number; y: number }[]; grid: MoveGrid | null;
  preview?: { path: number[]; ok: boolean } | null; // prévia da rota sendo traçada
}

const CUT = '#b3261e', SUPPLY_INK = '#c9a227';
const color = (owner: number) => (owner >= 0 ? REALM_COLORS[owner] ?? REALM_COLORS[0] : NEUTRAL);
const REBEL = '#1d1a17';
const armyColor = (t: { owner: number; home: number }) => (t.owner === -1 && t.home < 0 ? REBEL : color(t.owner));
/** Contorno da cidade pela estabilidade (nada quando estável). */
const unrestInk = (v: number) => (v < 15 ? '#b3261e' : v < 40 ? '#c8641e' : v < 60 ? '#c9a227' : null);
const onScreen = (v: View, px: number, py: number, m = 40) => px > -m && py > -m && px < v.w + m && py < v.h + m;

/**
 * O que da nação 0 pode ser melhorado agora: as regras de `checkUpgrade`/`checkUpgradeCity` (o botão "Melhorar"),
 * com as cotas contadas uma vez (roda a cada quadro). `c:<id>`, `l:<id>:<lot>`, `v:<id>:<veio>`.
 */
export function upgradeable(s: GameState, _pm: ProvinceMap): Set<string> {
  const out = new Set<string>(), have = new Map<string, number>(); // `<tipo>:<nível>` → prédios ativos nesse nível ou acima
  let towns2 = 0;
  const each = (f: (b: Building, id: number, place: string) => void) => s.owner.forEach((o, id) => {
    if (o !== 0) return;
    s.lots[id].forEach((b, lot) => b && f(b, id, `l:${id}:${lot}`));
    s.veins[id].forEach((b, vein) => b && f(b, id, `v:${id}:${vein}`));
  });
  each(b => { for (let l = 1; l <= activeLevel(b); l++) have.set(`${b.type}:${l}`, (have.get(`${b.type}:${l}`) ?? 0) + 1); });
  s.owner.forEach((o, id) => { if (o === 0 && cityLevel(s, id) >= 2) towns2++; });
  each((b, _id, key) => {
    if (b.remaining > 0 || b.level >= MAX_LEVEL || (have.get(`${b.type}:${b.level}`) ?? 0) < QUOTA) return;
    if (afford(s, buildCost(b.type, b.level + 1)).ok) out.add(key);
  });
  s.owner.forEach((o, id) => {
    const c = s.city[id];
    if (o !== 0 || !c || c.remaining > 0 || c.level >= MAX_LEVEL || (c.level + 1 === 3 && towns2 < QUOTA)) return;
    if (afford(s, CITY.cost[c.level + 1]).ok) out.add(`c:${id}`);
  });
  return out;
}

/** Setinha verde ▲ de "dá para melhorar", no canto superior direito de um marcador de raio `r`. */
function upArrow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  const ax = x + r * 0.75, ay = y - r * 0.75, h = 6 + r * 0.15;
  ctx.fillStyle = '#3f8a2e'; ctx.strokeStyle = PAPER; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(ax, ay - h); ctx.lineTo(ax + h, ay + h * 0.6); ctx.lineTo(ax - h, ay + h * 0.6); ctx.closePath(); ctx.fill(); ctx.stroke();
}

/** Chave do que os marcadores mostram: igual enquanto nada visível muda (posições ao pixel de tela). */
export function markersKey(s: GameState, pm: ProvinceMap, v: View, o: MarkerOpts): string {
  const parts: (string | number)[] = [v.cx, v.cy, v.scale, v.w, v.h, o.selectedProvince, o.pins.length, playerCapital(s)];
  const open = v.scale >= ARMY.openScale;
  if (open) parts.push('open');
  for (const t of s.armies) {
    const [px, py] = toScreen(v, t.x, t.y);
    if (!onScreen(v, px, py)) continue;
    parts.push(`t${t.id}:${t.owner}:${Math.round(px)},${Math.round(py)},${t.battalions.map(b => `${b.type[0]}${Math.ceil(b.soldiers)}`).join('')},${o.selectedArmies.has(t.id) ? 1 : 0},${t.path.length ? 1 : 0}`);
  }
  const code = (b: { type: string; level: number; remaining: number } | null) => (b ? `${b.type.slice(0, 3)}${b.level}${b.remaining > 0 ? 'o' : ''}` : '-');
  s.city.forEach((c, id) => { if (c) parts.push(`c${id}:${c.level}${c.remaining > 0 ? 'o' : ''}${s.owner[id]}`); });
  s.lots.forEach((l, id) => { if (l.some(b => b)) parts.push(`l${id}:${l.map(code).join('')}`); });
  s.veins.forEach((l, id) => { if (l.some(b => b)) parts.push(`v${id}:${l.map(code).join('')}`); });
  for (const c of s.colonizing) parts.push(`c${c.province}:${c.nation}:${Math.ceil(c.remaining)}`);
  for (const e of s.occupations) parts.push(`q${e.province}:${e.nation}:${Math.floor(e.progress * 10 + 1e-9)}`);
  parts.push(`o${s.owner.join(',')}`);
  // faixas de estabilidade (só o que muda o contorno), greves e revoltas
  parts.push(`u${s.stability.map(v => (v < 15 ? 3 : v < 40 ? 2 : v < 60 ? 1 : 0)).join('')}`, `g${s.strikes.map(k => k.province).join(',')}`, `v${s.revolts.map(k => k.province).join(',')}`);
  if (v.scale >= FORT_DETAIL) for (const f of s.fortresses) parts.push(`f${f.province}:${s.armies.find(t => t.home === f.province)?.battalions.length ?? 0}`);
  for (const b of s.battles) parts.push(`w${Math.round(b.x)},${Math.round(b.y)}:${b.sides.map(x => Math.round(x.morale * 20)).join('/')}`);
  for (const r of s.routes) parts.push(`r${r.id}:${r.remaining > 0 ? 'o' : ''}${r.cut ? 'x' : ''}`);
  parts.push(`k${s.connected.map(c => (c ? 1 : 0)).join('')}`);
  for (const t of s.armies) if (t.owner === 0) parts.push(`s${t.id}:${t.supplied ? 1 : 0}${t.supply ? `${t.supply.path.length},${t.supply.path.at(-1)},${t.supply.cut ? 1 : 0}` : ''}`);
  parts.push(`a${[...upgradeable(s, pm)].join(',')}`);
  if (o.preview) parts.push(`p${o.preview.path.length},${o.preview.path.at(-1)},${o.preview.ok ? 1 : 0}`);
  return parts.join('|');
}

/** Ícone gravado a tinta de um prédio ou veio, centrado em (x, y) na tela. */
function icon(ctx: CanvasRenderingContext2D, kind: BuildingType | 'grain' | 'wood' | 'coal' | 'iron', cx: number, cy: number, k = 1): void {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(k, k); ctx.lineWidth /= k;
  const x = 0, y = 0;
  ctx.beginPath();
  if (kind === 'farm' || kind === 'grain') { for (const d of [-4, 0, 4]) { ctx.moveTo(x + d, y + 6); ctx.lineTo(x + d * 0.4, y - 6); } } // feixe de trigo
  else if (kind === 'sawmill' || kind === 'wood') { ctx.moveTo(x, y + 7); ctx.lineTo(x, y - 7); ctx.moveTo(x - 6, y); ctx.lineTo(x, y - 7); ctx.lineTo(x + 6, y); } // árvore
  else if (kind === 'coal_mine' || kind === 'iron_mine' || kind === 'coal' || kind === 'iron') { ctx.moveTo(x - 6, y - 6); ctx.lineTo(x + 6, y + 6); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x - 6, y + 6); } // picaretas
  else if (kind === 'steelworks') { ctx.rect(x - 7, y - 1, 14, 7); ctx.rect(x + 2, y - 9, 3, 8); } // chaminé
  else if (kind === 'arms_factory') { ctx.moveTo(x - 7, y + 4); ctx.lineTo(x + 7, y - 4); ctx.moveTo(x - 7, y + 4); ctx.lineTo(x - 4, y + 6); } // mosquete
  else if (kind === 'market') { ctx.rect(x - 6, y - 2, 12, 8); ctx.moveTo(x - 7, y - 2); ctx.lineTo(x, y - 8); ctx.lineTo(x + 7, y - 2); } // toldo
  else if (kind === 'garrison') { ctx.rect(x - 6, y - 6, 12, 12); ctx.moveTo(x - 6, y - 6); ctx.lineTo(x - 6, y - 9); ctx.moveTo(x, y - 6); ctx.lineTo(x, y - 9); ctx.moveTo(x + 6, y - 6); ctx.lineTo(x + 6, y - 9); } // torre
  ctx.stroke();
  ctx.restore();
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
  // rotas entre cidades (como rotas náuticas), ligações veio→cidade, linhas de suprimento e prévia
  if (o.grid) drawNetwork(ctx, s, pm, v, o.grid, o.preview ?? null);
  // rotas das selecionadas
  if (o.grid) {
    const S = o.grid.size;
    ctx.strokeStyle = 'rgba(62,42,24,0.8)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    for (const t of s.armies) {
      if (!o.selectedArmies.has(t.id) || !t.path.length) continue;
      ctx.beginPath(); ctx.moveTo(...P(t.x, t.y));
      t.path.forEach((c, i) => { if (i % 4 === 3 || i === t.path.length - 1) ctx.lineTo(...P((c % S) * CELL + CELL / 2, Math.floor(c / S) * CELL + CELL / 2)); });
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // veios (de qualquer província) e lotes (das suas cidades, de perto)
  const k = markerScale(v.scale), kl = lotScale(v.scale), up = upgradeable(s, pm);
  for (const p of pm.provinces) p.veins.forEach((vein, i) => {
    if (!veinVisible(s, p.id, i, v.scale)) return;
    const [x, y] = P(vein.x, vein.y);
    if (!onScreen(v, x, y)) return;
    const b = s.veins[p.id][i];
    ctx.lineWidth = 1.6;
    if (b && s.owner[p.id] >= 0) { ctx.fillStyle = color(s.owner[p.id]); ctx.globalAlpha = b.remaining > 0 ? 0.35 : 0.8; ctx.beginPath(); ctx.arc(x, y, 10 * k, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }
    else { ctx.strokeStyle = INK; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, 10 * k, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
    ctx.strokeStyle = b ? PAPER : VEIN_INK[vein.kind]; ctx.lineWidth = 2;
    icon(ctx, vein.kind, x, y, k);
    if (up.has(`v:${p.id}:${i}`)) upArrow(ctx, x, y, 10 * k);
    if (v.scale >= VEIN_DETAIL) label(ctx, roman(vein.richness), x + 12 * k, y - 9 * k, Math.round(10 * Math.sqrt(k)));
  });
  if (v.scale >= LOT_DETAIL) s.lots.forEach((lots, id) => {
    if (s.owner[id] !== 0 || !s.city[id]) return;
    const open = CITY.lots[cityLevel(s, id)];
    lots.forEach((b, lot) => {
      const [x, y] = lotOnScreen(s, pm, v, id, lot);
      if (!onScreen(v, x, y)) return;
      ctx.strokeStyle = INK; ctx.lineWidth = 1.4;
      if (!b) {
        ctx.globalAlpha = lot < open ? 1 : 0.35; ctx.setLineDash([3, 3]); ctx.strokeRect(x - 8 * kl, y - 8 * kl, 16 * kl, 16 * kl); ctx.setLineDash([]);
        if (lot >= open) { ctx.strokeRect(x - 3 * kl, y - kl, 6 * kl, 5 * kl); ctx.beginPath(); ctx.arc(x, y - 2 * kl, 2.5 * kl, Math.PI, 0); ctx.stroke(); } // cadeado
        ctx.globalAlpha = 1;
        return;
      }
      ctx.setLineDash(b.remaining > 0 ? [3, 3] : []); ctx.lineWidth = 2;
      icon(ctx, b.type, x, y, kl);
      ctx.setLineDash([]);
      if (up.has(`l:${id}:${lot}`)) upArrow(ctx, x, y, 10 * kl);
      if (v.scale >= 2) label(ctx, BUILDINGS[b.type].name, x, y + 15 * kl, Math.round(9 * Math.sqrt(kl)), 'italic');
    });
  });
  for (let id = 0; id < s.owner.length; id++) {
    if (s.owner[id] < 0) continue;
    const c = cityAt(s, pm, id);
    if (!c) continue;
    const [x, y] = P(c.x, c.y);
    if (!onScreen(v, x, y)) continue;
    const level = cityLevel(s, id), r = cityRadius(level, v.scale), capital = s.nations.some(n => n.alive && n.capital === id);
    if (capital) { ctx.fillStyle = GOLD; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r + 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); } // aro dourado: capital de longe
    ctx.fillStyle = color(s.owner[id]); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.setLineDash(s.city[id]!.remaining > 0 ? [4, 2] : []);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
    const ink = unrestInk(s.stability[id]);
    if (ink) { ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.stroke(); }
    if (s.strikes.some(k => k.province === id)) label(ctx, '⚙', x - r - 6, y - r - 2, 12);
    if (s.revolts.some(k => k.province === id)) label(ctx, '🔥', x + r + 6, y + r + 2, 13);
    if (capital) { ctx.strokeStyle = PAPER; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r - 3, 0, Math.PI * 2); ctx.stroke(); }
    if (s.owner[id] === 0 && !s.connected[id]) { // desligada da capital: aro tracejado vermelho e ✕
      ctx.strokeStyle = CUT; ctx.lineWidth = 2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      label(ctx, '✕', x + r + 4, y - r - 2, 10);
    }
    if (up.has(`c:${id}`)) upArrow(ctx, x, y, r);
    ctx.fillStyle = PAPER;
    const g = r / 13; // pontos do nível acompanham o tamanho
    for (let i = 0; i < level; i++) { ctx.beginPath(); ctx.arc(x + (i - (level - 1) / 2) * 7 * g, y, 2.3 * g, 0, Math.PI * 2); ctx.fill(); }
  }
  // colonizações
  for (const col of s.colonizing) {
    const site = pm.provinces[col.province].city;
    const [x, y] = P(site.x, site.y);
    if (!onScreen(v, x, y)) continue;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5 * k; ctx.beginPath(); ctx.moveTo(x, y + 8 * k); ctx.lineTo(x, y - 12 * k); ctx.stroke();
    ctx.fillStyle = color(col.nation); ctx.beginPath(); ctx.moveTo(x, y - 12 * k); ctx.lineTo(x + 12 * k, y - 8 * k); ctx.lineTo(x, y - 4 * k); ctx.fill();
    label(ctx, `${Math.ceil(col.remaining)} m`, x, y + 16 * k, 10);
  }
  // ocupações: barra sob a cidade na cor do ocupante
  for (const e of s.occupations) {
    const site = pm.provinces[e.province].city, [x, y] = P(site.x, site.y);
    if (!onScreen(v, x, y)) continue;
    const by = y + cityRadius(cityLevel(s, e.province), v.scale) + 6;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 18, by, 36, 5);
    ctx.fillStyle = color(e.nation); ctx.fillRect(x - 18, by, 36 * Math.min(1, e.progress / occupyMonths(s, e.province)), 5);
    ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(x - 18, by, 36, 5);
  }
  // fortalezas (somem no continente inteiro, como os prédios: poluiriam o mapa)
  if (v.scale >= FORT_DETAIL) for (const f of s.fortresses) {
    const site = pm.provinces[f.province].city;
    const [x, y] = P(site.x, site.y);
    if (!onScreen(v, x, y)) continue;
    ctx.fillStyle = NEUTRAL; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5; ctx.lineTo(x + Math.cos(a) * FORT_R * k, y + Math.sin(a) * FORT_R * k); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PAPER; ctx.font = `bold ${Math.round(11 * k)}px Georgia, serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(s.armies.find(t => t.home === f.province)?.battalions.length ?? 0), x, y + 1);
  }
  // exércitos (as guarnições de fortaleza ficam dentro do pentágono): de longe uma peça; de perto, as fichas dos batalhões
  for (const t of s.armies) {
    if (t.owner === -1 && t.home >= 0) continue; // guarnição de fortaleza: fica dentro do pentágono (rebeldes aparecem)
    const [x, y] = P(t.x, t.y);
    if (!onScreen(v, x, y, 80)) continue;
    const w = TROOP_W, h = TROOP_H, total = Math.ceil(t.battalions.reduce((n, b) => n + b.soldiers, 0));
    if (v.scale >= ARMY.openScale) {
      // fichas em formação ao redor do estandarte: infantaria à frente, cavalaria nos flancos, artilharia atrás
      const spots = formation(t.battalions.map(b => b.type));
      t.battalions.forEach((b, i) => chip(ctx, b.type, Math.ceil(b.soldiers), armyColor(t), x + spots[i][0], y + spots[i][1]));
      ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y + 6); ctx.lineTo(x, y - 14); ctx.stroke(); // estandarte
      ctx.fillStyle = armyColor(t); ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 10, y - 10); ctx.lineTo(x, y - 6); ctx.fill();
      if (o.selectedArmies.has(t.id)) { ctx.strokeStyle = GOLD; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 40, 0, Math.PI * 2); ctx.stroke(); }
      label(ctx, `${t.name} · ${total}`, x, y + 48, 10);
    } else {
      piece(ctx, mainType(t.battalions.map(b => b.type)), armyColor(t), x, y, w, h);
      if (o.selectedArmies.has(t.id)) { ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.strokeRect(x - w / 2 - 4, y - h / 2 - 4, w + 8, h + 8); }
      label(ctx, `${total} · ${t.battalions.length}`, x, y + h / 2 + 9);
    }
    if (t.owner === 0 && !t.supplied) { ctx.fillStyle = CUT; ctx.fillRect(x - 10, y + h / 2 + 15, 20, 3); } // sem suprimento
    if (t.owner === 0 && t.supply && !t.supply.cut) label(ctx, '⛽', x + w / 2 + 7, y - h / 2, 10);
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

/** Pontos de tela do caminho de células (um a cada `every`, mais o último). */
function pathPoints(path: number[], grid: MoveGrid, v: View, every: number, from?: { x: number; y: number }): [number, number][] {
  const S = grid.size, pts: [number, number][] = from ? [toScreen(v, from.x, from.y)] : [];
  path.forEach((c, i) => { if (i % every === every - 1 || i === path.length - 1) pts.push(toScreen(v, (c % S) * CELL + CELL / 2, Math.floor(c / S) * CELL + CELL / 2)); });
  return pts;
}
function stroke(ctx: CanvasRenderingContext2D, pts: [number, number][]): void {
  if (pts.length < 2) return;
  ctx.beginPath(); ctx.moveTo(...pts[0]);
  for (const p of pts.slice(1)) ctx.lineTo(...p);
  ctx.stroke();
}

function drawNetwork(ctx: CanvasRenderingContext2D, s: GameState, pm: ProvinceMap, v: View, grid: MoveGrid, preview: { path: number[]; ok: boolean } | null): void {
  const every = v.scale >= 1 ? 2 : 4, S = grid.size;
  ctx.lineCap = 'round';
  // ligações veio → cidade (de perto, só veios construídos das suas províncias)
  if (v.scale >= 1) {
    ctx.strokeStyle = 'rgba(62,42,24,0.45)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    s.veins.forEach((list, id) => {
      if (s.owner[id] !== 0) return;
      list.forEach((b, i) => { if (b) { const a = pm.provinces[id].veins[i], c = pm.provinces[id].city; stroke(ctx, [toScreen(v, a.x, a.y), toScreen(v, c.x, c.y)]); } });
    });
  }
  // rotas entre cidades
  for (const r of s.routes) {
    const pts = pathPoints(r.path, grid, v, every, pm.provinces[r.a].city);
    ctx.lineWidth = v.scale >= 0.5 ? 2.5 : 1.5;
    ctx.strokeStyle = r.cut ? CUT : color(r.owner);
    ctx.globalAlpha = r.remaining > 0 ? 0.45 : 0.9;
    ctx.setLineDash(r.remaining > 0 ? [2, 5] : [8, 5]);
    stroke(ctx, pts);
    ctx.globalAlpha = 1;
    if (r.cut) { // ✕ no ponto da rota mais perto de uma tropa hostil
      let best = r.path[Math.floor(r.path.length / 2)], bd = Infinity;
      for (const t of s.armies) if (t.owner !== 0) for (const c of r.path) { const d = Math.hypot((c % S) * CELL - t.x, Math.floor(c / S) * CELL - t.y); if (d < bd) { bd = d; best = c; } }
      const [x, y] = toScreen(v, (best % S) * CELL + CELL / 2, Math.floor(best / S) * CELL + CELL / 2);
      ctx.setLineDash([]); ctx.strokeStyle = CUT; ctx.lineWidth = 3;
      stroke(ctx, [[x - 6, y - 6], [x + 6, y + 6]]); stroke(ctx, [[x + 6, y - 6], [x - 6, y + 6]]);
    }
  }
  // linhas de suprimento até as tropas: contorno escuro e pontos dourados (legível sobre a floresta)
  for (const t of s.armies) if (t.owner === 0 && t.supply) {
    const pts = pathPoints(t.supply.path, grid, v, every, pm.provinces[t.supply.from].city);
    ctx.setLineDash([]); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(43,26,14,0.35)'; stroke(ctx, pts);
    ctx.setLineDash([3, 6]); ctx.lineWidth = 3; ctx.strokeStyle = t.supply.cut ? CUT : SUPPLY_INK; stroke(ctx, pts);
  }
  // prévia da rota sendo traçada
  if (preview) {
    ctx.strokeStyle = preview.ok ? 'rgba(62,42,24,0.85)' : CUT; ctx.lineWidth = 2.5; ctx.setLineDash([8, 5]);
    stroke(ctx, pathPoints(preview.path, grid, v, every));
  }
  ctx.setLineDash([]); ctx.lineCap = 'butt';
}

/** Tipo que aparece na peça: o mais numeroso (empate: infantaria, cavalaria, artilharia). */
function mainType(types: TroopType[]): TroopType {
  const order: TroopType[] = ['line', 'cavalry', 'artillery'];
  return order.reduce((best, t) => (types.filter(x => x === t).length > types.filter(x => x === best).length ? t : best), order[0]);
}

/** Retângulo de carta militar com o símbolo do tipo. */
function piece(ctx: CanvasRenderingContext2D, type: TroopType, fill: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = fill; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  ctx.fillRect(x - w / 2, y - h / 2, w, h); ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  ctx.strokeStyle = PAPER; ctx.fillStyle = PAPER; ctx.lineWidth = 1.6; ctx.beginPath();
  if (type === 'line') { ctx.moveTo(x - w / 2, y - h / 2); ctx.lineTo(x + w / 2, y + h / 2); ctx.moveTo(x + w / 2, y - h / 2); ctx.lineTo(x - w / 2, y + h / 2); ctx.stroke(); }
  else if (type === 'cavalry') { ctx.moveTo(x - w / 2, y + h / 2); ctx.lineTo(x + w / 2, y - h / 2); ctx.stroke(); }
  else { ctx.arc(x, y, Math.min(w, h) / 5, 0, Math.PI * 2); ctx.fill(); }
}

/** Ficha de um batalhão (menor que a peça), com os homens embaixo. */
function chip(ctx: CanvasRenderingContext2D, type: TroopType, soldiers: number, fill: string, x: number, y: number): void {
  piece(ctx, type, fill, x, y, 20, 13);
  ctx.font = 'bold 9px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 2.5; ctx.strokeStyle = 'rgba(243,231,201,0.85)'; ctx.strokeText(String(soldiers), x, y + 13);
  ctx.fillStyle = INK; ctx.fillText(String(soldiers), x, y + 13);
}

/** Posições (px) das fichas: infantaria na fileira da frente (acima), cavalaria nos flancos, artilharia atrás (abaixo). */
export function formation(types: TroopType[]): [number, number][] {
  const out: [number, number][] = new Array(types.length);
  const row = (idx: number[], y: number) => idx.forEach((i, k) => { out[i] = [(k - (idx.length - 1) / 2) * 24, y]; });
  const of = (t: TroopType) => types.map((x, i) => (x === t ? i : -1)).filter(i => i >= 0);
  row(of('line'), -22);
  of('cavalry').forEach((i, k) => { out[i] = [(k % 2 ? 1 : -1) * (40 + Math.floor(k / 2) * 22), 0]; });
  row(of('artillery'), 22);
  return out;
}
