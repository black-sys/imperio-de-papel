import { EROSION_ITER, EROSION_K, EROSION_TALUS, EROSION_THERMAL_EVERY, EROSION_UPLIFT, SEA_LEVEL } from '../constants';

const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY = [-1, -1, -1, 0, 0, 1, 1, 1];
const DIST = [Math.SQRT2, 1, Math.SQRT2, 1, 1, Math.SQRT2, 1, Math.SQRT2];

/**
 * Stream power implícita (Braun & Willett 2013, m=0.5, n=1) + soerguimento + erosão térmica.
 * Ordem receptor→doador por pilha O(n) em vez de priority-flood por iteração (orçamento de tempo).
 * Mínimos locais em terra são sumidouros: não erodem; viram lagos na hidrologia depois.
 */
export function erode(size: number, elevation: Float32Array, land: Uint8Array, uplift: Float32Array, rain: Float32Array, onIter?: (i: number, n: number) => void): Float32Array {
  const n = size * size, res = size / 512, res2 = res * res;
  const h = Float32Array.from(elevation);
  const rec = new Int32Array(n), recDist = new Float32Array(n);
  const nDon = new Uint8Array(n), donors = new Int32Array(n * 8);
  const stack = new Int32Array(n), area = new Float32Array(n);

  for (let it = 0; it < EROSION_ITER; it++) {
    // receptor: vizinho mais íngreme abaixo (ou a própria célula)
    nDon.fill(0);
    for (let i = 0; i < n; i++) {
      rec[i] = i; recDist[i] = 1;
      if (!land[i]) continue;
      const x = i % size, y = (i - x) / size;
      let best = 0;
      for (let k = 0; k < 8; k++) {
        const nx = x + DX[k], ny = y + DY[k];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const j = ny * size + nx, slope = (h[i] - h[j]) / DIST[k];
        if (slope > best) { best = slope; rec[i] = j; recDist[i] = DIST[k]; }
      }
    }
    for (let i = 0; i < n; i++) if (rec[i] !== i) donors[rec[i] * 8 + nDon[rec[i]]++] = i;

    // pilha: cada receptor antes dos seus doadores
    let top = 0;
    for (let b = 0; b < n; b++) {
      if (rec[b] !== b) continue;
      let sp = top; stack[top++] = b;
      while (sp < top) {
        const c = stack[sp++];
        for (let d = 0; d < nDon[c]; d++) stack[top++] = donors[c * 8 + d];
      }
    }

    for (let i = 0; i < n; i++) area[i] = land[i] ? rain[i] : 0;
    for (let s = n - 1; s >= 0; s--) { const i = stack[s]; if (rec[i] !== i) area[rec[i]] += area[i]; }

    for (let s = 0; s < n; s++) {
      const i = stack[s];
      if (!land[i]) continue;
      const r = rec[i];
      let hi = h[i] + EROSION_UPLIFT * uplift[i];
      if (r !== i) {
        const F = (EROSION_K * Math.sqrt(area[i] / res2)) / (recDist[i] / res);
        const v = (hi + F * h[r]) / (1 + F);
        if (v < hi) hi = v;
      }
      h[i] = Math.min(1, Math.max(SEA_LEVEL + 0.001, hi));
    }

    if ((it + 1) % EROSION_THERMAL_EVERY === 0) thermal(size, h, land, EROSION_TALUS / res);
    onIter?.(it + 1, EROSION_ITER);
  }
  return h;
}

/** Encostas acima do ângulo limite desmoronam metade do excesso para o vizinho mais baixo (4-vizinhos). */
function thermal(size: number, h: Float32Array, land: Uint8Array, talus: number): void {
  const delta = new Float32Array(h.length);
  for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
    const i = y * size + x;
    if (!land[i]) continue;
    let low = -1, diff = talus;
    for (const j of [i - 1, i + 1, i - size, i + size]) if (land[j] && h[i] - h[j] > diff) { diff = h[i] - h[j]; low = j; }
    if (low < 0) continue;
    const move = (diff - talus) / 4;
    delta[i] -= move; delta[low] += move;
  }
  for (let i = 0; i < h.length; i++) if (land[i]) h[i] = Math.min(1, Math.max(SEA_LEVEL + 0.001, h[i] + delta[i]));
}
