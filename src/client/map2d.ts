import { WORLD_TILES } from '../worldgen/constants';
import { Biome, type WorldMap } from '../worldgen/types';

export const BIOME_COLORS: Record<Biome, [number, number, number]> = {
  [Biome.Ocean]: [58, 104, 168],
  [Biome.Beach]: [222, 206, 150],
  [Biome.Snow]: [236, 238, 242],
  [Biome.Taiga]: [62, 104, 78],
  [Biome.TemperateForest]: [72, 134, 64],
  [Biome.Grassland]: [138, 182, 86],
  [Biome.Swamp]: [86, 110, 76],
  [Biome.Savanna]: [196, 180, 96],
  [Biome.Desert]: [226, 198, 132],
  [Biome.Jungle]: [36, 118, 54],
  [Biome.Mountain]: [128, 120, 114],
};
export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Ocean]: 'Água', [Biome.Beach]: 'Praia', [Biome.Snow]: 'Neve / tundra', [Biome.Taiga]: 'Taiga',
  [Biome.TemperateForest]: 'Floresta temperada', [Biome.Grassland]: 'Campo', [Biome.Swamp]: 'Pântano',
  [Biome.Savanna]: 'Savana', [Biome.Desert]: 'Deserto', [Biome.Jungle]: 'Selva', [Biome.Mountain]: 'Montanha',
};

let base: ImageData | null = null;
let marker: { x: number; y: number } | null = null;
let ctx: CanvasRenderingContext2D | null = null;

export function drawMap2d(canvas: HTMLCanvasElement, map: WorldMap): void {
  canvas.width = canvas.height = map.size;
  ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(map.size, map.size);
  for (let i = 0; i < map.biome.length; i++) {
    let c = BIOME_COLORS[map.biome[i] as Biome];
    if (map.water[i] === 2) c = [86, 140, 200];
    if (map.river[i]) c = [60, 110, 210];
    const shade = map.water[i] ? 1 : 0.8 + (map.elevation[i] - 0.4) * 0.6;
    img.data[i * 4] = c[0] * shade; img.data[i * 4 + 1] = c[1] * shade; img.data[i * 4 + 2] = c[2] * shade; img.data[i * 4 + 3] = 255;
  }
  base = img;
  redraw();
}

export function setMarker(tileX: number, tileY: number): void {
  marker = { x: tileX, y: tileY };
  redraw();
}

function redraw() {
  if (!ctx || !base) return;
  ctx.putImageData(base, 0, 0);
  if (!marker) return;
  const s = base.width / WORLD_TILES;
  ctx.fillStyle = '#ff3b30'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(marker.x * s, marker.y * s, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

export function onMapClick(canvas: HTMLCanvasElement, cb: (tileX: number, tileY: number) => void): void {
  canvas.addEventListener('click', e => {
    const r = canvas.getBoundingClientRect();
    cb(Math.floor(((e.clientX - r.left) / r.width) * WORLD_TILES), Math.floor(((e.clientY - r.top) / r.height) * WORLD_TILES));
  });
}
