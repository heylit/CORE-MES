import { randomUUID } from 'node:crypto';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, gecersiz } from '#cekirdek/hata.ts';
import { VARSAYILAN_ONAY_LIMITLERI } from './kurallar.ts';
import * as servis from './servis.ts';
import * as sorgu from './sorgular.ts';
import { fasonSiparisTarihiSec, onayliTalepGelisi, tedarikAsamasi } from './kurallar.ts';
import type { FasonSiparisTarihi, TedarikAsamasi } from './kurallar.ts';
// 1237: Ctrl K genel aramasının talep ve sipariş kaynakları; çekirdek ad kuralıyla bulur (1233).
export { kayitAramaKaynaklari } from './arama/kaynaklar.ts';
// Stok modülünün mal kabul belgesi teslim bekleyen sipariş satırlarını buradan okur (fiyatsız; SAT-37).
export { siparisSatirlari } from './servis.ts';
export type { SiparisSatiriOkuma as SiparisSatiri } from './sorgular.ts';
// SH1 a: stok mal kabul işleminin içinde teslimi yazar, mal kabul düzeltilince geri alır. Çağıranın işlemini kullanır, yetki
// denetlemez (stok ucunda); hata UygulamaHatasi'dır (422 geçersiz, 409 aynı mal kabul satırı ikinci kez), stok işlemi geri sarar.
export { teslimGeriAl, teslimIsle } from './servis.ts';
// Stok değeri: malzemenin en son teslim alınan satın alma fiyatı (teklif birim fiyatı, para birimi, TRY karşılığı ve teslim zamanı).
export { ortalamaAlisFiyatlari, siparisBirimFiyatlari, sonAlisFiyatlari, type SiparisBirimFiyati } from './servis.ts';
// Plan motoru: açık satın alma siparişinde gelecek malzemenin kalan miktarı ve beklenen gelişi (termin sırasıyla, tarihsiz en sonda).
// Yetki denetlemez; fiyat yok. Tedarikçi adını ve sipariş numarasını gösteren çağıran kendi okuma yetkisini denetler.
export { malzemeGelisTarihleri } from './servis.ts';
export type { MalzemeGelisi } from './servis.ts';
// 3256-2: onaylanmış, siparişi verilmemiş talep kalemleri plana gelecek malzeme olarak girer (malzemeGelisTarihleri ile aynı biçim; numara
// talep numarasıdır). Geliş bugün + kararın teklifindeki termin günü, termin günü yoksa boş (onayliTalepGelisi). Yetki denetlemez; fiyat yok.
export async function onayliTalepGelisleri(db: Db, malzemeNolar: readonly number[], bugun: string): Promise<Map<number, servis.MalzemeGelisi[]>> {
  const m = new Map<number, servis.MalzemeGelisi[]>();
  const tekil = [...new Set(malzemeNolar)];
  if (tekil.length === 0) return m;
  for (const x of await sorgu.onayliTalepKalemleriOku(db, tekil)) {
    m.set(x.malzemeNo, [...(m.get(x.malzemeNo) ?? []), { tarih: onayliTalepGelisi(bugun, x.terminGun), miktar: servis.sade(x.miktar), birim: x.birim, siparisNo: x.talepNo, satirId: x.satirId, tedarikciAdi: x.tedarikciAdi }]);
  }
  return m;
}
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
// 2891-1: stok biriminin bir birimi kaç kg (kg 1; uzunluk ve alan stoklu kartta null; öteki birimde parça ağırlığı). Saf.
export { stokBirimiBasinaKg } from './kurallar.ts';
// #205 karar 1: Logo bağlantısı siparişi, düzenlemesini, kapatmasını ve iptalini buradan alır, sonucu buraya yazar. Yetki denetlemez, çağıranın işlemini kullanır.
export {
  logoyaBekletmeGidecekSiparisler, logoyaGidecekSiparisler, logoyaGuncellemeGidecekSiparisler, logoyaIptalGidecekSiparisler, logoyaKapatmaGidecekSiparisler,
  siparisLogoBekletmeSonucu, siparisLogoGuncellemeSonucu, siparisLogoIptalSonucu, siparisLogoKapatmaSonucu, siparisLogoSonucu,
} from './servis.ts';
export type { LogoyaBekletmeGidecekSiparis, LogoyaGidecekSiparis, LogoyaGuncellemeGidecekSiparis, LogoyaKapatmaGidecekSiparis } from './servis.ts';
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
// 3256-1: açık siparişin gelişi ya da elle tedarik termini değişti (plan canlı planı eskidi işaretler).
export { terminDinle } from './termin-olayi.ts';
export type { TerminDinleyicisi, TerminOlayi } from './termin-olayi.ts';
// D7 (2986 a): Logo'da düzeltilmek istenen sipariş CORE MES'in kendi siparişi mi; yalnız evet/hayır döner, sipariş verisi çıkmaz (G3).
export const coreSiparisiMi = (db: Db, no: string, logoKayitNo: number): Promise<boolean> => sorgu.coreSiparisiMi(db, no.trim(), String(logoKayitNo));
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

// 2611 a, Maliyet C1: proje maliyeti emre bağlı olmayan projeli talebin alım değerini buradan alır: proje başına, para birimi başına
// (sırası para birimi kodu), KDV hariç; yalnız stoğa girmeyen satırlar (hizmet kartlı teslim değeriyle, kartsız sipariş tutarıyla) ve
// onların masraf payı. Değeri olmayan proje haritada yoktur. Yetki denetlemez, yalnız okur.
export { projeSatinAlmaTutarlari } from './servis.ts';
// 2638 (Maliyet K1): üretim emri başına, para birimi başına emre yazılan hizmet ve kartsız alım (yalnız projesi olan emir; projesiz emrin
// satırı genel gidere gider). Fiyattır: çağıran yalnız maliyet yetkisiyle gösterir (Güvenlik N1). Yetki denetlemez, yalnız okur.
export { emirHizmetTutarlari } from './servis.ts';
// 2637 a, Mimar K1: siparişin genel gidere giren oranı; Finans kablolamadaki genelGiderOraniCozucusu ile toplu çeker (anahtar 'talepId:teklifId',
// 0-1, malı olmayan siparişte null, bilinmeyen sipariş haritada yok). Yetki denetlemez, yalnız okur.
export { siparisGenelGiderOranlari } from './servis.ts';
// 2642 b, 2646 a, Mimar: Finans genelGiderOraniCozucusu'nun kaynağı (kablolama); belge başına { oran, esleme }. Eşlemesi olmayan belgede sipariş
// oranı; bayat eşleme sayılmaz (Veri 1). Bulunmayan, siparişsiz ve iptal belge haritada yok. Yetki denetlemez, yalnız okur.
export { belgeGenelGiderOranlari } from './servis.ts';
// 2614 1/2 a: İdari İşler talebi satın alma talebine çevrilir (kalemsiz taslak; açan çeviren, talep eden idari talebi açan). Yetkiyi kendi
// içinde denetler (satin-alma.talep-ac ya da yaz; 403); ikinci çevirme 409. Çağıranın işlemini kullanır. İdari ekran bağı ikinci işlevle okur.
export { idariTalepSatinAlmalari, idariTaleptenTalepAc } from './servis.ts';
export type { IdaridenTalep } from './servis.ts';

// Plan: fason süresi tahmini (sorgularla aynı sırada, takvim günü); veri yoksa null. Yetki denetlemez, yalnız okur.
export { fasonSuresiTahminleri } from './servis.ts';

// Kart #435: stok yok istekleri satın alma iş kutusunda görünür; kaynak stoktan gelir (stok satın almayı ithal eder, bu yüzden ters yön
// ADR 0006 gibi kablolamada kurulur: sunucu/kablolama.ts).
// 1647: değişiklik yönetimi sipariş satırının parça revizyonunu verir; bağı kablolama.ts kurar.
export type { ParcaRevizyonuCozucusu } from './servis.ts';
export const parcaRevizyonuCozucusu = (cozucu: servis.ParcaRevizyonuCozucusu): void => servis.parcaRevizyonuCozucusuKaydet(cozucu);
export const stokYokCozucusu = (cozucu: servis.StokYokCozucusu): void => servis.stokYokCozucusuKaydet(cozucu);
// SAT-77: kg fiyatları sayfasındaki hammadde stok değeri için stok miktarı (kablolama stok/disari stokMiktarlari ile bağlar).
export const stokMiktariCozucusu = (cozucu: servis.StokMiktariCozucusu): void => servis.stokMiktariCozucusuKaydet(cozucu);
// 3437-3b-3b: emrin bir kartından net sarf ve ayırma (kablolama stok/disari emirlerinNetSarfi ve emrinRezerveleri ile bağlar).
export const emirKartKullanimiCozucusu = (cozucu: servis.EmirKartKullanimiCozucusu): void => servis.emirKartKullanimiCozucusuKaydet(cozucu);
// 2151: satın alma analizinin tüketim tahmini için stok tüketim serisi (kablolama stok/disari tuketimSerisi ile bağlar).
export { tuketimSerisiCozucusuKaydet as tuketimSerisiCozucusu } from './analiz.ts';
// E-13, 236 a: Kalite Merkezi'nin tedarikçi onay durumu, firma kimliğiyle (kablolama kalite-merkezi/disari tedarikciOnayDurumlari ile bağlar).
export const kaliteDurumuCozucusu = (cozucu: servis.KaliteDurumuCozucusu): void => servis.kaliteDurumuCozucusuKaydet(cozucu);
// 3279 a: onaylı tedarikçi listesinin Kalite parçası (kablolama kalite-merkezi/disari onayliListe ile bağlar).
export const onayliListeCozucusu = (cozucu: servis.OnayliListeCozucusu): void => servis.onayliListeCozucusuKaydet(cozucu);
// 2424: dış operasyonlarda planlanan gidiş canlı plandan (plan satın almayı okuduğu için bağ kablolamada).
export const fasonKonumuCozucusu = (cozucu: servis.FasonKonumuCozucusu): void => servis.fasonKonumuCozucusuKaydet(cozucu);
export const planlananGidisCozucusu = (cozucu: servis.PlanlananGidisCozucusu): void => servis.planlananGidisCozucusuKaydet(cozucu);
// 3429-3 F3: satış siparişinin "Satın al" kalemleri ön talep kaynağıdır; bağlı kalemler siparişte kilitlidir ve açık talep iptali durdurur
// (siparişler satın almayı ithal etmez; bağlar kablolamada).
export type { SatisSiparisiKalemi, SatisSiparisiKalemCozucusu } from './servis.ts';
export const satisSiparisiKalemCozucusu = (cozucu: servis.SatisSiparisiKalemCozucusu | null): void => servis.satisSiparisiKalemCozucusuKaydet(cozucu);
export { satisSatiriAcikTalepleriKilitle, satisSatiriAcikTalepNolari, satisSatiriBagliKalemler } from './servis.ts';
// Takvim (891): beklenen teslim günündeki siparişler. Yetki denetlemez; çağıran satin-alma.oku'yu denetler.
export { takvimKayitlari } from './servis.ts';
export { malzemeKartiIzleri } from './sorgular.ts';

// 3175: emrin ihtiyaç tablosunun satın alma sütunu (malzeme başına en ileri aşama: sipariş, talep, ön talep); numara ve termin, fiyat ve
// tedarikçi yok. Yetki denetlemez; çağıran satın alma ya da açık sipariş okumasını denetler.
export { emrinSatinAlmaDurumlari } from './servis.ts';
export type { EmirSatinAlmaAsamasi, EmirSatinAlmaDurumu } from './kurallar.ts';
// 2893 D2: Adım Durumu'nun okuduğu açık tedarik: emre ya da fason iş emrine bağlı, beklenen (talep ya da sipariş aşamasındaki) kalemler.
// Yalnız numara, aşama ve beklenen teslim döner; fiyat ve tedarikçi dönmez (operatör terminali de okur, 2893-3 b).
export interface EmirTedariki {
  uretimEmriId: number | null; isEmriId: number | null; malzemeNo: number | null; asama: TedarikAsamasi; talepNo: string; siparisNo: string | null; termin: string | null;
  // 3355: siparişin firması; yalnız sipariş aşamasında, yoksa null.
  firmaId: number | null;
}
export async function emirTedarikDurumlari(db: Db, uretimEmriIdleri: readonly number[], isEmriIdleri: readonly number[]): Promise<EmirTedariki[]> {
  if (uretimEmriIdleri.length === 0 && isEmriIdleri.length === 0) return [];
  return (await sorgu.emirTedarikDurumlariOku(db, uretimEmriIdleri, isEmriIdleri)).flatMap((s) => {
    const asama = tedarikAsamasi(s);
    return asama === null ? [] : [{
      uretimEmriId: s.uretimEmriId, isEmriId: s.isEmriId, malzemeNo: s.malzemeNo, asama, talepNo: s.talepNo, siparisNo: asama === 'siparis' ? s.siparisNo : null,
      termin: asama === 'siparis' ? s.beklenenTeslim : null, firmaId: asama === 'siparis' ? s.firmaId : null,
    }];
  });
}
// Fason iş emrinin firmadan dönüş günü: açık siparişindeki teslim tarihi (en geç olan) ve o siparişin numarası. Siparişi ya da tarihi olmayan
// iş emri haritada yoktur. Plan ve reçete-rota aynı kuralı buradan okur.
export type { FasonSiparisTarihi } from './kurallar.ts';
export async function fasonSiparisTarihleri(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, FasonSiparisTarihi>> {
  return fasonSiparisTarihiSec(await emirTedarikDurumlari(db, [], isEmriIdleri));
}

// 3345 a: Logo irsaliyeleri sayfasının eşleşmesi (Logo sipariş satır kaydı -> CORE sipariş satırı ve net teslim). Boş dizide sorgu atılmaz.
export async function logoSatirliSiparisSatirlari(db: Db, logoSatirRefleri: readonly string[]): Promise<Map<string, { siparisSatiriId: number; siparisNo: string | null; birim: string; teslim: string }>> {
  if (logoSatirRefleri.length === 0) return new Map();
  return new Map((await sorgu.logoSatirliSiparisSatirlari(db, logoSatirRefleri)).map(({ logoSatirRef, ...x }) => [logoSatirRef, x]));
}
// 3384 a: logo modülü siparişin Logo irsaliye ve fatura özetini kurarken siparişin satırlarını buradan okur; yetki denetlemez, fiyat yok.
export { logoSiparisKalemleri, type LogoSiparisKalemiOkuma as LogoSiparisKalemi } from './sorgular.ts';
// 3398-2: Stok kontrol sayfası teklif istenmeden önceki (taslak) talep kalemlerini buradan okur; yetki denetlemez, fiyat yok.
export { stokKontroluKalemleriOku as stokKontroluKalemleri, type StokKontroluKalemiOkuma as StokKontroluKalemi } from './sorgular.ts';
// 3398-2 a: stok modülü "stoktan karşıla" ve iptalinde kendi işleminin içinde çağırır; yetkiyi stok ucu denetler. Yalnız taslak talepte,
// yalın (Logo'ya gitmemiş, iş emrine ya da kalıba bağlı olmayan, teklif almamış) kalemde.
export async function kalemiStoktanKarsila(db: Db, talepId: string, kalemId: string, miktar: string, kisiId: number): Promise<{ satir: unknown; birim: string; malzemeNo: number; uretimEmriId: number | null }> {
  const k = await sorgu.stoktanKalemKilitle(db, talepId, kalemId);
  if (k === null) throw bulunamadi('Talep kalemi bulunamadı.');
  if (k.durum !== 'taslak') throw gecersiz('Teklif istenmiş talepte stoktan karşılanamaz.');
  if (k.engel !== null) throw gecersiz('Bu kalem Logo, iş emri, kalıp, satış siparişi ya da teklife bağlı; stoktan karşılanamaz.');
  if (k.malzemeNo === null || k.miktar === null) throw gecersiz('Kalemin malzeme kartı ya da miktarı yok.');
  if (Number(miktar) > Number(k.miktar) + 1e-9) throw dogrulama(`Kalemde ${servis.sade(k.miktar)} ${k.birim} var; daha fazlası karşılanamaz.`, 'miktar');
  const satir = await sorgu.stoktanKalemAzalt(db, talepId, kalemId, miktar);
  await sorgu.hareketEkle(db, talepId, randomUUID(), `Stoktan karşılandı: ${k.ad} ${servis.sade(miktar)} ${k.birim}${satir === null ? '' : ' (kalem talepten çıktı)'}; depoya ayırma isteği açıldı.`, kisiId);
  return { satir, birim: k.birim, malzemeNo: k.malzemeNo, uretimEmriId: k.uretimEmriId };
}
// Geri ekleyemezse (talep yok, teklif aşamasına geçti ya da kalem çıkarıldı) false döner; istek yine iptal edilir.
export async function kalemiStoktanGeriAl(db: Db, talepId: string, kalemId: string, miktar: string, satir: unknown, kisiId: number): Promise<boolean> {
  const t = await sorgu.stoktanTalepKilitle(db, talepId);
  if (t === null) return false;
  const eklendi = t.durum === 'taslak' && await sorgu.stoktanKalemGeriAl(db, talepId, kalemId, miktar, satir);
  await sorgu.hareketEkle(db, talepId, randomUUID(), eklendi
    ? `Stoktan karşılama iptal edildi: ${servis.sade(miktar)} talebe geri eklendi.`
    : `Stoktan karşılama iptal edildi: ${servis.sade(miktar)} geri eklenemedi (talep ilerledi ya da kalem çıkarıldı).`, kisiId);
  return eklendi;
}

// 3401-1 a: satın almada fiyat gören işlemler; logo modülü Logo belge aramasında alış tutarını bunlarla açar.
export { FIYAT_GOREN_ISLEMLER } from './kurallar.ts';

// 3405-1 a: kademeli uyarı kaynakları (onay bekleyen, siparişi verilmeyen, cevapsız teklif, teslim); bağ kablolamadadır.
export { satinAlmaKademeOkuyucusu } from './servis.ts';
export type { SatinAlmaKademeKaynagi } from './servis.ts';
