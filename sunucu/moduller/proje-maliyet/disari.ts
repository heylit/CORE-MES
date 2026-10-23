// Başka modüller (plan motoru, Üretim emirleri 6c) iş emrinin tahmini maliyetini ve emrin planlanan malzeme maliyetini (227 a) buradan alır. Plan bu modülü doğrudan ithal etmez
// (proje-maliyet plan'ı ithal eder); bağ sunucu/kablolama.ts'te kurulur (ADR 0006). Çağıranın db'sini kullanır, yetki denetlemez.
export { isEmriTahminiMaliyetleri, uretimEmriMalzemeMaliyetleri } from './servis.ts';
// H8 (K-D6): tek genel gider kuralı. Siparişler bu modülü ithal edemez (proje-maliyet siparişleri ithal eder); teklif maliyeti işlevleri
// kablolama.ts'te kaydedilen karşılıkla alır. Saf işlevlerdir.
export { genelGiderEksikleri, genelGiderTutari, genelGiderYukAlir } from './kurallar.ts';
export type { AdimKaynagi, GenelGiderEksigi, GenelGiderOraniGirdisi } from './kurallar.ts';
