import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi, bulunamadi, cokIstek, eskiSurum, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { agAraliklariniCoz } from '#paylasilan/ag-araligi.ts';
import type {
  AcilDurumCevabi, BenimZiyaretcim, EvSahipleriCevabi, GecmisCevabi, KapiCevabi, Kart, KartlarCevabi, OnerilerCevabi, PdksAktarCevabi, PdksCihaz, PdksCihazAnahtarCevabi,
  PdksCihazHareketiCevabi, PdksCihazlarCevabi, PdksPersonel, PersonelKart, PersonelKartlariCevabi,
  Ziyaret, ZiyaretcilerimCevabi,
} from '#paylasilan/sozlesme/nizamiye.ts';
import type { z } from 'zod';
import type {
  cikisGovdesi, girisGovdesi, habersizGovdesi, kartBildirGovdesi, kartEkleGovdesi, onKayitGovdesi, pdksAktarGovdesi, pdksCihazDurumGovdesi,
  pdksCihazEkleGovdesi, pdksCihazHareketiGovdesi, personelKartEkleGovdesi,
} from '#paylasilan/sozlesme/nizamiye.ts';
import { numaraAl, sistemAyariOku } from '../ayarlar/disari.ts';
import { kisiAdlari, kisiSecenekleri } from '../kisiler/disari.ts';
import {
  cikisHatasi, geriAlma, girisHatasi, iptalHatasi, kartBildirHatasi, kartVerilemezse, kapidanGec, kimlikDogru, kimlikHatasi, onKayitZamaniHatasi, pdksCihazGovdesiniCoz,
  pdksDosyasiniCoz, pdksIcerideMi, personelKartNoDuzelt, personelKartOzeti, rafaAlmaHatasi, type KapiDurumu, type PdksSatiri,
} from './kurallar.ts';
import { anahtarDogruMu, anahtarOzeti, anahtarUret } from './anahtar.ts';
import { adresiSadelestir, cihazAgiOku, cihazAginda, hamSaklamaGunuOku, kurumIciAralikMi } from './ag.ts';
import * as sorgu from './sorgular.ts';
import type { KartSatiri, ZiyaretSatiri } from './sorgular.ts';

type Govde<S extends z.ZodTypeAny> = z.output<S>;

const ZIYARET_YOK = 'Ziyaret bulunamadı.';
const KART_YOK = 'Kart bulunamadı.';
const KART_KISITLARI = {
  nizamiye_kart_no_benzersiz: { ileti: 'Bu kart numarası rafta zaten var.', alan: 'kartNo' },
  nizamiye_ziyaret_kart_icerde: { ileti: 'Bu kart içerideki başka bir ziyaretçide.', alan: 'kartId' },
  nizamiye_ziyaret_ev_sahibi: { ileti: 'Ziyaret edilecek kişi bulunamadı.', alan: 'evSahibiKisiId' },
  nizamiye_ziyaret_kimlik_butun: { ileti: 'Kimlik hanesi yazıldıysa kimlik türü de seçilmeli.', alan: 'kimlikTuru' },
  nizamiye_ziyaret_kart: { ileti: 'Kart bulunamadı.', alan: 'kartId' },
} as const;

async function adlarlaDoldur(db: Db, satirlar: ZiyaretSatiri[]): Promise<Ziyaret[]> {
  const adlar = await kisiAdlari(db, satirlar.flatMap((s) => [s.evSahibiKisiId, s.girenKisiId ?? 0, s.cikaranKisiId ?? 0]).filter((id) => id > 0));
  return satirlar.map(({ girenKisiId, cikaranKisiId, ...s }) => ({
    ...s,
    evSahibiAd: adlar.get(s.evSahibiKisiId) ?? null,
    girenAd: girenKisiId === null ? null : (adlar.get(girenKisiId) ?? null),
    cikaranAd: cikaranKisiId === null ? null : (adlar.get(cikaranKisiId) ?? null),
  }));
}

async function ziyaretCevabi(db: Db, id: number): Promise<Ziyaret> {
  const satir = await sorgu.ziyaretOku(db, id);
  if (satir === null) throw bulunamadi(ZIYARET_YOK);
  return (await adlarlaDoldur(db, [satir]))[0]!;
}

async function kilitliZiyaret(db: Db, id: number, surum: number): Promise<ZiyaretSatiri> {
  const z = await sorgu.ziyaretKilitle(db, id);
  if (z === null) throw bulunamadi(ZIYARET_YOK);
  if (z.surum !== surum) throw eskiSurum();
  return z;
}

const ms = (zaman: string | null): number | null => (zaman === null ? null : Date.parse(zaman));
// Kullanıcının yazdığı metin LIKE deseni olarak değil, düz metin olarak aranır.
const desenKacir = (metin: string): string => metin.replace(/[\\%_]/g, (h) => `\\${h}`);

function kartGorunumu(k: KartSatiri): Kart {
  return {
    id: k.id, kartNo: k.kartNo, tur: k.tur, izinliBolge: k.izinliBolge, durumNotu: k.durumNotu, surum: k.surum,
    durum: k.ziyaretId !== null ? 'kullanimda' : k.kayitDurumu,
    ziyaret: k.ziyaretId === null ? null : { id: k.ziyaretId, ziyaretNo: k.ziyaretNo!, ad: k.ziyaretAd, giris: k.ziyaretGiris! },
  };
}

async function kartiVer(db: Db, kartId: number): Promise<void> {
  const kart = await sorgu.kartKilitle(db, kartId);
  const hata = kartVerilemezse(kart === null ? null : { durum: kart.kayitDurumu, icerideMi: kart.ziyaretId !== null });
  if (hata !== null) throw gecersiz(hata);
}

async function ziyaretNoAl(db: Db): Promise<string> {
  return numaraAl(db, 'nizamiye.ziyaret-no', { varMi: (no) => sorgu.ziyaretNoVarMi(db, no) });
}

export async function kapi(db: Db): Promise<KapiCevabi> {
  return {
    simdi: await sorgu.simdi(db),
    beklenen: await adlarlaDoldur(db, await sorgu.beklenenleriOku(db)),
    iceride: await adlarlaDoldur(db, await sorgu.icerdekileriOku(db)),
    bosKartlar: await sorgu.bosKartlariOku(db),
  };
}

export async function gecmis(db: Db, istek: { gun?: string | undefined; ara?: string | undefined }): Promise<GecmisCevabi> {
  const gun = istek.gun ?? (await sorgu.bugun(db));
  const ara = istek.ara === undefined || istek.ara === '' ? null : desenKacir(istek.ara);
  return { gun, ziyaretler: await adlarlaDoldur(db, await sorgu.gunKayitlariniOku(db, gun, ara)) };
}

export async function acilDurum(db: Db, kullanici: Kullanici): Promise<AcilDurumCevabi> {
  const zaman = await sorgu.simdi(db);
  return {
    zaman, yazdiran: kullanici.ad, ziyaretler: await adlarlaDoldur(db, await sorgu.icerdekileriOku(db)),
    personel: await icerdekiPersonel(db, Date.parse(zaman)), pdksSonAktarim: await sorgu.pdksSonAktarim(db),
  };
}

// Pasif kişi listeye girmez: işten ayrılanın son girişi onu içeride göstermemeli.
async function icerdekiPersonel(db: Db, simdi: number): Promise<PdksPersonel[]> {
  const icerde = (await sorgu.pdksSonHareketler(db)).filter((h) => pdksIcerideMi({ yon: h.yon, zaman: Date.parse(h.zaman) }, simdi));
  const kisiler = new Map((await kisiSecenekleri(db)).map((k) => [k.id, k]));
  return icerde.flatMap((h) => {
    const k = kisiler.get(h.kisiId);
    return k ? [{ kisiId: k.id, ad: k.ad, sicilNo: k.sicilNo, giris: h.zaman }] : [];
  }).sort((a, b) => a.ad.localeCompare(b.ad, 'tr') || a.kisiId - b.kisiId);
}

// 243 a: sicil no etkin kişiyle eşleşir; eşleşmeyen ve okunamayan satır raporlanır, kalan satırlar yine alınır.
// Dosya aktarımı ve kart okuyucu aynı eşleştirmeyi kullanır: sicil no kişiye çevrilir, eşleşmeyen sicil ayrı sayılır.
async function sicilleEslestir(db: Db, satirlar: readonly PdksSatiri[]) {
  const sicil = new Map((await kisiSecenekleri(db)).flatMap((k) => (k.sicilNo === null ? [] : [[k.sicilNo, k.id] as const])));
  const eslesmeyen = new Set<string>();
  const hareketler = satirlar.flatMap((s) => {
    const kisiId = sicil.get(s.sicilNo);
    if (kisiId === undefined) { eslesmeyen.add(s.sicilNo); return []; }
    return [{ kisiId, zaman: new Date(s.zaman).toISOString(), yon: s.yon }];
  });
  return { hareketler, eslesmeyen };
}

export async function pdksAktar(db: Db, kullanici: Kullanici, g: Govde<typeof pdksAktarGovdesi>): Promise<PdksAktarCevabi> {
  const { satirlar, hatalar } = pdksDosyasiniCoz(g.metin, Date.parse(await sorgu.simdi(db)));
  if (satirlar.length === 0) throw gecersiz(hatalar.length > 0 ? `Dosyada okunur satır yok (ilk hata satır ${String(hatalar[0]!.satirNo)}: ${hatalar[0]!.neden})` : 'Dosyada satır yok.');
  const { hareketler, eslesmeyen } = await sicilleEslestir(db, satirlar);
  const yeni = await sorgu.pdksAktarimYaz(db, {
    dosyaAdi: g.dosyaAdi, aktaranKisiId: kullanici.id, satirSayisi: satirlar.length + hatalar.length, eslesmeyen: satirlar.length - hareketler.length,
  }, hareketler);
  return {
    satirSayisi: satirlar.length + hatalar.length, yeniHareket: yeni, zatenVardi: hareketler.length - yeni,
    eslesmeyenSicil: [...eslesmeyen].sort().slice(0, 50), hatalar: hatalar.slice(0, 50),
  };
}

// Yanlış yazılmış ağ ya da saklama değişkeni sunucuyu açılışta durdurur; istek anında yine okunur (testler ortamı değiştirir).
cihazAgiOku(process.env);
hamSaklamaGunuOku(process.env);

const cihazSemasi = (c: sorgu.PdksCihazSatiri): PdksCihaz => c;

export async function pdksCihazlari(db: Db): Promise<PdksCihazlarCevabi> {
  return { cihazlar: (await sorgu.pdksCihazlari(db)).map(cihazSemasi) };
}

const CIHAZ_YOK = 'Kart okuyucu bulunamadı.';
const CIHAZ_KISITLARI = {
  nizamiye_pdks_cihaz_ip_tek: { ileti: 'Bu adreste kayıtlı bir kart okuyucu zaten var.', alan: 'ip' },
} as const;

export async function pdksCihazEkle(db: Db, kullanici: Kullanici, g: Govde<typeof pdksCihazEkleGovdesi>): Promise<PdksCihazAnahtarCevabi> {
  const ip = adresiSadelestir(g.ip);
  const aralik = agAraliklariniCoz(ip).araliklar[0];
  if (aralik === undefined || !kurumIciAralikMi(aralik)) throw gecersiz('Kart okuyucu kurum içi bir adreste olmalı.');
  const anahtar = anahtarUret();
  const ozet = await anahtarOzeti(anahtar);
  const id = await kisitKorumali(CIHAZ_KISITLARI, () => sorgu.pdksCihazEkle(db, { ad: g.ad, ip, ozet, kisiId: kullanici.id }));
  return { cihaz: cihazSemasi((await sorgu.pdksCihazi(db, id))!), anahtar };
}

export async function pdksCihazAnahtarYenile(db: Db, id: number, surum: number): Promise<PdksCihazAnahtarCevabi> {
  if ((await sorgu.pdksCihazi(db, id)) === null) throw bulunamadi(CIHAZ_YOK);
  const anahtar = anahtarUret();
  if (!(await sorgu.pdksCihazAnahtarYaz(db, id, surum, await anahtarOzeti(anahtar)))) throw eskiSurum();
  return { cihaz: cihazSemasi((await sorgu.pdksCihazi(db, id))!), anahtar };
}

export async function pdksCihazDurum(db: Db, id: number, g: Govde<typeof pdksCihazDurumGovdesi>): Promise<PdksCihaz> {
  if ((await sorgu.pdksCihazi(db, id)) === null) throw bulunamadi(CIHAZ_YOK);
  if (!(await sorgu.pdksCihazDurumYaz(db, id, g.surum, g.aktif))) throw eskiSurum();
  return cihazSemasi((await sorgu.pdksCihazi(db, id))!);
}

// Adres başına kapı durumu bellekte (ADR 0016): yalnız cihaz ağından gelen adresler tutulur, liste sınırlıdır; sunucu yeniden açılınca
// sıfırlanır. Kimliği doğrulanamayan istek veritabanına yazılmaz.
const KAPI_EN_COK_ADRES = 10_000;
const kapilar = new Map<string, KapiDurumu>();
const kapiYaz = (ip: string, d: KapiDurumu): void => {
  kapilar.delete(ip);
  if (kapilar.size >= KAPI_EN_COK_ADRES) kapilar.delete(kapilar.keys().next().value!);
  kapilar.set(ip, d);
};
export const pdksKapilariniSifirla = (): void => { kapilar.clear(); };

// Ret iletisi nedeni söylemez: kayıtsız adres, yanlış anahtar ve etkin olmayan cihaz aynı görünür.
const KIMLIK_REDDI = 'Kart okuyucu tanınmadı.';

export async function pdksCihazHareketi(db: Db, ipHam: string, g: Govde<typeof pdksCihazHareketiGovdesi>): Promise<PdksCihazHareketiCevabi> {
  if (!(await sistemAyariOku(db, 'nizamiye.pdks-cihaz-girisi'))) throw bulunamadi('Kart okuyucu girişi kapalı.');
  const ip = adresiSadelestir(ipHam);
  if (!cihazAginda(cihazAgiOku(process.env), ip)) throw yetkiYok(KIMLIK_REDDI);
  const simdi = Date.now();
  const gecis = kapidanGec(kapilar.get(ip), simdi);
  kapiYaz(ip, gecis.durum);
  if (!gecis.izin) throw cokIstek('Çok sık istek; biraz sonra yeniden gönderin.');
  const cihaz = await sorgu.pdksEtkinCihaz(db, ip);
  if (!(await anahtarDogruMu(g.anahtar, cihaz?.ozet ?? null)) || cihaz === null) {
    kapiYaz(ip, kimlikHatasi(gecis.durum, simdi));
    throw yetkiYok(KIMLIK_REDDI);
  }
  kapiYaz(ip, kimlikDogru(gecis.durum));
  const { satirlar, hatalar } = pdksCihazGovdesiniCoz(g.ham, Date.parse(await sorgu.simdi(db)));
  const { hareketler, eslesmeyen } = await sicilleEslestir(db, satirlar);
  const yeni = await sorgu.pdksGonderimYaz(db, {
    cihazId: cihaz.id, ip, govde: g.ham, satirSayisi: satirlar.length + hatalar.length, eslesmeyen: satirlar.length - hareketler.length,
    hatali: hatalar.length,
  }, hareketler);
  return {
    satirSayisi: satirlar.length + hatalar.length, yeniHareket: yeni, zatenVardi: hareketler.length - yeni,
    eslesmeyen: eslesmeyen.size, hatali: hatalar.length,
  };
}

export async function pdksHamTemizle(db: Db): Promise<void> {
  await sorgu.pdksHamTemizle(db, hamSaklamaGunuOku(process.env));
}

export async function evSahipleri(db: Db): Promise<EvSahipleriCevabi> {
  const sayilar = new Map((await sorgu.evSahibiSayilari(db)).map((s) => [s.kisiId, s.sayi]));
  const kisiler = (await kisiSecenekleri(db)).map((k) => ({ id: k.id, ad: k.ad, ziyaretSayisi: sayilar.get(k.id) ?? 0 }));
  return { kisiler: kisiler.sort((a, b) => b.ziyaretSayisi - a.ziyaretSayisi || a.ad.localeCompare(b.ad, 'tr') || a.id - b.id) };
}

export async function oneriler(db: Db, ara: string): Promise<OnerilerCevabi> {
  return { oneriler: await sorgu.oncekiZiyaretler(db, desenKacir(ara)) };
}

export async function menuSayaclari(db: Db): Promise<Record<string, number | null>> {
  const s = await sorgu.menuSayilari(db);
  return { kapi: s.iceride, kartlar: s.sorunluKart };
}

// İdari İşler yemek hesabı için: tarih tesis günüdür (YYYY-AA-GG); o gün beklenen ya da giren, yemeğe kalacak işaretli ziyaretçi.
export function yemegeKalanZiyaretci(db: Db, tarih: string): Promise<number> {
  return sorgu.yemegeKalanSayisi(db, tarih);
}

// Ev sahibi kendi adına açar (217 a); kişi oturumdan gelir, gövdede ev sahibi yoktur.
export async function onKayitAc(db: Db, kullanici: Kullanici, g: Govde<typeof onKayitGovdesi>): Promise<BenimZiyaretcim> {
  const hata = onKayitZamaniHatasi(Date.parse(g.beklenenZaman), Date.parse(await sorgu.simdi(db)));
  if (hata !== null) throw gecersiz(hata);
  const id = await sorgu.ziyaretEkle(db, {
    ziyaretNo: await ziyaretNoAl(db), ad: g.ad, firmaAdi: g.firmaAdi, telefon: g.telefon, neden: g.neden, aciklama: g.aciklama,
    plaka: null, evSahibiKisiId: kullanici.id, beklenenZaman: g.beklenenZaman, ogleYemegi: g.ogleYemegi, olusturanKisiId: kullanici.id,
  });
  return benimGorunum((await sorgu.ziyaretOku(db, id))!);
}

function benimGorunum(z: ZiyaretSatiri): BenimZiyaretcim {
  return {
    id: z.id, ziyaretNo: z.ziyaretNo, ad: z.ad, firmaAdi: z.firmaAdi, neden: z.neden, aciklama: z.aciklama, beklenenZaman: z.beklenenZaman,
    ogleYemegi: z.ogleYemegi, durum: z.durum, giris: z.giris, cikis: z.cikis, kartNo: z.kartNo, surum: z.surum,
  };
}

export async function ziyaretcilerim(db: Db, kullanici: Kullanici): Promise<ZiyaretcilerimCevabi> {
  return { ziyaretler: (await sorgu.evSahibininZiyaretleri(db, kullanici.id)).map(benimGorunum) };
}

// Ev sahibi yalnız kendi ziyaretçisini iptal eder (NZ-08); başkasının kaydı yokmuş gibi 404 döner, varlığı sızmaz.
export async function kendiZiyaretiniIptalEt(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<BenimZiyaretcim> {
  const z = await sorgu.ziyaretKilitle(db, id);
  if (z === null || z.evSahibiKisiId !== kullanici.id) throw bulunamadi(ZIYARET_YOK);
  if (z.surum !== surum) throw eskiSurum();
  const hata = iptalHatasi(z.durum);
  if (hata !== null) throw gecersiz(hata);
  await sorgu.iptalYaz(db, id, kullanici.id);
  return benimGorunum((await sorgu.ziyaretOku(db, id))!);
}

export async function girisYap(db: Db, kullanici: Kullanici, id: number, g: Govde<typeof girisGovdesi>): Promise<Ziyaret> {
  const z = await kilitliZiyaret(db, id, g.surum);
  const hata = girisHatasi({ durum: z.durum, neden: z.neden, kimlikGoruldu: g.kimlikGoruldu, atolye: g.atolye });
  if (hata !== null) throw gecersiz(hata);
  await kartiVer(db, g.kartId);
  await kisitKorumali(KART_KISITLARI, () => sorgu.girisYaz(db, id, { ...g, girenKisiId: kullanici.id }));
  return ziyaretCevabi(db, id);
}

export async function habersizGiris(db: Db, kullanici: Kullanici, g: Govde<typeof habersizGovdesi>): Promise<Ziyaret> {
  const hata = girisHatasi({ durum: 'beklenen', neden: g.neden, kimlikGoruldu: g.kimlikGoruldu, atolye: g.atolye });
  if (hata !== null) throw gecersiz(hata);
  if (!(await kisiSecenekleri(db)).some((k) => k.id === g.evSahibiKisiId)) throw gecersiz('Ziyaret edilecek kişi bulunamadı ya da pasif.');
  await kartiVer(db, g.kartId);
  const ziyaretNo = await ziyaretNoAl(db);
  const id = await kisitKorumali(KART_KISITLARI, () => sorgu.habersizEkle(db, {
    ziyaretNo, ad: g.ad, firmaAdi: g.firmaAdi, telefon: g.telefon, neden: g.neden, aciklama: g.aciklama, plaka: g.plaka,
    evSahibiKisiId: g.evSahibiKisiId, beklenenZaman: null, ogleYemegi: g.ogleYemegi, olusturanKisiId: kullanici.id,
  }, { ...g, girenKisiId: kullanici.id }));
  return ziyaretCevabi(db, id);
}

export async function cikisYap(db: Db, kullanici: Kullanici, id: number, g: Govde<typeof cikisGovdesi>): Promise<Ziyaret> {
  const z = await kilitliZiyaret(db, id, g.surum);
  const hata = cikisHatasi({ durum: z.durum, dizustu: z.dizustu, ekipmanKontrol: g.ekipmanKontrol });
  if (hata !== null) throw gecersiz(hata);
  await sorgu.cikisYaz(db, id, { kartTeslim: g.kartTeslim, ekipmanKontrol: g.ekipmanKontrol, cikaranKisiId: kullanici.id });
  // Geri alınmayan kart rafta yoktur: kayıp sayılır, idari işler bulunca rafa alır.
  if (!g.kartTeslim && z.kartId !== null) await sorgu.kartDurumuYaz(db, z.kartId, 'kayip', `${z.ziyaretNo} çıkışında teslim edilmedi.`);
  return ziyaretCevabi(db, id);
}

export async function iptalEt(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<Ziyaret> {
  const z = await kilitliZiyaret(db, id, surum);
  const hata = iptalHatasi(z.durum);
  if (hata !== null) throw gecersiz(hata);
  await sorgu.iptalYaz(db, id, kullanici.id);
  return ziyaretCevabi(db, id);
}

export async function geriAl(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<Ziyaret> {
  const z = await kilitliZiyaret(db, id, surum);
  const sonuc = geriAlma(
    { durum: z.durum, giris: ms(z.giris), cikis: ms(z.cikis), beklenenZaman: ms(z.beklenenZaman) },
    Date.parse(await sorgu.simdi(db)),
  );
  if ('hata' in sonuc) throw gecersiz(sonuc.hata);
  if (sonuc.tur === 'cikis') {
    // Çıkışta teslim edilmeyip kayıp sayılan kart, çıkış geri alınınca yine ziyaretçidedir.
    if (z.kartTeslim === false && z.kartId !== null) await sorgu.kartDurumuYaz(db, z.kartId, 'bos', null);
    await kisitKorumali(KART_KISITLARI, () => sorgu.cikisiGeriAl(db, id));
  } else if (sonuc.habersiz) {
    await sorgu.habersizGirisiIptalEt(db, id, kullanici.id);
  } else {
    await sorgu.girisiGeriAl(db, id);
  }
  return ziyaretCevabi(db, id);
}

export async function kartlar(db: Db): Promise<KartlarCevabi> {
  return { kartlar: (await sorgu.kartlariOku(db)).map(kartGorunumu) };
}

async function kartCevabi(db: Db, id: number): Promise<Kart> {
  const kart = await sorgu.kartKilitle(db, id);
  if (kart === null) throw bulunamadi(KART_YOK);
  return kartGorunumu(kart);
}

async function kilitliKart(db: Db, id: number, surum: number): Promise<KartSatiri> {
  const kart = await sorgu.kartKilitle(db, id);
  if (kart === null) throw bulunamadi(KART_YOK);
  if (kart.surum !== surum) throw eskiSurum();
  return kart;
}

export async function kartEkle(db: Db, g: Govde<typeof kartEkleGovdesi>): Promise<Kart> {
  const id = await kisitKorumali(KART_KISITLARI, () => sorgu.kartEkle(db, g));
  return kartCevabi(db, id);
}

export async function kartBildir(db: Db, id: number, g: Govde<typeof kartBildirGovdesi>): Promise<Kart> {
  const kart = await kilitliKart(db, id, g.surum);
  const hata = kartBildirHatasi({ durum: kart.kayitDurumu, icerideMi: kart.ziyaretId !== null });
  if (hata !== null) throw gecersiz(hata);
  await sorgu.kartDurumuYaz(db, id, g.durum, g.not);
  return kartCevabi(db, id);
}

export async function rafaAl(db: Db, id: number, surum: number): Promise<Kart> {
  const kart = await kilitliKart(db, id, surum);
  const hata = rafaAlmaHatasi(kart.kayitDurumu);
  if (hata !== null) throw gecersiz(hata);
  await sorgu.kartDurumuYaz(db, id, 'bos', null);
  return kartCevabi(db, id);
}

/* ---------------- personel kartı (1326, karar 1327 a) ---------------- */

const PERSONEL_KART_YOK = 'Etkin personel kartı bulunamadı.';
const PERSONEL_KART_KISITLARI = {
  nizamiye_personel_kart_etkin_kart: { ileti: 'Bu kart başka bir kişiye kayıtlı; önce oradan kaldırın.', alan: 'kartNo' },
  nizamiye_personel_kart_etkin_kisi: { ileti: 'Kişinin kayıtlı bir kartı var; önce onu kaldırın.', alan: 'kisiId' },
  nizamiye_personel_kart_kisi: { ileti: 'Kişi bulunamadı.', alan: 'kisiId' },
} as const;

export async function personelKartlari(db: Db): Promise<PersonelKartlariCevabi> {
  const satirlar = await sorgu.personelKartlari(db);
  const etkin = await kisiSecenekleri(db);
  const bilinen = new Map(etkin.map((k) => [k.id, k]));
  // Pasife alınmış kişinin kartı da listede kalır ki kaldırılabilsin; adı ayrıca okunur.
  const adlar = await kisiAdlari(db, satirlar.filter((s) => !bilinen.has(s.kisiId)).map((s) => s.kisiId));
  const kartlar: PersonelKart[] = satirlar.map((s) => ({
    ...s, kisiAd: bilinen.get(s.kisiId)?.ad ?? adlar.get(s.kisiId) ?? null, sicilNo: bilinen.get(s.kisiId)?.sicilNo ?? null,
  }));
  const kartli = new Set(satirlar.map((s) => s.kisiId));
  return { kartlar, kisiler: etkin.filter((k) => !kartli.has(k.id)) };
}

export async function personelKartEkle(db: Db, kullanici: Kullanici, g: Govde<typeof personelKartEkleGovdesi>): Promise<PersonelKart> {
  const no = personelKartNoDuzelt(g.kartNo);
  if (no === null) throw new UygulamaHatasi('DOGRULAMA', 'Kart numarası okunamadı; kartı yeniden okutun.', { alan: 'kartNo' });
  if (!(await kisiSecenekleri(db)).some((k) => k.id === g.kisiId)) throw new UygulamaHatasi('DOGRULAMA', 'Kişi bulunamadı ya da etkin değil.', { alan: 'kisiId' });
  const id = await kisitKorumali(PERSONEL_KART_KISITLARI, () =>
    sorgu.personelKartEkle(db, { kisiId: g.kisiId, ozet: personelKartOzeti(no), son4: no.slice(-4), kaydeden: kullanici.id }));
  return personelKartCevabi(db, id);
}

async function personelKartCevabi(db: Db, id: number): Promise<PersonelKart> {
  const kart = (await personelKartlari(db)).kartlar.find((k) => k.id === id);
  if (kart === undefined) throw bulunamadi(PERSONEL_KART_YOK);
  return kart;
}

export async function personelKartKaldir(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<{ tamam: true }> {
  if ((await sorgu.personelKarti(db, id)) === null) throw bulunamadi(PERSONEL_KART_YOK);
  if (!(await sorgu.personelKartKapat(db, id, surum, kullanici.id))) throw eskiSurum();
  return { tamam: true };
}

// Okunan kartın etkin sahibi; biçimsiz ya da kayıtsız kart null. Kişinin etkinliğine ve PIN'ine çağıran bakar.
export async function personelKartSahibi(db: Db, kartNo: string): Promise<number | null> {
  const no = personelKartNoDuzelt(kartNo);
  return no === null ? null : sorgu.personelKartSahibi(db, personelKartOzeti(no));
}
