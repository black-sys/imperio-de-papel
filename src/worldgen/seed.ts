export function parseSeed(raw: string | null): number | null {
  if (raw === null || !/^\d{1,10}$/.test(raw)) return null;
  const n = Number(raw);
  return n <= 4294967295 ? n : null;
}

export function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}
