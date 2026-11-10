import { WORLD_TILES } from '../worldgen/constants';

const PITCH_SIN = Math.sin((35.264 * Math.PI) / 180);

/** Câmera livre: WASD/setas relativos ao giro, arrastar com botão do meio/direito. Posição em tiles. */
export class FreeCamera {
  x = WORLD_TILES / 2;
  y = WORLD_TILES / 2;
  private drag: { x: number; y: number } | null = null;

  constructor(canvas: HTMLCanvasElement, private yaw: () => number, private viewWidth: () => number) {
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    canvas.addEventListener('pointerdown', e => { if (e.button === 1 || e.button === 2) { this.drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); } });
    canvas.addEventListener('pointermove', e => {
      if (!this.drag) return;
      const k = this.viewWidth() / innerWidth;
      // arrastar move o chão junto com o mouse: horizontal no vetor direita, vertical no vetor frente (achatado pela inclinação)
      this.pan(-(e.clientX - this.drag.x) * k, (e.clientY - this.drag.y) * k / PITCH_SIN);
      this.drag = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('pointerup', () => (this.drag = null));
  }

  /** Move em coordenadas de tela: `right` para a direita, `forward` para cima, em tiles. */
  pan(right: number, forward: number): void {
    const t = this.yaw(), fx = -Math.cos(t), fy = -Math.sin(t), rx = -fy, ry = fx;
    this.x = Math.min(WORLD_TILES, Math.max(0, this.x + rx * right + fx * forward));
    this.y = Math.min(WORLD_TILES, Math.max(0, this.y + ry * right + fy * forward));
  }

  update(dt: number, keys: Set<string>): void {
    const fw = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
    const rt = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
    const speed = this.viewWidth() * 0.9 * dt;
    if (fw || rt) this.pan(rt * speed, fw * speed);
  }

  center(x: number, y: number): void { this.x = x; this.y = y; }
}
