import { useCallback, useSyncExternalStore } from 'react';

// Tablo görünümü (3748): satır aralığı bütün tablolar için tek tercihtir, gizlenen sütunlar tabloya göre saklanır.
// Tercih tarayıcıdadır; sunucuya yazılmaz. Depolama kapalıysa bellekte kalır ve sayfa yenilenince düşer.
export type Yogunluk = 'rahat' | 'yogun';

const YOGUNLUK_ANAHTARI = 'tmi:tablo:yogunluk';
const sutunAnahtari = (tablo: string): string => `tmi:tablo:sutun:${tablo}`;
const grupAnahtari = (tablo: string): string => `tmi:tablo:grup:${tablo}`;

const bellek = new Map<string, string | null>();
const dinleyiciler = new Set<() => void>();
const abone = (d: () => void): (() => void) => { dinleyiciler.add(d); return () => { dinleyiciler.delete(d); }; };

function oku(anahtar: string): string | null {
  if (bellek.has(anahtar)) return bellek.get(anahtar) ?? null;
  let deger: string | null = null;
  try { deger = localStorage.getItem(anahtar); } catch { /* depolama kapalı */ }
  bellek.set(anahtar, deger);
  return deger;
}

function yaz(anahtar: string, deger: string | null): void {
  bellek.set(anahtar, deger);
  try {
    if (deger === null) localStorage.removeItem(anahtar);
    else localStorage.setItem(anahtar, deger);
  } catch { /* depolama kapalı; bellekte kalır */ }
  dinleyiciler.forEach((d) => d());
}

// Seçilmemişse null: cihazın varsayılan aralığı (dokunmatikte geniş, farede dar) geçerlidir.
export function useYogunluk(): [Yogunluk | null, (y: Yogunluk | null) => void] {
  const deger = useSyncExternalStore(abone, () => oku(YOGUNLUK_ANAHTARI));
  const secili: Yogunluk | null = deger === 'rahat' || deger === 'yogun' ? deger : null;
  const degistir = useCallback((y: Yogunluk | null) => { yaz(YOGUNLUK_ANAHTARI, y); }, []);
  return [secili, degistir];
}

// Saklanan değer virgülle ayrılmış sütun anahtarlarıdır; aynı dizgi aynı kümeyi verir, böylece çizim kararlı kalır.
const kumeler = new Map<string, ReadonlySet<string>>();
const BOS: ReadonlySet<string> = new Set();
function kume(deger: string | null): ReadonlySet<string> {
  if (!deger) return BOS;
  let k = kumeler.get(deger);
  if (!k) { k = new Set(deger.split(',').filter(Boolean)); kumeler.set(deger, k); }
  return k;
}

// Tablo adı yoksa hiçbir sütun gizli değildir (kancanın koşulsuz çağrılabilmesi için).
export function useGizliSutunlar(tablo: string | null): [ReadonlySet<string>, (anahtar: string, gizli: boolean) => void] {
  const deger = useSyncExternalStore(abone, () => (tablo === null ? null : oku(sutunAnahtari(tablo))));
  const gizli = kume(deger);
  const degistir = useCallback((anahtar: string, gizle: boolean) => {
    if (tablo === null) return;
    const yeni = new Set(kume(oku(sutunAnahtari(tablo))));
    if (gizle) yeni.add(anahtar); else yeni.delete(anahtar);
    yaz(sutunAnahtari(tablo), yeni.size ? [...yeni].sort().join(',') : null);
  }, [tablo]);
  return [gizli, degistir];
}

// 3797: tablonun seçili gruplaması. Saklanan değer seçeneğin anahtarı ya da 'yok'; hiç seçilmemişse null (ekranın varsayılanı geçer).
export function useGrupSecimi(tablo: string | null): [string | null, (secim: string) => void] {
  const deger = useSyncExternalStore(abone, () => (tablo === null ? null : oku(grupAnahtari(tablo))));
  const degistir = useCallback((secim: string) => { if (tablo !== null) yaz(grupAnahtari(tablo), secim); }, [tablo]);
  return [deger, degistir];
}

// Testlerin birbirini etkilememesi için.
export function tabloTercihleriniSifirla(): void { bellek.clear(); }
