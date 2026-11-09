import type { Db } from '#cekirdek/db.ts';
import type { IsEmriKaynagi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { adimliEmirAyrintisi, aralikAdetleri, isEmriSureOzeti, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import { terminalOlcumleri } from './kurallar.ts';
import { kullanilmisOpNolari, yururluktekiRevizyonIdleri } from './sorgular.ts';
export type { DurumRotaAdimi, DurumRotaRevizyonu, RotaAdimi, RotaRevizyonu } from './servis.ts';
export type { EtkinAdimSuresi } from './kurallar.ts';
export { yururluktekiRevizyonId, yururluktekiRevizyonIdleri } from './sorgular.ts';
// Emir bitti olayının dinleyicisi (B38); bağı kablolama.ts kurar (uretim-emirleri rotayı ithal edemez).
export { emirBittiYansit, isEmriKopyalandiYansit } from './servis.ts';
// İş emri bitti (2578 a): ölçüm emrin kapanmasını beklemeden yazılır.
export { adimBittiYansit } from './servis/sureler.ts';
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

// Arkon "Süre ölçülmedi" (2567): bitmiş emrin terminal ölçümüne girmeyen iş emirleri ve nedenleri. Ölçüt emirBittiYansit ile aynıdır:
// bitmiş (tamam), kaynağı olan, fason olmayan iş emri ölçülür. Rotada olmayan adım (ek adım) ölçülmez; rotadaki adımda hazırlık ya da
// işlem süresi çıkmadıysa o tür yazılmamıştır; işlem süresi sağlam ya da hurda sayımdan çıkar, sayımı olup hepsi karar bekleyen (ilk
// parça, kalite onayı) ya da red olan iş emri "sağlam sayım yok"tur (2566 S-1). Neden kayıtlı ölçümden değil, ölçümün kaynağından (süre özeti) okunur: biri yazılıp öteki
// atlandıysa da görünür. Bitmemiş ya da malzemesiz emir haritada yoktur. Yetki
// denetlemez, bağı çağıran kurar.
export type OlcumAtlamaNedeni = 'rotada-yok' | 'ayar-yok' | 'sayim-yok' | 'saglam-yok';
export interface OlcumAtlamasi { isEmriId: number; opNo: number; kaynak: IsEmriKaynagi; bitis: string | null; nedenler: OlcumAtlamaNedeni[] }
export async function olcumAtlamalari(
  db: Db, emirIdleri: readonly number[],
): Promise<Map<number, { emirNo: string; isEmirsiz: boolean; atlananlar: OlcumAtlamasi[] }>> {
  const sonuc = new Map<number, { emirNo: string; isEmirsiz: boolean; atlananlar: OlcumAtlamasi[] }>();
  for (const id of new Set(emirIdleri)) {
    const emir = await uretimEmriOzeti(db, id);
    if (emir === null || emir.malzemeNo === null || emir.durum !== 'bitti') continue;
    const { isEmirleri } = await adimliEmirAyrintisi(db, id);
    const opNolari = new Set(await kullanilmisOpNolari(db, emir.malzemeNo));
    const adaylar = isEmirleri.filter((i) => i.durum === 'tamam' && i.kaynak !== null && i.kaynak.tur !== 'fason');
    // Sayımı olan her iş emri haritadadır, türü ne olursa olsun.
    const sayimli = await aralikAdetleri(db, 'is_emri', adaylar.map((i) => i.id), '-infinity', 'infinity');
    const atlananlar: OlcumAtlamasi[] = [];
    for (const i of adaylar) {
      if (i.kaynak === null) continue;
      const nedenler: OlcumAtlamaNedeni[] = [];
      if (!opNolari.has(i.opNo)) nedenler.push('rotada-yok');
      else {
        const olcum = terminalOlcumleri(await isEmriSureOzeti(db, i.id));
        if (olcum.hazirlik === null) nedenler.push('ayar-yok');
        if (olcum.islem === null) nedenler.push(sayimli.has(i.id) ? 'saglam-yok' : 'sayim-yok');
      }
      if (nedenler.length > 0) atlananlar.push({ isEmriId: i.id, opNo: i.opNo, kaynak: i.kaynak, bitis: i.bitis, nedenler });
    }
    sonuc.set(id, { emirNo: emir.emirNo, isEmirsiz: isEmirleri.length === 0, atlananlar });
  }
  return sonuc;
}
