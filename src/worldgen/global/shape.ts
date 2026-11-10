import { SEA_LEVEL } from '../constants';
import { fbm, warp } from '../noise';

const LAND_TARGET = 0.45;
const BORDER = 4;
const MIN_ISLAND = 20;

/** Máscara do continente; base reescalada para que terra ⇔ base ≥ SEA_LEVEL. */
export function landShape(seed: number, size: number): { base: Float32Array; land: Uint8Array } {
  const raw = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    if (x < BORDER || y < BORDER || x >= size - BORDER || y >= size - BORDER) { raw[i] = -1; continue; }
    const nx = (x / size) * 3, ny = (y / size) * 3;
    const [wx, wy] = warp(nx, ny, seed, 2.6);
    const dx = x / size - 0.5, dy = y / size - 0.5;
    const d = Math.sqrt(dx * dx + dy * dy) * 2; // 0 centro, ~1 borda
    raw[i] = fbm(wx, wy, seed, 6) + (fbm(wx * 3, wy * 3, seed + 7, 4) - 0.5) * 0.35 - d * d * 0.55;
  }

  const sorted = Float32Array.from(raw).sort();
  const thr = sorted[Math.floor(sorted.length * (1 - LAND_TARGET))];
  const land = new Uint8Array(size * size);
  for (let i = 0; i < raw.length; i++) land[i] = raw[i] >= thr && raw[i] > -1 ? 1 : 0;
  keepMainLand(land, size);

  let min = Infinity, max = -Infinity;
  for (let i = 0; i < raw.length; i++) { if (raw[i] < min) min = raw[i]; if (raw[i] > max) max = raw[i]; }
  const base = new Float32Array(size * size);
  for (let i = 0; i < raw.length; i++) {
    if (land[i]) base[i] = SEA_LEVEL + ((Math.max(raw[i], thr) - thr) / (max - thr || 1)) * (1 - SEA_LEVEL);
    else base[i] = (Math.min(Math.max(raw[i], min), thr) - min) / (thr - min || 1) * SEA_LEVEL * 0.999;
  }
  return { base, land };
}

/** Mantém a maior massa e ilhas ≥ MIN_ISLAND células (4-vizinhos). */
function keepMainLand(land: Uint8Array, size: number): void {
  const label = new Int32Array(land.length).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < land.length; s++) {
    if (!land[s] || label[s] >= 0) continue;
    const id = sizes.length; let n = 0;
    label[s] = id; stack.push(s);
    while (stack.length) {
      const i = stack.pop()!; n++;
      const x = i % size;
      for (const j of [i - 1, i + 1, i - size, i + size]) {
        if (j < 0 || j >= land.length || (j === i - 1 && x === 0) || (j === i + 1 && x === size - 1)) continue;
        if (land[j] && label[j] < 0) { label[j] = id; stack.push(j); }
      }
    }
    sizes.push(n);
  }
  const biggest = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < land.length; i++)
    if (land[i] && label[i] !== biggest && sizes[label[i]] < MIN_ISLAND) land[i] = 0;
}
