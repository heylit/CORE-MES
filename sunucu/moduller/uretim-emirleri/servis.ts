import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tesisSaati } from '#paylasilan/zaman.ts';
import type {
  AcikAdim, AdimCevabi, AsimlarCevabi, Canli, KatilimCevabi, MakineDoluAyrintisi, DurusDagilimiCevabi, Emir, EmirAdimi, EmirAyrintiCevabi, EmirDurumu, EmirKaydi, GunlukUretimCevabi, IzlemeEmri, KaliteKarari, OzetCevabi, SayimKaydi, SonOlaylarCevabi, SureOzetiCevabi, UretimKaydi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { durusNedeniGetir, durusNedenleriniListele, hurdaNedeniGetir, hurdaNedenleriniListele } from '../durus-nedenleri/disari.ts';
import {
  aktifIstasyonlar, calisirMakineler, ekipler, ekipUyeleri, isMerkeziIzinliMi, istasyonGetir, istasyonlar, kisininIzinliIsMerkezleri, makineGetir, yetkinMi,
} from '../istasyonlar/disari.ts';
import { kisiBayrakliMi, kisileriListele } from '../kisiler/disari.ts';
import {
  ADIM_YOK, DEVRAL_DEGISTI, DEVRAL_DURUMU, EKIP_DISI, EMIR_YOK, IS_EMRI_YOK, ISTASYONDA_TEK, ISTASYONSUZ_ADIM, ISTASYON_DOLU, KAPSAM_DISI, KATILIM_ACIK, KATILIM_TEK_ACIK, KATILIM_YOK, MAKINEDE_AYNI_IS, MAKINEDE_TEK, MAKINE_DOLU, MAKINE_SECILEMEZ, TERMINAL_FASON, acmaIstasyonIhlali,
  adimDegisiyorMu, adimIhlali, ayarIhlali, baslatmaIhlali, baslatmaIstasyonIhlali, baslatmaYetkinlikIhlali, bitirmeIhlali, calisilacakMakineler, calismaDurumu, devamIhlali,
  duraklatmaIhlali, durdurmaIhlali, durusNedeniIhlali, hurdaNedeniIhlali, hurdaToplamIhlali, HURDA_NEDENI_YOK, katilimUyarisi, katilmaIhlali, makineDoluIhlali, saglamToplamIhlali,
  adimlardanGorunum, isEmriSureOzeti as sureOzetiHesapla, kayitAniIhlali, sayimIhlali, sayimYetkiIhlali, siradakiIsEmri, toplamAsimiIhlali,
  ilkAyrim, kararAnlari, MAKINE_AYRIM_UFKU_DK, makineAyrildiMetni,
  ADIM_ACIK_DEGIL, ADIM_BASLAMIS, ADIM_SECILMELI, KATILIM_TEK_ACIK_IS_EMIRSIZ, adimEksigi, adimEksikleri, baslatilabilirAdimlar, eksiyleBitirmeUyarisi,
  emirEksiUyarisi, oncekiBitmediIhlali, oncekiParalelAdim, sayimAsimiUyarisi, siraDisiBaslatmaUyarisi, uyarilariBirlestir, varsayilanAdim,
} from './kurallar.ts';
import type { IstasyonDurumu, MakineAyrimi } from './kurallar.ts';
import { adimaGiren, birlesmeAdimiBiterMi, kolAdimiBaslarMi, kolSonuysaKatil, ustuOnceKilitle } from './is-emri-servis.ts';
import { hurdaSayimiBildir, kaliteKarariBildir, saglamSayimiBildir } from './sayim-olayi.ts';
import { baslatmaDenetimi } from './baslatma-denetimi.ts';
import { emirBittiBildir, hazirlikTamamlandiBildir } from './emir-olaylari.ts';
import * as sorgular from './sorgular.ts';
import type { AdimDurumSatiri, AdimSatiri, EmirSatiri, IsEmriSatiri, KararGrubu, KayitSatiri } from './sorgular.ts';

interface Adlar {
  istasyon: Map<number, string>;
  kisi: Map<number, string>;
}

// Aynı işlem bağlantısında sorgular sırayla koşar (eşzamanlı çağrı pg tarafından kullanımdan kaldırıldı).
// Ad tabloları sahibi modüllerden gelir; bulunamayan ad uydurulmaz (yabancı anahtar var olduğunu garanti eder).
// Bir istek içinde art arda koşan komutlar (Arkon kayıt ekleme) kişi kapsamını ve ad tablolarını her satırda yeniden okumasın diye
// çağıranın açtığı kapsamda bir kez okunur. Kapsam yalnız aynı db (transaction) içindir ve çağıran içinde kişi, rol, iş merkezi
// ataması ya da istasyon yazmaz; kapsam dışında okumalar her komutta tazedir.
const onbellekler = new WeakMap<Db, Map<string, Promise<unknown>>>();

export async function komutOnbellegiyle<T>(db: Db, is: () => Promise<T>): Promise<T> {
  if (onbellekler.has(db)) return is();
  onbellekler.set(db, new Map());
  try {
    return await is();
  } finally {
    onbellekler.delete(db);
  }
}

// Denetim #25: çağıran (Arkon çevrimdışı kuyruğu) kaydın kendi anını verir; kapsam yalnız o komutun çağrısıdır. Verilmezse an sunucu saatidir.
const kayitAnlari = new WeakMap<Db, string>();

export async function kayitAniyla<T>(db: Db, an: string | undefined, is: () => Promise<T>): Promise<T> {
  if (an === undefined) return is();
  if (kayitAnlari.has(db)) throw new Error('Kayıt anı kapsamı iç içe açılamaz.');
  kayitAnlari.set(db, an);
  try {
    return await is();
  } finally {
    kayitAnlari.delete(db);
  }
}

// Emir kilitlendikten sonra çağrılır: son an kilit altında okunur, aynı emre eşzamanlı yazı araya giremez.
async function komutAni(db: Db, emirId: number): Promise<string> {
  const simdi = await sorgular.anAl(db);
  const an = kayitAnlari.get(db);
  if (an === undefined) return simdi;
  const ihlal = kayitAniIhlali(an, await sorgular.emrinSonAni(db, emirId), simdi);
  if (ihlal !== null) throw dogrulama(ihlal, 'an');
  return new Date(an).toISOString();
}

function onbellekte<T>(db: Db, anahtar: string, oku: () => Promise<T>): Promise<T> {
  const onbellek = onbellekler.get(db);
  if (onbellek === undefined) return oku();
  const varolan = onbellek.get(anahtar);
  if (varolan !== undefined) return varolan as Promise<T>;
  const okuma = oku();
  onbellek.set(anahtar, okuma);
  okuma.catch(() => onbellek.delete(anahtar));
  return okuma;
}

const adlariAl = (db: Db): Promise<Adlar> => onbellekte(db, 'adlar', () => adlariOku(db));

async function adlariOku(db: Db): Promise<Adlar> {
  const ist = await istasyonlar(db, { pasiflerDahil: true });
  const kisiler = await kisileriListele(db);
  return {
    istasyon: new Map(ist.map((i) => [i.id, i.ad])),
    kisi: new Map(kisiler.map((k) => [k.id, k.ad])),
  };
}

function adli(harita: Map<number, string>, id: number, tur: string): { id: number; ad: string } {
  const ad = harita.get(id);
  if (ad === undefined) throw new Error(`${tur} bulunamadı: ${id}`);
  return { id, ad };
}

// Başlamış ve bitmiş emrin sayaçları; planlı ve iptal emirde canlı yoktur (null). Sağlam terminalin iş emrinden, hurda bütün
// iş emirlerinden gelir: önceki adımda çıkan hurda emrin hurdasıdır.
async function canliHaritasi(db: Db, satirlar: readonly EmirSatiri[]): Promise<Map<number, Canli>> {
  const sonuc = new Map<number, Canli>();
  const idler = satirlar.filter((s) => s.durum === 'basladi' || s.durum === 'bitti').map((s) => s.id);
  if (idler.length === 0) return sonuc;
  const sayaclar = new Map((await sorgular.sayaclariGetir(db, idler)).map((s) => [s.emirId, s]));
  const hurdalar = new Map((await sorgular.hurdaToplamlariGetir(db, idler)).map((s) => [s.emirId, s.hurda]));
  const olaylar = new Map((await sorgular.sonOlaylariGetir(db, idler)).map((o) => [o.emirId, o]));
  const calisanlar = new Map((await sorgular.calisanIsEmirleriGetir(db, idler)).map(({ emirId, ...i }) => [emirId, i]));
  const durusAdlari = olaylar.size === 0
    ? new Map<number, string>()
    : new Map((await durusNedenleriniListele(db, { yalnizAktif: false })).map((n) => [n.id, n.ad]));
  for (const s of satirlar) {
    if (s.durum !== 'basladi' && s.durum !== 'bitti') continue;
    const sayac = sayaclar.get(s.id);
    const hurda = hurdalar.get(s.id) ?? 0;
    if (s.durum === 'bitti') {
      // Kapanış değeri emrin kendisindedir; sayım satırı olmayan (defterden önce bitmiş) emirde de tutarlı kalır.
      sonuc.set(s.id, { calisma: null, saglam: s.saglamAdet ?? 0, hurda, durusNedeni: null, durusBaslangic: null, isEmri: null });
      continue;
    }
    const saglam = sayac?.saglam ?? 0;
    const olay = olaylar.get(s.id) ?? null;
    const calisma = calismaDurumu(olay?.olay ?? null);
    sonuc.set(s.id, {
      calisma,
      saglam,
      hurda,
      durusNedeni: calisma === 'durdu' && olay?.durusNedeniId != null
        ? adli(durusAdlari, olay.durusNedeniId, 'Duruş nedeni')
        : null,
      durusBaslangic: calisma === 'calisiyor' ? null : (olay?.zaman ?? null),
      isEmri: calisanlar.get(s.id) ?? null,
    });
  }
  return sonuc;
}

interface ParalelAlanlar { acikAdimlar: AcikAdim[]; baslatilabilirAdimlar: number[] }
const PARALELSIZ: ParalelAlanlar = { acikAdimlar: [], baslatilabilirAdimlar: [] };

// Paralel adım okuması (639): açık (çalışan) adımlar ve şimdi başlatılabilecek adımlar, bütün liste için tek sorguda. Bölünmüş ya da
// kol emirde eksik kol hesabı istediği için listede gösterilmez (null); ayrıntı ekranı adimaGiren ile okur.
async function paralelAlanlari(db: Db, satirlar: readonly EmirSatiri[]): Promise<Map<number, ParalelAlanlar>> {
  const sonuc = new Map<number, ParalelAlanlar>();
  const idler = satirlar.filter((s) => s.malzemeNo !== null && (s.durum === 'planli' || s.durum === 'basladi')).map((s) => s.id);
  if (idler.length === 0) return sonuc;
  const emirAdimlari = new Map<number, AdimDurumSatiri[]>();
  for (const a of await sorgular.adimDurumlariGetir(db, idler)) emirAdimlari.set(a.emirId, [...(emirAdimlari.get(a.emirId) ?? []), a]);
  const adlar = await adlariAl(db);
  for (const id of idler) {
    const hepsi = emirAdimlari.get(id) ?? [];
    const eksikler = adimEksikleri(hepsi);
    const partili = hepsi.some((a) => a.partili);
    const oncekiSaglam = (a: AdimDurumSatiri): number => {
      const o = oncekiParalelAdim(hepsi, a);
      return o === null ? 0 : o.durum === 'tamam' ? (o.saglamAdet ?? 0) : o.saglam;
    };
    sonuc.set(id, {
      acikAdimlar: hepsi.filter((a) => a.durum === 'calisiyor').map((a) => ({
        isEmriId: a.id, opNo: a.opNo, ad: a.ad, istasyon: a.istasyonId === null ? null : adli(adlar.istasyon, a.istasyonId, 'İstasyon'),
        durum: a.durum, calisma: calismaDurumu(a.sonOlay), makineId: a.makineId, eksik: partili ? null : (eksikler.get(a.id) ?? null),
      })),
      baslatilabilirAdimlar: baslatilabilirAdimlar(hepsi, oncekiSaglam),
    });
  }
  return sonuc;
}

// İstasyonsuz satır yalnız iş emirli emirde olur (sıradaki iş emri atanmamış ya da fason): listeler onu süzer; komut cevabı
// işin yapıldığı istasyonu `yedekIstasyonId` ile verir.
// Salt okunur izleme: istasyonu olmayan emir (adımları atanmamış ya da bitmiş) istasyonsuz döner.
async function izlemeyeCevir(db: Db, satirlar: readonly EmirSatiri[]): Promise<IzlemeEmri[]> {
  const adlar = await adlariAl(db);
  const canli = await canliHaritasi(db, satirlar);
  const paralel = await paralelAlanlari(db, satirlar);
  const adimlar = new Map<number, sorgular.IsEmriSatiri[]>();
  for (const i of await sorgular.isEmirleriGetir(db, satirlar.map((s) => s.id))) adimlar.set(i.uretimEmriId, [...(adimlar.get(i.uretimEmriId) ?? []), i]);
  return satirlar.map((s) => {
    const { istasyonId, acanId, ...kalan } = s;
    return {
      ...kalan,
      ...adimlardanGorunum(s, adimlar.get(s.id) ?? []),
      istasyon: istasyonId === null ? null : adli(adlar.istasyon, istasyonId, 'İstasyon'),
      acan: adli(adlar.kisi, acanId, 'Kişi'),
      canli: canli.get(s.id) ?? null,
      ...(paralel.get(s.id) ?? PARALELSIZ),
    };
  });
}

async function emirlereCevir(db: Db, satirlar: readonly EmirSatiri[], yedekIstasyonId: number | null = null): Promise<Emir[]> {
  const adlar = await adlariAl(db);
  const canli = await canliHaritasi(db, satirlar);
  const paralel = await paralelAlanlari(db, satirlar);
  return satirlar.map((s) => {
    const { istasyonId, acanId, ...kalan } = s;
    const istasyon = istasyonId ?? yedekIstasyonId;
    if (istasyon === null) throw bulunamadi(EMIR_YOK);
    return {
      ...kalan,
      istasyon: adli(adlar.istasyon, istasyon, 'İstasyon'),
      acan: adli(adlar.kisi, acanId, 'Kişi'),
      canli: canli.get(s.id) ?? null,
      ...(paralel.get(s.id) ?? PARALELSIZ),
    };
  });
}

async function kayitlariCevir(db: Db, satirlar: readonly KayitSatiri[]): Promise<UretimKaydi[]> {
  const adlar = await adlariAl(db);
  const durus = satirlar.some((k) => k.durusNedeniId !== null)
    ? new Map((await durusNedenleriniListele(db, { yalnizAktif: false })).map((n) => [n.id, n.ad]))
    : new Map<number, string>();
  const hurda = satirlar.some((k) => k.hurdaNedeniId !== null)
    ? new Map((await hurdaNedenleriniListele(db, { yalnizAktif: false })).map((n) => [n.id, n.ad]))
    : new Map<number, string>();
  return satirlar.map(({ kisiId, istasyonId, durusNedeniId, hurdaNedeniId, kararVerenId, ...kalan }) => ({
    ...kalan,
    kisi: adli(adlar.kisi, kisiId, 'Kişi'),
    ...(kalan.olay === 'kalite_onay' || kalan.olay === 'kalite_red'
      ? { kararVeren: kararVerenId === null ? null : adli(adlar.kisi, kararVerenId, 'Kişi') }
      : {}),
    istasyon: adli(adlar.istasyon, istasyonId, 'İstasyon'),
    durusNedeni: durusNedeniId === null ? null : adli(durus, durusNedeniId, 'Duruş nedeni'),
    hurdaNedeni: hurdaNedeniId === null ? null : adli(hurda, hurdaNedeniId, 'Hurda nedeni'),
  }));
}

// Terminal komutu istasyonlu emirde çalışır; iş emirli emirde sıradaki iş emri atanmamışsa ya da fasonsa istasyon yoktur.
function istasyonu(emir: EmirSatiri): number {
  if (emir.istasyonId === null) throw cakisma(ISTASYONSUZ_ADIM);
  return emir.istasyonId;
}

async function istasyonDurumu(db: Db, id: number): Promise<IstasyonDurumu> {
  if ((await istasyonGetir(db, id)) === null) return 'yok';
  return (await aktifIstasyonlar(db)).some((i) => i.id === id) ? 'aktif' : 'pasif';
}

// Kısıtı olmayan (ya da kısıttan muaf) kişi her iş merkezinde çalışır; kısıtlı kişi yalnız listedekilerde.
async function kapsaminda(db: Db, kisiId: number, istasyonId: number): Promise<void> {
  const istasyon = await onbellekte(db, `istasyon:${istasyonId}`, () => istasyonGetir(db, istasyonId));
  if (istasyon === null) return;
  const izinli = await onbellekte(db, `izinli:${kisiId}`, () => kisininIzinliIsMerkezleri(db, kisiId));
  if (!isMerkeziIzinliMi(izinli, istasyon.isMerkeziId)) throw yetkiYok(KAPSAM_DISI);
}

async function adimlariCevir(db: Db, emirId: number): Promise<EmirAdimi[]> {
  const satirlar: AdimSatiri[] = await sorgular.adimlariGetir(db, emirId);
  if (satirlar.length === 0) return [];
  const adlar = await adlariAl(db);
  return satirlar.map(({ tamamlayanId, ...kalan }) => ({
    ...kalan,
    tamamlayan: tamamlayanId === null ? null : adli(adlar.kisi, tamamlayanId, 'Kişi'),
  }));
}

async function emirdenCevap(db: Db, id: number, yedekIstasyonId: number | null = null): Promise<{ emir: Emir }> {
  const satir = await sorgular.emirBul(db, id);
  if (satir === null) throw bulunamadi(EMIR_YOK);
  const [emir] = await emirlereCevir(db, [satir], yedekIstasyonId);
  if (emir === undefined) throw bulunamadi(EMIR_YOK);
  return { emir };
}

async function kilitliEmir(db: Db, id: number): Promise<EmirSatiri> {
  const satir = await sorgular.emirKilitle(db, id);
  if (satir === null) throw bulunamadi(EMIR_YOK);
  return satir;
}

/* ---------------- paralel adım (kart 639) ---------------- */

interface KomutAdimi { hepsi: IsEmriSatiri[]; adim: IsEmriSatiri | null }

// Komutun adımı. Verilen adım bu emrin olmalıdır. Verilmezse emrin terminaldeki tek açık adımı, açık adım yoksa sıradaki adım kullanılır;
// iki açık adım varsa adım sorulur. Böylece iş emirsiz eski emir ve tek adımlı akış bugünkü gibi kalır.
async function komutAdimi(db: Db, emir: EmirSatiri, isEmriId: number | undefined): Promise<KomutAdimi> {
  if (emir.malzemeNo === null) {
    if (isEmriId !== undefined) throw bulunamadi(IS_EMRI_YOK);
    return { hepsi: [], adim: null };
  }
  const hepsi = await sorgular.isEmirleriGetir(db, [emir.id]);
  if (isEmriId !== undefined) {
    const adim = hepsi.find((i) => i.id === isEmriId);
    if (adim === undefined) throw bulunamadi(IS_EMRI_YOK);
    return { hepsi, adim };
  }
  const adim = varsayilanAdim(hepsi);
  if (adim === ADIM_SECILMELI) throw cakisma(ADIM_SECILMELI);
  return { hepsi, adim };
}

// Adımı verilen komutta kapsam ve kayıt adımın istasyonundadır; verilmeyende emrin istasyonunda (bugünkü kural).
function komutIstasyonu(emir: EmirSatiri, adim: IsEmriSatiri | null, isEmriId: number | undefined): number {
  if (isEmriId === undefined || adim === null) return istasyonu(emir);
  if (adim.fasonFirmaId !== null) throw cakisma(TERMINAL_FASON);
  if (adim.istasyonId === null) throw cakisma(ISTASYONSUZ_ADIM);
  return adim.istasyonId;
}

// Adımın çalışma hâli kendi olaylarından türer (646 a); iş emirsiz eski emirde emrin olaylarından.
async function adimCalismasi(db: Db, emirId: number, adim: IsEmriSatiri | null) {
  const olay = adim === null ? ((await sorgular.sonOlaylariGetir(db, [emirId]))[0] ?? null) : await sorgular.adimSonOlayi(db, emirId, adim.id);
  return calismaDurumu(olay?.olay ?? null);
}

// Kilit, kapsam ve (kilit altında okunan) çalışma durumu: sayım ve duruş komutlarının ortak girişi. Adımı verilen komut çalışan adımda olur.
async function komutBaglami(db: Db, kisiId: number, id: number, isEmriId?: number) {
  const emir = await kilitliEmir(db, id);
  const { hepsi, adim } = await komutAdimi(db, emir, isEmriId);
  const istasyonId = komutIstasyonu(emir, adim, isEmriId);
  await kapsaminda(db, kisiId, istasyonId);
  if (isEmriId !== undefined && adim?.durum !== 'calisiyor') throw cakisma(ADIM_ACIK_DEGIL);
  // Varsayılan adım çalışmıyorsa (emir adımlar arasında) komut emir kuralıyla reddedilir; kayıt adımsız eski yoldan gider.
  const calisan = adim?.durum === 'calisiyor' ? adim : null;
  return { emir, hepsi, adim: calisan, istasyonId, calisma: await adimCalismasi(db, id, calisan) };
}

async function sayimYetkisiniDenetle(db: Db, kisiId: number, id: number, duzeltebilir: boolean, isEmriId: number | null = null): Promise<void> {
  if (duzeltebilir) return;
  const ihlal = sayimYetkiIhlali(await sorgular.adimaKatildiMi(db, id, kisiId, isEmriId), false);
  if (ihlal !== null) throw yetkiYok(ihlal);
}

// Adım verilirse o adımın, verilmezse terminal iş emrinin (iş emirsiz emirde emrin) sayaçları.
async function sayaclar(db: Db, id: number, isEmriId: number | null = null): Promise<{ saglam: number; hurda: number; kararBekliyor: number }> {
  const [sayac] = isEmriId === null ? await sorgular.sayaclariGetir(db, [id]) : await sorgular.adimSayaclariGetir(db, [isEmriId]);
  return { saglam: sayac?.saglam ?? 0, hurda: sayac?.hurda ?? 0, kararBekliyor: sayac?.kararBekliyor ?? 0 };
}

// Adıma giren: ilk adımda null; bağımsız adımda emir adedi (önceki adıma bağlı değildir); öteki adımda önceki adımın sağlamı (adimaGiren).
async function adimGirisi(db: Db, emir: EmirSatiri, hepsi: readonly IsEmriSatiri[], adim: IsEmriSatiri): Promise<number | null> {
  if (adim.bagimlilik === 'bagimsiz') return hepsi.some((i) => i.sira < adim.sira) ? emir.adet : null;
  return adimaGiren(db, emir.id, hepsi, adim);
}

// Denetim #31, 647 a: adımın sağlamı ve karar bekleyeni adıma girenle sınırlıdır. Aşım reddedilmez, uyarı döner; iz sayım defterindedir
// (asimlarGetir). İş emirsiz eski emirde sınır yoktur.
async function adimGirdisiUyarisi(db: Db, emir: EmirSatiri, hepsi: readonly IsEmriSatiri[], adim: IsEmriSatiri | null, fark: number): Promise<string | null> {
  if (fark <= 0 || adim === null) return null;
  const sayac = await sayaclar(db, emir.id, adim.id);
  return sayimAsimiUyarisi(await adimGirisi(db, emir, hepsi, adim), sayac.saglam + sayac.kararBekliyor, fark, adim.opNo);
}

// 654 a: adım, sonraki adımın saydığından az sağlamla biterse uyarır. Sonraki adım bağımsızsa bu adıma bağlı değildir.
async function eksiyleBitisUyarisi(db: Db, hepsi: readonly IsEmriSatiri[], adim: IsEmriSatiri, kapanis: number): Promise<string | null> {
  const sonraki = hepsi.find((i) => i.id !== adim.id && oncekiParalelAdim(hepsi, i)?.id === adim.id);
  if (sonraki === undefined || sonraki.durum === 'bekliyor') return null;
  const s = await sayaclar(db, sonraki.uretimEmriId, sonraki.id);
  return eksiyleBitirmeUyarisi(kapanis, { opNo: sonraki.opNo, sayilan: s.saglam + s.kararBekliyor + s.hurda });
}

// Emir eksi bakiyeyle biterse uyarır (tasarım 639 §5): her adımın girdisi adimaGiren ile, sayılanı adım sayacından.
async function emirEksiBitisUyarisi(db: Db, emir: EmirSatiri): Promise<string | null> {
  if (emir.malzemeNo === null) return null;
  const hepsi = await sorgular.isEmirleriGetir(db, [emir.id]);
  const sayac = new Map((await sorgular.adimSayaclariGetir(db, hepsi.map((i) => i.id))).map((x) => [x.isEmriId, x]));
  const adimlar: { opNo: number; eksik: number | null }[] = [];
  for (const i of hepsi) {
    if (i.bagimlilik === 'bagimsiz') continue;
    const x = sayac.get(i.id);
    adimlar.push({ opNo: i.opNo, eksik: adimEksigi(await adimaGiren(db, emir.id, hepsi, i), (x?.saglam ?? 0) + (x?.kararBekliyor ?? 0) + (x?.hurda ?? 0)) });
  }
  return emirEksiUyarisi(adimlar);
}

export async function emirleriListele(db: Db, durum: EmirDurumu | undefined): Promise<{ emirler: Emir[] }> {
  return { emirler: await emirlereCevir(db, await sorgular.emirleriGetir(db, durum ?? null, true)) };
}

// Salt okunur liste: istasyonsuz emirler yalnız istenirse gelir; Atölye, Stok ve Arkon'un açık emir okuması istasyonlu kalır.
export async function izlemeListesi(
  db: Db, durum: EmirDurumu | undefined, istasyonsuzDahil: boolean, hepsi = false,
): Promise<{ emirler: IzlemeEmri[] }> {
  // Adımlar arasında satır 'planli' iken görünen durum 'basladi'dir: açık durumlarla süzme görünen durumla yapılır.
  const acikSuzgec = durum === 'planli' || durum === 'basladi';
  const emirler = await izlemeyeCevir(db, await sorgular.emirleriGetir(db, acikSuzgec ? null : durum ?? null, !istasyonsuzDahil, hepsi));
  return { emirler: acikSuzgec ? emirler.filter((e) => e.durum === durum) : emirler };
}

// Biten (bitmiş ya da iptal) emirler, en yeni önce, sayfalı (kart #1323).
export function bitenEmirler(
  db: Db, suzgec: sorgular.BitenSuzgeci, istasyonsuzDahil: boolean, sayfa: { sayfa: number; sayfaBoyu?: number | undefined },
): Promise<SayfaliListe<IzlemeEmri>> {
  return sayfaliListe(sayfa, {
    say: () => sorgular.bitenEmirSay(db, suzgec, !istasyonsuzDahil),
    satirlar: async (d) => izlemeyeCevir(db, await sorgular.bitenEmirleriGetir(db, suzgec, !istasyonsuzDahil, d)),
  });
}

// Tek açık emir, listedeki biçimiyle (acikEmirler'in tek kayıtlık karşılığı); açık değilse, terminale düşmemişse ya da yoksa null.
export async function acikEmir(db: Db, id: number): Promise<Emir | null> {
  const satir = await sorgular.emirBul(db, id);
  if (satir === null || satir.istasyonId === null || !(ACIK_EMIR_DURUMLARI as readonly EmirDurumu[]).includes(satir.durum)) return null;
  return (await emirlereCevir(db, [satir]))[0] ?? null;
}

export async function emirAyrintisi(db: Db, id: number): Promise<EmirAyrintiCevabi> {
  const satir = await sorgular.emirBul(db, id);
  if (satir === null) throw bulunamadi(EMIR_YOK);
  const [emir] = await izlemeyeCevir(db, [satir]);
  if (emir === undefined) throw bulunamadi(EMIR_YOK);
  const kayitlar = await kayitlariCevir(db, await sorgular.kayitlariGetir(db, id));
  const kollar = (await sorgular.altPartilerGetir(db, [id])).map((k) => k.id);
  const kolHurdasi = kollar.length === 0 ? null : (await sorgular.hurdaToplamlariGetir(db, kollar)).reduce((t, x) => t + x.hurda, 0);
  return { emir, kayitlar, adimlar: await adimlariCevir(db, id), kolHurdasi };
}

// Denetimsiz yazıcı: yalnız test kurulumları çağırır (iş emirsiz emir).
export async function emirAc(db: Db, kisiId: number, govde: Omit<EmirKaydi, 'projeId'> & { projeId?: number }): Promise<{ emir: Emir }> {
  const ihlal = acmaIstasyonIhlali(await istasyonDurumu(db, govde.istasyonId));
  if (ihlal !== null) throw dogrulama(ihlal, 'istasyonId');
  const id = await sorgular.emirEkle(db, govde, kisiId);
  // Adımlar emirle aynı işlemde, dizideki sırayla 1..n bitişik yazılır.
  for (const [i, adim] of (govde.adimlar ?? []).entries()) await sorgular.adimEkle(db, id, i + 1, adim.ad, adim.aciklama);
  return emirdenCevap(db, id);
}

// Seçilen makine emrin istasyonunda olmalı ve çalışır durumda (aktif, arızada ya da bakımda değil) olmalı. İş emrine
// atanmış makine planın kararıdır, yeniden denetlenmez.
async function secimiDenetle(db: Db, istasyonId: number, secilen: readonly number[] | undefined): Promise<void> {
  if (secilen === undefined) return;
  const calisir = new Set(await calisirMakineler(db, istasyonId));
  if (secilen.some((m) => !calisir.has(m))) throw dogrulama(MAKINE_SECILEMEZ, 'makineIdleri');
}

// Canlı plan bu modülün değil: plan, verilen makinelerde ufuk içinde başlayan canlı yerleşimleri (bölünmüş işte parçaları) kablolama.ts
// çözücüsüyle verir. Kayıtsızken (araç, test) ayrım denetlenmez.
export type PlanAyrimiCozucusu = (db: Db, makineIdleri: readonly number[], ufukDk: number) => Promise<{ makineId: number; isEmriId: number; baslangic: string }[]>;
let planAyrimi: PlanAyrimiCozucusu | null = null;
export function planAyrimiCozucusuKaydet(cozucu: PlanAyrimiCozucusu | null): void { planAyrimi = cozucu; }

// 393 d: yalnız seçilen ve iş emrinin makinesi olmayan makineler denetlenir; seçimsiz başlatma planın makinesindedir.
async function ayrimAdaylari(db: Db, baska: readonly number[]): Promise<MakineAyrimi[]> {
  if (planAyrimi === null || baska.length === 0) return [];
  const satirlar = await planAyrimi(db, baska, MAKINE_AYRIM_UFKU_DK);
  if (satirlar.length === 0) return [];
  const bilgi = new Map((await sorgular.isEmriAyrimBilgileri(db, [...new Set(satirlar.map((x) => x.isEmriId))])).map((i) => [i.id, i]));
  return satirlar.flatMap((x) => {
    const i = bilgi.get(x.isEmriId);
    return i === undefined ? [] : [{ ...i, makineId: x.makineId, baslangic: x.baslangic }];
  });
}

async function ayrimiDenetle(db: Db, emirId: number, secilen: readonly number[] | undefined, atanan: number | null): Promise<void> {
  const baska = (secilen ?? []).filter((m) => m !== atanan);
  const a = ilkAyrim(await ayrimAdaylari(db, baska), emirId, baska, atanan);
  if (a === null) return;
  const kod = async (id: number) => (await makineGetir(db, id))?.kod ?? `#${id}`;
  throw cakisma(makineAyrildiMetni(await kod(a.makineId), a, tesisSaati(new Date(a.baslangic)), atanan === null ? null : await kod(atanan)));
}

// Seçici reddin kuralından okur: makine başına ilk ayrım. Atanan, başlatmada sıradaki, devamda çalışan iş emrinin makinesidir
// (emirBaslat ve emirDevam'ın ayrimiDenetle'ye verdiği). Salt okuma: kilit almaz, yetki denetlemez.
export async function makineAyrimlari(db: Db, emirId: number, makineIdleri: readonly number[]): Promise<{
  atanan: number | null; ayrimlar: { makineId: number; emirNo: string; opNo: number; baslangic: string }[];
}> {
  const emir = await sorgular.emirBul(db, emirId);
  if (emir === null) throw bulunamadi(EMIR_YOK);
  const isEmirleri = emir.malzemeNo === null ? [] : await sorgular.isEmirleriGetir(db, [emirId]);
  const isEmri = emir.durum === 'planli' ? siradakiIsEmri(isEmirleri) : isEmirleri.find((i) => i.durum === 'calisiyor') ?? null;
  const atanan = isEmri?.makineId ?? null;
  const baska = [...new Set(makineIdleri)].filter((m) => m !== atanan);
  const adaylar = await ayrimAdaylari(db, baska);
  const ayrimlar = baska.flatMap((m) => {
    const a = ilkAyrim(adaylar, emirId, [m], atanan);
    return a === null ? [] : [{ makineId: a.makineId, emirNo: a.emirNo, opNo: a.opNo, baslangic: a.baslangic }];
  }).sort((x, y) => Date.parse(x.baslangic) - Date.parse(y.baslangic));
  return { atanan, ayrimlar };
}

// Kilidin yeri: seçilen ya da atanmış makineler; makinesiz işte istasyonun makinesiz yeri (eski istasyon kilidi). Aynı işe
// birden çok kişinin girmesi kilit değil katılımdır.
interface Yer {
  istasyonId: number;
  makineler: readonly number[];
}

// Yer doluysa 409; ayrıntı kimin hangi işi başlattığını ve devralmanın kapatacağı kullanımı söyler. Aynı emrin öteki adımı da yeri doldurur.
async function yeriDenetle(db: Db, emirId: number, yer: Yer, isEmriId: number | null = null): Promise<void> {
  const [acik] = await sorgular.acikKullanimlar(db, yer.istasyonId, yer.makineler);
  const ihlal = makineDoluIhlali(acik?.emirId ?? null, emirId, yer.makineler.length > 0, acik?.isEmriId ?? null, isEmriId);
  if (ihlal === null || acik === undefined) return;
  const makine = acik.makineId === null ? null : await makineGetir(db, acik.makineId);
  const ayrinti: MakineDoluAyrintisi = {
    kullanimId: acik.id,
    makine: acik.makineId === null ? null : { id: acik.makineId, ad: makine?.ad ?? `#${acik.makineId}` },
    emir: { id: acik.emirId, emirNo: acik.emirNo },
    kisi: adli((await adlariAl(db)).kisi, acik.kisiId, 'Kişi'),
    baslama: acik.baslama,
  };
  throw cakisma(ihlal, ayrinti);
}

async function yeriTut(db: Db, emirId: number, isEmriId: number | null, yer: Yer, kisiId: number, an: string): Promise<void> {
  try {
    for (const m of yer.makineler) await sorgular.kullanimAc(db, emirId, isEmriId, yer.istasyonId, m, kisiId, an);
    if (yer.makineler.length === 0) await sorgular.kullanimAc(db, emirId, isEmriId, yer.istasyonId, null, kisiId, an);
  } catch (hata) {
    // Yarışı kaybeden: öteki iş denetimden sonra, ama bizden önce yere yazıldı.
    const kisit = kisitIhlali(hata)?.iz.kisit;
    if (kisit === MAKINEDE_TEK) throw cakisma(MAKINE_DOLU);
    if (kisit === ISTASYONDA_TEK) throw cakisma(ISTASYON_DOLU);
    throw hata;
  }
}

// İş emirli emirde başlatma sıradaki iş emrini başlatır; fason iş emri operatörle başlamaz (UE3).
// Uyarı (karar 110 b): stok girdi istasyonda yokken başlatmayı durdurmaz, eksiği iz olarak açar ve metnini döner; yoksa null.
// Paralel adım (639): adım verilirse o adım başlar; emir başlamışken de bekleyen adım başlatılır. Sıra dışı başlatma reddedilmez,
// uyarı döner (626 a); iz, adımın başlatma kaydıdır.
export async function emirBaslat(
  db: Db, kisiId: number, id: number, makineIdleri?: readonly number[], isEmriId?: number,
): Promise<{ emir: Emir; uyari: string | null }> {
  const emir = await kilitliEmir(db, id);
  const hepsi = emir.malzemeNo === null ? [] : await sorgular.isEmirleriGetir(db, [id]);
  const verilen = isEmriId === undefined ? null : (hepsi.find((i) => i.id === isEmriId) ?? null);
  if (isEmriId !== undefined && verilen === null) throw bulunamadi(IS_EMRI_YOK);
  const isEmri = isEmriId === undefined ? (emir.malzemeNo === null ? null : siradakiIsEmri(hepsi)) : verilen;
  const istasyonId = komutIstasyonu(emir, isEmri, isEmriId);
  await kapsaminda(db, kisiId, istasyonId);
  const yetkinlikIhlali = baslatmaYetkinlikIhlali(await yetkinMi(db, kisiId, istasyonId), await kisiBayrakliMi(db, kisiId));
  if (yetkinlikIhlali !== null) throw yetkiYok(yetkinlikIhlali);
  const paralel = isEmriId !== undefined && emir.durum === 'basladi';
  const durumIhlali = paralel ? null : baslatmaIhlali(emir.durum);
  if (durumIhlali !== null) throw cakisma(durumIhlali);
  if (isEmriId !== undefined && isEmri?.durum !== 'bekliyor') throw cakisma(ADIM_BASLAMIS);
  if (emir.malzemeNo !== null && isEmri === null) throw cakisma(ISTASYONSUZ_ADIM);
  if (isEmri !== null && isEmri.fasonFirmaId !== null) throw cakisma(TERMINAL_FASON);
  if (isEmri !== null) {
    const ust = await sorgular.ustEmirBul(db, id);
    if (ust !== null) await kolAdimiBaslarMi(db, ust, isEmri);
  }
  const istasyonIhlali = baslatmaIstasyonIhlali(await istasyonDurumu(db, istasyonId));
  if (istasyonIhlali !== null) throw cakisma(istasyonIhlali);
  const denetim = isEmri === null ? { engel: null, uyarilar: [] } : await baslatmaDenetimi(db, { uretimEmriId: id, isEmriId: isEmri.id, istasyonId, kisiId });
  if (denetim.engel !== null) throw cakisma(denetim.engel);
  await secimiDenetle(db, istasyonId, makineIdleri);
  await ayrimiDenetle(db, id, makineIdleri, isEmri?.makineId ?? null);
  const yer: Yer = { istasyonId, makineler: calisilacakMakineler(makineIdleri, isEmri?.makineId ?? null) };
  await yeriDenetle(db, id, yer, isEmri?.id ?? null);
  const siraUyarisi = isEmri === null ? null : siraDisiBaslatmaUyarisi(hepsi, isEmri, (await adimaGiren(db, id, hepsi, isEmri)) ?? 0);
  const an = await komutAni(db, id);
  await sorgular.baslamayiYaz(db, id, an);
  // Planlı emir adımı verilerek başlarsa emir o adımın istasyonunda başlar; başlamış emrin istasyonu öncü adımda kalır.
  if (isEmriId !== undefined && !paralel && emir.istasyonId !== istasyonId) await sorgular.emirIstasyonunuYaz(db, id, istasyonId);
  if (isEmri !== null) await sorgular.isEmriBaslat(db, isEmri.id, an);
  const ilkBaslatma = !(await sorgular.baslatmaKaydiVarMi(db, id));
  await sorgular.kayitEkle(db, id, kisiId, istasyonId, 'baslat', null, an, isEmri?.id ?? null);
  await yeriTut(db, id, isEmri?.id ?? null, yer, kisiId, an);
  await sorgular.katilimAc(db, id, isEmri?.id ?? null, kisiId, istasyonId, an);
  // Hazırlık denetiminden geçen ilk terminal başlatması; adımsız eski emir ve sonraki adımlar olay vermez.
  if (isEmri !== null && ilkBaslatma) await hazirlikTamamlandiBildir(db, { uretimEmriId: id, kisiId });
  return { ...(await emirdenCevap(db, id)), uyari: uyarilariBirlestir(...denetim.uyarilar, siraUyarisi) };
}

// Ayar başlamamış işte yazılır, istasyonu kilitlemez ve çalışma hâlini değiştirmez; sonraki başlatma ayarı kapatır.
// Başlatmanın iş emri denetimleri aynen geçerlidir (sıradaki iş emri yoksa ya da fasonsa ayar yoktur). Adım verilirse o bekleyen
// adımın ayarıdır; emir başlamışken de yazılır (paralel adım, 639).
export async function emirAyar(db: Db, kisiId: number, id: number, isEmriId?: number): Promise<{ emir: Emir }> {
  const emir = await kilitliEmir(db, id);
  const hepsi = emir.malzemeNo === null ? [] : await sorgular.isEmirleriGetir(db, [id]);
  const verilen = isEmriId === undefined ? null : (hepsi.find((i) => i.id === isEmriId) ?? null);
  if (isEmriId !== undefined && verilen === null) throw bulunamadi(IS_EMRI_YOK);
  const isEmri = isEmriId === undefined ? (emir.malzemeNo === null ? null : siradakiIsEmri(hepsi)) : verilen;
  const istasyonId = komutIstasyonu(emir, isEmri, isEmriId);
  await kapsaminda(db, kisiId, istasyonId);
  if (emir.malzemeNo !== null && isEmri === null) throw cakisma(ISTASYONSUZ_ADIM);
  if (isEmri !== null && isEmri.fasonFirmaId !== null) throw cakisma(TERMINAL_FASON);
  if (isEmriId !== undefined && isEmri?.durum !== 'bekliyor') throw cakisma(ADIM_BASLAMIS);
  const durum = isEmriId !== undefined && emir.durum === 'basladi' ? 'planli' : emir.durum;
  const ihlal = ayarIhlali(durum, await sorgular.ayarVarMi(db, id, isEmri?.id ?? null));
  if (ihlal !== null) throw cakisma(ihlal);
  await sorgular.olayEkle(db, id, kisiId, istasyonId, 'ayar', null, await komutAni(db, id), isEmri?.id ?? null);
  return emirdenCevap(db, id);
}

// İş emri başka emrin ise bulunamadı sayılır (yol emir kimliğini de taşır).
export async function isEmriSureOzeti(db: Db, isEmriId: number, emirId?: number): Promise<SureOzetiCevabi> {
  const isEmri = await sorgular.isEmriBul(db, isEmriId);
  if (isEmri === null || (emirId !== undefined && isEmri.uretimEmriId !== emirId)) throw bulunamadi(IS_EMRI_YOK);
  const olaylar = await sorgular.isEmriOlaylari(db, isEmriId);
  const sayimlar = await sorgular.isEmriSayimlari(db, isEmriId);
  const ozet = sureOzetiHesapla({
    baslama: isEmri.baslama, bitis: isEmri.bitis, simdi: await sorgular.anAl(db),
    ayarlar: olaylar.filter((o) => o.olay === 'ayar').map((o) => o.zaman),
    olaylar: olaylar.flatMap((o) => (o.olay === 'ayar' ? [] : [{ olay: o.olay, zaman: o.zaman }])),
    sayimlar,
  });
  return { isEmriId, baslama: isEmri.baslama, bitis: isEmri.bitis, ...ozet };
}

// Bitirme çalışma durumundan bağımsızdır (çalışırken, duraklıyken, durmuşken). Adet verilmezse emrin sağlam adedi
// sayaç toplamıdır; verilirse sayaçla farkı düzeltme satırı olarak yazılır, toplam verilen adede eşitlenir.
// İş emirli emirde çalışan iş emri biter; iş emri kalırsa emir sıradakinin istasyonunda yeniden planlı olur, son iş emri
// biterse emir biter (ilk sistemdeki gibi). Defter satırları iş emri bitmeden yazılır: kapsamları çalışan iş emridir.
// duzeltebilir verilirse (dışarıdan gelen komut) verilen adet sayımı ezdiği için emirSayim'deki eksi sayım denetimine tabidir.
// Paralel adım (639): akışlı ya da bekleyen adım önceki adım bitmeden bitmez (649 a). Başka adım çalışıyorsa emir başlamış kalır ve
// istasyonu öncü adıma geçer. Emrin sağlamı en büyük sıralı adımın sağlamıdır. Eksi bakiyeyle bitiş uyarır (654 a).
export async function emirBitir(
  db: Db, kisiId: number, id: number, saglamAdet: number | undefined, refakatPartisiId: number | null = null, duzeltebilir?: boolean,
  isEmriId?: number,
): Promise<{ emir: Emir; uyari: string | null }> {
  await ustuOnceKilitle(db, id);
  const emir = await kilitliEmir(db, id);
  const { hepsi, adim } = await komutAdimi(db, emir, isEmriId);
  const istasyonId = komutIstasyonu(emir, adim, isEmriId);
  await kapsaminda(db, kisiId, istasyonId);
  const ihlal = bitirmeIhlali(emir.durum);
  if (ihlal !== null) throw cakisma(ihlal);
  if (isEmriId !== undefined && adim?.durum !== 'calisiyor') throw cakisma(ADIM_ACIK_DEGIL);
  const calisan = adim?.durum === 'calisiyor' ? adim : null;
  const adimId = calisan?.id ?? null;
  if (saglamAdet !== undefined && duzeltebilir !== undefined) await sayimYetkisiniDenetle(db, kisiId, id, duzeltebilir, adimId);
  if (calisan !== null) {
    const sira = oncekiBitmediIhlali(hepsi, calisan);
    if (sira !== null) throw cakisma(sira);
    await birlesmeAdimiBiterMi(db, id, calisan);
  }
  const sayac = await sayaclar(db, id, adimId);
  const mevcut = sayac.saglam;
  // 327 a: karar bekleyen varken verilen adet onunla birlikte sayılandır; fark karar bekleyene yazılır,
  // kapanış onaylı sağlamdır ve onay bekleyeni sonradan ekler (çift sayım olmaz).
  const bekleyen = sayac.kararBekliyor;
  const onayBekler = saglamAdet !== undefined && bekleyen > 0;
  const sayilan = onayBekler ? mevcut + bekleyen : mevcut;
  const fark = (saglamAdet ?? sayilan) - sayilan;
  // Eksi fark önce karar bekleyeni, artanı sağlamı düşer: karar bekleyen sıfırın altına inmez.
  const bekleyeneFark = onayBekler ? Math.max(fark, -bekleyen) : 0;
  const saglamaFark = fark - bekleyeneFark;
  const kapanis = mevcut + saglamaFark;
  const uyarilar = [await adimGirdisiUyarisi(db, emir, hepsi, calisan, fark), calisan === null ? null : await eksiyleBitisUyarisi(db, hepsi, calisan, kapanis)];
  const an = await komutAni(db, id);
  if (bekleyeneFark !== 0) await saglamYaz(db, emir, kisiId, istasyonId, bekleyeneFark, true, an, true, refakatPartisiId, adimId);
  if (saglamaFark !== 0) await saglamYaz(db, emir, kisiId, istasyonId, saglamaFark, true, an, false, refakatPartisiId, adimId);
  await sorgular.kayitEkle(db, id, kisiId, istasyonId, 'bitir', kapanis, an, adimId);
  await sorgular.emrinKullanimlariniKapat(db, id, kisiId, an, adimId);
  await sorgular.emrinKatilimlariniKapat(db, id, an, adimId);
  let emirKapanis = kapanis;
  if (calisan !== null) {
    await sorgular.isEmriBitir(db, calisan.id, kapanis, an);
    const guncel = await sorgular.isEmirleriGetir(db, [id]);
    // Terminalde çalışan başka adım: emir başlamış kalır, istasyonu en küçük sıralı çalışan adıma geçer.
    const suren = guncel.filter((i) => i.durum === 'calisiyor' && i.fasonFirmaId === null && i.istasyonId !== null).sort((a, b) => a.sira - b.sira)[0];
    if (suren?.istasyonId != null) {
      if (suren.istasyonId !== emir.istasyonId) await sorgular.emirIstasyonunuYaz(db, id, suren.istasyonId);
      return { ...(await emirdenCevap(db, id, istasyonId)), uyari: uyarilariBirlestir(...uyarilar) };
    }
    const sonraki = siradakiIsEmri(guncel);
    if (sonraki !== null) {
      await sorgular.sonrakiIsEmrineGec(db, id, sonraki.istasyonId);
      // Sıradaki iş emri atanmamış ya da fasonsa emir terminal listelerinden çıkar; cevap, bitirildiği istasyondaki hâlidir.
      return { ...(await emirdenCevap(db, id, istasyonId)), uyari: uyarilariBirlestir(...uyarilar) };
    }
    // Planlı birleşmeli kolun son iş emri: kol üstüne katılır, emir bitmez (UE-PB6c).
    const ust = await sorgular.ustEmirBul(db, id);
    if (ust !== null && (await kolSonuysaKatil(db, ust, kisiId))) return { ...(await emirdenCevap(db, id, istasyonId)), uyari: uyarilariBirlestir(...uyarilar) };
    // Son biten adım en büyük sıralı adım değilse (bağımsız adım sonra bitti) emrin sağlamı en büyük sıralı adımındır.
    const son = [...guncel].sort((a, b) => b.sira - a.sira)[0];
    if (son !== undefined && son.id !== calisan.id) emirKapanis = son.saglamAdet ?? 0;
  }
  await sorgular.bitisiYaz(db, id, emirKapanis, an);
  await emirBittiBildir(db, { uretimEmriId: id, saglamAdet: emirKapanis, kisiId });
  return { ...(await emirdenCevap(db, id)), uyari: uyarilariBirlestir(...uyarilar, await emirEksiBitisUyarisi(db, emir)) };
}

// Sağlam sayım satırı yazılır, sonra aynı işlemde dinleyicilere bildirilir (kart #1289; stok girişi). Dinleyicilerin uyarısı döner.
async function saglamYaz(
  db: Db, emir: { id: number }, kisiId: number, istasyonId: number, adet: number, duzeltme: boolean, an: string, kararBekliyor = false,
  refakatPartisiId: number | null = null, adimId: number | null = null,
): Promise<string | null> {
  const { isEmriId } = await sorgular.sayimEkle(db, {
    emirId: emir.id, kisiId, istasyonId, tur: kararBekliyor ? 'karar_bekliyor' : 'saglam', adet, hurdaNedeniId: null, duzeltme, an, refakatPartisiId, isEmriId: adimId,
  });
  return saglamSayimiBildir(db, {
    uretimEmriId: emir.id, isEmriId, istasyonId, kisiId, fark: adet, kaliteDurumu: kararBekliyor ? 'karar_bekliyor' : 'serbest', refakatPartisiId,
  });
}

// kararBekliyor: ilk parça kararı beklenirken sağlam sayım karar bekleyen sayılır (131 b); türü çağıran modül seçer, terminal
// gövdesi seçemez. Eksi düzeltme karar bekleyen toplamı sıfırın altına indiremez.
// duzeltebilir verilirse (dışarıdan gelen komut) eksi sayım başkasının sayımını düşürebileceği için kişinin çalışan adıma başlamış
// ya da katılmış olmasını, değilse düzeltme işlemini ister (185 a). Artı sayım Arkon'un kendi cihaz ve ekibinden gelir.
export async function emirSayim(
  db: Db, kisiId: number, id: number, govde: SayimKaydi, secenek: { kararBekliyor?: boolean; duzeltebilir?: boolean; isEmriId?: number } = {},
): Promise<{ emir: Emir; uyari: string | null }> {
  const { emir, hepsi, adim, istasyonId, calisma } = await komutBaglami(db, kisiId, id, secenek.isEmriId);
  const adimId = adim?.id ?? null;
  // 327 a: ilk parçası onaylanmamış emirde sağlam sayım, hangi yoldan gelirse gelsin, karar bekler.
  // Onaysız emirde sağlam sıfırdır: eksi düzeltme de karar bekleyeni düşer.
  const kararBekliyor = govde.tur === 'saglam'
    && (secenek.kararBekliyor === true || (await sorgular.ilkParcaOnaysiz(db, id)));
  const ihlal = sayimIhlali(emir.durum, calisma);
  if (ihlal !== null) throw cakisma(ihlal);
  if (secenek.duzeltebilir !== undefined && govde.adet < 0) await sayimYetkisiniDenetle(db, kisiId, id, secenek.duzeltebilir, adimId);
  const refakatPartisiId = govde.refakatPartisiId ?? null;
  let hurdaNedeniId: number | null = null;
  let asimUyarisi: string | null = null;
  if (govde.tur === 'hurda' && govde.adet < 0) {
    const eksi = hurdaToplamIhlali((await sayaclar(db, id, adimId)).hurda, govde.adet);
    if (eksi !== null) throw cakisma(eksi);
    // Düzeltme pasif nedene de yazılır: geri alınan hurda o nedenle girilmişti.
    hurdaNedeniId = govde.hurdaNedeniId ?? (await sorgular.sonHurdaNedeni(db, id, adimId));
    if (hurdaNedeniId === null || (await hurdaNedeniGetir(db, hurdaNedeniId)) === null) throw dogrulama(HURDA_NEDENI_YOK, 'hurdaNedeniId');
  } else if (govde.tur === 'hurda') {
    const nedenIhlali = hurdaNedeniIhlali(govde.hurdaNedeniId === undefined ? null : await hurdaNedeniGetir(db, govde.hurdaNedeniId));
    if (nedenIhlali !== null || govde.hurdaNedeniId === undefined) throw dogrulama(nedenIhlali ?? HURDA_NEDENI_YOK, 'hurdaNedeniId');
    hurdaNedeniId = govde.hurdaNedeniId;
    const asim = toplamAsimiIhlali((await sayaclar(db, id, adimId)).hurda, govde.adet);
    if (asim !== null) throw cakisma(asim);
  } else {
    const sayac = await sayaclar(db, id, adimId);
    const mevcut = kararBekliyor ? sayac.kararBekliyor : sayac.saglam;
    const ihlalEksi = saglamToplamIhlali(mevcut, govde.adet) ?? toplamAsimiIhlali(mevcut, govde.adet);
    if (ihlalEksi !== null) throw cakisma(ihlalEksi);
    asimUyarisi = await adimGirdisiUyarisi(db, emir, hepsi, adim, govde.adet);
  }
  let uyari: string | null = null;
  if (govde.tur === 'saglam') {
    uyari = await saglamYaz(db, emir, kisiId, istasyonId, govde.adet, govde.adet < 0, await komutAni(db, id), kararBekliyor, refakatPartisiId, adimId);
  } else {
    if (hurdaNedeniId === null) throw dogrulama(HURDA_NEDENI_YOK, 'hurdaNedeniId');
    const { isEmriId } = await sorgular.sayimEkle(db, {
      emirId: id, kisiId, istasyonId, tur: 'hurda', adet: govde.adet, hurdaNedeniId, duzeltme: govde.adet < 0, an: await komutAni(db, id), refakatPartisiId, isEmriId: adimId,
    });
    await hurdaSayimiBildir(db, { uretimEmriId: id, isEmriId, istasyonId, kisiId, hurdaNedeniId, fark: govde.adet, refakatPartisiId });
  }
  return { ...(await emirdenCevap(db, id)), uyari: uyarilariBirlestir(asimUyarisi, uyari) };
}

// Emrin karar bekleyen sayımı kalite kararıyla kapanır: onayda sağlama, retde redde geçer; her iş emrinde iki düzeltme satırı yazılır
// (-n karar bekliyor, +n sağlam ya da red), parçanın üretildiği her an için ayrı (645 a). Ret sonrası sayılan yeniden karar bekler ve bir sonraki kararla kapanır (136 a).
// Emir bitmiş ya da durmuş olabilir; kapsam ve kalite yetkisini çağıran denetler (Arkon numune kararı).
export async function kararliSayimiSonuclandir(
  db: Db, kisiId: number, id: number, karar: KaliteKarari,
): Promise<{ emir: Emir; adet: number }> {
  await kilitliEmir(db, id);
  const an = await sorgular.anAl(db);
  const gruplar = new Map<string, { grup: KararGrubu; satirlar: { zaman: string; adet: number }[] }>();
  for (const { zaman, adet, ...grup } of await sorgular.kararBekleyenSatirlari(db, id)) {
    const anahtar = `${String(grup.isEmriId)}/${grup.istasyonId}/${grup.kisiId}/${String(grup.refakatPartisiId)}`;
    const g = gruplar.get(anahtar) ?? { grup, satirlar: [] };
    g.satirlar.push({ zaman, adet });
    gruplar.set(anahtar, g);
  }
  // İş emri ve refakat partisi başına toplanır: stok kararı partinin kendi bakiyesine uygular.
  const adetler = new Map<string, { isEmriId: number | null; refakatPartisiId: number | null; adet: number }>();
  for (const { grup: g, satirlar } of gruplar.values()) {
    let grupAdedi = 0;
    for (const a of kararAnlari(satirlar)) {
      await sorgular.kararSatirlariEkle(db, id, g, karar === 'onay' ? 'saglam' : 'red', a.zaman, a.adet, an, kisiId);
      grupAdedi += a.adet;
    }
    const anahtar = `${String(g.isEmriId)}/${String(g.refakatPartisiId)}`;
    const o = adetler.get(anahtar) ?? { isEmriId: g.isEmriId, refakatPartisiId: g.refakatPartisiId, adet: 0 };
    adetler.set(anahtar, { ...o, adet: o.adet + grupAdedi });
  }
  let toplam = 0;
  for (const { isEmriId, refakatPartisiId, adet } of adetler.values()) {
    if (adet === 0) continue;
    if (karar === 'onay') await sorgular.bitmisSaglamaEkle(db, id, isEmriId, adet);
    await kaliteKarariBildir(db, { uretimEmriId: id, isEmriId, kisiId, karar, adet, refakatPartisiId });
    toplam += adet;
  }
  return { ...(await emirdenCevap(db, id)), adet: toplam };
}

export async function kararSayaclari(db: Db, idler: readonly number[]): Promise<Map<number, { kararBekliyor: number; red: number }>> {
  const sonuc = new Map(idler.map((id) => [id, { kararBekliyor: 0, red: 0 }]));
  if (idler.length === 0) return sonuc;
  for (const { emirId, ...s } of await sorgular.kararSayaclariGetir(db, idler)) sonuc.set(emirId, s);
  return sonuc;
}

export async function emirDuraklat(db: Db, kisiId: number, id: number, isEmriId?: number): Promise<{ emir: Emir }> {
  const { emir, adim, istasyonId, calisma } = await komutBaglami(db, kisiId, id, isEmriId);
  const ihlal = duraklatmaIhlali(emir.durum, calisma);
  if (ihlal !== null) throw cakisma(ihlal);
  const an = await komutAni(db, id);
  await sorgular.olayEkle(db, id, kisiId, istasyonId, 'duraklat', null, an, adim?.id ?? null);
  await sorgular.emrinKullanimlariniKapat(db, id, kisiId, an, adim?.id ?? null);
  await sorgular.emrinKatilimlariniKapat(db, id, an, adim?.id ?? null);
  return emirdenCevap(db, id);
}

// Duraklamış ya da durmuş iş, seçilen makinelerde; seçilmezse son durduğu makinelerde, onlar da yoksa iş emrinin makinesinde sürer.
export async function emirDevam(db: Db, kisiId: number, id: number, makineIdleri?: readonly number[], isEmriId?: number): Promise<{ emir: Emir }> {
  const { emir, adim: isEmri, istasyonId, calisma } = await komutBaglami(db, kisiId, id, isEmriId);
  const ihlal = devamIhlali(emir.durum, calisma);
  if (ihlal !== null) throw cakisma(ihlal);
  await secimiDenetle(db, istasyonId, makineIdleri);
  await ayrimiDenetle(db, id, makineIdleri, isEmri?.makineId ?? null);
  const son = makineIdleri === undefined ? await sorgular.sonKapananMakineler(db, id, isEmri?.id ?? null) : [];
  const yer: Yer = { istasyonId, makineler: son.length > 0 ? son : calisilacakMakineler(makineIdleri, isEmri?.makineId ?? null) };
  await yeriDenetle(db, id, yer, isEmri?.id ?? null);
  const an = await komutAni(db, id);
  await sorgular.olayEkle(db, id, kisiId, istasyonId, 'devam', null, an, isEmri?.id ?? null);
  await yeriTut(db, id, isEmri?.id ?? null, yer, kisiId, an);
  // Devam ettiren işe döner; öteki katılımcılar kendileri katılır.
  await sorgular.katilimAc(db, id, isEmri?.id ?? null, kisiId, istasyonId, an);
  return emirdenCevap(db, id);
}

export async function emirDurdur(db: Db, kisiId: number, id: number, durusNedeniId: number, isEmriId?: number): Promise<{ emir: Emir }> {
  const { emir, adim, istasyonId, calisma } = await komutBaglami(db, kisiId, id, isEmriId);
  const ihlal = durdurmaIhlali(emir.durum, calisma);
  if (ihlal !== null) throw cakisma(ihlal);
  const nedenIhlali = durusNedeniIhlali(await durusNedeniGetir(db, durusNedeniId));
  if (nedenIhlali !== null) throw dogrulama(nedenIhlali, 'durusNedeniId');
  const an = await komutAni(db, id);
  await sorgular.olayEkle(db, id, kisiId, istasyonId, 'durdur', durusNedeniId, an, adim?.id ?? null);
  await sorgular.emrinKullanimlariniKapat(db, id, kisiId, an, adim?.id ?? null);
  await sorgular.emrinKatilimlariniKapat(db, id, an, adim?.id ?? null);
  return emirdenCevap(db, id);
}

// Yerdeki (makine ya da makinesiz istasyon yeri) işi durdurup bu işi orada başlatır ya da devam ettirir, tek işlemde.
// Kapatılan kullanımın kimliği dolu cevabında gösterilenle aynı olmalı: arada orada başka iş açıldıysa kişi neyi durdurduğunu
// bilmeden devralmaz. Öteki işin (adımın) başka açık kullanımı kalmazsa iş duraklatılır (duraklatma neden istemez); kalırsa orada sürer.
// Paralel adım (639): yer aynı emrin öteki adımındaysa da devralınır; duraklayan o adımdır.
export async function makineDevral(db: Db, kisiId: number, id: number, kullanimId: number, isEmriId?: number): Promise<{ emir: Emir }> {
  const emir = await kilitliEmir(db, id);
  const { adim } = await komutAdimi(db, emir, isEmriId);
  const istasyonId = komutIstasyonu(emir, adim, isEmriId);
  await kapsaminda(db, kisiId, istasyonId);
  const baslatilacak = isEmriId === undefined ? emir.durum === 'planli' : adim?.durum === 'bekliyor';
  if (!baslatilacak) {
    const calisan = adim?.durum === 'calisiyor' ? adim : null;
    const calismiyor = emir.durum === 'basladi' && (isEmriId === undefined || calisan !== null) && (await adimCalismasi(db, id, calisan)) !== 'calisiyor';
    if (!calismiyor) throw cakisma(DEVRAL_DURUMU);
  }
  const acik = await sorgular.kullanimBul(db, kullanimId);
  if (acik === null || acik.istasyonId !== istasyonId) throw cakisma(DEVRAL_DEGISTI);
  const adimId = adim?.id ?? null;
  if (acik.emirId === id && (acik.isEmriId === null || adimId === null || acik.isEmriId === adimId)) throw cakisma(MAKINEDE_AYNI_IS);
  const oteki = acik.emirId === id ? emir : await kilitliEmir(db, acik.emirId);
  const an = await komutAni(db, id);
  await sorgular.kullanimKapat(db, acik.id, kisiId, an);
  if ((await sorgular.emrinAcikKullanimSayisi(db, oteki.id, acik.isEmriId)) === 0) {
    const otekiCalisma = acik.isEmriId === null
      ? calismaDurumu(((await sorgular.sonOlaylariGetir(db, [oteki.id]))[0] ?? null)?.olay ?? null)
      : calismaDurumu((await sorgular.adimSonOlayi(db, oteki.id, acik.isEmriId))?.olay ?? null);
    if (oteki.durum === 'basladi' && otekiCalisma === 'calisiyor') {
      await sorgular.olayEkle(db, oteki.id, kisiId, oteki.istasyonId ?? istasyonId, 'duraklat', null, an, acik.isEmriId);
      await sorgular.emrinKatilimlariniKapat(db, oteki.id, an, acik.isEmriId);
    }
  }
  const makineler = acik.makineId === null ? [] : [acik.makineId];
  return baslatilacak ? emirBaslat(db, kisiId, id, makineler, isEmriId) : emirDevam(db, kisiId, id, makineler, isEmriId);
}

// Sıra zorunlu değildir, işaret geri alınabilir, adımlar bitirmeyi engellemez. Aynı duruma yeniden ayarlama olay yazmaz.
export async function adimTamamla(db: Db, kisiId: number, emirId: number, adimId: number, tamam: boolean): Promise<AdimCevabi> {
  const emir = await kilitliEmir(db, emirId);
  await kapsaminda(db, kisiId, istasyonu(emir));
  if (!(await sorgular.adimEmirdeVarMi(db, emirId, adimId))) throw bulunamadi(ADIM_YOK);
  const ihlal = adimIhlali(emir.durum);
  if (ihlal !== null) throw cakisma(ihlal);
  const suAn = (await sorgular.adimlariGetir(db, emirId)).find((a) => a.id === adimId);
  if (suAn !== undefined && adimDegisiyorMu(suAn.tamam, tamam)) {
    await sorgular.adimOlayiEkle(db, adimId, kisiId, tamam ? 'tamamla' : 'geri-al', await sorgular.anAl(db));
  }
  return { emir: (await emirdenCevap(db, emirId)).emir, adimlar: await adimlariCevir(db, emirId) };
}

export async function anaSayfaOzeti(db: Db, kisiId: number, listeyiOkur: boolean): Promise<OzetCevabi> {
  const s = await sorgular.ozetGetir(db, kisiId);
  return {
    planlanacak: listeyiOkur ? s.planlanacak : null, acik: listeyiOkur ? s.acik : null, kuyrugum: s.kuyrugum, bugunSaglam: s.bugunSaglam,
    asamalar: listeyiOkur ? {
      planlanacak: s.planlanacak, planda: s.planda, uretimde: s.uretimde, duraklatilmis: s.duraklatilmis, kaliteBekleyen: null, buHaftaBiten: s.buHaftaBiten,
    } : null,
  };
}

export async function gunlukUretim(db: Db, gun: number): Promise<GunlukUretimCevabi> {
  return { gunler: await sorgular.gunlukUretimGetir(db, gun) };
}

// Silinmiş neden olmaz (yabancı anahtar); pasif nedenler de ad için okunur.
export async function durusDagilimi(db: Db, gun: number): Promise<DurusDagilimiCevabi> {
  const satirlar = await sorgular.durusSureleriGetir(db, gun);
  const adlar = new Map((await durusNedenleriniListele(db, { yalnizAktif: false })).map((n) => [n.id, n.ad]));
  return {
    nedenler: satirlar
      .map((r) => ({ neden: { id: r.nedenId, ad: adlar.get(r.nedenId) ?? `#${r.nedenId}` }, adet: r.adet, dakika: Number(r.dakika) }))
      .sort((a, b) => b.dakika - a.dakika),
  };
}

/* ---------------- aynı işe çok kişi katılımı (kart #1144) ---------------- */

async function katilimlariCevir(db: Db, emirId: number, uyari: string | null = null): Promise<KatilimCevabi> {
  const satirlar = await sorgular.katilimlarGetir(db, emirId);
  const adlar = (await adlariAl(db)).kisi;
  return { katilimlar: satirlar.map(({ kisiId, ...k }) => ({ ...k, kisi: adli(adlar, kisiId, 'Kişi') })), uyari };
}

export async function katilimlar(db: Db, emirId: number): Promise<KatilimCevabi> {
  if ((await sorgular.emirBul(db, emirId)) === null) throw bulunamadi(EMIR_YOK);
  return katilimlariCevir(db, emirId);
}

// İstasyonun (aktif) ekiplerinin bugünkü üyeleri katılır; işi başlatan ekip denetimine girmez (başlatma kuralı değişmedi).
async function istasyonEkibinde(db: Db, istasyonId: number, kisiId: number): Promise<boolean> {
  for (const ekip of (await ekipler(db)).filter((e) => e.istasyonId === istasyonId)) {
    if ((await ekipUyeleri(db, ekip.id)).some((u) => u.kisiId === kisiId)) return true;
  }
  return false;
}

// Kişi çalışan işe katılır ya da duraklattığı çalışmasına döner. Başka çalışan varsa uyarı döner, reddedilmez.
// Katılım adım başınadır (648 a): kişi aynı emrin iki adımında aynı anda olabilir, aynı adımda bir kez.
export async function katil(db: Db, kisiId: number, id: number, isEmriId?: number): Promise<KatilimCevabi> {
  const { emir, adim, istasyonId, calisma } = await komutBaglami(db, kisiId, id, isEmriId);
  const son = await sorgular.sonKatilim(db, id, kisiId, adim?.id ?? null);
  // Kendi duraklattığı çalışmasına dönen kişi zaten bu işteydi (işi başlatan ekip denetimine girmez): ekip yalnız yeni katılımda aranır.
  const donus = son !== null && son.kapanis === 'duraklat';
  if (!donus && !(await istasyonEkibinde(db, istasyonId, kisiId))) throw yetkiYok(EKIP_DISI);
  const ihlal = katilmaIhlali(emir.durum, calisma, son !== null && son.cikis === null);
  if (ihlal !== null) throw cakisma(ihlal);
  try {
    await sorgular.katilimAc(db, id, adim?.id ?? null, kisiId, istasyonId, await komutAni(db, id));
  } catch (hata) {
    const kisit = kisitIhlali(hata)?.iz.kisit;
    if (kisit === KATILIM_TEK_ACIK || kisit === KATILIM_TEK_ACIK_IS_EMIRSIZ) throw cakisma(KATILIM_ACIK);
    throw hata;
  }
  const adlar = (await adlariAl(db)).kisi;
  const digerleri = (await sorgular.katilimlarGetir(db, id))
    .filter((k) => k.cikis === null && k.kisiId !== kisiId && (adim === null || k.isEmriId === adim.id)).map((k) => adlar.get(k.kisiId) ?? `#${k.kisiId}`);
  return katilimlariCevir(db, id, katilimUyarisi([...new Set(digerleri)]));
}

// Kişi yalnız kendi açık çalışmasını duraklatır; işin kendisi ve öteki katılımcılar sürer.
export async function katilimDuraklat(db: Db, kisiId: number, id: number, isEmriId?: number): Promise<KatilimCevabi> {
  const { adim } = await komutBaglami(db, kisiId, id, isEmriId);
  const son = await sorgular.sonKatilim(db, id, kisiId, adim?.id ?? null);
  if (son === null || son.cikis !== null) throw cakisma(KATILIM_YOK);
  await sorgular.katilimKapat(db, son.id, 'duraklat', await komutAni(db, id));
  return katilimlariCevir(db, id);
}

// Kişi işten ayrılır: açık çalışması kapanır, duraklattığı çalışması ayrılmış sayılır. İş öteki katılımcılarla sürer.
export async function katilimAyril(db: Db, kisiId: number, id: number, isEmriId?: number): Promise<KatilimCevabi> {
  const { adim } = await komutBaglami(db, kisiId, id, isEmriId);
  const son = await sorgular.sonKatilim(db, id, kisiId, adim?.id ?? null);
  if (son === null || son.kapanis === 'ayril' || son.kapanis === 'emir') throw cakisma(KATILIM_YOK);
  if (son.cikis === null) await sorgular.katilimKapat(db, son.id, 'ayril', await komutAni(db, id));
  else await sorgular.katilimAyrildi(db, son.id);
  return katilimlariCevir(db, id);
}

// 647 a: adımın sayım aşımı izi (kim, kaç, hangi adım, o anki önceki adım sağlamı). İş emri başka emrin ise bulunamadı sayılır.
export async function asimlar(db: Db, emirId: number, isEmriId: number): Promise<AsimlarCevabi> {
  const isEmri = await sorgular.isEmriBul(db, isEmriId);
  if (isEmri === null || isEmri.uretimEmriId !== emirId) throw bulunamadi(IS_EMRI_YOK);
  const adlar = (await adlariAl(db)).kisi;
  return { asimlar: (await sorgular.asimlarGetir(db, emirId, isEmriId)).map(({ kisiId, ...a }) => ({ ...a, kisi: adli(adlar, kisiId, 'Kişi') })) };
}

// Makine adı istasyonlar modülünden; pasif makine de adıyla gelir. Akış kısa olduğu için ayrı makine sayısı azdır.
export async function sonOlaylar(db: Db, sonra: string | null, sayi: number): Promise<SonOlaylarCevabi> {
  const satirlar = await sorgular.sonOlaylarGetir(db, sonra, sayi);
  if (satirlar.length === 0) return { olaylar: [] };
  const adlar = await adlariAl(db);
  const makineIdleri = [...new Set(satirlar.flatMap((r) => (r.makineId === null ? [] : [r.makineId])))];
  const makineler = new Map<number, string>();
  for (const id of makineIdleri) {
    const m = await makineGetir(db, id);
    if (m !== null) makineler.set(m.id, m.ad);
  }
  const nedenler = satirlar.some((r) => r.durusNedeniId !== null)
    ? new Map((await durusNedenleriniListele(db, { yalnizAktif: false })).map((n) => [n.id, n.ad]))
    : new Map<number, string>();
  return {
    olaylar: satirlar.map((r) => ({
      id: r.id,
      olay: r.olay,
      emir: { id: r.emirId, emirNo: r.emirNo, parcaNo: r.parcaNo },
      isEmri: r.isEmriId === null || r.opNo === null || r.isEmriAd === null ? null : { id: r.isEmriId, opNo: r.opNo, ad: r.isEmriAd },
      makine: r.makineId === null ? null : adli(makineler, r.makineId, 'Makine'),
      istasyon: adli(adlar.istasyon, r.istasyonId, 'İstasyon'),
      kisi: adli(adlar.kisi, r.kisiId, 'Kişi'),
      adet: r.adet,
      durusNedeni: r.durusNedeniId === null ? null : adli(nedenler, r.durusNedeniId, 'Duruş nedeni'),
      ...(r.olay === 'kalite_onay' || r.olay === 'kalite_red'
        ? { kararVeren: r.kararVerenId === null ? null : adli(adlar.kisi, r.kararVerenId, 'Kişi') }
        : {}),
      zaman: r.zaman,
    })),
  };
}
