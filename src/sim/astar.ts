import type { MoveGrid } from './movegrid';

const DX = [1, -1, 0, 0, 1, 1, -1, -1], DY = [0, 0, 1, -1, 1, -1, 1, -1];

/**
 * A* 8-direções na grade inteira; o passo custa distância × custo da célula de chegada; não corta quina bloqueada.
 * Devolve as células depois de `from` até `to`; [] se já está lá; null se bloqueado ou inalcançável.
 */
// shortcut: caminho sem suavização (anda de centro em centro de célula); suavizar se o zigue-zague aparecer no jogo
export function findCellPath(grid: MoveGrid, from: number, to: number): number[] | null {
  const S = grid.size, N = S * S, cost = grid.cost;
  if (!(from >= 0 && from < N && to >= 0 && to < N) || cost[to] === 0) return null;
  if (from === to) return [];
  const g = new Float32Array(N).fill(Infinity), parent = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const tx = to % S, ty = (to / S) | 0;
  const h = (i: number) => { const dx = Math.abs((i % S) - tx), dy = Math.abs(((i / S) | 0) - ty); return Math.max(dx, dy) + 0.41421356 * Math.min(dx, dy); };
  // heap binário em arrays paralelos (sem alocar um objeto por nó)
  let hf = new Float32Array(1024), hi = new Int32Array(1024), hn = 0;
  const push = (f: number, i: number) => {
    if (hn === hf.length) { const nf = new Float32Array(hn * 2), ni = new Int32Array(hn * 2); nf.set(hf); ni.set(hi); hf = nf; hi = ni; }
    let c = hn++;
    while (c > 0) { const p = (c - 1) >> 1; if (hf[p] <= f) break; hf[c] = hf[p]; hi[c] = hi[p]; c = p; }
    hf[c] = f; hi[c] = i;
  };
  const pop = () => {
    const top = hi[0], f = hf[--hn], i = hi[hn];
    let p = 0;
    for (;;) {
      let c = 2 * p + 1;
      if (c >= hn) break;
      if (c + 1 < hn && hf[c + 1] < hf[c]) c++;
      if (hf[c] >= f) break;
      hf[p] = hf[c]; hi[p] = hi[c]; p = c;
    }
    hf[p] = f; hi[p] = i;
    return top;
  };
  g[from] = 0; push(h(from), from);
  while (hn > 0) {
    const i = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === to) break;
    const x = i % S, y = (i / S) | 0;
    for (let d = 0; d < 8; d++) {
      const nx = x + DX[d], ny = y + DY[d];
      if (nx < 0 || ny < 0 || nx >= S || ny >= S) continue;
      const n = ny * S + nx, w = cost[n];
      if (w === 0 || closed[n] || (d >= 4 && (cost[y * S + nx] === 0 || cost[ny * S + x] === 0))) continue;
      const c = g[i] + (d >= 4 ? Math.SQRT2 : 1) * w;
      if (c < g[n]) { g[n] = c; parent[n] = i; push(c + h(n), n); }
    }
  }
  if (!closed[to]) return null;
  const path: number[] = [];
  for (let i = to; i !== from; i = parent[i]) path.push(i);
  return path.reverse();
}
