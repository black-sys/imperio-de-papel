import { CELL, MOUNTAIN_LEVEL } from './constants';
import { DENSITY } from './resources';
import { makeRng, subSeed } from './rng';
import { Biome, type WorldMap } from './types';

export interface Province {
  id: number;
  name: string;
  center: { x: number; y: number }; // tiles
  cells: number;
  neighbors: number[];
  coastal: boolean;
  biome: Biome;
  fertility: number; // 0–1.5
  forest: number;
  rock: number;
  slots: number; // 3–6
  sites: { x: number; y: number }[]; // tiles, um por vaga
}

export interface ProvinceMap {
  cellProvince: Int16Array; // −1 = mar
  provinces: Province[];
  suggestedCapitals: number[];
}

const TARGET = 300;
const RIVER_COST = 30; // cruzar rio/lago custa caro: fronteira para nele
const RIDGE_COST = 600; // por unidade de elevação subida
const MOUNTAIN_COST = 4;
// 4-vizinhos: rios são cadeias 8-conexas; com diagonais a região atravessaria o rio sem pisar nele
const DX = [0, -1, 1, 0], DY = [-1, 0, 0, 1];

export function generateProvinces(map: WorldMap): ProvinceMap {
  const S = map.size, n = S * S;
  const land = (i: number) => map.water[i] !== 1;
  const region = growRegions(map, pickSeeds(map));
  mergeSmall(region, S, land);
  splitLarge(map, region);
  mergeSmall(region, S, land); // pedaços pequenos que a divisão possa ter deixado
  const cellProvince = compact(region);
  const provinces = describe(map, cellProvince);
  void n;
  addAttributes(map, cellProvince, provinces);
  return { cellProvince, provinces, suggestedCapitals: suggestCapitals(provinces) };
}

/** Sementes espalhadas por "dart throwing" com distância mínima, ~TARGET em terra. */
function pickSeeds(map: WorldMap): number[] {
  const S = map.size, rng = makeRng(subSeed(map.seed, 'províncias'));
  let landCells = 0;
  for (let i = 0; i < S * S; i++) if (map.water[i] !== 1) landCells++;
  const d = Math.sqrt(landCells / TARGET) * 0.85, d2 = d * d;
  const gs = Math.max(1, Math.floor(d)), gw = Math.ceil(S / gs), grid: number[][] = Array.from({ length: gw * gw }, () => []);
  const seeds: number[] = [];
  const tries = landCells * 3;
  for (let t = 0; t < tries; t++) {
    const i = Math.floor(rng() * S * S);
    if (map.water[i] === 1) continue;
    const x = i % S, y = (i - x) / S, gx = Math.floor(x / gs), gy = Math.floor(y / gs);
    let ok = true;
    for (let yy = gy - 2; yy <= gy + 2 && ok; yy++) for (let xx = gx - 2; xx <= gx + 2 && ok; xx++) {
      if (xx < 0 || yy < 0 || xx >= gw || yy >= gw) continue;
      for (const s of grid[yy * gw + xx]) { const sx = s % S, sy = (s - sx) / S; if ((sx - x) ** 2 + (sy - y) ** 2 < d2) { ok = false; break; } }
    }
    if (!ok) continue;
    seeds.push(i); grid[gy * gw + gx].push(i);
  }
  return seeds;
}

/** Dijkstra multi-fonte: rios, lagos, subidas e montanhas encarecem a travessia. */
function growRegions(map: WorldMap, seeds: number[]): Int32Array {
  const S = map.size, region = new Int32Array(S * S).fill(-1), cost = new Float64Array(S * S).fill(Infinity);
  const heap = new Heap();
  seeds.forEach((s, k) => { region[s] = k; cost[s] = 0; heap.push(s, 0); });
  const wet = (i: number) => map.river[i] === 1 || map.water[i] === 2;
  while (heap.size) {
    const [c, cc] = heap.pop();
    if (cc > cost[c]) continue;
    const x = c % S, y = (c - x) / S;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k], ny = y + DY[k];
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const nb = ny * S + nx;
      if (map.water[nb] === 1) continue;
      let step = 1 + (map.elevation[nb] >= MOUNTAIN_LEVEL ? MOUNTAIN_COST : 0);
      step += RIDGE_COST * Math.max(0, map.elevation[nb] - map.elevation[c]);
      if (wet(nb) !== wet(c)) step += RIVER_COST; // entrar ou sair do rio/lago
      const nc = cc + step;
      if (nc < cost[nb]) { cost[nb] = nc; region[nb] = region[c]; heap.push(nb, nc); }
    }
  }
  // terra sem semente alcançável (ilhas isoladas): cada massa vira uma região nova
  let next = seeds.length;
  for (let s = 0; s < S * S; s++) {
    if (map.water[s] === 1 || region[s] >= 0) continue;
    const id = next++, st = [s];
    region[s] = id;
    while (st.length) {
      const c = st.pop()!, x = c % S, y = (c - x) / S;
      for (let k = 0; k < 4; k++) {
        const nx = x + DX[k], ny = y + DY[k], nb = ny * S + nx;
        if (nx < 0 || ny < 0 || nx >= S || ny >= S || map.water[nb] === 1 || region[nb] >= 0) continue;
        region[nb] = id; st.push(nb);
      }
    }
  }
  fixFragments(region, S);
  return region;
}

/** Diagonais do Dijkstra podem deixar pedaços desconectados (em 4-vizinhos): cada pedaço menor vai para o vizinho de maior contato. */
function fixFragments(region: Int32Array, S: number): void {
  let nextId = 0;
  for (let i = 0; i < region.length; i++) nextId = Math.max(nextId, region[i] + 1);
  const seen = new Uint8Array(S * S), best = new Map<number, { size: number; cells: number[] }>(), frags: number[][] = [];
  for (let s = 0; s < S * S; s++) {
    if (region[s] < 0 || seen[s]) continue;
    const r = region[s], cells = [s], st = [s];
    seen[s] = 1;
    while (st.length) {
      const c = st.pop()!;
      for (const nb of n4(c, S)) if (!seen[nb] && region[nb] === r) { seen[nb] = 1; st.push(nb); cells.push(nb); }
    }
    const b = best.get(r);
    if (!b) best.set(r, { size: cells.length, cells });
    else if (cells.length > b.size) { frags.push(b.cells); best.set(r, { size: cells.length, cells }); }
    else frags.push(cells);
  }
  for (const cells of frags) {
    const own = region[cells[0]], count = new Map<number, number>();
    for (const c of cells) for (const nb of n4(c, S)) if (region[nb] >= 0 && region[nb] !== own) count.set(region[nb], (count.get(region[nb]) ?? 0) + 1);
    let to = -1, m = 0;
    for (const [r, k] of count) if (k > m || (k === m && r < to)) { m = k; to = r; }
    if (to >= 0) for (const c of cells) region[c] = to;
    else { const id = nextId++; for (const c of cells) region[c] = id; } // ilhota solta: região própria
  }
}

/** Funde regiões abaixo de 30% da média com a vizinha de maior fronteira (menores primeiro). */
function mergeSmall(region: Int32Array, S: number, land: (i: number) => boolean): void {
  for (let pass = 0; pass < 8; pass++) {
    const area = new Map<number, number>();
    for (let i = 0; i < S * S; i++) if (region[i] >= 0) area.set(region[i], (area.get(region[i]) ?? 0) + 1);
    const mean = [...area.values()].reduce((a, b) => a + b, 0) / area.size;
    const border = new Map<number, Map<number, number>>();
    for (let i = 0; i < S * S; i++) {
      const r = region[i];
      if (r < 0) continue;
      for (const j of [i + 1, i + S]) {
        if (j >= S * S || (j === i + 1 && (i + 1) % S === 0) || !land(j)) continue;
        const q = region[j];
        if (q < 0 || q === r) continue;
        for (const [a, b] of [[r, q], [q, r]]) { const m = border.get(a) ?? border.set(a, new Map()).get(a)!; m.set(b, (m.get(b) ?? 0) + 1); }
      }
    }
    const small = [...area].filter(([r, a]) => a < 0.3 * mean && border.has(r)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    if (!small.length) return;
    const into = new Map<number, number>();
    for (const [r] of small) {
      if (into.has(r)) continue;
      // vizinha de maior fronteira entre as que não passam de 2× a média depois da fusão; senão a menor vizinha
      let to = -1, m = 0;
      const ra = area.get(r)!;
      for (const [q, k] of border.get(r)!) {
        if (into.has(q) || ra + area.get(q)! > 2 * mean) continue;
        if (k > m || (k === m && q < to)) { m = k; to = q; }
      }
      if (to < 0) for (const [q] of border.get(r)!) if (!into.has(q) && (to < 0 || area.get(q)! < area.get(to)!)) to = q;
      if (to >= 0) { into.set(r, to); into.set(to, to); }
    }
    for (let i = 0; i < S * S; i++) { const t = into.get(region[i]); if (t !== undefined && t !== region[i]) region[i] = t; }
  }
}

/** Regiões acima de 2.5× a média (planícies cercadas por rios) são divididas com novas sementes internas. */
function splitLarge(map: WorldMap, region: Int32Array): void {
  const S = map.size, area = new Map<number, number[]>();
  for (let i = 0; i < region.length; i++) if (region[i] >= 0) (area.get(region[i]) ?? area.set(region[i], []).get(region[i])!).push(i);
  const mean = [...area.values()].reduce((a, c) => a + c.length, 0) / area.size;
  let nextId = Math.max(...area.keys()) + 1;
  for (const [r, cells] of area) {
    if (cells.length <= 2.5 * mean) continue;
    const k = Math.ceil(cells.length / (1.2 * mean));
    // sementes por amostragem do ponto mais distante (determinístico: começa pela primeira célula)
    const seeds = [cells[0]], dmin = new Float64Array(cells.length).fill(Infinity);
    while (seeds.length < k) {
      const s0 = seeds[seeds.length - 1], x0 = s0 % S, y0 = (s0 - x0) / S;
      let far = 0;
      cells.forEach((c, i) => { const x = c % S, y = (c - x) / S; dmin[i] = Math.min(dmin[i], (x - x0) ** 2 + (y - y0) ** 2); if (dmin[i] > dmin[far]) far = i; });
      seeds.push(cells[far]);
    }
    const ids = seeds.map((_, i) => (i === 0 ? r : nextId++));
    const inside = new Set(cells), cost = new Map<number, number>(), heap = new Heap();
    seeds.forEach((sd, i) => { cost.set(sd, 0); region[sd] = ids[i]; heap.push(sd, 0); });
    for (const c of cells) if (!cost.has(c)) region[c] = -2;
    while (heap.size) {
      const [c, cc] = heap.pop();
      if (cc > cost.get(c)!) continue;
      for (const nb of n4(c, S)) {
        if (!inside.has(nb)) continue;
        const nc = cc + 1 + RIDGE_COST * Math.max(0, map.elevation[nb] - map.elevation[c]);
        if (nc < (cost.get(nb) ?? Infinity)) { cost.set(nb, nc); region[nb] = region[c]; heap.push(nb, nc); }
      }
    }
  }
  fixFragments(region, S);
}

function compact(region: Int32Array): Int16Array {
  const map = new Map<number, number>(), out = new Int16Array(region.length).fill(-1);
  for (let i = 0; i < region.length; i++) {
    const r = region[i];
    if (r < 0) continue;
    let id = map.get(r);
    if (id === undefined) { id = map.size; map.set(r, id); }
    out[i] = id;
  }
  return out;
}

function describe(map: WorldMap, cp: Int16Array): Province[] {
  const S = map.size;
  let count = 0;
  for (let i = 0; i < cp.length; i++) count = Math.max(count, cp[i] + 1);
  const sx = new Float64Array(count), sy = new Float64Array(count), cells = new Int32Array(count);
  const nb: Set<number>[] = Array.from({ length: count }, () => new Set());
  const coastal = new Uint8Array(count);
  for (let i = 0; i < cp.length; i++) {
    const p = cp[i];
    if (p < 0) continue;
    const x = i % S, y = (i - x) / S;
    sx[p] += x; sy[p] += y; cells[p]++;
    for (const j of n4(i, S)) {
      if (map.water[j] === 1) coastal[p] = 1;
      else if (cp[j] >= 0 && cp[j] !== p) nb[p].add(cp[j]);
    }
  }
  // centro: célula da província mais próxima do centróide (províncias não convexas)
  const best = new Float64Array(count).fill(Infinity), center = new Int32Array(count);
  for (let i = 0; i < cp.length; i++) {
    const p = cp[i];
    if (p < 0) continue;
    const x = i % S, y = (i - x) / S, d = (x - sx[p] / cells[p]) ** 2 + (y - sy[p] / cells[p]) ** 2;
    if (d < best[p]) { best[p] = d; center[p] = i; }
  }
  return Array.from({ length: count }, (_, p) => ({
    id: p, name: '', cells: cells[p], neighbors: [...nb[p]].sort((a, b) => a - b), coastal: coastal[p] === 1,
    center: { x: (center[p] % S) * CELL + CELL / 2, y: Math.floor(center[p] / S) * CELL + CELL / 2 },
    biome: Biome.Grassland, fertility: 1, forest: 0, rock: 0, slots: 3, sites: [],
  }));
}

function n4(i: number, S: number): number[] {
  const x = i % S, out: number[] = [];
  if (x > 0) out.push(i - 1);
  if (x < S - 1) out.push(i + 1);
  if (i >= S) out.push(i - S);
  if (i < S * S - S) out.push(i + S);
  return out;
}

class Heap {
  private i: number[] = [];
  private k: number[] = [];
  get size() { return this.i.length; }
  push(v: number, key: number) {
    this.i.push(v); this.k.push(key);
    let c = this.i.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (this.k[p] <= key) break;
      [this.i[p], this.i[c]] = [this.i[c], this.i[p]]; [this.k[p], this.k[c]] = [this.k[c], this.k[p]]; c = p;
    }
  }
  pop(): [number, number] {
    const top: [number, number] = [this.i[0], this.k[0]];
    const lv = this.i.pop()!, lk = this.k.pop()!;
    if (this.i.length) {
      this.i[0] = lv; this.k[0] = lk;
      let p = 0;
      for (;;) {
        let c = 2 * p + 1;
        if (c >= this.i.length) break;
        if (c + 1 < this.i.length && this.k[c + 1] < this.k[c]) c++;
        if (this.k[c] >= this.k[p]) break;
        [this.i[p], this.i[c]] = [this.i[c], this.i[p]]; [this.k[p], this.k[c]] = [this.k[c], this.k[p]]; p = c;
      }
    }
    return top;
  }
}

// ---- atributos ----

const FERTILITY: Record<Biome, number> = {
  [Biome.Ocean]: 0, [Biome.Beach]: 0.5, [Biome.Snow]: 0.1, [Biome.Taiga]: 0.6, [Biome.TemperateForest]: 1.0, [Biome.Grassland]: 1.2,
  [Biome.Swamp]: 0.7, [Biome.Savanna]: 0.9, [Biome.Desert]: 0.2, [Biome.Jungle]: 1.0, [Biome.Mountain]: 0.2,
};
const treeDensity = (b: Biome) => (DENSITY[b] ?? []).reduce((a, [k, p]) => a + (k === 'tree' || k === 'pine' ? p : 0), 0);
const rockDensity = (b: Biome) => (DENSITY[b] ?? []).reduce((a, [k, p]) => a + (k === 'rock' ? p : 0), 0);
const clamp15 = (v: number) => Math.min(1.5, Math.max(0, v));

/** Fatores (fertilidade, floresta e rocha estimadas pela densidade esperada por bioma), vagas, locais e nomes. */
function addAttributes(map: WorldMap, cp: Int16Array, provinces: Province[]): void {
  const S = map.size, count = provinces.length;
  const biomeCount = Array.from({ length: count }, () => new Array<number>(11).fill(0));
  const fert = new Float64Array(count), tree = new Float64Array(count), rock = new Float64Array(count), mtn = new Float64Array(count), riv = new Float64Array(count);
  const cellsOf: number[][] = Array.from({ length: count }, () => []);
  for (let i = 0; i < cp.length; i++) {
    const p = cp[i];
    if (p < 0) continue;
    cellsOf[p].push(i);
    if (map.water[i] !== 0) continue;
    const b = map.biome[i] as Biome;
    biomeCount[p][b]++;
    fert[p] += FERTILITY[b]; tree[p] += treeDensity(b); rock[p] += rockDensity(b);
    if (map.elevation[i] >= MOUNTAIN_LEVEL) mtn[p]++;
    if (map.river[i]) riv[p]++;
  }
  const mean = provinces.reduce((a, p) => a + p.cells, 0) / count;
  const rng = makeRng(subSeed(map.seed, 'nomes')), used = new Set<string>();
  for (const p of provinces) {
    const dry = Math.max(1, biomeCount[p.id].reduce((a, b) => a + b, 0));
    p.biome = biomeCount[p.id].indexOf(Math.max(...biomeCount[p.id])) as Biome;
    p.fertility = clamp15(fert[p.id] / dry + Math.min(0.3, (riv[p.id] / dry) * 3) + (p.coastal ? 0.1 : 0));
    p.forest = clamp15(tree[p.id] / dry / 0.15);
    const mFrac = mtn[p.id] / dry;
    p.rock = clamp15((rock[p.id] / dry / 0.02) * 0.5 + mFrac * 1.5);
    let slots = 3 + (p.cells > mean ? 1 : 0) + (p.cells > 1.5 * mean ? 1 : 0) + (p.fertility > 0.9 ? 1 : 0);
    if (mFrac > 0.4 || p.biome === Biome.Swamp) slots--;
    p.slots = Math.min(6, Math.max(3, slots));
    p.sites = pickSites(map, cellsOf[p.id], p);
    let name = '';
    do name = makeName(rng); while (used.has(name));
    used.add(name);
    p.name = name;
  }
}

/** Um local por vaga: células secas, sem rio e sem montanha, mais planas e perto do centro primeiro, afastadas ≥ 4 tiles. */
function pickSites(map: WorldMap, cells: number[], p: Province): { x: number; y: number }[] {
  const S = map.size;
  const slope = (i: number) => {
    const x = i % S; let m = 0;
    for (const j of [x > 0 ? i - 1 : i, x < S - 1 ? i + 1 : i, i - S >= 0 ? i - S : i, i + S < S * S ? i + S : i]) m = Math.max(m, Math.abs(map.elevation[j] - map.elevation[i]));
    return m;
  };
  const cand = cells.filter(i => map.water[i] === 0 && !map.river[i]);
  const score = (i: number) => {
    const x = (i % S) * CELL + CELL / 2, y = Math.floor(i / S) * CELL + CELL / 2;
    return Math.hypot(x - p.center.x, y - p.center.y) / CELL + slope(i) * 2000 + (map.elevation[i] >= MOUNTAIN_LEVEL ? 50 : 0);
  };
  const ranked = cand.map(i => [score(i), i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(e => e[1]);
  const out: { x: number; y: number }[] = [];
  for (const minD of [12, 8, 4]) {
    for (const i of ranked) {
      if (out.length >= p.slots) break;
      const x = (i % S) * CELL + CELL / 2, y = Math.floor(i / S) * CELL + CELL / 2;
      if (out.some(o => Math.hypot(o.x - x, o.y - y) < minD)) continue;
      out.push({ x, y });
    }
    if (out.length >= p.slots) break;
  }
  if (out.length < p.slots) p.slots = Math.max(1, out.length); // ilhota sem espaço: menos vagas
  return out;
}

const ONSET = ['b', 'c', 'd', 'f', 'g', 'l', 'm', 'n', 'p', 'r', 's', 't', 'v', 'br', 'tr', 'gr', 'dr', 'st', 'ch', 'th', 'val', 'mor', 'kar', 'el'];
const VOWEL = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'ou'];
const CODA = ['', '', 'n', 'r', 'l', 's', 'th', 'nd', 'rk', 'm'];
const SUFFIX = ['ia', 'or', 'en', 'heim', 'mar', 'dor', 'wick', 'ana', 'ova', 'ar', 'ell', 'ford'];

function makeName(rng: () => number): string {
  const pick = <T>(a: T[]) => a[Math.floor(rng() * a.length)];
  const syl = 1 + Math.floor(rng() * 2);
  let s = '';
  for (let i = 0; i < syl; i++) s += pick(ONSET) + pick(VOWEL) + pick(CODA);
  s += pick(SUFFIX);
  return s[0].toUpperCase() + s.slice(1);
}

/** 5–8 capitais sugeridas: acima da mediana de pontuação, longe umas das outras. */
function suggestCapitals(provinces: Province[]): number[] {
  const score = (p: Province) => p.fertility + 0.6 * p.forest + 0.6 * p.rock;
  const sorted = provinces.map(score).sort((a, b) => a - b), median = sorted[Math.floor(sorted.length / 2)];
  const cand = provinces.filter(p => score(p) >= median && p.neighbors.length >= 3 && p.slots >= 3)
    .sort((a, b) => score(b) - score(a) || a.id - b.id);
  for (let d = 1100; d >= 400; d -= 100) {
    const chosen: Province[] = [];
    for (const p of cand) {
      if (chosen.length >= 8) break;
      if (chosen.every(c => Math.hypot(c.center.x - p.center.x, c.center.y - p.center.y) >= d)) chosen.push(p);
    }
    if (chosen.length >= 5) return chosen.map(p => p.id);
  }
  return cand.slice(0, 5).map(p => p.id);
}
