import { CELL, LAKE_MIN_CELLS, LAKE_MIN_DEPTH, RIVER_FLOW_MIN, SEA_LEVEL } from '../constants';
import type { River } from '../types';

const EPS = 1e-5;
const DX = [-1, 0, 1, -1, 1, -1, 0, 1];
const DY = [-1, -1, -1, 0, 0, 1, 1, 1];

export interface Hydrology {
  elevation: Float32Array;
  filled: Float32Array;
  water: Uint8Array;
  lakeSurface: Float32Array;
  flow: Float32Array;
  river: Uint8Array;
  rivers: River[];
}

export function runHydrology(size: number, elevation: Float32Array, land: Uint8Array, moisture: Float32Array): Hydrology {
  // 1ª passada só para saber onde erodir
  let filled = priorityFlood(size, elevation, land);
  let down = downstream(size, filled, land);
  let flow = accumulate(size, filled, land, moisture, down);
  const elev = Float32Array.from(elevation);
  for (let i = 0; i < elev.length; i++)
    if (land[i] && flow[i] >= RIVER_FLOW_MIN)
      elev[i] = Math.max(SEA_LEVEL + 0.001, elev[i] - Math.min(0.03, 0.004 * Math.sqrt(flow[i])));

  filled = priorityFlood(size, elev, land);
  const { water, lakeSurface } = findLakes(size, elev, filled, land);
  down = downstream(size, filled, land);
  flow = accumulate(size, filled, land, moisture, down);
  const river = new Uint8Array(size * size);
  for (let i = 0; i < river.length; i++) river[i] = land[i] && water[i] === 0 && flow[i] >= RIVER_FLOW_MIN ? 1 : 0;
  const rivers = tracePolylines(size, river, water, down, flow, filled);
  return { elevation: elev, filled, water, lakeSurface, flow, river, rivers };
}

/** Barnes 2014: superfície sem depressões, estritamente decrescente até o mar. */
function priorityFlood(size: number, elev: Float32Array, land: Uint8Array): Float32Array {
  const filled = new Float32Array(elev.length);
  const done = new Uint8Array(elev.length);
  const heap = new MinHeap(elev.length);
  for (let i = 0; i < elev.length; i++) if (!land[i]) { filled[i] = elev[i]; done[i] = 1; heap.push(i, elev[i]); }
  while (heap.size) {
    const c = heap.pop();
    const cx = c % size, cy = (c - cx) / size;
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (done[n]) continue;
      done[n] = 1;
      filled[n] = Math.max(elev[n], filled[c] + EPS);
      heap.push(n, filled[n]);
    }
  }
  return filled;
}

function findLakes(size: number, elev: Float32Array, filled: Float32Array, land: Uint8Array) {
  const water = new Uint8Array(elev.length);
  const lakeSurface = new Float32Array(elev.length);
  for (let i = 0; i < water.length; i++) if (!land[i]) water[i] = 1;
  const seen = new Uint8Array(elev.length);
  const isDepr = (i: number) => land[i] === 1 && filled[i] - elev[i] > LAKE_MIN_DEPTH;
  for (let s = 0; s < elev.length; s++) {
    if (seen[s] || !isDepr(s)) continue;
    const comp: number[] = [], st = [s];
    seen[s] = 1;
    let top = 0;
    while (st.length) {
      const c = st.pop()!;
      comp.push(c); top = Math.max(top, filled[c]);
      const cx = c % size, cy = (c - cx) / size;
      for (let k = 0; k < 8; k++) {
        const nx = cx + DX[k], ny = cy + DY[k];
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        const n = ny * size + nx;
        if (!seen[n] && isDepr(n)) { seen[n] = 1; st.push(n); }
      }
    }
    if (comp.length < LAKE_MIN_CELLS) continue;
    for (const c of comp) { water[c] = 2; lakeSurface[c] = top; }
  }
  return { water, lakeSurface };
}

/** Vizinho D8 de menor superfície (-1 se nenhum é mais baixo, só no oceano). */
function downstream(size: number, filled: Float32Array, land: Uint8Array): Int32Array {
  const down = new Int32Array(filled.length).fill(-1);
  for (let i = 0; i < filled.length; i++) {
    if (!land[i]) continue;
    const cx = i % size, cy = (i - cx) / size;
    let best = -1, bv = filled[i];
    for (let k = 0; k < 8; k++) {
      const nx = cx + DX[k], ny = cy + DY[k];
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (filled[n] < bv) { bv = filled[n]; best = n; }
    }
    down[i] = best;
  }
  return down;
}

function accumulate(size: number, filled: Float32Array, land: Uint8Array, moisture: Float32Array, down: Int32Array): Float32Array {
  const flow = new Float32Array(size * size);
  const order: number[] = [];
  for (let i = 0; i < flow.length; i++) if (land[i]) order.push(i);
  order.sort((a, b) => filled[b] - filled[a] || a - b);
  for (const i of order) {
    flow[i] += moisture[i];
    const d = down[i];
    if (d >= 0 && land[d]) flow[d] += flow[i];
  }
  return flow;
}

function tracePolylines(size: number, river: Uint8Array, water: Uint8Array, down: Int32Array, flow: Float32Array, filled: Float32Array): River[] {
  const hasUpstream = new Uint8Array(river.length);
  for (let i = 0; i < river.length; i++) if (river[i] && down[i] >= 0) hasUpstream[down[i]] = 1;
  const traced = new Uint8Array(river.length);
  const rivers: River[] = [];
  const center = (i: number) => [(i % size) * CELL + CELL / 2, Math.floor(i / size) * CELL + CELL / 2];
  for (let s = 0; s < river.length; s++) {
    if (!river[s] || hasUpstream[s]) continue;
    const pts: number[] = [], fl: number[] = [], sf: number[] = [];
    let i = s;
    for (let guard = 0; guard < river.length; guard++) {
      pts.push(...center(i)); fl.push(flow[i]); sf.push(filled[i]);
      if (water[i] !== 0 || traced[i]) break; // chegou ao mar/lago ou juntou-se a outro rio
      traced[i] = 1;
      const d = down[i];
      if (d < 0) break;
      i = d;
    }
    if (pts.length >= 4) rivers.push({ points: Float32Array.from(pts), flow: Float32Array.from(fl), surface: Float32Array.from(sf) });
  }
  return rivers;
}

class MinHeap {
  private idx: Int32Array;
  private key: Float64Array;
  size = 0;
  constructor(cap: number) { this.idx = new Int32Array(cap); this.key = new Float64Array(cap); }
  push(i: number, k: number) {
    let p = this.size++;
    while (p > 0) {
      const q = (p - 1) >> 1;
      if (this.key[q] <= k) break;
      this.idx[p] = this.idx[q]; this.key[p] = this.key[q]; p = q;
    }
    this.idx[p] = i; this.key[p] = k;
  }
  pop(): number {
    const top = this.idx[0];
    const li = this.idx[--this.size], lk = this.key[this.size];
    let p = 0;
    for (;;) {
      let c = 2 * p + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.key[c + 1] < this.key[c]) c++;
      if (this.key[c] >= lk) break;
      this.idx[p] = this.idx[c]; this.key[p] = this.key[c]; p = c;
    }
    this.idx[p] = li; this.key[p] = lk;
    return top;
  }
}
