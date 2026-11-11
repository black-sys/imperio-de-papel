import { fallbackFor, LEVELS, TILE_PX, type TileId } from './view';

const key = (t: TileId) => `${t.L},${t.x},${t.y}`;

/** Pixels → imagem desenhável (no navegador; os testes injetam outra). */
export async function pixelsToImage(p: Uint8ClampedArray): Promise<CanvasImageSource> {
  return createImageBitmap(new ImageData(p, TILE_PX, TILE_PX));
}

/** Ladrilhos prontos (LRU) e pedidos ao worker com limite de simultâneos. `version` sobe a cada chegada. */
export class TileCache {
  version = 0;
  private ready = new Map<string, CanvasImageSource>();
  private flying = new Set<string>();
  private queue: TileId[] = [];
  private epoch = 0;
  private visible = new Set<string>(); // lista visível atual: nunca sai do cache (tela grande passa do limite)

  constructor(private fetch: (L: number, x: number, y: number) => Promise<Uint8ClampedArray>, private max = 400, private inFlight = 6,
    private toImage: (p: Uint8ClampedArray) => Promise<CanvasImageSource> = pixelsToImage) {}

  get(t: TileId): CanvasImageSource | null {
    const k = key(t), img = this.ready.get(k);
    if (!img) return null;
    this.ready.delete(k); this.ready.set(k, img); // mais recente
    return img;
  }

  /** Pede os que faltam, na ordem dada; a fila anterior é trocada pela nova (o que saiu da tela não interessa mais). */
  request(ts: TileId[]): void {
    // junto, o ancestral do nível mais afastado (o continente tem só 16): é o substituto que garante nunca haver buraco
    const top = LEVELS - 1, roots = new Map<string, TileId>();
    for (const t of ts) { const s = top - t.L, r = { L: top, x: t.x >> s, y: t.y >> s }; roots.set(key(r), r); }
    const all = [...roots.values(), ...ts];
    this.visible = new Set(all.map(key));
    this.queue = all.filter(t => !this.ready.has(key(t)) && !this.flying.has(key(t)));
    this.pump();
  }

  clear(): void {
    this.epoch++;
    for (const img of this.ready.values()) (img as ImageBitmap).close?.();
    this.ready.clear(); this.flying.clear(); this.queue = []; this.visible.clear();
  }

  private pump(): void {
    while (this.flying.size < this.inFlight && this.queue.length) {
      const t = this.queue.shift()!, k = key(t), epoch = this.epoch;
      if (this.ready.has(k) || this.flying.has(k)) continue;
      this.flying.add(k);
      this.fetch(t.L, t.x, t.y).then(this.toImage).then(img => {
        if (epoch !== this.epoch) { (img as ImageBitmap).close?.(); return; }
        this.ready.set(k, img);
        // descarta os menos usados, menos os visíveis agora e os do continente
        for (const old of this.ready.keys()) {
          if (this.ready.size <= this.max) break;
          if (this.visible.has(old) || old.startsWith(`${LEVELS - 1},`)) continue;
          (this.ready.get(old) as ImageBitmap).close?.(); this.ready.delete(old);
        }
        this.version++;
      }, () => {}).finally(() => {
        if (epoch !== this.epoch) return;
        this.flying.delete(k);
        this.pump();
      });
    }
  }
}

/** O próprio ladrilho, ou o do nível acima mais próximo que já esteja pronto (nunca deixa buraco). */
export function drawableFor(cache: TileCache, t: TileId): { img: CanvasImageSource; t: TileId } | null {
  for (let c: TileId | null = t; c; c = fallbackFor(c)) { const img = cache.get(c); if (img) return { img, t: c }; }
  return null;
}
