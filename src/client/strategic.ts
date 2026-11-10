import { WORLD_TILES } from '../worldgen/constants';

const PITCH_SIN = Math.sin((35.264 * Math.PI) / 180);
export const FADE_START = 500, FADE_END = 600;

/**
 * Mapa estratégico em pergaminho sobre o 3D. Abaixo de FADE_END acompanha a câmera 3D com a mesma projeção
 * isométrica (gira e achata), para o fade casar com o chão; em modo mapa anima para norte-acima e tem pan/zoom próprios.
 */
export interface MapUnit { x: number; y: number; text: string; color: string; selected: boolean; path?: { x: number; y: number }[] }

export class StrategicMap {
  private img: HTMLCanvasElement | null = null;
  private layers: HTMLCanvasElement[] = [];
  // pergaminho + camadas já compostos, em 3 resoluções (2048/1024/512): desenhar 1 imagem, na resolução da tela
  private mips: HTMLCanvasElement[] = [];
  private lastKey = '';
  private lastAlpha = 0;
  /** Quantas vezes o pergaminho foi de fato redesenhado (diagnóstico). */
  paints = 0;
  private labels: { x: number; y: number; name: string; size: number }[] = [];
  private pins: { x: number; y: number }[] = [];
  private units: MapUnit[] = [];
  private unitsKey = '';
  /** Clique direito (sem arrastar) no modo mapa: ordem de mover para (x, y) em tiles. */
  onOrder: ((x: number, y: number) => void) | null = null;
  private ctx: CanvasRenderingContext2D;
  mode: '3d' | 'map' = '3d';
  private center = { x: 0, y: 0 };
  private across = FADE_END; // tiles na largura da tela, no modo mapa
  private t = 0; // 0 = projeção isométrica, 1 = norte-acima
  private marker: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;

  constructor(private canvas: HTMLCanvasElement, private onPick: (x: number, y: number, shift: boolean) => void, private onExit: () => void) {
    this.ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    addEventListener('resize', resize);
    resize();
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => { if (this.mode === 'map') this.drag = { x: e.clientX, y: e.clientY, moved: false }; });
    canvas.addEventListener('pointermove', e => {
      if (!this.drag) return;
      const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) this.drag.moved = true;
      const k = this.across / canvas.width;
      this.center.x -= dx * k; this.center.y -= dy * k;
      this.drag.x = e.clientX; this.drag.y = e.clientY;
    });
    canvas.addEventListener('pointerup', e => {
      const d = this.drag; this.drag = null;
      if (!d || d.moved || this.mode !== 'map' || !this.img) return;
      const k = this.across / canvas.width, x = this.center.x + (e.clientX - canvas.width / 2) * k, y = this.center.y + (e.clientY - canvas.height / 2) * k;
      if (e.button === 2) this.onOrder?.(x, y); else if (e.button === 0) this.onPick(x, y, e.shiftKey);
    });
  }

  setImage(pixels: Uint8ClampedArray | null, size: number): void {
    if (!pixels) { this.img = null; return; }
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.putImageData(new ImageData(pixels, size, size), 0, 0);
    this.img = c;
    this.compose();
  }

  /** Compõe pergaminho + camadas uma vez (quando mudam) e gera as reduções. */
  private compose(): void {
    this.lastKey = '';
    if (!this.img) { this.mips = []; return; }
    let prev = document.createElement('canvas');
    prev.width = prev.height = this.img.width;
    const g = prev.getContext('2d')!;
    g.drawImage(this.img, 0, 0);
    for (const l of this.layers) g.drawImage(l, 0, 0, l.width, l.height, 0, 0, prev.width, prev.height);
    this.mips = [prev];
    for (let i = 0; i < 2; i++) {
      const m = document.createElement('canvas');
      m.width = m.height = prev.width / 2;
      const mg = m.getContext('2d')!;
      mg.imageSmoothingQuality = 'high';
      mg.drawImage(prev, 0, 0, m.width, m.height);
      this.mips.push(m); prev = m;
    }
  }

  setMarker(x: number, y: number): void { this.marker = { x, y }; }

  /** Selos (capitais sugeridas na tela inicial). */
  setPins(pins: { x: number; y: number }[]): void { this.pins = pins; this.lastKey = ''; }

  /** Fichas (tropas, fortalezas, batalhas) por cima do mapa, em tamanho fixo de tela. Só redesenha quando `key` muda. */
  setUnits(units: MapUnit[], key: string): void { this.units = units; this.unitsKey = key; }

  /** Tiles por pixel no modo mapa (para acertar fichas com o clique). */
  get tilesPerPixel(): number { return this.across / this.canvas.width; }

  /** Camadas desenhadas por cima do pergaminho (aquarela dos donos, fronteiras) e nomes das províncias. */
  setOverlay(layers: HTMLCanvasElement[], labels: { x: number; y: number; name: string; size: number }[]): void {
    this.layers = layers; this.labels = labels;
    this.compose();
  }

  /** Entra no modo mapa centrado em (x,y). */
  open(x: number, y: number): void { this.mode = 'map'; this.center = { x, y }; this.across = FADE_END * 1.5; }

  /** Roda do mouse no modo mapa; aproximar abaixo de FADE_END volta ao 3D. */
  wheel(deltaY: number): void {
    this.across = Math.min(WORLD_TILES * 1.3, this.across * (deltaY > 0 ? 1.15 : 1 / 1.15));
    if (this.across < FADE_END) { this.mode = '3d'; this.onExit(); }
  }

  get focus() { return this.center; }

  /** Largura (em tiles) mostrada no modo mapa. */
  zoomTo(across: number): void { this.across = across; }

  /** Modo mapa com a transição concluída: o 3D está totalmente escondido. */
  get covering(): boolean { return this.img !== null && (this.mode === 'map' ? this.t > 0.98 : this.lastAlpha >= 1); }

  /** Desenha. Em 3D: `viewWidth` e `yaw` da câmera e o alvo (cx, cy). */
  draw(viewWidth: number, yaw: number, cx: number, cy: number): void {
    const W = this.canvas.width, H = this.canvas.height, ctx = this.ctx;
    const alpha = this.mode === 'map' ? 1 : Math.min(1, Math.max(0, (viewWidth - FADE_START) / (FADE_END - FADE_START)));
    this.t += ((this.mode === 'map' ? 1 : 0) - this.t) * 0.15;
    this.canvas.style.opacity = String(alpha);
    this.canvas.style.pointerEvents = this.mode === 'map' ? 'auto' : 'none';
    this.lastAlpha = alpha;
    if (alpha <= 0) return;
    if (!this.img) { this.lastKey = ''; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#b0bcb0'; ctx.fillRect(0, 0, W, H); return; } // pergaminho do novo mundo ainda gerando
    if (this.mode === '3d') { this.center = { x: cx, y: cy }; this.across = viewWidth; }
    // nada mudou na vista: o canvas já mostra a imagem certa (mapa parado custa zero)
    const key = [W, H, this.center.x, this.center.y, this.across, this.t.toFixed(3), yaw.toFixed(4), this.marker?.x, this.marker?.y, this.unitsKey].join('|');
    if (key === this.lastKey) return;
    this.lastKey = key;
    this.paints++;
    // ângulo de norte-acima é 90°; interpola pelo caminho mais curto
    let target = Math.PI / 2, d = target - yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d)); target = yaw + d;
    const th = yaw + (target - yaw) * this.t, s = PITCH_SIN + (1 - PITCH_SIN) * this.t;
    const rx = Math.sin(th), rz = -Math.cos(th), fx = -Math.cos(th), fz = -Math.sin(th);
    // resolução da redução ≈ resolução da tela (menos pixels reamostrados de longe)
    const scale = W / this.across, ppx = scale * (WORLD_TILES / this.img.width);
    const mip = this.mips[ppx < 0.3 ? 2 : ppx < 0.6 ? 1 : 0] ?? this.img, k = WORLD_TILES / mip.width, c = this.center;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#b0bcb0'; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(k * scale * rx, -k * scale * s * fx, k * scale * rz, -k * scale * s * fz,
      W / 2 - scale * (c.x * rx + c.y * rz), H / 2 + scale * s * (c.x * fx + c.y * fz));
    ctx.drawImage(mip, 0, 0);
    // nomes à mão, só quando cabem na tela (tamanho ∝ área, em tiles → pixels)
    if (this.t > 0.5) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (const l of this.labels) {
        const px = W / 2 + scale * ((l.x - c.x) * rx + (l.y - c.y) * rz), py = H / 2 - scale * s * ((l.x - c.x) * fx + (l.y - c.y) * fz);
        const fs = l.size * scale;
        if (fs < 9 || px < -100 || py < -40 || px > W + 100 || py > H + 40) continue;
        ctx.font = `italic ${Math.min(28, fs).toFixed(0)}px Georgia, 'Times New Roman', serif`;
        ctx.fillStyle = 'rgba(60, 38, 20, 0.85)';
        ctx.fillText(l.name, px, py);
      }
    }
    for (const p of this.pins) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const px = W / 2 + scale * ((p.x - c.x) * rx + (p.y - c.y) * rz), py = H / 2 - scale * s * ((p.x - c.x) * fx + (p.y - c.y) * fz);
      ctx.fillStyle = '#8a2a20'; ctx.strokeStyle = '#f1e6cf'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f1e6cf'; ctx.font = 'bold 13px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('♜', px, py + 1);
    }
    const at = (x: number, y: number): [number, number] => [W / 2 + scale * ((x - c.x) * rx + (y - c.y) * rz), H / 2 - scale * s * ((x - c.x) * fx + (y - c.y) * fz)];
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const u of this.units) {
      const [px, py] = at(u.x, u.y);
      if (u.path?.length) { // rota das selecionadas
        ctx.strokeStyle = 'rgba(60, 38, 20, 0.7)'; ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
        ctx.beginPath(); ctx.moveTo(px, py);
        for (const p of u.path) ctx.lineTo(...at(p.x, p.y));
        ctx.stroke(); ctx.setLineDash([]);
      }
      if (px < -30 || py < -30 || px > W + 30 || py > H + 30) continue;
      ctx.font = 'bold 12px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(u.text).width + 10;
      ctx.fillStyle = u.color; ctx.strokeStyle = u.selected ? '#fff2c0' : '#2b1a0e'; ctx.lineWidth = u.selected ? 3 : 1.5;
      ctx.beginPath(); ctx.roundRect(px - w / 2, py - 10, w, 20, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f1e6cf'; ctx.fillText(u.text, px, py + 1);
    }
    if (this.marker) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const px = W / 2 + scale * ((this.marker.x - c.x) * rx + (this.marker.y - c.y) * rz);
      const py = H / 2 - scale * s * ((this.marker.x - c.x) * fx + (this.marker.y - c.y) * fz);
      ctx.fillStyle = '#b3261e'; ctx.strokeStyle = '#2b1a0e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
}
