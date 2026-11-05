import type { BekleyenKarari, DefterOlayi } from '#paylasilan/sozlesme/planlama.ts';

// 2129-2 b: çalışma yazmasında defter satırları önceki ve yeni çalışmanın bekleyen listesinden çıkar. Yeni satır: değişiklik (başka sayfanın
// farkıysa kaynak). Düşen satır: istemcinin bildirdiği karar; karar yoksa plan bu yazmada güncellendiyse uygulandı (yeniden çözme bütün
// bekleyeni uygular), güncellenmediyse değişiklik karar verilmeden geri alındı. "Kaydı olmayan önceki değişiklikler" satırı (`eski`) yeni bir
// değişiklik değildir: eklenince yazılmaz, düşünce kararı yazılır.
export const ESKI_BEKLEYEN = 'eski';
const NE_EN_COK = 500;
const AYRINTI_EN_COK = 2000;
const ISLER_EN_COK = 200;

export interface DefterYazimi { olay: DefterOlayi; bekleyenId: string; ne: string; ayrinti: string; isler: string[]; gerekce: string | null }
interface Bekleyen { id: string; ne: string; ayrinti: string; isler: string[]; dis: boolean }

const nesne = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const kes = (s: string, n: number): string => (s.length > n ? s.slice(0, n) : s);

function bekleyenler(c: unknown): Bekleyen[] {
  if (!nesne(c) || !Array.isArray(c.bekleyen)) return [];
  return c.bekleyen.flatMap((b) => {
    if (!nesne(b) || typeof b.id !== 'string' || b.id.length === 0 || b.id.length > 200 || typeof b.ne !== 'string') return [];
    const isler = Array.isArray(b.isler) ? b.isler.filter((x): x is string => typeof x === 'string').slice(0, ISLER_EN_COK) : [];
    return [{ id: b.id, ne: kes(b.ne, NE_EN_COK), ayrinti: typeof b.ayrinti === 'string' ? kes(b.ayrinti, AYRINTI_EN_COK) : '', isler, dis: b.dis === true }];
  });
}

function planGuncel(c: unknown): boolean {
  if (!nesne(c) || !nesne(c.plan)) return false;
  return typeof c.dataVer === 'number' && c.plan.dataVer === c.dataVer;
}

export function defterSatirlari(once: unknown, sonra: unknown, kararlar: readonly BekleyenKarari[] = []): DefterYazimi[] {
  const a = bekleyenler(once), b = bekleyenler(sonra);
  const aId = new Set(a.map((x) => x.id)), bId = new Set(b.map((x) => x.id));
  const karar = new Map(kararlar.map((k) => [k.id, k]));
  const guncellendi = !planGuncel(once) && planGuncel(sonra);
  const l: DefterYazimi[] = [];
  for (const x of a) {
    if (bId.has(x.id)) continue;
    const k = karar.get(x.id);
    const olay: DefterOlayi = k ? k.karar : guncellendi ? 'uygulandi' : 'geri-alindi';
    l.push({ olay, bekleyenId: x.id, ne: x.ne, ayrinti: x.ayrinti, isler: x.isler, gerekce: k?.karar === 'reddedildi' ? k.gerekce : null });
  }
  for (const x of b) {
    if (aId.has(x.id) || x.id === ESKI_BEKLEYEN) continue;
    l.push({ olay: x.dis ? 'kaynak' : 'degisiklik', bekleyenId: x.id, ne: x.ne, ayrinti: x.ayrinti, isler: x.isler, gerekce: null });
  }
  return l;
}
