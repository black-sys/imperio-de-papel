import { cityLevel, type GameState } from '../../sim/state';
import { CELL } from '../../worldgen/constants';
import type { ProvinceMap } from '../../worldgen/provinces';
import { drawMarkers, markersKey, type MarkerOpts } from './markers';
import { borderSegments, provinceRings } from './outlines';
import { GOLD, INK, REALM_COLORS, cityRadius } from './pick';
import { drawableFor, type TileCache } from './tileCache';
import { OPEN_SEA } from './tilePaint';
import { levelFor, TILE_PX, tileSpan, toScreen, visibleTiles, type View } from './view';


/** Desenha o mapa num Canvas 2D: ladrilhos → território → fronteiras → nomes → marcadores → caixa. Só quando algo muda. */
export class MapRenderer {
  paints = 0;
  private ctx: CanvasRenderingContext2D;
  private key = '';
  private rings: Path2D[] = [];
  private borders: Path2D | null = null;
  private labels: { id: number; x: number; y: number; name: string; size: number }[] = [];
  private pm: ProvinceMap | null = null;
  private cache: TileCache | null = null;

  constructor(private canvas: HTMLCanvasElement) { this.ctx = canvas.getContext('2d')!; }

  /** Contornos e nomes são calculados uma vez por mundo. */
  setWorld(pm: ProvinceMap | null, cache: TileCache | null): void {
    this.pm = pm; this.cache = cache; this.key = '';
    this.rings = []; this.borders = null; this.labels = [];
    if (!pm) return;
    this.rings = provinceRings(pm).map(rs => {
      const p = new Path2D();
      for (const r of rs) { p.moveTo(r[0], r[1]); for (let i = 2; i < r.length; i += 2) p.lineTo(r[i], r[i + 1]); p.closePath(); }
      return p;
    });
    const seg = borderSegments(pm), b = new Path2D();
    for (let i = 0; i < seg.length; i += 4) { b.moveTo(seg[i], seg[i + 1]); b.lineTo(seg[i + 2], seg[i + 3]); }
    this.borders = b;
    this.labels = pm.provinces.map(p => ({ id: p.id, x: p.center.x, y: p.center.y, name: p.name, size: Math.sqrt(p.cells) * CELL * 0.12 }));
  }

  /** Devolve true se redesenhou. `box` = caixa de seleção em px de tela; `extra` = qualquer outra coisa que mude o desenho. */
  draw(s: GameState | null, v: View, o: MarkerOpts, box: [number, number, number, number] | null, extra = ''): boolean {
    const pm = this.pm, cache = this.cache, ctx = this.ctx;
    if (this.canvas.width !== v.w || this.canvas.height !== v.h) { this.canvas.width = v.w; this.canvas.height = v.h; this.key = ''; }
    const L = levelFor(v.scale), tiles = visibleTiles(v, L);
    cache?.request(tiles);
    const key = [cache?.version, s && pm ? markersKey(s, pm, v, o) : `${v.cx},${v.cy},${v.scale},${v.w},${v.h}`, s?.owner.join(','), box?.join(','), extra].join('#');
    if (key === this.key) return false;
    this.key = key;
    this.paints++;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = OPEN_SEA; ctx.fillRect(0, 0, v.w, v.h); // fora do mundo: mar aberto sem fim
    if (!pm || !cache) return true;
    // ladrilhos (ou o substituto do nível acima, recortado na área deste)
    ctx.imageSmoothingEnabled = true;
    const span = tileSpan(L);
    for (const t of tiles) {
      const d = drawableFor(cache, t);
      if (!d) continue;
      const f = 2 ** (d.t.L - t.L), sub = TILE_PX / f, sx = (t.x - d.t.x * f) * sub, sy = (t.y - d.t.y * f) * sub;
      const [ax, ay] = toScreen(v, t.x * span, t.y * span), [bx, by] = toScreen(v, (t.x + 1) * span, (t.y + 1) * span);
      const dx = Math.floor(ax), dy = Math.floor(ay); // arredonda para fora: sem fresta entre ladrilhos
      ctx.drawImage(d.img, sx, sy, sub, sub, dx, dy, Math.ceil(bx) - dx, Math.ceil(by) - dy);
    }
    if (!s) return true;
    // território e fronteiras em coordenadas do mundo
    ctx.setTransform(v.scale, 0, 0, v.scale, v.w / 2 - v.cx * v.scale, v.h / 2 - v.cy * v.scale);
    s.owner.forEach((owner, id) => {
      if (owner < 0 || !this.rings[id]) return;
      ctx.fillStyle = REALM_COLORS[owner] ?? REALM_COLORS[0]; ctx.globalAlpha = 0.16; ctx.fill(this.rings[id], 'evenodd');
    });
    ctx.globalAlpha = 1;
    if (this.borders) {
      ctx.strokeStyle = 'rgba(62,42,24,0.7)'; ctx.lineWidth = 1.4 / v.scale; ctx.setLineDash([6 / v.scale, 4 / v.scale]);
      ctx.stroke(this.borders); ctx.setLineDash([]);
    }
    if (o.selectedProvince >= 0 && this.rings[o.selectedProvince]) { ctx.strokeStyle = GOLD; ctx.lineWidth = 3 / v.scale; ctx.stroke(this.rings[o.selectedProvince]); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // nomes das províncias (só os que cabem)
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const l of this.labels) {
      const fs = l.size * v.scale, [px, py] = toScreen(v, l.x, l.y);
      if (fs < 9 || px < -150 || py < -40 || px > v.w + 150 || py > v.h + 40) continue;
      // com cidade: nome em negrito e maior; terra vazia: itálico claro
      // (com cidade, o nome vai logo acima do marcador dela)
      const town = !!s.city[l.id], size = Math.min(town ? 32 : 28, fs * (town ? 1.15 : 1));
      ctx.font = `${town ? 'bold ' : 'italic '}${size.toFixed(0)}px Georgia, 'Times New Roman', serif`;
      ctx.fillStyle = town ? 'rgba(48,30,16,0.95)' : 'rgba(62,42,24,0.7)';
      if (town) { const c = pm.provinces[l.id].city, [cx, cy] = toScreen(v, c.x, c.y); ctx.fillText(l.name, cx, cy - cityRadius(cityLevel(s, l.id), v.scale) - 6 - size / 2); }
      else ctx.fillText(l.name, px, py - 22);
    }
    drawMarkers(ctx, s, pm, v, o);
    if (box) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.setLineDash([4, 3]); ctx.fillStyle = 'rgba(247,215,116,0.15)';
      ctx.fillRect(box[0], box[1], box[2] - box[0], box[3] - box[1]); ctx.strokeRect(box[0], box[1], box[2] - box[0], box[3] - box[1]);
      ctx.setLineDash([]);
    }
    return true;
  }
}
