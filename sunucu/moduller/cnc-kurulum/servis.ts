import { createHash } from 'node:crypto';
import type { Db } from '#cekirdek/db.ts';
import { cakisma, cokBuyuk, dogrulama, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { EMIR_ANAHTARI, EMIR_ANLIK_ONEKI, IS_EMRI_ANLIK_ONEKI, SECIM_ANAHTARI } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import type {
  BenCevabi, EmirSecCevabi, EmirSecenegi, EmirSecGovdesi, EmirlerCevabi, HazirlikCevabi, HazirlikOnayGovdesi, KayitlarCevabi,
  KurulumDurumu, KurulumTamamCevabi, KurulumTamamGovdesi, SilCevabi, TakimOlaylariCevabi, TakimOlaylariGovdesi, YazCevabi, YazGovdesi,
} from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { istasyonAdlari } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import {
  AZAMI_OLAY, KURULUM_ADIMI, asinmaBindir, degerBicimeUyarMi, elleUretimKaydiVarMi, emirAnligi, emirDurumu, hazirlikAyniMi, hazirlikOlaylari, hazirlikOnaylariDegistiMi,
  hazirlikOnaylariniBindir, kurulumIzi, kurulumYukleri, degerCokBuyukMu, nulKarakteriVarMi, onayVarMi, sayimKullanimi, sonOnaySiraDisiMi, surumUyarMi, takimDurumu, takimOlayiSatirlari,
} from './kurallar.ts';
import type { TakimDurumu } from './kurallar.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { acikIsEmri, acikIsEmirleri } from '../uretim-emirleri/disari.ts';
import type { AcikIsEmri } from '../uretim-emirleri/disari.ts';
import * as sorgular from './sorgular.ts';

// Akış: yetkiyi uç verir; burada biçim ve sürüm denetimi uygulanır.

const ISLEM_YAZ = 'cnc-kurulum.yaz';
const ISLEM_HAZIRLIK = 'cnc-kurulum.hazirlik-onayla';
const ISLEM_TAKIM = 'cnc-kurulum.takim-degistir';
const CAKISMA_ILETISI = 'Kurulum kayıtları siz açtıktan sonra başka bir kişi tarafından değiştirildi; sayfayı yenileyin.';
const BUYUK_ILETISI = 'Kurulum kaydı 1 MB sınırını aşıyor ve kaydedilmedi; eski kayıtları silip yeniden deneyin.';
const ONAY_UCU_ILETISI = 'Hazırlık onayları yalnız hazırlık onayıyla değiştirilir.';
const URETIM_ADEDI_ILETISI = 'Üretim adedi yalnız Üretim Terminali\'nden girilir.';
const SIRA_ILETISI = 'Son onay için hazırlığın bütün adımları onaylanmış olmalıdır.';
const EMIR_ILETISI = 'Üretim emri ve emirlerin kurulumları yalnız emir seçimiyle değişir.';
// Emir ve emirlerin saklanan kurulumları genel uçtan yazılmaz, silinmez: emir değişince kurulum emre saklanmadan değişirdi.
const emirKaydiMi = (anahtar: string): boolean => anahtar === EMIR_ANAHTARI || anahtar.startsWith(EMIR_ANLIK_ONEKI);

export function ben(kullanici: Kullanici): BenCevabi {
  const yazabilir = kullanici.islemler.includes(ISLEM_YAZ);
  return {
    kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir, hazirlikOnaylayabilir: !yazabilir && kullanici.islemler.includes(ISLEM_HAZIRLIK),
    takimDegistirebilir: kullanici.islemler.includes(ISLEM_TAKIM),
  };
}

export async function kayitlar(db: Db): Promise<KayitlarCevabi> {
  const liste = await sorgular.kayitlar(db);
  const secili = await seciliIsEmri(db);
  const istasyonId = secili === null ? null : (await acikIsEmri(db, secili.isEmriId))?.istasyonId ?? null;
  if (istasyonId === null) return { kayitlar: liste };
  const sayaclar = await takimOmruDurumlari(db, [istasyonId]);
  return { kayitlar: liste.map((k) => (k.anahtar === DURUM_ANAHTARI && k.bicim === 'json' ? { ...k, deger: asinmaBindir(k.deger, sayaclar) } : k)) };
}

// Emir listesini üretim emirleri ekranında görebilen görür (GET /uretim-emirleri ile aynı işlemler): CNC okuma yetkisi tek
// başına emir listesini açmaz.
const EMIR_OKUMA: readonly string[] = [...ADIMLI_OKUMA_ISLEMLERI, 'sayfa.stok', 'sayfa.atolye'];

// Seçenek iş emridir (266 a); istasyonu olmayan (atanmamış ya da fason) iş emri kurulumda seçilmez.
const secenek = (i: AcikIsEmri, istasyon: string): EmirSecenegi => ({
  id: i.id, uretimEmriId: i.uretimEmriId, emirNo: i.emirNo, opNo: i.opNo, ad: i.ad, parcaNo: i.parcaNo, parcaAd: i.parcaAd, adet: i.adet, istasyon,
});

export async function emirler(db: Db, kullanici: Kullanici): Promise<EmirlerCevabi> {
  if (!kullanici.islemler.some((i) => EMIR_OKUMA.includes(i))) throw yetkiYok();
  const liste = (await acikIsEmirleri(db)).filter((i) => i.istasyonId !== null);
  const adlar = await istasyonAdlari(db, [...new Set(liste.map((i) => i.istasyonId ?? 0))]);
  return { emirler: liste.map((i) => secenek(i, adlar.get(i.istasyonId ?? 0) ?? '')) };
}

export async function yaz(db: Db, kullanici: Kullanici, g: YazGovdesi): Promise<YazCevabi> {
  return kaydet(db, kullanici, g, false);
}

// Onay ucu: yalnız onay alanları gelir ve alınır; kayıt açılamaz, durum anahtarı dışına yazılamaz. Yazma işlemi olan kişi de
// onayını buradan verir (köprü önce bunu, sonra bütün durumu yazar); defterdeki kişi ve zaman sunucunundur.
export async function hazirlikOnayla(db: Db, kullanici: Kullanici, g: HazirlikOnayGovdesi): Promise<YazCevabi> {
  return kaydet(db, kullanici, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: { prep: g.hazirlik }, beklenenSurum: g.beklenenSurum }, true);
}

async function kaydet(db: Db, kullanici: Kullanici, g: YazGovdesi, yalnizHazirlik: boolean): Promise<YazCevabi> {
  if (emirKaydiMi(g.anahtar)) throw yetkiYok(EMIR_ILETISI);
  if (!degerBicimeUyarMi(g.bicim, g.deger)) throw dogrulama('Metin biçimli değer dize olmalıdır.', 'deger');
  if (nulKarakteriVarMi(g.deger)) throw dogrulama('Değer boş karakter (U+0000) içeremez.', 'deger');
  if (degerCokBuyukMu(g.deger)) throw cokBuyuk(BUYUK_ILETISI);
  const mevcut = await sorgular.surumKilitle(db, g.anahtar);
  if (!surumUyarMi(mevcut, g.beklenenSurum)) throw cakisma(CAKISMA_ILETISI);
  const onceki = g.anahtar === DURUM_ANAHTARI && mevcut !== null ? (await sorgular.kayitGetir(db, g.anahtar))?.deger ?? null : null;
  if (yalnizHazirlik && onceki === null) throw yetkiYok();
  const deger = yalnizHazirlik ? hazirlikOnaylariniBindir(onceki, g.deger) : g.deger;
  if (deger === null) throw dogrulama('Hazırlık onayı okunamadı.', 'deger');
  if (yalnizHazirlik && sonOnaySiraDisiMi(onceki, deger)) throw gecersiz(SIRA_ILETISI);
  if (!yalnizHazirlik && g.anahtar === DURUM_ANAHTARI && hazirlikOnaylariDegistiMi(onceki, deger)) throw yetkiYok(ONAY_UCU_ILETISI);
  if (!yalnizHazirlik && g.anahtar === DURUM_ANAHTARI && elleUretimKaydiVarMi(onceki, deger)) throw yetkiYok(URETIM_ADEDI_ILETISI);
  if (yalnizHazirlik && hazirlikAyniMi(onceki, deger)) {
    const kayitli = await sorgular.kayitGetir(db, g.anahtar);
    if (kayitli !== null) return { kayit: kayitli };
  }
  const satir = { anahtar: g.anahtar, bicim: g.bicim, deger, kisiId: kullanici.id };
  const kayit = mevcut === null ? await sorgular.kayitEkle(db, satir) : await sorgular.kayitGuncelle(db, satir);
  // Eşzamanlı ilk yazmada öteki kazandı.
  if (kayit === null) throw cakisma(CAKISMA_ILETISI);
  if (g.anahtar === DURUM_ANAHTARI) await hazirlikDefterineYaz(db, kullanici, onceki, deger);
  return { kayit };
}

// Kimin ne zaman onayladığı prototipin durumunda yoktur: önceki ve yeni durum karşılaştırılıp deftere yazılır. Olay, onay
// anında kurulumda seçili iş emriyle kaydedilir.
async function hazirlikDefterineYaz(db: Db, kullanici: Kullanici, onceki: unknown, yeni: unknown): Promise<void> {
  const olaylar = hazirlikOlaylari(onceki, yeni);
  if (olaylar.length === 0) return;
  if (olaylar.length > AZAMI_OLAY) throw dogrulama('Hazırlık adımı sayısı sınırı aşıyor.', 'deger');
  await sorgular.hazirlikOlaylariEkle(db, olaylar, await seciliIsEmri(db), kullanici.id);
}

// 266 a öncesinin seçili kaydı üretim emri kimliği taşır (uretimEmriId alanı yok): seçim yok sayılır, iş emri yeniden seçilir.
async function seciliIsEmri(db: Db): Promise<{ isEmriId: number; uretimEmriId: number } | null> {
  const emir = (await sorgular.kayitGetir(db, EMIR_ANAHTARI))?.deger;
  if (emir === null || typeof emir !== 'object') return null;
  const { id, uretimEmriId } = emir as { id?: unknown; uretimEmriId?: unknown };
  return typeof id === 'number' && typeof uretimEmriId === 'number' ? { isEmriId: id, uretimEmriId } : null;
}

const kurulumImzasi = (durum: unknown): string => createHash('sha256').update(kurulumIzi(durum)).digest('hex');

async function kurulumDurumu(db: Db, isEmriId: number | null, durum: unknown): Promise<KurulumDurumu | null> {
  if (isEmriId === null) return null;
  const son = await sorgular.kurulumSonu(db, isEmriId);
  if (son === null) return null;
  const ad = (await kisiAdlari(db, [son.kisiId])).get(son.kisiId) ?? '';
  return { kisi: { id: son.kisiId, ad }, zaman: son.zaman, gecerli: son.imza === kurulumImzasi(durum) };
}

// Seçili iş emrinin hazırlık onayları ve "kurulum tamam" kaydı.
export async function hazirlik(db: Db): Promise<HazirlikCevabi> {
  const isEmriId = (await seciliIsEmri(db))?.isEmriId ?? null;
  const satirlar = await sorgular.hazirlikSonOnaylari(db, isEmriId);
  const adlar = await kisiAdlari(db, [...new Set(satirlar.map((s) => s.kisiId))]);
  return {
    onaylar: satirlar.map((s) => ({ adim: s.adim, olay: s.olay, imza: s.imza, kisi: { id: s.kisiId, ad: adlar.get(s.kisiId) ?? '' }, zaman: s.zaman })),
    kurulum: await kurulumDurumu(db, isEmriId, (await sorgular.kayitGetir(db, DURUM_ANAHTARI))?.deger ?? null),
  };
}

// Kaydı kilitli okunmuş anahtara yazar (yoksa açar, değer null ise siler).
async function sunucuYazar(db: Db, anahtar: string, deger: unknown, kisiId: number): Promise<number | null> {
  const mevcut = await sorgular.surumKilitle(db, anahtar);
  if (deger === null) {
    if (mevcut !== null) await sorgular.kayitSil(db, anahtar);
    return null;
  }
  const satir = { anahtar, bicim: 'json', deger, kisiId };
  const kayit = mevcut === null ? await sorgular.kayitEkle(db, satir) : await sorgular.kayitGuncelle(db, satir);
  if (kayit === null) throw cakisma(CAKISMA_ILETISI);
  return kayit.surum;
}

// İş emri değişince kurulum iş emrine saklanır ve yeni iş emrinin kurulumu açılır (kurulum iş emri başınadır, kullanıcı kararları
// 17.10.2026 ve 266 a). Durum sürümü kilitli denetlenir: eşzamanlı iki seçimden ikincisi çakışır. İş emrine geri dönüşte defter
// olayı yazılmaz: onaylar iş emirleriyle defterdedir.
export async function emirSec(db: Db, kullanici: Kullanici, g: EmirSecGovdesi): Promise<EmirSecCevabi> {
  const e = await acikIsEmri(db, g.isEmriId);
  if (e === null || e.istasyonId === null) throw dogrulama('İş emri açık değil ya da istasyonu yok.', 'isEmriId');
  const emir = secenek(e, (await istasyonAdlari(db, [e.istasyonId])).get(e.istasyonId) ?? '');
  const mevcut = await sorgular.surumKilitle(db, DURUM_ANAHTARI);
  if (!surumUyarMi(mevcut, g.beklenenSurum)) throw cakisma(CAKISMA_ILETISI);
  await sorgular.surumKilitle(db, EMIR_ANAHTARI);
  const oncekiId = (await seciliIsEmri(db))?.isEmriId ?? null;
  if (oncekiId !== emir.id) {
    const durum = mevcut === null ? null : (await sorgular.kayitGetir(db, DURUM_ANAHTARI))?.deger ?? null;
    const secim = (await sorgular.kayitGetir(db, SECIM_ANAHTARI))?.deger ?? null;
    if (oncekiId !== null) await sunucuYazar(db, `${IS_EMRI_ANLIK_ONEKI}${String(oncekiId)}`, emirAnligi(durum, secim), kullanici.id);
    const hedef = (await sorgular.kayitGetir(db, `${IS_EMRI_ANLIK_ONEKI}${String(emir.id)}`))?.deger ?? null;
    const yeni = emirDurumu(durum, secim, hedef, oncekiId !== null, emir.parcaNo);
    // Emirsiz verilen onaylar ilk emre geçmez; düşüşleri kişisiyle deftere girer.
    if (oncekiId === null) await sorgular.hazirlikOlaylariEkle(db, hazirlikOlaylari(durum, yeni.durum), null, kullanici.id);
    await sunucuYazar(db, DURUM_ANAHTARI, yeni.durum, kullanici.id);
    await sunucuYazar(db, SECIM_ANAHTARI, yeni.secim, kullanici.id);
  }
  await sunucuYazar(db, EMIR_ANAHTARI, emir, kullanici.id);
  return { emir };
}

// "Kurulum tamam": seçili iş emrinin kurulumunu kişi ve saatle deftere yazar; imza seçimlerin izidir (sonra değişirse eskir).
export async function kurulumTamam(db: Db, kullanici: Kullanici, g: KurulumTamamGovdesi): Promise<KurulumTamamCevabi> {
  const mevcut = await sorgular.surumKilitle(db, DURUM_ANAHTARI);
  if (!surumUyarMi(mevcut, g.beklenenSurum)) throw cakisma(CAKISMA_ILETISI);
  const secili = await seciliIsEmri(db);
  if (secili === null) throw dogrulama('Önce iş emrini seçin.', 'emir');
  const durum = (await sorgular.kayitGetir(db, DURUM_ANAHTARI))?.deger ?? null;
  await sorgular.hazirlikOlaylariEkle(db, [{ adim: KURULUM_ADIMI, olay: 'tamam', imza: kurulumImzasi(durum) }], secili, kullanici.id);
  // Takım ömrü (295 a): kurulan magazin iş emrinin istasyonuna yük olarak yazılır; istasyonsuz iş emrinde yük yoktur.
  const istasyonId = (await acikIsEmri(db, secili.isEmriId))?.istasyonId ?? null;
  if (istasyonId !== null) await sorgular.takimYukleriniYaz(db, istasyonId, kurulumYukleri(durum), kullanici.id);
  const kurulum = await kurulumDurumu(db, secili.isEmriId, durum);
  if (kurulum === null) throw new Error('Kurulum kaydı okunamadı.');
  return { kurulum };
}

export async function sil(db: Db, anahtar: string, beklenenSurum: number): Promise<SilCevabi> {
  if (emirKaydiMi(anahtar)) throw yetkiYok(EMIR_ILETISI);
  const mevcut = await sorgular.surumKilitle(db, anahtar);
  if (mevcut === null) return { silindi: false };
  if (!surumUyarMi(mevcut, beklenenSurum)) throw cakisma(CAKISMA_ILETISI);
  // Silme onayları defter olayı olmadan düşürürdü; onaylar önce onay ucundan geri alınır.
  if (anahtar === DURUM_ANAHTARI && onayVarMi((await sorgular.kayitGetir(db, anahtar))?.deger ?? null)) throw yetkiYok(ONAY_UCU_ILETISI);
  return { silindi: await sorgular.kayitSil(db, anahtar) };
}

// ---- Takım ömrü (295 a): üretim sayımı istasyondaki her yüklü cebe kullanım yazar. Sayımla aynı işlemde koşar; yükü olmayan
// istasyonda iz bırakmaz, sayımı da reddetmez.
export interface TakimSayimOlayi { uretimEmriId: number; isEmriId: number | null; istasyonId: number; kisiId: number; fark: string }

export async function takimSayimiYansit(db: Db, olay: TakimSayimOlayi): Promise<void> {
  const fark = Number(olay.fark);
  if (!Number.isFinite(fark) || fark === 0) return;
  const yukler = await sorgular.istasyonTakimYukleri(db, [olay.istasyonId]);
  await sorgular.takimOlaylariEkle(
    db,
    yukler.map((y) => ({ istasyonId: y.istasyonId, cep: y.cep, takimKimligi: y.takimKimligi, tur: 'sayim' as const, ...sayimKullanimi(y, fark) })),
    { uretimEmriId: olay.uretimEmriId, isEmriId: olay.isEmriId, neden: null, kisiId: olay.kisiId },
  );
}

// Değişim ve düzeltme kurulumda seçili iş emrinin istasyonuna yazılır (sayım gibi); seçim yoksa ya da iş emri kapandıysa iz
// bırakılmaz: ömür yalnız açık kurulumda tutulur.
export async function takimOlaylari(db: Db, kullanici: Kullanici, g: TakimOlaylariGovdesi): Promise<TakimOlaylariCevabi> {
  const secili = await seciliIsEmri(db);
  const istasyonId = secili === null ? null : (await acikIsEmri(db, secili.isEmriId))?.istasyonId ?? null;
  if (secili === null || istasyonId === null) return { yazilan: 0 };
  const [yukler, kullanimlar] = [await sorgular.istasyonTakimYukleri(db, [istasyonId]), await sorgular.takimKullanimlari(db, [istasyonId])];
  const satirlar = takimOlayiSatirlari(g.olaylar, yukler, kullanimlar);
  await sorgular.takimOlaylariEkle(
    db,
    satirlar.map((s) => ({ istasyonId, ...s })),
    { uretimEmriId: secili.uretimEmriId, isEmriId: secili.isEmriId, neden: null, kisiId: kullanici.id },
  );
  return { yazilan: satirlar.length };
}

export interface TakimOmruDurumu {
  istasyonId: number; cep: number; takimKimligi: string; takimAd: string;
  kullanilanDk: number; kullanilanAdet: number; kalanPay: number | null; durum: TakimDurumu | null;
}

export async function takimOmruDurumlari(db: Db, istasyonIdler: readonly number[]): Promise<TakimOmruDurumu[]> {
  const idler = [...new Set(istasyonIdler)];
  const [yukler, kullanimlar] = [await sorgular.istasyonTakimYukleri(db, idler), await sorgular.takimKullanimlari(db, idler)];
  const kullanim = new Map(kullanimlar.map((k) => [`${k.istasyonId}/${k.cep}`, k]));
  return yukler.map((y) => {
    const k = kullanim.get(`${y.istasyonId}/${y.cep}`) ?? { dk: 0, adet: 0 };
    const d = takimDurumu(k, y);
    return {
      istasyonId: y.istasyonId, cep: y.cep, takimKimligi: y.takimKimligi, takimAd: y.takimAd,
      kullanilanDk: k.dk, kullanilanAdet: k.adet, kalanPay: d?.kalanPay ?? null, durum: d?.durum ?? null,
    };
  });
}
