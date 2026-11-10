const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STAGES: Record<string, string> = { forma: 'Formando o continente', placas: 'Erguendo montanhas', umidade: 'Soprando os ventos', rios: 'Traçando rios', biomas: 'Distribuindo biomas' };

export function initHud(opts: { seed: number; onGenerate: (seed: string) => void; getLink: () => string }): void {
  const input = $<HTMLInputElement>('seed');
  input.value = String(opts.seed);
  $('gen').onclick = () => opts.onGenerate(input.value.trim());
  input.onkeydown = e => { if (e.key === 'Enter') opts.onGenerate(input.value.trim()); e.stopPropagation(); };
  $('link').onclick = async () => {
    const btn = $('link');
    try { await navigator.clipboard.writeText(opts.getLink()); btn.textContent = 'Copiado!'; }
    catch { prompt('Copie o link:', opts.getLink()); }
    setTimeout(() => (btn.textContent = 'Copiar link'), 1500);
  };
}

export function setSeedField(seed: number): void { $<HTMLInputElement>('seed').value = String(seed); }

export function setProgress(stage: string | null, pct: number): void {
  $('stage').textContent = stage === null ? '' : STAGES[stage] ?? stage;
  ($('progress').firstElementChild as HTMLElement).style.width = `${Math.round(pct * 100)}%`;
  $('progress').style.visibility = stage === null ? 'hidden' : 'visible';
}

export function setInfo(i: { x: number; y: number; biome: string; fps: number }): void {
  $('info').textContent = `x ${Math.floor(i.x)}  y ${Math.floor(i.y)} · ${i.biome} · ${i.fps} fps`;
}

export function showError(msg: string | null, seed?: number): void {
  const el = $('error');
  el.style.display = msg ? 'block' : 'none';
  el.textContent = msg ? `Erro ao gerar a semente ${seed}: ${msg}` : '';
}
