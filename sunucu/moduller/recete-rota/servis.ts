import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { bulunamadi, cakisma, cokBuyuk, dogrulama, eskiSurum } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ROTA_ISLEMLERI } from '#paylasilan/islemler/rota.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type {
  BenCevabi, FasonTahminCevabi, KayitlarCevabi, ReceteRotaDurumCevabi, SilCevabi, Statu, StatulerCevabi, StatuTanimiCevabi, StatuTanimiKaydetGovdesi, YazCevabi, YazGovdesi,
} from '#paylasilan/sozlesme/recete-rota.ts';
import { planlamaAnahtariMi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { emirDilimi, kapanisSonuclari, planlanacakIsEmirleri, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import {
  aktifMakineler, istasyonKisileri, istasyonYetkinlikleri, istasyonlar, isMerkezleri, kisiTezgahSinirlari, makineDurumlari, makineYetkinlikleri, operasyonTipleri, planAyarlari,
} from '../istasyonlar/disari.ts';
import { birimMaliyetleri } from '../finans/disari.ts';
import { kisiSecenekleri } from '../kisiler/disari.ts';
import { firmaAra } from '../musteri-tedarikci/disari.ts';
import { fasonSuresiTahminleri } from '../satin-alma/disari.ts';
import { durumRevizyonlari, revizyonKunyeleri, yururluktekiRevizyonId, yururluktekiRevizyonIdleri } from '../rota/disari.ts';
import { malzemeAra, malzemeOzetleri, olcuBirimleri } from '../malzemeler/disari.ts';
import { malzemeStokDurumlari, sonHareketler } from '../stok/disari.ts';
import { takvimGunleri, vardiyaTanimlari } from '../vardiya/disari.ts';
import {
  adimCiktisiBul, adimKimligi, bagFarklari, bagiDegisenUrunler, jsondanSatirlar, degerBicimeUyarMi, emirleriCevir, adimAdetleriCevir, hareketleriCevir, isMerkeziCevir, maliyetCevir,
  istasyonCevir, kisiCevir, makineCevir, malzemeCevir, degerCokBuyukMu, nulKarakteriVarMi, operasyonCevir, statuleriTuret, sunucuRevizyonlariyla, planAlanlariniKoru,
  bagliDilimleriAyikla, rotaDilimiCevir, sayimBelgesiTablodan, sayimKartKimlikleri, sunucuKaynaklariyla, surumUyarMi, tatilTarihleri, vardiyaCevir, type EmirKaydi,
} from './kurallar.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';

// Akış: yetkiyi uç verir; burada biçim ve sürüm denetimi uygulanır.

const ISLEM_YAZ = 'recete-rota.yaz';
const CAKISMA_ILETISI = 'Reçete ve rota kayıtları siz açtıktan sonra başka bir kişi tarafından değiştirildi; sayfayı yenileyin.';
const BUYUK_ILETISI = 'Reçete ve rota kaydı 1 MB sınırını aşıyor ve kaydedilmedi; eski kayıtları silip yeniden deneyin.';
const PLANLAMA_ILETISI = 'Planlama kaydı plan modülündedir; bu uçtan yazılamaz.';

// Planlama çalışması ve sayfa tercihleri plan modülünün tablosundadır (658 b, 662 a); buradan yazılmaz, silinmez. Tablodaki denetim de reddeder.
export function planlamaAnahtariniReddet(anahtar: string): void {
  if (planlamaAnahtariMi(anahtar)) throw dogrulama(PLANLAMA_ILETISI, 'anahtar');
}

export function ben(kullanici: Kullanici): BenCevabi {
  return { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir: kullanici.islemler.includes(ISLEM_YAZ) };
}

export async function kayitlar(db: Db): Promise<KayitlarCevabi> {
  return { kayitlar: await sorgular.kayitlar(db) };
}

export async function yaz(db: Db, kullanici: Kullanici, g: YazGovdesi, gunluk?: Gunluk): Promise<YazCevabi> {
  planlamaAnahtariniReddet(g.anahtar);
  if (!degerBicimeUyarMi(g.bicim, g.deger)) throw dogrulama('Metin biçimli değer dize olmalıdır.', 'deger');
  if (nulKarakteriVarMi(g.deger)) throw dogrulama('Değer boş karakter (U+0000) içeremez.', 'deger');
  if (degerCokBuyukMu(g.deger)) throw cokBuyuk(BUYUK_ILETISI);
  const mevcut = await sorgular.surumKilitle(db, g.anahtar);
  if (!surumUyarMi(mevcut, g.beklenenSurum)) throw cakisma(CAKISMA_ILETISI);
  const anaKayit = g.anahtar === DURUM_ANAHTARI && g.bicim === 'json';
  const eskiDeger = anaKayit && mevcut !== null ? (await sorgular.kayitGetir(db, g.anahtar))?.deger : undefined;
  const deger = anaKayit ? bagliDilimleriAyikla(planAlanlariniKoru(g.deger, mevcut === null ? null : eskiDeger)) : g.deger;
  const satir = { anahtar: g.anahtar, bicim: g.bicim, deger, kisiId: kullanici.id };
  const kayit = mevcut === null ? await sorgular.kayitEkle(db, satir) : await sorgular.kayitGuncelle(db, satir);
  // Eşzamanlı ilk yazmada öteki kazandı.
  if (kayit === null) throw cakisma(CAKISMA_ILETISI);
  // Ana durum kaydında statülü adımların statüleri aynı transaction'da eşitlenir (kart #1107).
  if (anaKayit) {
    await sorgular.statuEsitle(db, await yururluktekiRevizyonla(db, statuleriTuret(g.deger)));
    // Geçiş süresince tablolar belgeyle aynı transaction'da eşitlenir (geçiş planı adım 3); okumalar tablolara geçince JSON salt okunur olur.
    const belgeden = jsondanSatirlar(g.deger);
    const revizyonIdleri = [...new Set([...belgeden.adimBaglari, ...belgeden.girenStatuleri].map((x) => x.revizyonId))];
    const satirlar = sunucuRevizyonlariyla(belgeden, revizyonIdleri.length === 0 ? [] : (await revizyonKunyeleri(db, revizyonIdleri)).revizyonlar);
    await sorgular.tasimaTablolariniEsitle(db, satirlar, kullanici.id);
    // Gölge karşılaştırma: sayım tablodan okur; belgede olup tabloya yazılamayan bağ günlüğe düşer. Yalnız bağı belgede değişen ürüne
    // bakılır: değişmeyenin farkı önceki yazmada zaten günlüğe düştü, bütün bağ tablosu her yazmada okunmaz.
    const degisen = bagiDegisenUrunler(eskiDeger === undefined ? null : jsondanSatirlar(eskiDeger), belgeden);
    const bakilan = { ...satirlar, adimBaglari: satirlar.adimBaglari.filter((b) => degisen.has(b.malzemeId)) };
    const fark = bagFarklari(bakilan, degisen.size === 0 ? [] : await sorgular.urunlerinAdimBaglari(db, [...degisen]));
    if (fark.length > 0) gunluk?.uyar(`Reçete ve Rota: ${String(fark.length)} bağ tabloda belgeden farklı; sayım tabloyu okur. ${fark.slice(0, 10).join('; ')}`);
  }
  return { kayit };
}

// Statü tanımı komutları: tablo tek kaynaktır; cevap güncel listedir (ekran listesini onunla değiştirir).
export async function statuTanimiKaydet(db: Db, kullanici: Kullanici, kimlik: string, g: StatuTanimiKaydetGovdesi): Promise<StatuTanimiCevabi> {
  const mevcut = await sorgular.statuTanimiSurumu(db, kimlik);
  if (g.beklenenSurum === null) {
    if (mevcut !== null || !(await sorgular.statuTanimiEkle(db, kimlik, g, kullanici.id))) throw cakisma(`${kimlik} kimlikli statü zaten var; sayfayı yenileyin.`);
  } else {
    if (mevcut === null) throw bulunamadi('Statü bulunamadı; başka bir kişi silmiş olabilir.');
    if (mevcut !== g.beklenenSurum) throw eskiSurum();
    await sorgular.statuTanimiGuncelle(db, kimlik, g, kullanici.id);
  }
  return { statuses: await sorgular.statuTanimlari(db) };
}

export async function statuTanimiSil(db: Db, kimlik: string, beklenenSurum: number): Promise<StatuTanimiCevabi> {
  const mevcut = await sorgular.statuTanimiSurumu(db, kimlik);
  if (mevcut === null) throw bulunamadi('Statü bulunamadı; başka bir kişi silmiş olabilir.');
  if (mevcut !== beklenenSurum) throw eskiSurum();
  await sorgular.statuTanimiSil(db, kimlik);
  return { statuses: await sorgular.statuTanimlari(db) };
}

export async function fasonTahminleri(
  db: Db, sorgu: readonly { malzemeNo: number; operasyonTipiId: number; firmaId: number; adet: number }[],
): Promise<FasonTahminCevabi> {
  return { gunler: await fasonSuresiTahminleri(db, sorgu) };
}
export async function statuler(db: Db): Promise<StatulerCevabi> {
  return { statuler: await statuListesi(db) };
}
const urunu = (s: { kaynakAdim: string }): number | null => { const m = /^(\d+)-o\d+$/.exec(s.kaynakAdim); return m ? Number(m[1]) : null; };
// Kaynak adım `<ürün no>-o<OP>`: ürünün stok kodu malzemelerden, revizyon harfi rotadan okunur.
export async function statuListesi(db: Db): Promise<Statu[]> {
  const liste = await sorgular.statuler(db);
  const ozet = await malzemeOzetleri(db, liste.map(urunu).filter((x): x is number => x !== null));
  const revizyonIdleri = [...new Set(liste.flatMap((s) => (s.rotaRevizyonuId === null ? [] : [s.rotaRevizyonuId])))];
  const harf = new Map((revizyonIdleri.length === 0 ? [] : (await revizyonKunyeleri(db, revizyonIdleri)).revizyonlar).map((r) => [r.id, r.harf]));
  return liste.map(({ rotaRevizyonuId, ...s }) => {
    const no = urunu(s);
    return { ...s, urunKodu: no === null ? null : ozet.get(no)?.kod ?? null, revizyon: rotaRevizyonuId === null ? null : harf.get(rotaRevizyonuId) ?? null };
  });
}
// Çerçevenin yazdığı statüler ürünün yürürlükteki revizyonuna açılır; eski revizyonun statüsü (ve ondaki stok) olduğu gibi kalır.
async function yururluktekiRevizyonla<T extends { kaynakAdim: string }>(db: Db, liste: readonly T[]): Promise<(T & { rotaRevizyonuId: number | null })[]> {
  const rev = await yururluktekiRevizyonIdleri(db, [...new Set(liste.map(urunu).filter((x): x is number => x !== null))]);
  return liste.map((s) => { const no = urunu(s); return { ...s, rotaRevizyonuId: no === null ? null : rev.get(no) ?? null }; });
}

export async function sil(db: Db, anahtar: string, beklenenSurum: number): Promise<SilCevabi> {
  planlamaAnahtariniReddet(anahtar);
  const mevcut = await sorgular.surumKilitle(db, anahtar);
  if (mevcut === null) return { silindi: false };
  if (!surumUyarMi(mevcut, beklenenSurum)) throw cakisma(CAKISMA_ILETISI);
  return { silindi: await sorgular.kayitSil(db, anahtar) };
}

// Bağlı durum (kart #1104): sahibi modüllerin `disari.ts` okumaları prototipin `st` biçimine çevrilir (kurallar.ts). Yetkiyi uç verir;
// sahip modüllerin kapsam kuralları burada uygulanmaz (yalnız okuma).
const MALZEME_SAYFA_BOYU = 200;
const MALZEME_AZAMI_SAYFA = 10;
const HAREKET_SAYISI = 100;

export interface MalzemeSiniri { sayfaBoyu: number; azamiSayfa: number }
type MalzemeOzeti = Awaited<ReturnType<typeof malzemeAra>>['satirlar'][number];

async function aktifMalzemeler(db: Db, sinir: MalzemeSiniri): Promise<{ kartlar: MalzemeOzeti[]; kesildi: boolean }> {
  const kartlar: MalzemeOzeti[] = [];
  for (let sayfa = 1; sayfa <= sinir.azamiSayfa; sayfa += 1) {
    const s = await malzemeAra(db, { metin: null, yalnizAktif: true, sayfa, sayfaBoyu: sinir.sayfaBoyu });
    kartlar.push(...s.satirlar);
    if (s.satirlar.length < sinir.sayfaBoyu || (s.toplam !== null && kartlar.length >= s.toplam)) return { kartlar, kesildi: false };
  }
  return { kartlar, kesildi: true };
}

// Her dilim sahibinin kendi okuma ucundaki yetkiyi ister; yetkisi olmayana o dilim null gelir (kart #1104, VARSAYIM: kullanıcı kararı bekliyor).
// Birim maliyetler finanstan gelir ve finans.maliyet-oku ister (kullanıcı kararı 14.10.2026, kart #1187).
// Vardiya takvimi sahibinde yalnız oturum ister (vardiya/uclar.ts), burada da açık. Stok yetkisi yoksa malzemenin stok ve kritik seviyesi null.
const MALZEME_OKUMA: readonly Islem[] = ['sayfa.malzemeler'];
const ISTASYON_OKUMA: readonly Islem[] = ['sayfa.istasyonlar', 'istasyonlar.yaz'];
const KISI_OKUMA: readonly Islem[] = ['kisiler.oku'];
// Rotanın kendi uçları oturumla açıktır; okuma işlemi olarak rota sayfası ve rota işlemleri sayılır (kart #1184, VARSAYIM).
const ROTA_OKUMA: readonly Islem[] = ['sayfa.rota', ...ROTA_ISLEMLERI];
const MALIYET_OKUMA: readonly Islem[] = ['finans.maliyet-oku'];
const MALIYET_YAZMA: readonly Islem[] = ['finans.yonet'];
const STOK_OKUMA: readonly Islem[] = ['sayfa.stok', ...STOK_ISLEMLERI];
const EMIR_OKUMA: readonly Islem[] = ADIMLI_OKUMA_ISLEMLERI;
// Rota modülünün fason seçicisiyle aynı sınır (rota/servis.ts); süzgeç aramada uygulanır, yalnız aktif fason firmalar gelir.
const FASON_ARAMA_SINIRI = 200;
const yetkiliMi = (k: Kullanici, islemler: readonly Islem[]): boolean => islemler.some((i) => islemVarMi(k, i));

export async function durum(
  db: Db, kullanici: Kullanici, sinir: MalzemeSiniri = { sayfaBoyu: MALZEME_SAYFA_BOYU, azamiSayfa: MALZEME_AZAMI_SAYFA },
): Promise<ReceteRotaDurumCevabi> {
  return (await durumVeEmirler(db, kullanici, sinir)).durum;
}

// Plan modülü bağlı durumu kendi alanlarıyla birleştirir (658 b). Başlamış adımların çevirisi emir kayıtlarını ister; ikinci kez okunmasın
// diye durumla birlikte döner. Emir okuma yetkisi yoksa null.
export async function durumVeEmirler(
  db: Db, kullanici: Kullanici, sinir: MalzemeSiniri = { sayfaBoyu: MALZEME_SAYFA_BOYU, azamiSayfa: MALZEME_AZAMI_SAYFA },
): Promise<{ durum: ReceteRotaDurumCevabi; emirKayitlari: EmirKaydi[] | null }> {
  const malzemeOkur = yetkiliMi(kullanici, MALZEME_OKUMA);
  const istasyonOkur = yetkiliMi(kullanici, ISTASYON_OKUMA);
  const kisiOkur = yetkiliMi(kullanici, KISI_OKUMA);
  const stokOkur = yetkiliMi(kullanici, STOK_OKUMA);
  const rotaOkur = yetkiliMi(kullanici, ROTA_OKUMA);
  const emirOkur = yetkiliMi(kullanici, EMIR_OKUMA);
  const maliyetOkur = yetkiliMi(kullanici, MALIYET_OKUMA);

  const { kartlar, kesildi } = malzemeOkur ? await aktifMalzemeler(db, sinir) : { kartlar: [], kesildi: false };
  const stoklar = malzemeOkur && stokOkur ? await malzemeStokDurumlari(db, kartlar.map((k) => k.id)) : new Map();
  const birimler = malzemeOkur ? await olcuBirimleri(db) : null;
  const tipler = istasyonOkur ? await operasyonTipleri(db) : [];
  const merkezler = istasyonOkur ? await isMerkezleri(db, { pasiflerDahil: false }) : [];
  const istasyonListesi = istasyonOkur ? await istasyonlar(db, { pasiflerDahil: false }) : [];
  const makineler = istasyonOkur ? await aktifMakineler(db) : [];
  const ayarlar = istasyonOkur ? await planAyarlari(db) : [];
  const durumlar = istasyonOkur ? await makineDurumlari(db) : [];
  const kisiler = kisiOkur ? await kisiSecenekleri(db) : [];
  const kisiIstasyonlari = kisiOkur && istasyonOkur ? await istasyonKisileri(db) : [];
  const yetkinlikler = kisiOkur && istasyonOkur ? await istasyonYetkinlikleri(db) : [];
  const makineYetkinlik = kisiOkur && istasyonOkur ? await makineYetkinlikleri(db) : [];
  const tezgahSinirlari = kisiOkur && istasyonOkur ? await kisiTezgahSinirlari(db) : [];
  const maliyet = maliyetOkur
    ? maliyetCevir(
      await birimMaliyetleri(db, 'malzeme'), await birimMaliyetleri(db, 'istasyon'), await birimMaliyetleri(db, 'kisi'),
      yetkiliMi(kullanici, MALIYET_YAZMA))
    : null;
  const vardiyalar = await vardiyaTanimlari(db);
  const gunler = await takvimGunleri(db);
  const hareketler = stokOkur ? await sonHareketler(db, HAREKET_SAYISI) : null;
  const statuAnahtari = hareketler === null ? new Map<number, string>() : new Map((await sorgular.statuler(db)).map((x) => [x.id, `step:${x.kaynakAdim}`]));
  const rotaRevizyonlari = rotaOkur ? await durumRevizyonlari(db) : [];
  const fasonFirmalari = rotaOkur ? await firmaAra(db, { metin: '', sinir: FASON_ARAMA_SINIRI, fason: true }) : null;
  const emirDilimleri = emirOkur ? await emirDilimi(db) : null;
  const kapanislar = emirDilimleri === null ? null : await kapanisSonuclari(db, emirDilimleri.filter((e) => e.durum === 'bitti').map((e) => e.id));
  const adimAdetleri = emirOkur ? adimAdetleriCevir(await planlanacakIsEmirleri(db, { taslakDahil: true })) : null;

  const ayarHaritasi = new Map(ayarlar.map((a) => [a.istasyonId, a]));
  const makineDurumu = new Map(durumlar.map((d) => [d.makineId, d.durum]));
  const makineSayilari = new Map<number, number>();
  for (const m of makineler) if (m.istasyonId !== null) makineSayilari.set(m.istasyonId, (makineSayilari.get(m.istasyonId) ?? 0) + 1);
  const makineIstasyonu = new Map(makineler.flatMap((m) => (m.istasyonId === null ? [] : [[m.id, m.istasyonId] as const])));
  const rota = rotaDilimiCevir(rotaRevizyonlari, makineIstasyonu);
  const istasyonMerkezi = new Map(istasyonListesi.map((i) => [i.id, i.isMerkeziId]));
  const kisiIstasyonu = new Map(kisiIstasyonlari.map((k) => [k.kisiId, k.istasyonId]));
  const kisiYetkinlikleri = new Map<number, number[]>();
  for (const y of yetkinlikler) kisiYetkinlikleri.set(y.kisiId, [...(kisiYetkinlikleri.get(y.kisiId) ?? []), y.istasyonId]);
  const kisiMakineleri = new Map<number, number[]>();
  for (const y of makineYetkinlik) kisiMakineleri.set(y.kisiId, [...(kisiMakineleri.get(y.kisiId) ?? []), y.makineId]);
  const kisiSiniri = new Map(tezgahSinirlari.map((t) => [t.kisiId, t.enCok]));

  const durum: ReceteRotaDurumCevabi = {
    items: malzemeOkur ? kartlar.map((k) => malzemeCevir(k, stoklar.get(k.id))) : null,
    units: birimler,
    opdefs: istasyonOkur ? tipler.map(operasyonCevir) : null,
    wcs: istasyonOkur ? merkezler.map(isMerkeziCevir) : null,
    stations: istasyonOkur ? istasyonListesi.map((i) => istasyonCevir(i, ayarHaritasi.get(i.id), makineSayilari.get(i.id) ?? 0)) : null,
    machines: istasyonOkur ? makineler.map((m) => makineCevir(m, makineDurumu.get(m.id))) : null,
    people: kisiOkur
      ? kisiler.map((k) => kisiCevir(k, kisiIstasyonu.get(k.id), istasyonMerkezi, kisiYetkinlikleri.get(k.id) ?? [],
        { makineler: kisiMakineleri.get(k.id) ?? [], enCok: kisiSiniri.get(k.id) ?? null }))
      : null,
    routes: rotaOkur ? rota.routes : null,
    routeRevs: rotaOkur ? rota.routeRevs : null,
    fasonFirms: fasonFirmalari === null ? null : fasonFirmalari.map((f) => ({ id: String(f.id), code: f.kod, name: f.ad })),
    cal: { shifts: vardiyalar.filter((v) => v.aktif).map(vardiyaCevir), holidays: tatilTarihleri(gunler) },
    emirler: emirDilimleri === null ? null : emirleriCevir(emirDilimleri, kapanislar ?? undefined),
    adimAdetleri,
    maliyet,
    statuses: await sorgular.statuTanimlari(db),
    moves: hareketler === null ? null : hareketleriCevir(hareketler, statuAnahtari),
    malzemeKesildi: kesildi,
  };
  return { durum, emirKayitlari: emirDilimleri };
}

// Planın satın alma eki ve sunucu çözücüsü aktif malzemeleri durumdaki biçimiyle okur; malzeme okuma yetkisi yoksa null (stok alanları boş).
export async function aktifMalzemeListesi(db: Db, kullanici: Kullanici): Promise<ReceteRotaDurumCevabi['items']> {
  if (!yetkiliMi(kullanici, MALZEME_OKUMA)) return null;
  const { kartlar } = await aktifMalzemeler(db, { sayfaBoyu: MALZEME_SAYFA_BOYU, azamiSayfa: MALZEME_AZAMI_SAYFA });
  return kartlar.map((k) => malzemeCevir(k, undefined));
}

// Durumun dilimlerini açan okuma işlemleri; plan modülünün sunucu okuyucusu ve kapasite okuması aynı kapsamı kullanır.
export const KAYNAK_OKUMA = {
  malzeme: MALZEME_OKUMA, istasyon: ISTASYON_OKUMA, kisi: KISI_OKUMA, stok: STOK_OKUMA, rota: ROTA_OKUMA, emir: EMIR_OKUMA, maliyet: MALIYET_OKUMA,
} as const;

// Sayımın okuduğu belge: kayıtlı durum, ürünün rotası rota modülünün yürürlükteki hâliyle, adımın "çıkan" kalemi ve statü bağı taşıma
// tablosundan (sayimBelgesiTablodan). Revizyon verilirse rota o
// revizyonun hâlidir: eski revizyonla açılmış emir, yeni revizyonda kalkmış adımında da kendi rotasıyla sayılır. Kayıt yoksa null.
async function sayimDurumu(db: Db, malzemeNo: number, revizyonId: number | null = null): Promise<unknown> {
  const kayit = await sorgular.kayitGetir(db, DURUM_ANAHTARI);
  if (kayit === null || kayit.bicim !== 'json') return null;
  const revizyonlar = await durumRevizyonlari(db, malzemeNo);
  const secilen = revizyonId !== null && revizyonlar.some((r) => r.id === revizyonId)
    ? revizyonlar.map((r) => (r.id === revizyonId ? { ...r, durum: 'yururlukte' as const } : r.durum === 'yururlukte' ? { ...r, durum: 'onayli' as const } : r))
    : revizyonlar;
  const rota = rotaDilimiCevir(secilen, new Map());
  // Bağ, rotası okunan revizyonundur: emrin revizyonu, yoksa yürürlükteki. Taslaktaki bağ yürürlüğe alınana kadar sayıma girmez. Yürürlükte
  // revizyonu olmayan ürünün (rota modülüne geçmemiş yerel rota) bağı tabloya yazılamaz; belge olduğu gibi okunur. Rotalı emir her zaman
  // revizyonludur (uretim_emri_rotali), yani üretim sayımı bu yola düşmez.
  const bagRevizyonu = secilen.find((r) => r.durum === 'yururlukte')?.id ?? null;
  const belge = bagRevizyonu === null ? kayit.deger
    : sayimBelgesiTablodan(kayit.deger, malzemeNo, rota.routes[String(malzemeNo)], await sorgular.adimBaglari(db, bagRevizyonu));
  const ozetler = await malzemeOzetleri(db, sayimKartKimlikleri(belge, malzemeNo));
  const kartlar = [...ozetler.values()].map((o) => { const m = malzemeCevir(o, undefined); return { id: m.id, code: m.code, type: m.type }; });
  return sunucuKaynaklariyla(belge, kartlar, (await operasyonTipleri(db)).map((t) => ({ id: String(t.id), name: t.ad })));
}

const emirOzeti = async (db: Db, uretimEmriId: number | null | undefined) =>
  (uretimEmriId === undefined || uretimEmriId === null ? null : uretimEmriOzeti(db, uretimEmriId));

// Üretim sayımında stok girişinin statüsü (kart #1289): adımın statüsü, rotanın şimdiki hâlinde statü açıyorsa (son adım değilse, başka
// karta ya da tanımlı statüye bağlı değilse) kimliği döner; yoksa null. Rotadan kalkmış adımın eski statü satırı kullanılmaz. Statü rota
// revizyonuna aittir: emir verilirse adım ve statü emrin açıldığı revizyondandır, verilmezse (ya da emir rotasızsa) yürürlükteki revizyondan.
// Satır henüz yoksa burada açılır (çerçevenin yazımındaki eşitlemeyle aynı).
export async function adimStatusu(db: Db, g: { malzemeNo: number; opNo: number; uretimEmriId?: number | null | undefined }): Promise<number | null> {
  const emir = await emirOzeti(db, g.uretimEmriId);
  const belge = await sayimDurumu(db, g.malzemeNo, emir?.kaynakRotaRevizyonId ?? null);
  if (belge === null) return null;
  const kimlik = adimKimligi(g.malzemeNo, g.opNo);
  const turetilen = statuleriTuret(belge);
  if (!turetilen.some((x) => x.kaynakAdim === kimlik)) return null;
  const revizyon = emir?.kaynakRotaRevizyonId ?? await yururluktekiRevizyonId(db, g.malzemeNo);
  const id = await sorgular.statuKimligi(db, kimlik, revizyon);
  if (id !== null) return id;
  await sorgular.statuEsitle(db, turetilen.filter((x) => urunu(x) === g.malzemeNo).map((x) => ({ ...x, rotaRevizyonuId: revizyon })));
  return sorgular.statuKimligi(db, kimlik, revizyon);
}

// Üretim sayımında adımın çıktı kartı (kart #1289): rotada ara adımın "çıkan" kalemi; yoksa null. Statüyle aynı revizyondan okunur
// (kart #1214): emir verilirse emrin açıldığı revizyonun bağı, verilmezse (ya da emir rotasızsa) yürürlükteki; ikisi ayrı revizyondan
// okunursa revizyon sonrası açık emirde çıktı yeni, statü eski rotadan gelir.
export async function adimCiktisi(db: Db, g: { malzemeNo: number; opNo: number; uretimEmriId?: number | null | undefined }): Promise<number | null> {
  const emir = await emirOzeti(db, g.uretimEmriId);
  const belge = await sayimDurumu(db, g.malzemeNo, emir?.kaynakRotaRevizyonId ?? null);
  return belge === null ? null : adimCiktisiBul(belge, g.malzemeNo, g.opNo);
}
