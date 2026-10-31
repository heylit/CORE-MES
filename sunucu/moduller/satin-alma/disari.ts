import type { Db } from '#cekirdek/db.ts';
import { VARSAYILAN_ONAY_LIMITLERI } from './kurallar.ts';
import * as servis from './servis.ts';
import * as sorgu from './sorgular.ts';
// 1237: Ctrl K genel aramasının talep ve sipariş kaynakları; çekirdek ad kuralıyla bulur (1233).
export { kayitAramaKaynaklari } from './arama/kaynaklar.ts';
// Stok modülünün mal kabul belgesi teslim bekleyen sipariş satırlarını buradan okur (fiyatsız; SAT-37).
export { siparisSatirlari } from './servis.ts';
export type { SiparisSatiriOkuma as SiparisSatiri } from './sorgular.ts';
// SH1 a: stok mal kabul işleminin içinde teslimi yazar, mal kabul düzeltilince geri alır. Çağıranın işlemini kullanır, yetki
// denetlemez (stok ucunda); hata UygulamaHatasi'dır (422 geçersiz, 409 aynı mal kabul satırı ikinci kez), stok işlemi geri sarar.
export { teslimGeriAl, teslimIsle } from './servis.ts';
// Stok değeri: malzemenin en son teslim alınan satın alma fiyatı (teklif birim fiyatı, para birimi, TRY karşılığı ve teslim zamanı).
export { ortalamaAlisFiyatlari, sonAlisFiyatlari } from './servis.ts';
// Plan motoru: açık satın alma siparişinde gelecek malzemenin kalan miktarı ve beklenen gelişi (termin sırasıyla, tarihsiz en sonda).
// Yetki denetlemez; fiyat yok.
export { malzemeGelisTarihleri } from './servis.ts';
export type { MalzemeGelisi } from './servis.ts';
export type { OrtalamaAlisFiyati, SonAlisFiyati } from './servis.ts';
// 533 a: malzemenin tedarik termini (sahibi satın alma). Plan termini okur; satırı olmayan malzeme haritada yoktur (termin
// bekliyor). Plan "olması gereken" tarihi tam liste olarak yazar (listede olmayanın gereken tarihi boşalır, sürüm artmaz).
// Yetki denetlemez; çağıranın işlemini kullanır. Termin girişi uçtandır (POST /satin-alma-tedarik-terminleri/kaydet).
export { tedarikIhtiyaclariniYaz, tedarikTerminleri } from './servis.ts';
// 898 a, 902 a: plan canlıya alınınca malzeme eksiğini tam liste olarak yazar (listede olmayan silinir); satın alma okurken açık sipariş ve
// açık talebi düşer, kalanı "Plan ihtiyacı" ön talebidir. Yetki denetlemez; çağıranın işlemini kullanır.
export { planIhtiyaclariniYaz } from './servis.ts';
export type { TedarikTermini } from '#paylasilan/sozlesme/satin-alma.ts';
// SAT-77: malzemenin uygulanan kg fiyatı ve stok biriminin birim fiyatı (TRY karşılığıyla); fiyatı ya da birim ağırlığı olmayan değer null. Yetki denetlemez.
export { degerlemeKgFiyatlari, malKabulFiyatlari, malzemeKgFiyatlari, type DegerlemeKgFiyati } from './servis.ts';
export type { MalzemeKgFiyati } from './servis.ts';
// #205 karar 1: Logo bağlantısı siparişi, düzenlemesini, kapatmasını ve iptalini buradan alır, sonucu buraya yazar. Yetki denetlemez, çağıranın işlemini kullanır.
export {
  logoyaGidecekSiparisler, logoyaGuncellemeGidecekSiparisler, logoyaIptalGidecekSiparisler, logoyaKapatmaGidecekSiparisler, siparisLogoGuncellemeSonucu,
  siparisLogoIptalSonucu, siparisLogoKapatmaSonucu, siparisLogoSonucu,
} from './servis.ts';
export type { LogoyaGidecekSiparis, LogoyaGuncellemeGidecekSiparis, LogoyaKapatmaGidecekSiparis } from './servis.ts';
// #205 S3 b (kart #790): Logo bağlantısı onaylı talep fişini ve sipariş satırının karşılamasını buradan alır, sonucu buraya yazar.
export { karsilamaLogoSonucu, logoyaGidecekKarsilamalar, logoyaGidecekTalepler, talepLogoSonucu } from './servis.ts';
export type { LogoyaGidecekKarsilama, LogoyaGidecekTalep } from './servis.ts';
// Stok mal kabulü: sipariş satırına bağlı sertifika ve raporlar (satır kimliği başına); belgesi olmayan satır haritada yoktur.
export { siparisSatiriBelgeleri } from './servis.ts';
export type { SiparisBelgesi } from '#paylasilan/sozlesme/satin-alma.ts';

// Kart #1310, 959 b: teslim yöntemi seçilmiş talebin siparişleri; sevkiyattaki alım kalemlerini ve taşımalarını eşitler.
export { alimDinle } from './alim-olayi.ts';
export async function talepNolari(db: Db, idler: readonly string[]): Promise<Map<string, string>> {
  if (idler.length === 0) return new Map();
  return new Map((await sorgu.talepNolari(db, [...new Set(idler)])).map((t) => [t.id, t.no]));
}
export type { AlimDinleyicisi, AlimOlayi, AlimTasimasi } from './alim-olayi.ts';
// Stok mal kabulü: sipariş satırı kimliğinden talebin üretim emri; emre bağlı olmayan satır haritada yoktur (hata değil).
export async function siparisSatirlarininEmri(db: Db, siparisSatirIdler: number[]): Promise<Map<number, number>> {
  const tekil = [...new Set(siparisSatirIdler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgu.siparisSatirlarininEmri(db, tekil)).map((r) => [r.id, r.uretimEmriId]));
}

// Sipariş onay limitleri (sırayla; azamiTutar null = limitsiz son basamak, tutar "kadar" kuralıyla bu basamağa düşer). Portal onay eşiklerini buradan alır.
// Tablo boşsa (ayar hiç kaydedilmemiş) ekranın gösterdiği varsayılan döner. Yetki denetlemez; çağıranın okuma görüntüsünü kullanır.
export async function onayLimitleri(db: Db): Promise<{ azamiTutar: string | null; seviye: string }[]> {
  const kayitli = await sorgu.onayLimitleri(db);
  return kayitli.length > 0 ? kayitli : VARSAYILAN_ONAY_LIMITLERI.map((l) => ({ ...l }));
}

// Proje maliyeti (197 a): iş emri başına fason tutarı, para birimi başına bir satır (sırası para birimi kodu); bağlı satırı olmayan
// iş emri haritada yoktur. Yetki denetlemez (çağıran uç korur), yalnız okur.
export async function isEmriFasonTutarlari(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, { tutar: string; paraBirimi: string }[]>> {
  const tekil = [...new Set(isEmriIdleri)];
  const harita = new Map<number, { tutar: string; paraBirimi: string }[]>();
  if (tekil.length === 0) return harita;
  for (const r of await sorgu.isEmriFasonTutarlari(db, tekil)) {
    const liste = harita.get(r.isEmriId) ?? [];
    liste.push({ tutar: r.tutar, paraBirimi: r.paraBirimi });
    harita.set(r.isEmriId, liste);
  }
  return harita;
}

// Plan: fason süresi tahmini (sorgularla aynı sırada, takvim günü); veri yoksa null. Yetki denetlemez, yalnız okur.
export { fasonSuresiTahminleri } from './servis.ts';

// Kart #435: stok yok istekleri satın alma iş kutusunda görünür; kaynak stoktan gelir (stok satın almayı ithal eder, bu yüzden ters yön
// ADR 0006 gibi kablolamada kurulur: sunucu/kablolama.ts).
export const stokYokCozucusu = (cozucu: servis.StokYokCozucusu): void => servis.stokYokCozucusuKaydet(cozucu);
// SAT-77: kg fiyatları sayfasındaki hammadde stok değeri için stok miktarı (kablolama stok/disari stokMiktarlari ile bağlar).
export const stokMiktariCozucusu = (cozucu: servis.StokMiktariCozucusu): void => servis.stokMiktariCozucusuKaydet(cozucu);
// E-13, 236 a: Kalite Merkezi'nin tedarikçi onay durumu, firma kimliğiyle (kablolama kalite-merkezi/disari tedarikciOnayDurumlari ile bağlar).
export const kaliteDurumuCozucusu = (cozucu: servis.KaliteDurumuCozucusu): void => servis.kaliteDurumuCozucusuKaydet(cozucu);
// Takvim (891): beklenen teslim günündeki siparişler. Yetki denetlemez; çağıran satin-alma.oku'yu denetler.
export { takvimKayitlari } from './servis.ts';
