/* Arkon operatör ekranının TMI emrine bağlanan işleri (Üretim Terminali ile aynı davranış): talimat adımı TMI'ye yazılır, başlatmadan
   önce girdi istasyonda mı sorulur. Paket TMI'den gelmiyorsa (yerel paket) ikisi de yerelde kalır. */
export interface TmiPaketi { id?: unknown; tmi?: { emirId?: unknown } | null }

// tmi-ue-<emir> doğrudan emirdir; tmi-ie-<iş emri> paketinde emir `tmi.emirId`'dedir. Emir bilinmiyorsa null.
export function tmiEmirId(p: TmiPaketi | null | undefined): number | null {
  if (!p) return null;
  const tmi = p.tmi && typeof p.tmi === 'object' ? p.tmi.emirId : undefined;
  if (typeof tmi === 'number' && Number.isSafeInteger(tmi) && tmi > 0) return tmi;
  const m = typeof p.id === 'string' ? /^tmi-ue-([1-9]\d*)$/.exec(p.id) : null;
  return m ? Number(m[1]) : null;
}

export interface Adim { id: number; tamam: boolean }

// İşaret iyimser yazılır; cevap gelince yalnız o adım cevaptan alınır (bekleyen öbür işaretleri ezmesin), hata olursa yalnız o adım geri döner.
export const adimYaz = <T extends Adim>(liste: readonly T[], id: number, f: (a: T) => T): T[] => liste.map(a => (a.id === id ? f(a) : a));
export function adimCevabiUygula<T extends Adim>(liste: readonly T[], id: number, cevap: readonly T[]): T[] {
  const yeni = cevap.find(a => a.id === id);
  return yeni ? adimYaz(liste, id, () => yeni) : [...liste];
}
