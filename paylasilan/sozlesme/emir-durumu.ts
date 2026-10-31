// zod taşımaz: istemci değer olarak ithal eder (eslint.config.js ZODSUZ).
// Üretim emri ve iş emri durumunun tek sözlüğü (1389 a); sahibi uretim-emirleri. Her ekran adı ve tonu buradan okur, kendi adını yazmaz.
// Projeler uretim-emirleri'ne bağımlı olduğundan sözlük istemci modülünde değil sözleşmededir (modül döngüsü olmasın).
import type { CalismaDurumu, EmirDurumu, IsEmriDurumu } from './uretim-emirleri.ts';

// İstemcinin Rozet tonlarıyla aynı küme.
export type DurumTonu = 'bilgi' | 'tamam' | 'uyari' | 'hata' | 'pasif';
export interface DurumGosterimi { etiket: string; ton: DurumTonu }
export type KapanisSonucu = 'tamamlandi' | 'saglamsiz';

export const EMIR_DURUMU: Readonly<Record<EmirDurumu, DurumGosterimi>> = {
  taslak: { etiket: 'Taslak', ton: 'pasif' },
  planli: { etiket: 'Planlı', ton: 'bilgi' },
  basladi: { etiket: 'Başladı', ton: 'uyari' },
  bitti: { etiket: 'Üretimi bitti', ton: 'tamam' },
  iptal: { etiket: 'İptal', ton: 'pasif' },
};
// 1082 a: son adımda emir "Üretimi bitti" olur; kalite ve müdür onayından sonra kapanış sonucu yazılır.
export const KAPANIS_SONUCU: Readonly<Record<KapanisSonucu, DurumGosterimi>> = {
  tamamlandi: { etiket: 'Tamamlandı', ton: 'tamam' },
  saglamsiz: { etiket: 'Kapandı (sağlamsız)', ton: 'tamam' },
};
export const CALISMA_DURUMU: Readonly<Record<CalismaDurumu, DurumGosterimi>> = {
  calisiyor: { etiket: 'Çalışıyor', ton: 'tamam' },
  durakli: { etiket: 'Duraklı', ton: 'uyari' },
  durdu: { etiket: 'Durdu', ton: 'hata' },
};
export const IS_EMRI_DURUMU: Readonly<Record<IsEmriDurumu, DurumGosterimi>> = {
  bekliyor: { etiket: 'Bekliyor', ton: 'pasif' },
  calisiyor: { etiket: 'Çalışıyor', ton: 'uyari' },
  tamam: { etiket: 'Bitti', ton: 'tamam' },
};

// Başlamış emirde canlı çalışma durumu adın ikinci parçasıdır ("Başladı · Duraklı"): ilk kelime her ekranda aynı kalır, renk canlı durumdan gelir.
export function emirDurumuGosterimi(e: { durum: EmirDurumu; kapanisSonucu?: KapanisSonucu | null; calisma?: CalismaDurumu | null }): DurumGosterimi {
  if (e.durum === 'bitti' && e.kapanisSonucu) return KAPANIS_SONUCU[e.kapanisSonucu];
  if (e.durum === 'basladi' && e.calisma) {
    const c = CALISMA_DURUMU[e.calisma];
    return { etiket: `${EMIR_DURUMU.basladi.etiket} · ${c.etiket}`, ton: c.ton };
  }
  return EMIR_DURUMU[e.durum];
}
