// 3326: teklifin teslim süresi (gün) ile termin tarihi birbirinden hesaplanır; gün takvim günüdür, başlangıç bugündür (tesis günü).
const GUN_MS = 86_400_000;
const an = (gun: string): number => Date.parse(`${gun}T00:00:00Z`);

export const bugun = (simdi: number = Date.now()): string => new Date(simdi + 3 * 3_600_000).toISOString().slice(0, 10);

// Termine kalan gün; geçmiş ya da bugünkü termin ve 365'ten uzak termin süre vermez (sözleşme 1-365).
export function teslimGunu(termin: string | null, bas: string): number | null {
  if (termin === null || !/^\d{4}-\d{2}-\d{2}$/.test(termin)) return null;
  const n = Math.round((an(termin) - an(bas)) / GUN_MS);
  return n >= 1 && n <= 365 ? n : null;
}

export function terminGunu(gun: number, bas: string): string {
  return new Date(an(bas) + gun * GUN_MS).toISOString().slice(0, 10);
}
