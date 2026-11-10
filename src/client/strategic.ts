import { WORLD_TILES } from '../worldgen/constants';

const PITCH_SIN = Math.sin((35.264 * Math.PI) / 180);
export const FADE_START = 500, FADE_END = 600;

/**
 * Mapa estratégico em pergaminho sobre o 3D. Abaixo de FADE_END acompanha a câmera 3D com a mesma projeção
 * isométrica (gira e achata), para o fade casar com o chão; em modo mapa anima para norte-acima e tem pan/zoom próprios.
 */
export class StrategicMap {
  private img: HTMLCanvasElement | null = null;
  private layers: HTMLCanvasElement[] = [];
  private labels: { x: number; y: number; name: string; size: number }[] = [];
  private ctx: CanvasRenderingContext2D;
  mode: '3d' | 'map' = '3d';
  private center = { x: 0, y: 0 };
  private across = FADE_END; // tiles na largura da tela, no modo mapa
  private t = 0; // 0 = projeção isométrica, 1 = norte-acima
  private marker: { x: number; y: number } | null = null;
  private drag: { x: number; y: number; moved: boolean } | null = null;

  constructor(private canvas: HTMLCanvasElement, private onPick: (x: number, y: number) => void, private onExit: () => void) {
    this.ctx = canvas.getContext('2d')!;
    const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
    addEventListener('resize', resize);
    resize();
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
      const k = this.across / canvas.width;
      this.onPick(this.center.x + (e.clientX - canvas.width / 2) * k, this.center.y + (e.clientY - canvas.height / 2) * k);
    });
  }

  setImage(pixels: Uint8ClampedArray | null, size: number): void {
    if (!pixels) { this.img = null; return; }
    const c = document.createElement('canvas');
    c.width = c.height = size;
    c.getContext('2d')!.putImageData(new ImageData(pixels, size, size), 0, 0);
    this.img = c;
  }

  setMarker(x: number, y: number): void { this.marker = { x, y }; }

  /** Camadas desenhadas por cima do pergaminho (aquarela dos donos, fronteiras) e nomes das províncias. */
  setOverlay(layers: HTMLCanvasElement[], labels: { x: number; y: number; name: string; size: number }[]): void {
    this.layers = layers; this.labels = labels;
  }

  /** Entra no modo mapa centrado em (x,y). */
  open(x: number, y: number): void { this.mode = 'map'; this.center = { x, y }; this.across = FADE_END * 1.5; }

  /** Roda do mouse no modo mapa; aproximar abaixo de FADE_END volta ao 3D. */
  wheel(deltaY: number): void {
    this.across = Math.min(WORLD_TILES * 1.3, this.across * (deltaY > 0 ? 1.15 : 1 / 1.15));
    if (this.across < FADE_END) { this.mode = '3d'; this.onExit(); }
  }

  get focus() { return this.center; }

  /** Modo mapa com a transição concluída: o 3D está totalmente escondido. */
  get covering(): boolean { return this.mode === 'map' && this.t > 0.98 && this.img !== null; }

  /** Desenha. Em 3D: `viewWidth` e `yaw` da câmera e o alvo (cx, cy). */
  draw(viewWidth: number, yaw: number, cx: number, cy: number): void {
    const W = this.canvas.width, H = this.canvas.height, ctx = this.ctx;
    const alpha = this.mode === 'map' ? 1 : Math.min(1, Math.max(0, (viewWidth - FADE_START) / (FADE_END - FADE_START)));
    this.t += ((this.mode === 'map' ? 1 : 0) - this.t) * 0.15;
    this.canvas.style.opacity = String(alpha);
    this.canvas.style.pointerEvents = this.mode === 'map' ? 'auto' : 'none';
    if (alpha <= 0) return;
    if (!this.img) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#b0bcb0'; ctx.fillRect(0, 0, W, H); return; } // pergaminho do novo mundo ainda gerando
    if (this.mode === '3d') { this.center = { x: cx, y: cy }; this.across = viewWidth; }
    // ângulo de norte-acima é 90°; interpola pelo caminho mais curto
    let target = Math.PI / 2, d = target - yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d)); target = yaw + d;
    const th = yaw + (target - yaw) * this.t, s = PITCH_SIN + (1 - PITCH_SIN) * this.t;
    const rx = Math.sin(th), rz = -Math.cos(th), fx = -Math.cos(th), fz = -Math.sin(th);
    const scale = W / this.across, k = WORLD_TILES / this.img.width, c = this.center;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#b0bcb0'; ctx.fillRect(0, 0, W, H);
    ctx.imageSmoothingEnabled = true;
    ctx.setTransform(k * scale * rx, -k * scale * s * fx, k * scale * rz, -k * scale * s * fz,
      W / 2 - scale * (c.x * rx + c.y * rz), H / 2 + scale * s * (c.x * fx + c.y * fz));
    ctx.drawImage(this.img, 0, 0);
    for (const l of this.layers) ctx.drawImage(l, 0, 0, l.width, l.height, 0, 0, this.img.width, this.img.height);
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
    if (this.marker) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const px = W / 2 + scale * ((this.marker.x - c.x) * rx + (this.marker.y - c.y) * rz);
      const py = H / 2 - scale * s * ((this.marker.x - c.x) * fx + (this.marker.y - c.y) * fz);
      ctx.fillStyle = '#b3261e'; ctx.strokeStyle = '#2b1a0e'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }
}
