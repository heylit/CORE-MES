import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { bulunamadi, cakisma, cokBuyuk, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ROTA_ISLEMLERI } from '#paylasilan/islemler/rota.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type {
  BenCevabi, FasonTahminCevabi, MalzemeIhtiyaciCevabi, KayitlarCevabi, ReceteRotaDurumCevabi, SilCevabi, Statu, StatulerCevabi, StatuTanimiCevabi, StatuTanimiKaydetGovdesi, YazCevabi, YazGovdesi,
} from '#paylasilan/sozlesme/recete-rota.ts';
import { planlamaAnahtariMi } from '#paylasilan/sozlesme/recete-rota.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { emirDilimi, emirlerinMalzemeIhtiyaci, emrinPatlatmasi, kapanisSonuclari, planlanacakIsEmirleri, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import {
  aktifMakineler, istasyonKisileri, istasyonYetkinlikleri, istasyonlar, isMerkezleri, kisiTezgahSinirlari, makineDurumlari, makineYetkinlikleri, operasyonTipleri, planAyarlari,
} from '../istasyonlar/disari.ts';
import { birimMaliyetleri } from '../finans/disari.ts';
import { kisiSecenekleri } from '../kisiler/disari.ts';
import { firmaAra } from '../musteri-tedarikci/disari.ts';
import { emrinSatinAlmaDurumlari, fasonSuresiTahminleri } from '../satin-alma/disari.ts';
import { durumRevizyonlari, patlatmaRevizyonu, revizyonKunyeleri, yururluktekiRevizyonId, yururluktekiRevizyonIdleri } from '../rota/disari.ts';
import type { AraHalCozumu } from '../rota/disari.ts';
import type { malzemeAra } from '../malzemeler/disari.ts';
import { aktifMalzemelerSinirli, malzemeOzetleri, olcuBirimleri } from '../malzemeler/disari.ts';
import { emirlerinNetSarfi, emrinRezerveleri, malzemeStokDurumlari, sonHareketler, statuluStoklar, statuStoklari, stokMiktarlari } from '../stok/disari.ts';
import { takvimGunleri, vardiyaTanimlari } from '../vardiya/disari.ts';
import {
  adimCiktisiBul, adimKimligi, araStokHavuzuKur, bagFarklari, emirMalzemeIhtiyaclari, bagiDegisenUrunler, jsondanSatirlar, degerBicimeUyarMi, emirleriCevir, adimAdetleriCevir, hareketleriCevir, isMerkeziCevir, maliyetCevir,
  istasyonCevir, kisiCevir, makineCevir, malzemeCevir, degerCokBuyukMu, nulKarakteriVarMi, operasyonCevir, statuleriTuret, sunucuRevizyonlariyla, planAlanlariniKoru,
  bagliDilimleriAyikla, kayitMaliyetiniKoru, kayitMaliyetiniSuz, rotaDilimiCevir, sayimBelgesiTablodan, sayimKartKimlikleri, sunucuKaynaklariyla, surumUyarMi, tatilTarihleri, vardiyaCevir, type EmirKaydi,
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

// Ana durum kaydı komutla yazılmaz, silinmez (B-2484-2): yeni ekran yazmaz (204 a); eski çerçevenin bütün-belge yazımı taşıma tablolarında
// belgede olmayan bütün bağları siliyordu. Reçete ve rota sahiplerinin komutlarıyla değişir; kayıt yalnız örnek veri yüklemesinde yazılır.
const ANA_KAYIT_ILETISI = 'Reçete ve rota ana kaydı salt okunurdur; reçete ve rota kendi ekranlarından değiştirilir.';
export function anaKaydiReddet(anahtar: string): void {
  if (anahtar === DURUM_ANAHTARI) throw dogrulama(ANA_KAYIT_ILETISI, 'anahtar');
}

export function ben(kullanici: Kullanici): BenCevabi {
  return { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir: kullanici.islemler.includes(ISLEM_YAZ) };
}

// Ham kayıt okuması ve yazmanın geri dönen kaydı maliyet görmeyene kalem maliyetsiz döner (2783, 2601 a; kurallar.ts kayitMaliyetiniSuz).
const gorunenKayit = <T extends { bicim: string; deger: unknown }>(k: Kullanici, kayit: T): T => (yetkiliMi(k, MALIYET_OKUMA) ? kayit : kayitMaliyetiniSuz(kayit));

export async function kayitlar(db: Db, kullanici: Kullanici): Promise<KayitlarCevabi> {
  return { kayitlar: (await sorgular.kayitlar(db)).map((k) => gorunenKayit(kullanici, k)) };
}

// Komut ucu: ana kayıt dışındaki anahtarlar.
export async function komutlaYaz(db: Db, kullanici: Kullanici, g: YazGovdesi, gunluk?: Gunluk): Promise<YazCevabi> {
  anaKaydiReddet(g.anahtar);
  // Maliyet görmeyenin gönderdiği maliyet yok sayılır, kayıttaki kalır (kurallar.ts kayitMaliyetiniKoru). Satır kilitlenip okunur:
  // korunan değer yazmanın sürüm denetimindeki kayıttandır.
  const korunmus = yetkiliMi(kullanici, MALIYET_OKUMA)
    ? g
    : kayitMaliyetiniKoru(g, (await sorgular.surumKilitle(db, g.anahtar)) === null ? null : await sorgular.kayitGetir(db, g.anahtar));
  const { kayit } = await yaz(db, kullanici, korunmus, gunluk);
  return { kayit: gorunenKayit(kullanici, kayit) };
}

export async function komutlaSil(db: Db, anahtar: string, beklenenSurum: number): Promise<SilCevabi> {
  anaKaydiReddet(anahtar);
  return sil(db, anahtar, beklenenSurum);
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

// B-2483-11: termini girilmemiş bitmemiş fason adıma Satın Alma'nın tahmini (tek okumada); plan motoru termin yoksa onu, o da yoksa 7 günü alır.
// Adet emrin adedidir (VARSAYIM: adımın kalan adedi değil; tahmin adetle az değişir).
async function fasonTahminiEkle(db: Db, emirler: EmirKaydi[]): Promise<EmirKaydi[]> {
  const sorulacak = emirler.flatMap((e) => (e.kaynakRotaRevizyonId === null ? [] : e.isEmirleri
    .filter((i) => i.durum !== 'tamam' && i.kaynak?.tur === 'fason' && i.terminGun == null)
    .map((i) => ({ e, i, q: { malzemeNo: e.malzemeNo, operasyonTipiId: i.operasyonTipiId, firmaId: i.kaynak!.id, adet: e.adet } }))));
  if (sorulacak.length === 0) return emirler;
  const gunler = await fasonSuresiTahminleri(db, sorulacak.map((x) => x.q));
  const tahmin = new Map(sorulacak.map((x, n) => [x.i, gunler[n] ?? null]));
  return emirler.map((e) => ({ ...e, isEmirleri: e.isEmirleri.map((i) => (tahmin.has(i) ? { ...i, tahminGun: tahmin.get(i)! } : i)) }));
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
  return aktifMalzemelerSinirli(db, sinir.sayfaBoyu * sinir.azamiSayfa);
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
// Risk D1 (3175): satın alma durumu satın alma okuyabilene ya da açık sipariş okuyabilene (stok/uclar.ts ACIK_SIPARIS_OKUMA) görünür.
const SATIN_ALMA_OKUMA: readonly Islem[] = ['satin-alma.oku', 'satin-alma.talep-ac', 'satin-alma.yaz', 'stok.giris', 'plan.planlama-oku'];
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
// emirSecimi verilirse kapalı emirlerin yalnız bir kısmı gelir (plan modülünün planlama kaynağı, 2216-1 a); verilmezse hepsi.
export async function durumVeEmirler(
  db: Db, kullanici: Kullanici, sinir: MalzemeSiniri = { sayfaBoyu: MALZEME_SAYFA_BOYU, azamiSayfa: MALZEME_AZAMI_SAYFA },
  emirSecimi?: { kapaliGun: number; dahil: readonly number[] },
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
  const emirDilimleri = emirOkur ? await fasonTahminiEkle(db, await emirDilimi(db, emirSecimi)) : null;
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

// Emir malzeme ihtiyacı (2486-8, 461 b): kural kurallar.ts emirMalzemeIhtiyaclari'ndadır. Emir okuma yetkisi şarttır (durumun emir dilimi);
// stok okuma yetkisi yoksa ara adım stoğu okunmaz, serbest stok durumdaki kuralla gelir. Emir verilip planda değilse boş liste döner.
export async function malzemeIhtiyaci(db: Db, kullanici: Kullanici, emirId?: number): Promise<MalzemeIhtiyaciCevabi> {
  if (!yetkiliMi(kullanici, EMIR_OKUMA)) throw yetkiYok();
  const { durum: d } = await durumVeEmirler(db, kullanici);
  const emirler = d.emirler?.orders ?? [];
  if (emirId !== undefined && !emirler.some((o) => o.kayitNo === emirId)) throw bulunamadi('Üretim emri bulunamadı.');
  const kayitlar = emirler.map((o) => o.kayitNo);
  const stokGorunur = yetkiliMi(kullanici, STOK_OKUMA);
  const statuler = stokGorunur ? await sorgular.statuler(db) : [];
  const kartNo = new Map((d.items ?? []).map((i) => [i.code.trim().toLocaleUpperCase('tr-TR'), i.kayitNo]));
  const statuKartlari = [...new Set(statuler.flatMap((x) => { const no = kartNo.get(x.malzemeNo.trim().toLocaleUpperCase('tr-TR')); return no === undefined ? [] : [no]; }))];
  const sonuclar = emirMalzemeIhtiyaclari({
    durum: d,
    kopyalar: await emirlerinMalzemeIhtiyaci(db, kayitlar),
    sarflar: await emirlerinNetSarfi(db, kayitlar),
    araStok: stokGorunur ? araStokHavuzuKur(statuler, await statuluStoklar(db, statuKartlari)) : new Map(),
  }).filter((x) => emirId === undefined || x.emirId === emirId);
  const kartlar = await malzemeOzetleri(db, [...new Set(sonuclar.flatMap((x) => [...x.hammadde.map((h) => h.malzemeNo), ...x.yanUrun.map((y) => y.malzemeNo)]))]);
  const kart = (no: number) => { const k = kartlar.get(no); return { malzemeNo: no, kod: k?.kod ?? null, ad: k?.ad ?? null, birim: k?.birim ?? null }; };
  const metin = (n: number): string => String(n);
  // 3175: rezerve ve satın alma yalnız tek emir okunurken gelir (emir ekranı); stok okuması yoksa rezerve, satın alma ya da açık sipariş
  // okuması yoksa satın alma null (Risk D1). Emir verilmezse ikisi de null.
  const satinAlmaGorunur = emirId !== undefined && yetkiliMi(kullanici, SATIN_ALMA_OKUMA);
  const rezerveler = emirId !== undefined && stokGorunur ? await emrinRezerveleri(db, emirId) : null;
  const emirNo = satinAlmaGorunur ? (await uretimEmriOzeti(db, emirId))?.emirNo ?? null : null;
  const satinAlmalar = satinAlmaGorunur && emirNo !== null ? await emrinSatinAlmaDurumlari(db, emirId, emirNo) : null;
  // Stok okunurken ayrılanı olmayan malzemenin rezervesi bilinen sıfırdır; okunmadıysa null.
  const rezerve = (no: number): string | null => (rezerveler === null ? null : metin(Number(rezerveler.get(no) ?? '0')));
  const satinAlma = (no: number) => {
    const d = satinAlmalar?.get(no);
    return d === undefined ? null : { asama: d.asama, no: d.no, talepDurumu: d.talepDurumu, termin: d.termin };
  };
  return {
    stokGorunur,
    satinAlmaGorunur,
    emirler: sonuclar.map((x) => {
      const hammadde = x.hammadde.map((h) => ({
        ...kart(h.malzemeNo), brut: metin(h.brut), verilen: metin(h.verilen), stoktan: metin(h.stoktan), alinacak: metin(h.alinacak),
        rezerve: rezerve(h.malzemeNo), satinAlma: satinAlma(h.malzemeNo),
      }));
      return {
        emirId: x.emirId, hammadde, eksikler: hammadde.filter((h) => Number(h.alinacak) > 1e-6),
        yanUrun: x.yanUrun.map((y) => ({ ...kart(y.malzemeNo), miktar: metin(y.miktar) })), uyarilar: x.uyarilar,
      };
    }),
  };
}

// Durumun dilimlerini açan okuma işlemleri; plan modülünün sunucu okuyucusu ve kapasite okuması aynı kapsamı kullanır.
export const KAYNAK_OKUMA = {
  malzeme: MALZEME_OKUMA, istasyon: ISTASYON_OKUMA, kisi: KISI_OKUMA, stok: STOK_OKUMA, rota: ROTA_OKUMA, emir: EMIR_OKUMA, maliyet: MALIYET_OKUMA,
} as const;

// Sayımın okuduğu belge: kayıtlı durum, ürünün rotası rota modülünün yürürlükteki hâliyle, adımın "çıkan" kalemi ve statü bağı taşıma
// tablosundan (sayimBelgesiTablodan). Revizyon verilirse rota o
// revizyonun hâlidir: eski revizyonla açılmış emir, yeni revizyonda kalkmış adımında da kendi rotasıyla sayılır. Yeni ekran ana kaydı yazmaz:
// kayıt yoksa sayım boş belgeyle yürür (rota ve bağ tablodan okunur); yoksa ara adımın çıktısı statüsüz stoğa düşer (B-2484-1).
async function sayimDurumu(db: Db, malzemeNo: number, revizyonId: number | null = null): Promise<unknown> {
  const kayit = await sorgular.kayitGetir(db, DURUM_ANAHTARI);
  if (kayit !== null && kayit.bicim !== 'json') return null;
  const kayitliBelge: unknown = kayit === null ? {} : kayit.deger;
  const revizyonlar = await durumRevizyonlari(db, malzemeNo);
  // Kayıt da rota da yoksa okunacak adım yoktur: sayım her adımda bu çözücüyü çağırır, gerisi okunmaz.
  if (kayit === null && revizyonlar.every((r) => r.adimlar.length === 0)) return null;
  const secilen = revizyonId !== null && revizyonlar.some((r) => r.id === revizyonId)
    ? revizyonlar.map((r) => (r.id === revizyonId ? { ...r, durum: 'yururlukte' as const } : r.durum === 'yururlukte' ? { ...r, durum: 'onayli' as const } : r))
    : revizyonlar;
  const rota = rotaDilimiCevir(secilen, new Map());
  // Bağ, rotası okunan revizyonundur: emrin revizyonu, yoksa yürürlükteki. Taslaktaki bağ yürürlüğe alınana kadar sayıma girmez. Yürürlükte
  // revizyonu olmayan ürünün (rota modülüne geçmemiş yerel rota) bağı tabloya yazılamaz; belge olduğu gibi okunur. Rotalı emir her zaman
  // revizyonludur (uretim_emri_rotali), yani üretim sayımı bu yola düşmez.
  const bagRevizyonu = secilen.find((r) => r.durum === 'yururlukte')?.id ?? null;
  const belge = bagRevizyonu === null ? kayitliBelge
    : sayimBelgesiTablodan(kayitliBelge, malzemeNo, rota.routes[String(malzemeNo)], await sorgular.adimBaglari(db, bagRevizyonu));
  const ozetler = await malzemeOzetleri(db, sayimKartKimlikleri(belge, malzemeNo));
  const kartlar = [...ozetler.values()].map((o) => { const m = malzemeCevir(o, undefined); return { id: m.id, code: m.code, type: m.type }; });
  return sunucuKaynaklariyla(belge, kartlar, (await operasyonTipleri(db)).map((t) => ({ id: String(t.id), name: t.ad })));
}

const emirOzeti = async (db: Db, uretimEmriId: number | null | undefined) =>
  (uretimEmriId === undefined || uretimEmriId === null ? null : uretimEmriOzeti(db, uretimEmriId));

// Sayımın rota revizyonu; null ise yürürlükteki okunur. Emir yoksa null. Çok katmanlı emrin alt düğümünde (malzeme emrin ürünü değil) revizyon
// patlatmada donmuş olandır (1558 a, 1481 a): emir açıldıktan sonra alt parçanın yeni revizyonu yürürlüğe girse de açık emir kendi rotasıyla
// sayılır. Patlatmada bulunmayan malzeme yürürlükteki revizyondan okunur. Kökte ve tek katmanlı emirde emrin açıldığı revizyondur.
async function sayimRevizyonu(db: Db, malzemeNo: number, uretimEmriId: number | null | undefined): Promise<number | null> {
  const emir = await emirOzeti(db, uretimEmriId);
  if (emir === null) return null;
  const patlatma = emir.malzemeNo === malzemeNo ? null : await emrinPatlatmasi(db, emir.id);
  return patlatma === null ? emir.kaynakRotaRevizyonId : patlatmaRevizyonu(db, patlatma, malzemeNo);
}

// Üretim sayımında stok girişinin statüsü (kart #1289): adımın statüsü, rotanın şimdiki hâlinde statü açıyorsa (son adım değilse, başka
// karta ya da tanımlı statüye bağlı değilse) kimliği döner; yoksa null. Rotadan kalkmış adımın eski statü satırı kullanılmaz. Statü rota
// revizyonuna aittir: emir verilirse adım ve statü emrin açıldığı revizyondandır (alt düğümde patlatmadaki), verilmezse (ya da emir rotasızsa)
// yürürlükteki revizyondan. Satır henüz yoksa burada açılır (çerçevenin yazımındaki eşitlemeyle aynı).
export async function adimStatusu(db: Db, g: { malzemeNo: number; opNo: number; uretimEmriId?: number | null | undefined }): Promise<number | null> {
  const emirRevizyonu = await sayimRevizyonu(db, g.malzemeNo, g.uretimEmriId);
  const belge = await sayimDurumu(db, g.malzemeNo, emirRevizyonu);
  if (belge === null) return null;
  const kimlik = adimKimligi(g.malzemeNo, g.opNo);
  const turetilen = statuleriTuret(belge);
  if (!turetilen.some((x) => x.kaynakAdim === kimlik)) return null;
  const revizyon = emirRevizyonu ?? await yururluktekiRevizyonId(db, g.malzemeNo);
  const id = await sorgular.statuKimligi(db, kimlik, revizyon);
  if (id !== null) return id;
  await sorgular.statuEsitle(db, turetilen.filter((x) => urunu(x) === g.malzemeNo).map((x) => ({ ...x, rotaRevizyonuId: revizyon })));
  return sorgular.statuKimligi(db, kimlik, revizyon);
}

// Patlamış rota önizlemesinde ara adımların çıktısı (2610 a): adımStatusu ve adimCiktisi ile aynı belge ve kural, ama yazmaz (GET okur; statü
// satırı yoksa açılmaz, statu null). Çıktı kartlı adımda stok kartın statüsüz stoğudur (kullanılabilir plana sayılandır); statülü adımda
// taşınan malzemenin o statüdeki stoğu. Statünün taşınanı belgede stok koduyla durur; kart kimliği sayımın okuduğu kartlardan bulunur.
export async function adimAraHalleri(
  db: Db, g: { malzemeNo: number; revizyonId: number; opNolari: readonly number[] },
): Promise<Map<number, AraHalCozumu>> {
  const sonuc = new Map<number, AraHalCozumu>();
  const belge = await sayimDurumu(db, g.malzemeNo, g.revizyonId);
  if (belge === null) return sonuc;
  const turetilen = statuleriTuret(belge);
  const kodlar = new Map([...(await malzemeOzetleri(db, sayimKartKimlikleri(belge, g.malzemeNo))).values()].map((o) => [malzemeCevir(o, undefined).code, o.id]));
  const satirlar: { opNo: number; kartId: number | null; statu: { id: number; ad: string } | null; ciktiKarti: boolean }[] = [];
  for (const opNo of g.opNolari) {
    const cikti = adimCiktisiBul(belge, g.malzemeNo, opNo);
    if (cikti !== null) { satirlar.push({ opNo, kartId: cikti, statu: null, ciktiKarti: true }); continue; }
    const kimlik = adimKimligi(g.malzemeNo, opNo);
    const t = turetilen.find((x) => x.kaynakAdim === kimlik);
    if (t === undefined) continue;
    const id = await sorgular.statuKimligi(db, kimlik, g.revizyonId);
    satirlar.push({ opNo, kartId: kodlar.get(t.malzemeNo) ?? null, statu: id === null ? null : { id, ad: t.ad }, ciktiKarti: false });
  }
  const statuStogu = new Map((await statuStoklari(db, satirlar.flatMap((x) => (x.kartId === null || x.statu === null ? [] : [{ malzemeId: x.kartId, statuId: x.statu.id }]))))
    .map((r) => [`${String(r.malzemeId)}:${String(r.statuId)}`, { toplam: r.toplam, planaSayilan: r.planaSayilan }]));
  const kartStogu = await stokMiktarlari(db, satirlar.flatMap((x) => (x.ciktiKarti && x.kartId !== null ? [x.kartId] : [])));
  for (const x of satirlar) {
    const k = x.kartId === null ? undefined : x.ciktiKarti ? kartStogu.get(x.kartId) : undefined;
    const stok = x.kartId === null ? null
      : x.ciktiKarti ? (k === undefined ? null : { toplam: k.toplam, planaSayilan: k.kullanilabilir })
      : x.statu === null ? null : statuStogu.get(`${String(x.kartId)}:${String(x.statu.id)}`) ?? null;
    sonuc.set(x.opNo, { statu: x.statu, kartId: x.kartId, stok });
  }
  return sonuc;
}

// Üretim sayımında adımın çıktı kartı (kart #1289): rotada ara adımın "çıkan" kalemi; yoksa null. Statüyle aynı revizyondan okunur
// (kart #1214): emir verilirse emrin açıldığı revizyonun bağı (alt düğümde patlatmadaki), verilmezse (ya da emir rotasızsa) yürürlükteki;
// ikisi ayrı revizyondan okunursa revizyon sonrası açık emirde çıktı yeni, statü eski rotadan gelir.
export async function adimCiktisi(db: Db, g: { malzemeNo: number; opNo: number; uretimEmriId?: number | null | undefined }): Promise<number | null> {
  const belge = await sayimDurumu(db, g.malzemeNo, await sayimRevizyonu(db, g.malzemeNo, g.uretimEmriId));
  return belge === null ? null : adimCiktisiBul(belge, g.malzemeNo, g.opNo);
}
