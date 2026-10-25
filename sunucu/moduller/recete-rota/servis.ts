import type { Db } from '#cekirdek/db.ts';
import type { Gunluk } from '#cekirdek/gunluk.ts';
import { bulunamadi, cakisma, cokBuyuk, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ROTA_ISLEMLERI } from '#paylasilan/islemler/rota.ts';
import { STOK_ISLEMLERI } from '#paylasilan/islemler/stok.ts';
import type {
  BenCevabi, DurumCevabi, FasonTahminCevabi, KapasiteCevabi, KayitlarCevabi, PlanlamaCalismasiCevabi, SilCevabi, Statu, StatulerCevabi, StatuTanimiCevabi, StatuTanimiKaydetGovdesi,
  YazCevabi, YazGovdesi,
} from '#paylasilan/sozlesme/recete-rota.ts';
import { KAPASITE_GUNU } from '#paylasilan/sozlesme/recete-rota.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { ADIMLI_OKUMA_ISLEMLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { emirDilimi, planlanacakIsEmirleri, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import {
  aktifMakineler, istasyonKisileri, istasyonYetkinlikleri, istasyonlar, isMerkezleri, makineDurumlari, operasyonTipleri, planAyarlari,
} from '../istasyonlar/disari.ts';
import { birimMaliyetleri } from '../finans/disari.ts';
import { kisiGorevi, kisiSecenekleri } from '../kisiler/disari.ts';
import { firmaAra } from '../musteri-tedarikci/disari.ts';
import { fasonSuresiTahminleri, malzemeGelisTarihleri, tedarikTerminleri } from '../satin-alma/disari.ts';
import { durumRevizyonlari, revizyonKunyeleri, yururluktekiRevizyonId, yururluktekiRevizyonIdleri } from '../rota/disari.ts';
import { malzemeAra, malzemeOzetleri, olcuBirimleri } from '../malzemeler/disari.ts';
import { calisanAdimlar, canliOzeti, planAyariOku } from '../plan/disari.ts';
import { malzemeStokDurumlari, sonHareketler } from '../stok/disari.ts';
import { calismaTakvimleri, isMerkeziKisiPaylari, kisiVardiyalari, takvimGunleri, vardiyaMatrisi, vardiyaTanimlari } from '../vardiya/disari.ts';
import {
  acikSiparisSatirlari, type AcikSiparisGelisi, adimCiktisiBul, adimKimligi, ayarCevir, bitisAkisiEkle, bagFarklari, bagiDegisenUrunler, jsondanSatirlar, degerBicimeUyarMi, emirleriCevir, adimAdetleriCevir, calisanAdimlariCevir, hareketleriCevir, isMerkeziCevir, maliyetCevir, istasyonCevir, kisiCevir, makineCevir, malzemeCevir, degerCokBuyukMu, nulKarakteriVarMi, operasyonCevir, statuleriTuret, sunucuRevizyonlariyla, planAlanlariniKoru, bagliDilimleriAyikla,
  planAni, planGunu, planSaati, rotaDilimiCevir, sayimBelgesiTablodan, sayimKartKimlikleri, sunucuKaynaklariyla, surumUyarMi, tatilTarihleri, vardiyaCevir,
} from './kurallar.ts';
import { DURUM_ANAHTARI, PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';
import { planGirdisi, type KaynakOkumasi } from './plan-girdisi.ts';
import { satinAlmaCalismasi } from './satin-alma-gorunumu.ts';
import { teklifDenemesi, type DenemeSonucu, type TeklifTaslagi } from './teklif-denemesi.ts';

// Akış: yetkiyi uç verir; burada biçim ve sürüm denetimi uygulanır.

const ISLEM_YAZ = 'recete-rota.yaz';
const CAKISMA_ILETISI = 'Reçete ve rota kayıtları siz açtıktan sonra başka bir kişi tarafından değiştirildi; sayfayı yenileyin.';
const BUYUK_ILETISI = 'Reçete ve rota kaydı 1 MB sınırını aşıyor ve kaydedilmedi; eski kayıtları silip yeniden deneyin.';
const PLANLAMA_YETKI_ILETISI = 'Planlama çalışmasını değiştirme yetkiniz yok.';

// Planlama çalışması (tercih, ağırlık, karar, sayfa içi kilit) yalnız planı yazabilene açıktır (287 a): yazma ve silme ucu recete-rota.yaz
// ister, bu anahtar ayrıca plan.yaz ister. Planlama sayfasını okuyup plan.yaz taşımayan rol çalışmayı değiştiremez.
export function planlamaYazmaDenetimi(kullanici: Kullanici, anahtar: string): void {
  if (anahtar === PLANLAMA_ANAHTARI && !islemVarMi(kullanici, 'plan.yaz')) throw yetkiYok(PLANLAMA_YETKI_ILETISI);
}

export function ben(kullanici: Kullanici): BenCevabi {
  return { kisi: { id: kullanici.id, ad: kullanici.ad }, yazabilir: kullanici.islemler.includes(ISLEM_YAZ) };
}

export async function kayitlar(db: Db): Promise<KayitlarCevabi> {
  return { kayitlar: await sorgular.kayitlar(db) };
}

export async function yaz(db: Db, kullanici: Kullanici, g: YazGovdesi, gunluk?: Gunluk): Promise<YazCevabi> {
  planlamaYazmaDenetimi(kullanici, g.anahtar);
  if (!degerBicimeUyarMi(g.bicim, g.deger)) throw dogrulama('Metin biçimli değer dize olmalıdır.', 'deger');
  if (nulKarakteriVarMi(g.deger)) throw dogrulama('Değer boş karakter (U+0000) içeremez.', 'deger');
  if (degerCokBuyukMu(g.deger)) throw cokBuyuk(BUYUK_ILETISI);
  const mevcut = await sorgular.surumKilitle(db, g.anahtar);
  if (!surumUyarMi(mevcut, g.beklenenSurum)) throw cakisma(CAKISMA_ILETISI);
  const anaKayit = g.anahtar === DURUM_ANAHTARI && g.bicim === 'json';
  const eskiDeger = anaKayit && mevcut !== null ? (await sorgular.kayitGetir(db, g.anahtar))?.deger : undefined;
  // Planlama çalışmasında bitiş tarihi akışını sunucu yazar (455/2 a); eklenen satırlarla değer yeniden boyut denetiminden geçer.
  const planlama = g.anahtar === PLANLAMA_ANAHTARI && g.bicim === 'json';
  const deger = anaKayit
    ? bagliDilimleriAyikla(planAlanlariniKoru(g.deger, mevcut === null ? null : eskiDeger))
    : planlama ? bitisAkisiEkle(g.deger, mevcut === null ? null : (await sorgular.kayitGetir(db, g.anahtar))?.deger, kullanici.ad, Date.now()) : g.deger;
  if (planlama && deger !== g.deger && degerCokBuyukMu(deger)) throw cokBuyuk(BUYUK_ILETISI);
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
// Açık satın alma siparişinin gelişi (525 1 a): satın almayı okuyan ya da depoda mal kabul eden görür (stoktaki açık sipariş satırlarıyla aynı kapsam).
const ACIK_SIPARIS_OKUMA: readonly Islem[] = ['satin-alma.oku', 'satin-alma.yaz', 'stok.giris'];
// Rota modülünün fason seçicisiyle aynı sınır (rota/servis.ts); süzgeç aramada uygulanır, yalnız aktif fason firmalar gelir.
const FASON_ARAMA_SINIRI = 200;
const yetkiliMi = (k: Kullanici, islemler: readonly Islem[]): boolean => islemler.some((i) => islemVarMi(k, i));

export async function durum(
  db: Db, kullanici: Kullanici, sinir: MalzemeSiniri = { sayfaBoyu: MALZEME_SAYFA_BOYU, azamiSayfa: MALZEME_AZAMI_SAYFA },
): Promise<DurumCevabi> {
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
  const maliyet = maliyetOkur
    ? maliyetCevir(
      await birimMaliyetleri(db, 'malzeme'), await birimMaliyetleri(db, 'istasyon'), await birimMaliyetleri(db, 'kisi'),
      yetkiliMi(kullanici, MALIYET_YAZMA))
    : null;
  const vardiyalar = await vardiyaTanimlari(db);
  const gunler = await takvimGunleri(db);
  const ayar = await planAyariOku(db);
  const hareketler = stokOkur ? await sonHareketler(db, HAREKET_SAYISI) : null;
  const statuAnahtari = hareketler === null ? new Map<number, string>() : new Map((await sorgular.statuler(db)).map((x) => [x.id, `step:${x.kaynakAdim}`]));
  const rotaRevizyonlari = rotaOkur ? await durumRevizyonlari(db) : [];
  const fasonFirmalari = rotaOkur ? await firmaAra(db, { metin: '', sinir: FASON_ARAMA_SINIRI, fason: true }) : null;
  const emirDilimleri = emirOkur ? await emirDilimi(db) : null;
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

  return {
    items: malzemeOkur ? kartlar.map((k) => malzemeCevir(k, stoklar.get(k.id))) : null,
    units: birimler,
    opdefs: istasyonOkur ? tipler.map(operasyonCevir) : null,
    wcs: istasyonOkur ? merkezler.map(isMerkeziCevir) : null,
    stations: istasyonOkur ? istasyonListesi.map((i) => istasyonCevir(i, ayarHaritasi.get(i.id), makineSayilari.get(i.id) ?? 0)) : null,
    machines: istasyonOkur ? makineler.map((m) => makineCevir(m, makineDurumu.get(m.id))) : null,
    people: kisiOkur ? kisiler.map((k) => kisiCevir(k, kisiIstasyonu.get(k.id), istasyonMerkezi, kisiYetkinlikleri.get(k.id) ?? [])) : null,
    routes: rotaOkur ? rota.routes : null,
    routeRevs: rotaOkur ? rota.routeRevs : null,
    fasonFirms: fasonFirmalari === null ? null : fasonFirmalari.map((f) => ({ id: String(f.id), code: f.kod, name: f.ad })),
    cal: { shifts: vardiyalar.filter((v) => v.aktif).map(vardiyaCevir), holidays: tatilTarihleri(gunler) },
    emirler: emirDilimleri === null ? null : emirleriCevir(emirDilimleri),
    calisanAdimlar: emirDilimleri === null ? null : calisanAdimlariCevir(await calisanAdimlar(db), emirDilimleri, adimAdetleri ?? {}),
    adimAdetleri,
    maliyet,
    settings: ayarCevir(ayar),
    planCanli: await canliOzeti(db),
    statuses: await sorgular.statuTanimlari(db),
    moves: hareketler === null ? null : hareketleriCevir(hareketler, statuAnahtari),
    malzemeKesildi: kesildi,
  };
}

// Plan kapasitesi (kart #1324): Vardiya'nın iş merkezi, istasyon ve kişi takvimlerinden prototipin kendi vardiya hesabına eklediği farklar
// tek okumada. Kişi ve payı Vardiya'nın tek tanımıdır (`isMerkeziKisiPaylari`, Plan da bunu okur: aktif kişi; istasyon, makine ve ekip
// ataması); takvimi okunamayan (iş merkezine bağlanamayan) kaynak gelmez. W8: işten ayrıldığı günler (VR-29) izinli gibi 0 gider.
export async function kapasite(db: Db, kullanici: Kullanici, simdi = Date.now()): Promise<KapasiteCevabi> {
  const istasyonOkur = yetkiliMi(kullanici, ISTASYON_OKUMA);
  const kisiOkur = yetkiliMi(kullanici, KISI_OKUMA) && istasyonOkur;
  const baslangic = tesisGunu(simdi);
  const bitis = new Date(Date.parse(`${baslangic}T00:00:00Z`) + (KAPASITE_GUNU - 1) * 86_400_000).toISOString().slice(0, 10);
  const merkezler = istasyonOkur ? await isMerkezleri(db, { pasiflerDahil: false }) : [];
  const istasyonListesi = istasyonOkur ? await istasyonlar(db, { pasiflerDahil: false }) : [];
  const paylar = new Map<number, Map<number, number>>();
  for (const [m, kisiler] of kisiOkur ? await isMerkeziKisiPaylari(db) : []) {
    for (const [kisiId, sent] of kisiler) {
      const l = paylar.get(kisiId) ?? new Map<number, number>();
      l.set(m, sent);
      paylar.set(kisiId, l);
    }
  }
  const takvimler = await calismaTakvimleri(db, [
    ...merkezler.map((m) => ({ tur: 'is-merkezi' as const, id: m.id })),
    ...istasyonListesi.map((i) => ({ tur: 'istasyon' as const, id: i.id })),
    ...[...paylar.keys()].map((id) => ({ tur: 'kisi' as const, id })),
  ], { baslangic, bitis });
  const fazlaMesai = (anahtar: string) =>
    (takvimler.get(anahtar)?.gunler ?? []).flatMap((g) => ((g.fazlaMesaiDakika ?? 0) > 0 ? [{ tarih: g.tarih, dakika: g.fazlaMesaiDakika! }] : []));
  const ayni = (a: { tarih: string; dakika: number }[], b: { tarih: string; dakika: number }[]) =>
    a.length === b.length && a.every((x, i) => x.tarih === b[i]!.tarih && x.dakika === b[i]!.dakika);
  return {
    baslangic,
    isMerkezleri: istasyonOkur ? merkezler.map((m) => ({ id: String(m.id), fazlaMesai: fazlaMesai(`is-merkezi:${m.id}`) })) : null,
    istasyonlar: istasyonOkur
      ? istasyonListesi.flatMap((i) => {
        const kendi = fazlaMesai(`istasyon:${i.id}`);
        return i.isMerkeziId === null || ayni(kendi, fazlaMesai(`is-merkezi:${i.isMerkeziId}`)) ? [] : [{ id: String(i.id), fazlaMesai: kendi }];
      })
      : null,
    kisiler: kisiOkur
      ? [...paylar].flatMap(([kisiId, l]) => {
        const t = takvimler.get(`kisi:${kisiId}`) ?? null;
        if (t === null) return [];
        return [{
          id: String(kisiId),
          izinli: t.gunler.filter((g) => g.izinli === true || g.ayrildi === true).map((g) => g.tarih),
          fazlaMesai: fazlaMesai(`kisi:${kisiId}`),
          paylar: [...l].filter(([, sent]) => sent > 0).map(([m, sent]) => ({ wcId: String(m), pay: sent / 10000 })),
        }];
      })
      : null,
  };
}

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

// Üretim sayımında stok girişinin statüsü (kart #1289): adımın statüsü, rotanın şimdiki hâlinde statü açıyorsa (son adım değilse, başka
// karta ya da tanımlı statüye bağlı değilse) kimliği döner; yoksa null. Rotadan kalkmış adımın eski statü satırı kullanılmaz. Statü rota
// revizyonuna aittir: emir verilirse adım ve statü emrin açıldığı revizyondandır, verilmezse (ya da emir rotasızsa) yürürlükteki revizyondan.
// Satır henüz yoksa burada açılır (çerçevenin yazımındaki eşitlemeyle aynı).
export async function adimStatusu(db: Db, g: { malzemeNo: number; opNo: number; uretimEmriId?: number | null | undefined }): Promise<number | null> {
  const emir = g.uretimEmriId === undefined || g.uretimEmriId === null ? null : await uretimEmriOzeti(db, g.uretimEmriId);
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

// Üretim sayımında adımın çıktı kartı (kart #1289): rotada ara adımın "çıkan" kalemi; yoksa null.
export async function adimCiktisi(db: Db, g: { malzemeNo: number; opNo: number }): Promise<number | null> {
  const belge = await sayimDurumu(db, g.malzemeNo);
  return belge === null ? null : adimCiktisiBul(belge, g.malzemeNo, g.opNo);
}

// Satış teklifi denemesi (Y4). Planın girdisi çerçevenin açılışındaki gibi kurulur: ortak çalışma kaydı, Reçete ve Rota kaydı ve çağıranın
// yetkisiyle kaynak okuması. Takvim eki (iş merkezi haftası, kişi vardiyası) sunucuda henüz okunamaz (vardiya modülü kişi vardiyalarını dışarı
// vermiyor; BASKA-MODUL-ISTEKLERI.md): çerçevenin okuyamadığı durumdaki gibi null'dır, çalışmanın kayıtlı takvimi kullanılır.
const PLANLAMA_SURUMU = 2;

export async function kaynakOku(db: Db, kullanici: Kullanici): Promise<KaynakOkumasi> {
  const d = await durum(db, kullanici);
  const makineNotu = yetkiliMi(kullanici, ISTASYON_OKUMA)
    ? Object.fromEntries((await makineDurumlari(db)).map((x) => [String(x.makineId), x.aciklama ?? null])) : null;
  let gorev: Record<string, string | null> | null = null;
  if (yetkiliMi(kullanici, KISI_OKUMA) && d.people !== null) {
    gorev = {};
    for (const k of d.people) gorev[k.id] = await kisiGorevi(db, Number(k.id));
  }
  // 13.4: onaylı izin ve atama payı çerçevedeki gibi kapasite okumasından; motor izinli günü devamsızlık sayar
  const acikSiparisler = d.items !== null && yetkiliMi(kullanici, ACIK_SIPARIS_OKUMA) ? await acikSiparisGelisleri(db, d.items) : null;
  // 533 a: malzemenin tedarik termini Satın Alma'dandır; planlamada her malzeme satırında görünür (yazma ucu satın almanın).
  const terminler = d.items === null ? null : await malzemeTerminleri(db, d.items);
  return { durum: d, ek: { takvim: null, makineNotu, kisiGorevi: gorev, kapasite: await kapasite(db, kullanici), acikSiparisler, tedarikTerminleri: terminler } };
}

// 533 a: ham malzemenin tedarik termini ve sürümü (girdi.betik plandaki malzemeye yazar). Satırı olmayan malzeme listede yoktur.
async function malzemeTerminleri(db: Db, malzemeler: NonNullable<DurumCevabi['items']>): Promise<{ kod: string; termin: string | null; surum: number; aciklama: string }[]> {
  const ham = malzemeler.filter((m) => m.type === 'ham');
  const t = await tedarikTerminleri(db, ham.map((m) => m.kayitNo));
  return ham.flatMap((m) => { const x = t.get(m.kayitNo); return x ? [{ kod: m.id, termin: x.termin, surum: x.surum, aciklama: x.aciklama }] : []; });
}

// 525 1 a: ham malzemenin açık satın alma siparişleri (girdi.betik bunları plana satın alma satırı olarak yazar).
async function acikSiparisGelisleri(db: Db, malzemeler: NonNullable<DurumCevabi['items']>): Promise<AcikSiparisGelisi[]> {
  const ham = malzemeler.filter((m) => m.type === 'ham');
  return acikSiparisSatirlari(ham, await malzemeGelisTarihleri(db, ham.map((m) => m.kayitNo)));
}

// Çerçeve kaydı metin olarak da yazabilir (yerel depo değeri); metin biçimli değer JSON olarak okunur.
const kayitDegeri = (k: { bicim: string; deger?: unknown } | null): unknown => {
  if (k === null || k.deger === undefined) return null;
  if (k.bicim !== 'metin' || typeof k.deger !== 'string') return k.deger;
  try { return JSON.parse(k.deger) as unknown; } catch { return null; }
};

// ADR 0018: sunucu plan motoru bir kullanıcı adına değil sunucunun içinde okur (Soru 150 a): aynı girdi her kullanıcıda aynı planı verir.
// Okunan veri kimseye dönmez; çözücü yalnız saat verir. Yazma işlemi taşımaz.
const PLAN_MOTORU_OKUYUCUSU: Kullanici = {
  id: 0, ad: 'plan motoru',
  islemler: [...new Set([...MALZEME_OKUMA, ...ISTASYON_OKUMA, ...KISI_OKUMA, ...STOK_OKUMA, ...ROTA_OKUMA, ...EMIR_OKUMA, ...MALIYET_OKUMA, ...ACIK_SIPARIS_OKUMA])],
};
export interface PlanCozumKaynagi { calisma: unknown; kayit: unknown; kaynak: KaynakOkumasi }
// Planlama sayfası hiç kaydetmemişse (ya da kaydın sürümü eskiyse) çalışma yoktur: null.
export async function planCozumKaynagi(db: Db): Promise<PlanCozumKaynagi | null> {
  const calisma = kayitDegeri(await sorgular.kayitGetir(db, PLANLAMA_ANAHTARI)) as { surum?: unknown; D?: unknown } | null;
  if (calisma === null || calisma.surum !== PLANLAMA_SURUMU || !calisma.D) return null;
  const kayit = kayitDegeri(await sorgular.kayitGetir(db, DURUM_ANAHTARI));
  return { calisma, kayit, kaynak: await kaynakOku(db, PLAN_MOTORU_OKUYUCUSU) };
}

// Planlama sayfasının açılışı (288 a). Eski çerçeve çalışmayı, Reçete ve Rota kaydını ve kaynak okumasını tarayıcıda girdi.betik ile
// birleştirirdi; aynı betik burada aynı girdiyle koşar, sayfa birleşmiş çalışmayı okur. Kaynak okuması çağıranın yetkisiyledir (çerçevedeki
// gibi: okuyamadığı dilim kayıttaki gibi kalır). Takvim eki çerçevenin okuduğu vardiya takviminden kurulur (o uç yalnız oturum ister).
export async function planlamaCalismasi(db: Db, kullanici: Kullanici, simdi: number = Date.now()): Promise<PlanlamaCalismasiCevabi> {
  const k = await planlamaGirdisi(db, kullanici);
  if (k.girdi === null) return { calisma: null, surum: k.surum };
  const g = planGirdisi({ ...k.girdi, bugun: tesisGunu(simdi) }, simdi);
  return { calisma: g === null ? null : g.S, surum: k.surum };
}

// 542 a, 546 a, 549 a: Satın Alma'nın malzeme ve fason planı sayfaları. Çalışma planlama sayfasıyla aynı girdiyle birleşir; kaynak sunucunun
// iç okuyucusuyla okunur (çağıranın yetkisiyle okunsa satın almanın göremediği dilim düşer, hesap planlamadan ayrılırdı) ve giden çalışma
// beyaz listeyle daraltılır (satin-alma-gorunumu.ts). Biten iş canlı emir durumundandır, okunamazsa Reçete ve Rota kaydındaki kopyası.
export async function satinAlmaPlanCalismasi(db: Db, simdi: number = Date.now()): Promise<PlanlamaCalismasiCevabi> {
  const k = await planlamaGirdisi(db, PLAN_MOTORU_OKUYUCUSU);
  if (k.girdi === null) return { calisma: null, surum: k.surum };
  const g = planGirdisi({ ...k.girdi, bugun: tesisGunu(simdi) }, simdi);
  if (g === null) return { calisma: null, surum: k.surum };
  const emirler = (k.girdi.kaynak.durum as { emirler?: unknown } | null)?.emirler ?? k.girdi.kayit;
  return { calisma: satinAlmaCalismasi(g.S, emirler), surum: k.surum };
}

// Planlama sayfasının birleştirilecek girdisi: çalışma kaydı, Reçete ve Rota kaydı ve çağıranın yetkisiyle kaynak okuması (takvim eki
// dahil). Değerlendirme ucu (Soru 357 a) aynı girdiyle hesaplar. Çalışma yoksa (ya da kaydın biçimi eskiyse) girdi null; sürüm kaydınındır.
export async function planlamaGirdisi(db: Db, kullanici: Kullanici): Promise<{ surum: number | null; girdi: PlanCozumKaynagi | null }> {
  const satir = await sorgular.kayitGetir(db, PLANLAMA_ANAHTARI);
  const calisma = kayitDegeri(satir) as { surum?: unknown; D?: unknown } | null;
  const surum = satir?.surum ?? null;
  if (calisma === null || calisma.surum !== PLANLAMA_SURUMU || !calisma.D) return { surum, girdi: null };
  const kayit = kayitDegeri(await sorgular.kayitGetir(db, DURUM_ANAHTARI));
  const kaynak = await kaynakOku(db, kullanici);
  const ek = { ...(kaynak.ek as Record<string, unknown>), takvim: await takvimEki(db) };
  return { surum, girdi: { calisma, kayit, kaynak: { durum: kaynak.durum, ek } } };
}

// Çerçevenin biçimi (kaynak-komutlari.ts takvimEki): iş merkezi -> haftanın günü (0 pazar ... 6 cumartesi) -> vardiyalar; kişi -> vardiya.
async function takvimEki(db: Db): Promise<{ hafta: Record<string, Record<number, string[]>>; kisiVardiyasi: Record<string, string> }> {
  const hafta: Record<string, Record<number, string[]>> = {};
  for (const m of await vardiyaMatrisi(db)) {
    const merkez = (hafta[String(m.isMerkeziId)] ??= {});
    (merkez[m.gun === 7 ? 0 : m.gun] ??= []).push(String(m.vardiyaId));
  }
  const kisiVardiyasi: Record<string, string> = {};
  for (const k of await kisiVardiyalari(db)) kisiVardiyasi[String(k.kisiId)] = String(k.vardiyaId);
  return { hafta, kisiVardiyasi };
}

export interface TeklifKalemiGirdisi { malzemeNo: number; adet: number }
// Satış taslağı siparişlerin kaydıdır; kilitli yeri adım başına makine ve başlangıç anı. Süresi dolan taslak verilmez ya da süzülür.
export interface SatisTaslagiGirdisi {
  id: string;
  gecerlilik: string;
  kalemler: Array<TeklifKalemiGirdisi & { termin: string; yerlesim: Record<string, { makineId: string; baslangic: string }> }>;
}
export interface TeklifDenemeGirdisi {
  kalemler: TeklifKalemiGirdisi[];
  gecerlilik: string;
  istenenTermin: string | null;
  taslakId: string | null;
  taslaklar: SatisTaslagiGirdisi[];
  // Plan termini için bitişe eklenen gün; verilmezse canlı plan ayarının tamponu (plan modülü).
  tamponGun?: number;
}
export interface TeklifIslemi { adim: string; makineId: string; fason: boolean; baslangic: string; bitis: string; ayarSaat: number; islemeSaat: number; tl: number | null }
export interface TeklifKalemiSonucu {
  malzemeNo: number;
  adet: number;
  tamam: boolean;
  bitis: string | null;
  planTermini: string | null;
  ulasir: boolean | null;
  malzeme: Array<{ kod: string; birim: string; miktar: number; kaynak: string; gelis: string | null }>;
  satinalma: Array<{ kod: string; birim: string; miktar: number; gelis: string; tedarikGun: number | null }>;
  islemler: TeklifIslemi[];
  malzemeTl: number | null;
  eksik: string[];
  // satış taslağı olarak kaydedilirse kilitlenecek yer: adım -> makine ve başlangıç
  yerlesim: Record<string, { makineId: string; baslangic: string }>;
}
export interface TeklifDenemeSonucu {
  kalemler: TeklifKalemiSonucu[];
  kayan: Array<{ siparis: string; emirNo: string | null; once: string; sonra: string; termin: string | null }>;
  taslakYerlesimi: Array<{ taslakId: string; kalem: number; adim: string; makineId: string; baslangic: string }>;
  // Plan şeridi: pencere planın şimdisinden max(termin, geçerlilik) + 2 günün sonuna; termin istenen termin, yoksa kalemlerin en geç plan
  // termini. Pencere kurulamazsa null.
  plan: TeklifPlani | null;
}
export interface TeklifPlani {
  baslangic: string;
  bitis: string;
  kapaliGunler: string[];
  hatlar: Array<{ makineId: string; ad: string; fason: boolean }>;
  bloklar: Array<{
    makineId: string;
    tur: 'siparis' | 'satis-taslagi' | 'teklif';
    is: string;
    emirNo: string | null;
    kalem: number | null;
    adim: string;
    baslangic: string;
    bitis: string;
    gecikir: boolean;
  }>;
}

const fasonMu = (m: string): boolean => m.startsWith('@');

// Çalışma yoksa null (planlama sayfası hiç açılıp kaydedilmemiş). Süre sınırı aşılırsa hata.
export async function teklifDene(db: Db, kullanici: Kullanici, g: TeklifDenemeGirdisi, simdi: number = Date.now()): Promise<TeklifDenemeSonucu | null> {
  const calisma = kayitDegeri(await sorgular.kayitGetir(db, PLANLAMA_ANAHTARI)) as { surum?: unknown; D?: { meta?: { baslangic?: unknown } } } | null;
  if (calisma === null || calisma.surum !== PLANLAMA_SURUMU || !calisma.D) return null;
  const kayit = kayitDegeri(await sorgular.kayitGetir(db, DURUM_ANAHTARI)) as { orders?: Array<{ id: string; no?: string }> } | null;
  const kaynak = await kaynakOku(db, kullanici);
  const bugun = tesisGunu(simdi);
  const baslangic = typeof calisma.D.meta?.baslangic === 'string' ? calisma.D.meta.baslangic : bugun;
  const saat = (an: string): number => planSaati(baslangic, an);
  const taslaklar: TeklifTaslagi[] = g.taslaklar.filter((t) => t.gecerlilik >= bugun).map((t) => ({
    id: t.id,
    kalemler: t.kalemler.map((k, i) => ({ id: `${t.id}-${String(i + 1)}`, urun: String(k.malzemeNo), adet: k.adet, termin: `${k.termin} 23:00` })),
    yerlesim: Object.fromEntries(t.kalemler.flatMap((k, i) => Object.entries(k.yerlesim).map(([adim, y]) => [`${t.id}-${String(i + 1)}.${adim}`, { m: y.makineId, S: saat(y.baslangic) }]))),
  }));
  const r: DenemeSonucu | null = await teklifDenemesi({
    calisma, kayit, kaynak, bugun,
    kalemler: g.kalemler.map((k, i) => ({ id: `TK-${String(i + 1)}`, urun: String(k.malzemeNo), adet: k.adet })),
    termin: g.istenenTermin === null ? null : `${g.istenenTermin} 23:00`,
    taslaklar, haric: g.taslakId, tamponGun: g.tamponGun ?? (await planAyariOku(db)).tamponGun, gecerlilik: g.gecerlilik,
  });
  if (r === null) return null;
  const an = (h: number): string => planAni(r.baslangic, h);
  const makine = (m: string): string => (fasonMu(m) ? m.slice(1) : m);
  const emirNo = new Map((kayit?.orders ?? []).map((o) => [o.id, o.no ?? null]));
  return {
    kalemler: r.kalemler.map((k, i) => ({
      malzemeNo: g.kalemler[i]!.malzemeNo,
      adet: g.kalemler[i]!.adet,
      tamam: k.tamam,
      bitis: k.bitis === null ? null : an(k.bitis),
      planTermini: k.planTerminGun === null ? null : planGunu(r.baslangic, k.planTerminGun),
      ulasir: k.ulasir,
      malzeme: k.malzeme.map((m) => ({ ...m, gelis: m.gelis === null || !Number.isFinite(m.gelis) ? null : an(m.gelis) })),
      satinalma: k.satinalma.map((s) => ({ kod: s.kod, birim: s.birim, miktar: s.miktar, gelis: an(s.gelis), tedarikGun: s.gun })),
      islemler: k.islemler.map((o) => ({ adim: o.adim, makineId: makine(o.m), fason: o.fason, baslangic: an(o.S), bitis: an(o.C), ayarSaat: o.ayarSaat, islemeSaat: o.islemeSaat, tl: o.tl })),
      malzemeTl: k.malzemeTl,
      eksik: k.eksik,
      yerlesim: Object.fromEntries(Object.entries(k.kilit).map(([id, y]) => [id.slice(id.lastIndexOf('.') + 1), { makineId: makine(y.m), baslangic: an(y.S) }])),
    })),
    kayan: r.kayan.map((x) => ({ siparis: x.siparis, emirNo: emirNo.get(x.siparis) ?? null, once: an(x.once), sonra: an(x.sonra), termin: x.termin === null ? null : an(x.termin) })),
    taslakYerlesimi: Object.entries(r.taslakYeri).map(([id, y]) => {
      const nokta = id.lastIndexOf('.'); const kalemId = id.slice(0, nokta); const tire = kalemId.lastIndexOf('-');
      return { taslakId: kalemId.slice(0, tire), kalem: Number(kalemId.slice(tire + 1)), adim: id.slice(nokta + 1), makineId: makine(y.m), baslangic: an(y.S) };
    }),
    plan: r.plan === null ? null : {
      baslangic: an(r.plan.bas),
      bitis: an(r.plan.bit),
      kapaliGunler: r.plan.kapaliGunler,
      hatlar: r.plan.hatlar.map((h) => ({ makineId: makine(h.m), ad: h.ad, fason: h.fason })),
      bloklar: r.plan.bloklar.map((b) => ({
        makineId: makine(b.m), tur: b.tur, is: b.is, emirNo: b.tur === 'siparis' ? emirNo.get(b.is) ?? null : null, kalem: b.kalem,
        adim: b.adim, baslangic: an(b.S), bitis: an(b.C), gecikir: b.gecikir,
      })),
    },
  };
}
