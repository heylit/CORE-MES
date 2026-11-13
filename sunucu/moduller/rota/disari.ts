import type { Db } from '#cekirdek/db.ts';
import type { IsEmriKaynagi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { adimliEmirAyrintisi, aralikAdetleri, isEmriSureOzeti, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import { gecerliAletVarMi } from '../kalibrasyon/disari.ts';
import { ekipmanHazirliklari, terminalOlcumAdaylari, terminalOlcumKarari, terminalOlcumleri } from './kurallar.ts';
import type { EkipmanHazirligi, OlcumAtlamaNedeni } from './kurallar.ts';
import { isEmriEkipmanlari, kullanilmisOpNolari, yururluktekiRevizyonIdleri } from './sorgular.ts';
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
// Hazırlık matrisinin aparat ve ölçü aleti maddeleri (2893-4 a, yalnız uyarır): iş emrine rota adımından kopyalanan liste. Aparat
// stokta en az bir adetse (stok üst kattadır: okuyucuyu kablolama verir), ölçü aleti türünde kalibrasyonu geçerli alet varsa hazırdır; listesi boş iş emrinde madde gerekmez. Bağı kablolama.ts kurar.
export type StokAdetleri = (db: Db, malzemeIdler: number[]) => Promise<ReadonlyMap<number, { toplam: string }>>;
export async function isEmriAparatHazirliklari(db: Db, isEmriIdleri: readonly number[], stokAdetleri: StokAdetleri): Promise<Map<number, EkipmanHazirligi>> {
  const liste = await isEmriEkipmanlari(db, isEmriIdleri);
  const kartlar = [...new Set(liste.flatMap((x) => (x.tur === 'aparat' && x.malzemeId !== null ? [x.malzemeId] : [])))];
  const stokta = kartlar.length === 0 ? new Map() : await stokAdetleri(db, kartlar);
  return ekipmanHazirliklari(isEmriIdleri, liste.flatMap((x) => (x.tur === 'aparat' && x.malzemeId !== null ? [{ isEmriId: x.isEmriId, kimlik: x.malzemeId }] : [])),
    (id) => Number(stokta.get(id)?.toplam ?? 0) > 0);
}
export async function isEmriOlcuAletiHazirliklari(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, EkipmanHazirligi>> {
  const liste = await isEmriEkipmanlari(db, isEmriIdleri);
  const gecerli = new Map<number, boolean>();
  for (const t of new Set(liste.flatMap((x) => (x.tur === 'olcu_aleti' && x.aletTuruId !== null ? [x.aletTuruId] : [])))) gecerli.set(t, (await gecerliAletVarMi(db, t)) === true);
  return ekipmanHazirliklari(isEmriIdleri, liste.flatMap((x) => (x.tur === 'olcu_aleti' && x.aletTuruId !== null ? [{ isEmriId: x.isEmriId, kimlik: x.aletTuruId }] : [])),
    (id) => gecerli.get(id) === true);
}

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

// Arkon "Süre ölçülmedi" (2567): emrin bitmiş iş emirlerinden terminal ölçümüne girmeyenler ve nedenleri; ölçüt iş emri bitince yazılan
// ölçümle ortaktır (2578 a; terminalOlcumAdaylari, terminalOlcumKarari), emrin bitmesi beklenmez. Neden kayıtlı ölçümden değil, ölçümün
// kaynağından (süre özeti) okunur: biri yazılıp öteki atlandıysa da görünür. İş emirsiz emir yalnız bittiyse işaretlenir. Malzemesiz emir
// haritada yoktur. Yetki denetlemez, bağı çağıran kurar.
export type { OlcumAtlamaNedeni } from './kurallar.ts';
export interface OlcumAtlamasi { isEmriId: number; opNo: number; kaynak: IsEmriKaynagi; bitis: string | null; nedenler: OlcumAtlamaNedeni[] }
export async function olcumAtlamalari(
  db: Db, emirIdleri: readonly number[],
): Promise<Map<number, { emirNo: string; isEmirsiz: boolean; atlananlar: OlcumAtlamasi[] }>> {
  const sonuc = new Map<number, { emirNo: string; isEmirsiz: boolean; atlananlar: OlcumAtlamasi[] }>();
  for (const id of new Set(emirIdleri)) {
    const emir = await uretimEmriOzeti(db, id);
    if (emir === null || emir.malzemeNo === null) continue;
    const { isEmirleri } = await adimliEmirAyrintisi(db, id);
    const { rotada, rotadaYok } = terminalOlcumAdaylari(isEmirleri, new Set(await kullanilmisOpNolari(db, emir.malzemeNo)));
    // Sayımı olan her iş emri haritadadır, türü ne olursa olsun.
    const sayimli = await aralikAdetleri(db, 'is_emri', rotada.map((i) => i.id), '-infinity', 'infinity');
    const atlananlar: OlcumAtlamasi[] = [];
    const ekle = (i: (typeof isEmirleri)[number], nedenler: OlcumAtlamaNedeni[]): void => {
      if (i.kaynak !== null && nedenler.length > 0) atlananlar.push({ isEmriId: i.id, opNo: i.opNo, kaynak: i.kaynak, bitis: i.bitis, nedenler });
    };
    for (const i of rotadaYok) ekle(i, ['rotada-yok']);
    for (const i of rotada) ekle(i, terminalOlcumKarari(terminalOlcumleri(await isEmriSureOzeti(db, i.id)), sayimli.has(i.id)).atlananlar);
    atlananlar.sort((a, b) => a.opNo - b.opNo || a.isEmriId - b.isEmriId);
    sonuc.set(id, { emirNo: emir.emirNo, isEmirsiz: emir.durum === 'bitti' && isEmirleri.length === 0, atlananlar });
  }
  return sonuc;
}

// Terminal: emre sabitlenen talimat sürümünün 3B sahnesi (3209 a); yetki denetlemez.
export { talimatSahnesi } from './servis.ts';
export type { TalimatSahnesi } from '#paylasilan/sozlesme/rota.ts';
