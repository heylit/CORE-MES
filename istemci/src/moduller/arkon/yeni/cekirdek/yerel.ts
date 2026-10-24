// Arkon'un cihazdaki ayarları (yukleyici.ts LS, FEAT, LITE): 'arkon:' önekli JSON, eski ekranla aynı anahtarlar. Çıkışta silinenler
// (yerel-temizlik.ts) burada da silinir; depolama kapalıysa okuma null, yazma sessizce düşer.
const ONEK = 'arkon:';

export const yerel = {
  oku<T = unknown>(anahtar: string): T | null {
    try { return JSON.parse(window.localStorage.getItem(ONEK + anahtar) ?? 'null') as T | null; } catch { return null; }
  },
  yaz(anahtar: string, deger: unknown): void {
    try {
      if (deger === null || deger === undefined) window.localStorage.removeItem(ONEK + anahtar);
      else window.localStorage.setItem(ONEK + anahtar, JSON.stringify(deger));
    } catch { /* depolama kapalı: ayar yalnız bu açılışta geçerli */ }
  },
};

// Ekran modülleri (Ayarlar'dan açılıp kapanır, bu cihazda saklanır).
export interface EkranOzellikleri { spindle: boolean; autoCount: boolean }
const VARSAYILAN_OZELLIKLER: EkranOzellikleri = { spindle: false, autoCount: false };
export const ozellikler = {
  oku(): EkranOzellikleri { return { ...VARSAYILAN_OZELLIKLER, ...(yerel.oku<Partial<EkranOzellikleri>>('feat') ?? {}) }; },
  yaz<K extends keyof EkranOzellikleri>(k: K, v: EkranOzellikleri[K]): void { yerel.yaz('feat', { ...ozellikler.oku(), [k]: v }); },
};

// Performans kipi: düğmesi kabuğun üst çubuğundadır, aynı 'arkon:lite' anahtarını yazar. Elle seçim yoksa zayıf cihaz kendiliğinden açar.
export function hafifKip(): boolean {
  const v = yerel.oku<boolean>('lite');
  if (v === true || v === false) return v;
  const n = navigator.hardwareConcurrency || 8;
  const m = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  let azHareket = false;
  try { azHareket = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* eski tarayıcı */ }
  return n <= 4 || m <= 3 || azHareket;
}
