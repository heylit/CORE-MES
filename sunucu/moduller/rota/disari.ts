import type { Db } from '#cekirdek/db.ts';
import { uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import { yururluktekiRevizyonIdleri } from './sorgular.ts';
export type { DurumRotaAdimi, DurumRotaRevizyonu, RotaAdimi, RotaRevizyonu } from './servis.ts';
export type { EtkinAdimSuresi } from './kurallar.ts';
export { yururluktekiRevizyonId, yururluktekiRevizyonIdleri } from './sorgular.ts';
// Emir bitti olayının dinleyicisi (B38); bağı kablolama.ts kurar (uretim-emirleri rotayı ithal edemez).
export { emirBittiYansit, isEmriKopyalandiYansit } from './servis.ts';
// Emre sabitlenen işlem şartnameleri (971 a): kalite, sevkiyat ve satın alma okur; tabloya yazmaz.
export { isEmriSartnameleri } from './servis.ts';
export type { IsEmriSartnamesi } from '#paylasilan/sozlesme/rota.ts';
// Emre sabitlenen talimat sürümünün adımları ve kontrol noktaları (989 a): terminal adım adım gösterir; tabloya yazmaz.
export { talimatSurumuAdimlari } from './servis.ts';
export type { KontrolNoktasi, TalimatAdimi } from '#paylasilan/sozlesme/rota.ts';
export { acikRevizyonSayisi, adimBilesenleri, adimIlkParcaSecimleri, adimEtkinSureleri, adimEtkinSureleriToplu, durumRevizyonlari, emreKopyala, gecerliTalimat, gecerliTalimatlarToplu, girdisiEksikRevizyonlar, revizyonGetir, revizyonKunyeleri, revizyonlar, urunAgaci, yururluktekiRevizyon } from './servis.ts';
// 1476-E: çok katmanlı emirde düğümün patlatmadaki rota revizyonu ve malzemesi; yetki denetlemez.
export { patlatmaDugumleri, patlatmaRevizyonu } from './servis.ts';
export type { PatlatmaDugumu } from './servis.ts';
export {
  adimMiktarlari, agaciAc, akisiCikar, akisliBaslayabilirMi, akisliIslenebilirAdet, etkinSure, girdiOlabilirMi, isEmriKaynagi, kaynaktakiSure, teorikSure, yeniOpNo,
} from './kurallar.ts';
// 3D Atölyesi yüzey işaretlemesinin işlem listesi (2144, 2140-3); bağı kablolama.ts kurar, yetki denetlemez.
export { yuzeyIslemiAdimlari } from './servis.ts';
// Patlamış rota önizlemesinde ara adımın statülü kartı ve stoğu (2610 a); bağı kablolama.ts kurar (Reçete ve Rota rotayı ithal eder).
export { araHalCozucusuKaydet } from './servis.ts';
export type { AraHalCozucusu, AraHalCozumu } from './servis.ts';
export { malzemeKartiIzleri } from './sorgular.ts';

// Hazırlık matrisinin rota maddesi (2146-1 a, yalnız uyarır): emir, ürünün yürürlükteki rota revizyonuyla mı açıldı. Rotadan açılmamış
// emirde madde gerekmez; ürünün yürürlükte revizyonu yoksa ya da emir eski revizyonla açıldıysa eksiktir. Bağı kablolama.ts kurar.
export async function emirRotaHazirliklari(db: Db, emirIdleri: readonly number[]): Promise<Map<number, { durum: 'yok' | 'tamam'; secildi: boolean }>> {
  const emirler = [];
  for (const id of new Set(emirIdleri)) {
    const e = await uretimEmriOzeti(db, id);
    if (e !== null) emirler.push(e);
  }
  const yururlukte = await yururluktekiRevizyonIdleri(db, [...new Set(emirler.flatMap((e) => (e.malzemeNo === null ? [] : [e.malzemeNo])))]);
  return new Map(emirler.map((e) => [e.id, e.kaynakRotaRevizyonId === null || e.malzemeNo === null
    ? { durum: 'yok' as const, secildi: false }
    : { durum: yururlukte.get(e.malzemeNo) === e.kaynakRotaRevizyonId ? 'tamam' as const : 'yok' as const, secildi: true }]));
}
