
import { randomUUID } from 'node:crypto';
import { kayitNoktasi } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { bagimliKayit, bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { firmaAra, firmaOzeti, tedarikciOlabilirMi } from '../musteri-tedarikci/disari.ts';
import { aletKimlikleri, aletNoIleGetir } from '../kalibrasyon/disari.ts';
import { aparatKapasiteleri, istasyonlar as istasyonListesi, makineGetir, makineler, operasyonTipleri } from '../istasyonlar/disari.ts';
import { OPERASYON_GRUP_ADLARI } from '#paylasilan/sozlesme/istasyonlar.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { KATALOG_TURLERI, LOGO_GECIS_SAYFA_BOYU, LOGO_TUR_KARSILIGI_TURLERI, LOGO_GELEN_SAYFA_BOYU, LOGO_KART_TURLERI, MALZEME_SECIM_SAYFA_BOYU } from '#paylasilan/sozlesme/malzemeler.ts';
import type {
  DemirbasMakineSecenekleriCevabi, DemirbasTeknikCevabi, demirbasTeknikKaydetGovdesi,
  HizmetYonu, LogoDurumuCevabi, LogoEksik, LogoKarsiligi,
  KatalogAyarlariCevabi, KatalogKartiKaydetCevabi, MalzemelerOzetiCevabi, KatalogKartlariCevabi, KatalogMalzemeOzeti, KatalogSablonlariCevabi, KatalogTuru, MalzemeSecimCevabi,
  OlcuAletiSecenekleriCevabi, OlcuBirimleriCevabi, katalogKartiKaydetGovdesi, KatalogKartiRotasiCevabi,
  LogoGecisCevabi, logoGecisSorgusu, LogoGelenCevabi, LogoGeriAlCevabi, logoTopluAlGovdesi, logoTopluBaglaGovdesi, LogoTopluCevabi, LogodanAlCevabi, LogoYeniKodCevabi, logodanAlGovdesi, logoGelenSorgusu,
  ArsivKarti, ArsivKartiCevabi, ArsivKartlariCevabi, KatalogKartiIptalCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { z } from 'zod';
import { bildirimGonder, bildirimKapat } from '../bildirim/disari.ts';
import { kisiAdlari, kisiBayrakliMi } from '../kisiler/disari.ts';
import {
  katalogAnahtarCakismalari, katalogAnahtarZorunluMu, katalogOnayEksigi, katalogCakismaAlanlari, katalogKuralAnahtari, katalogKurallariGecerliMi, katalogYeniAnahtar, katalogGecisiDenetle, katalogGecmisiDenetle, katalogGecmisiniBas, katalogIcerigiDegistiMi, katalogSilinirMi,
  katalogIptalYetkiliMi, katalogHicOnaylanmadiMi, katalogKodDegisebilirMi, katalogYeniOnek, katalogFirmaKodu, katalogFirmaKoduGecerliMi, katalogFirmaKoduTurleriGecerliMi, katalogKodOneki, katalogFirmaOneki, katalogOnayAkisiAcikMi, katalogStokKodu,
  katalogAgirlikAlanlari, katalogGkkAyari, katalogNetAgirlikKg, katalogOnayiBas, katalogOnekiTureUyarMi, katalogRolu, katalogSurumUyarMi, katalogTalebiBas, katalogTalepBicimiGecerliMi, katalogTalepYokMu,
  katalogTalepDenetle, katalogTalepUygulamaDenetle, katalogKaydiAlanlari, ayarBirimleri, ayarKaliteYogunluklari, ayarKategorileri, kartBilesenKimlikleri, kartOperasyonlari, kartRotaIcerigiDegistiMi, ROTALI_KART_ILETISI, hammaddeOlcuHatasi, hammaddeTanimHatasi, kartZorunluAlanEksigi, katalogSunucuAnahtari, kartTedarikciFirmaId, katalogAciklamalari, kartBirimDonusumu, kartBirimDonusumleri, kartBirimi, kartTedarikciKimlikleri, tedarikciDegistiMi, kartAletNo, kartAletNolari, kartAletNoYaz, eskiKalibrasyonAlanlariniKoru, denetlenecekKategoriler, MUKERRER_GEREKCE_ILETISI, mukerrerGerekcesiKisaMi, logoAdiDegistiMi, logoBirimiDegistiMi, logoGuncellemeSonucuDurumu, logoKarsiligiHatasi, logoBirimSetiGecersizHatasi, logoDurumSirasi, logoEksikleri, logoHataMetni, ornekKartKimligi,
} from './kurallar.ts';
import type { BirimDonusumu, KimlikliKartOperasyonu, LogoGuncellemeSonucu, OrnekMalzemeAnahtari } from './kurallar.ts';
import { kartOperasyonKimlikleri, OPERASYON_AYARI_ILETISI } from './kurallar.ts';
import { demirbasTeknikYazilabilirMi, demirbasTeknikYazimi, tekrarlananOzellik } from './kurallar.ts';
import { katalogGeriCekildiMi, katalogKartAdi, kategoriAgaciKur, olcuListesi, olcuMetni } from './kurallar.ts';
import type { OlcuDegeri } from './kurallar.ts';
import type { KategoriAgaciDugumu, KategoriAgaciTuru } from '#paylasilan/sozlesme/kategori-agaci-sabitleri.ts';
import { arsivdenDonusDurumu, arsivIzAdetleri, arsivKaliciSilmeEngeli, type ArsivIzi } from './kurallar.ts';
import type { MalzemeKartiAnahtari, MalzemeKartiIzi } from '#paylasilan/malzeme-karti-izi.ts';
import { logoGecisAdayligi, logoGelenDurumu, logoKullanimEsigi, logoKullanimNedenleri, logoKartFarklari, logoKodBicimi, logoKoduTureUyar } from './kurallar.ts';
import * as s from './sorgular.ts';

// Dört göz ayarının tek kaynağı: Sistem Ayarları. Satır yokken ayar açıktır.
export function dortGozAcikMi(db: Db): Promise<boolean> {
  return sistemAyariOku(db, 'malzemeler.dort-goz');
}

/* ---------------- başka modüllere ---------------- */

// Stok, satın alma, rota gibi modüller kartı sayı kimliğiyle (`no`) gösterir; tablo okumazlar.
// `birim` kartta (`kayit.com.birim`) varsa değeri, yoksa null.
export function malzemeOzeti(db: Db, id: number): Promise<KatalogMalzemeOzeti | null> {
  return s.katalogMalzemeOzeti(db, id);
}

// Boş dizide sorgu atılmaz; yinelenen kimlik tek kayıt; olmayan kimlik haritada yok.
export async function malzemeOzetleri(db: Db, idler: number[]): Promise<Map<number, KatalogMalzemeOzeti>> {
  const benzersiz = [...new Set(idler)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await s.katalogMalzemeOzetleri(db, benzersiz)).map((o) => [o.id, o]));
}

// 1247 d: satın alma kabulünde lotu karantinaya alınacak kartlar (giriş kalite kontrolü). Boş dizide sorgu atılmaz; olmayan kart kümede yok.
export async function gkkGerekenKartlar(db: Db, idler: readonly number[]): Promise<ReadonlySet<number>> {
  const benzersiz = [...new Set(idler)];
  return new Set(benzersiz.length === 0 ? [] : await s.gkkGerekenKartlar(db, benzersiz));
}

// 2099-3 b: mal kabulde son kullanma tarihi istenecek kartlar. Boş dizide sorgu atılmaz; olmayan kart kümede yok.
export async function sktTakipliKartlar(db: Db, idler: readonly number[]): Promise<ReadonlySet<number>> {
  const benzersiz = [...new Set(idler)];
  return new Set(benzersiz.length === 0 ? [] : await s.sktTakipliKartlar(db, benzersiz));
}

// 2099-6 a: bir türün bir kategorisindeki kartlar (silinmiş hariç), no sırasıyla.
export function kategoriKartlari(db: Db, tur: KatalogTuru, kategori: string): Promise<number[]> {
  return s.kategoriKartlari(db, tur, kategori);
}

// 2099: kartın türe özel alan değerleri (anahtar ekranın alan kodu: `tur`, `marka`, `ambalaj`, `raf` ...). Değer biçimi ekranın yazdığıdır;
// metin dizisi dışındaki diziler ve nesneler atlanır. Olmayan kart ya da alanı olmayan kart haritada yok.
export type KartAlanDegeri = string | number | boolean | string[];
export async function kartAlanDegerleri(db: Db, idler: readonly number[]): Promise<Map<number, Record<string, KartAlanDegeri>>> {
  const benzersiz = [...new Set(idler)];
  if (benzersiz.length === 0) return new Map();
  const sonuc = new Map<number, Record<string, KartAlanDegeri>>();
  for (const r of await s.kartAlanSatirlari(db, benzersiz)) {
    const alanlar: Record<string, KartAlanDegeri> = {};
    for (const [k, v] of Object.entries(r.alanlar)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') alanlar[k] = v;
      else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) alanlar[k] = v;
    }
    sonuc.set(r.no, alanlar);
  }
  return sonuc;
}

// Satın almanın kg fiyatı için (19.10.2026): kartın kalitesi, ailesi, formu ve stok birimi. Olmayan kart haritada yok.
// birimKg (stok birimi başına kg), kaliteAdi ve formAdi hammaddede ekranın kayıtta yazdığı değerdir; ekran hesaplayamadıysa null, uydurulmaz.
// netKg yalnız mamul ve yarı mamulde, parçanın net ağırlığı: talaş = kütük ağırlığı - netKg (214 a).
export interface MalzemeMaliyetBilgisi {
  kaliteKodu: string | null; kaliteAdi: string | null; aile: string | null; form: string | null; formAdi: string | null;
  stokBirimi: string | null; birimKg: number | null; netKg: number | null;
}

export async function malzemeMaliyetBilgileri(db: Db, nolar: number[]): Promise<Map<number, MalzemeMaliyetBilgisi>> {
  const benzersiz = [...new Set(nolar)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await s.katalogMaliyetSatirlari(db, benzersiz)).map((r) => [r.no, {
    kaliteKodu: r.kaliteKodu, kaliteAdi: r.kaliteAdi, aile: r.aile, form: r.form, formAdi: r.formAdi, stokBirimi: r.stokBirimi, birimKg: r.birimKg, netKg: r.netKg,
  }]));
}

// 2478: kart başına kategori (tür, kod); anahtar kategori ağacının düğümüyle aynıdır. Kategorisiz tür ve boş kategori null; olmayan
// kart haritada yok; iptal ve pasif kart da döner (süzmek çağıranda). Yetki denetlemez.
export async function malzemeKategorileri(db: Db, malzemeIdler: readonly number[]): Promise<Map<number, { tur: KategoriAgaciTuru; kod: string } | null>> {
  const benzersiz = [...new Set(malzemeIdler)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await s.katalogKategoriSatirlari(db, benzersiz)).map((r) => [r.no, r.kod === null ? null : { tur: r.tur as KategoriAgaciTuru, kod: r.kod }]));
}

// 1104 a: satın almanın kart ayrıntısı. Olmayan ve iptal kart haritada yok. Yetki denetlemez; neyin tedarikçiye gideceğine satın alma karar verir.
// 3121: işlem ve ölçü de taşınır (satın almanın sipariş kopyası bunlarla alınır; eski kopyada yoktur).
export type MalzemeSatinAlmaAyrintisi = Omit<s.KatalogSatinAlmaSatiri, 'no'> & { islem: string | null; olcu: string | null };
export async function malzemeSatinAlmaAyrintilari(db: Db, nolar: readonly number[]): Promise<Map<number, MalzemeSatinAlmaAyrintisi>> {
  const benzersiz = [...new Set(nolar)];
  if (benzersiz.length === 0) return new Map();
  const ozellikler = await malzemeOzellikleri(db, benzersiz);
  return new Map((await s.katalogSatinAlmaSatirlari(db, benzersiz)).map(({ no, ...r }) => {
    const o = ozellikler.get(no);
    return [no, { ...r, islem: o?.islem ?? null, olcu: o?.olcu ?? null }];
  }));
}

// 3121: satın alma tablolarındaki kalite, durum, işlem ve ölçü sütunları; boş alan null, işlemler virgülle. Olmayan ya da iptal kart haritada yok.
export interface MalzemeOzelligi { kalite: string | null; durum: string | null; islem: string | null; olcu: string | null }
export async function malzemeOzellikleri(db: Db, nolar: readonly number[]): Promise<Map<number, MalzemeOzelligi>> {
  const benzersiz = [...new Set(nolar)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await s.katalogOzellikSatirlari(db, benzersiz)).map((r) => [r.no, {
    kalite: r.kaliteAdi, durum: r.durum, islem: r.islemler.length ? [...new Set(r.islemler)].join(', ') : null,
    olcu: r.tur === 'hammadde' ? olcuMetni(r.form, r.dims) : r.olcuAlani,
  }]));
}

// 3118: GKK formunun ölçü satırları (ad ve birimli değer); hammadde dışı ya da ölçüsüz kartta boş liste. Olmayan ya da iptal kart haritada yok.
export async function malzemeOlculeri(db: Db, nolar: readonly number[]): Promise<Map<number, OlcuDegeri[]>> {
  const benzersiz = [...new Set(nolar)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await s.katalogOzellikSatirlari(db, benzersiz)).map((r) => [r.no, r.tur === 'hammadde' ? olcuListesi(r.form, r.dims) : []]));
}

// Kart #688: çizim merkezinin resim eşleşmesi. Değer kırpılır, boş metin null; olmayan kart haritada yok. Yetki denetlemez.
export interface MalzemeResimAnahtari { resimNo: string | null; revizyon: string | null }
export async function malzemeResimAnahtarlari(db: Db, nolar: readonly number[]): Promise<Map<number, MalzemeResimAnahtari>> {
  const benzersiz = [...new Set(nolar)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await s.katalogResimSatirlari(db, benzersiz)).map((r) => [r.no, { resimNo: r.resimNo, revizyon: r.revizyon }]));
}

// 323 b: tedarikçinin biriminde girilen miktar stok birimine `miktar * katsayi` ile çevrilir. Olmayan ya da dönüşümsüz kart haritada yok.
export interface MalzemeBirimDonusumu { stokBirimi: string | null; alisBirimi: string; katsayi: string }
export async function malzemeBirimDonusumleri(db: Db, nolar: number[]): Promise<Map<number, MalzemeBirimDonusumu>> {
  const benzersiz = [...new Set(nolar)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await s.katalogBirimDonusumleri(db, benzersiz)).map((r) => [r.no, { stokBirimi: r.stokBirimi, alisBirimi: r.alisBirimi, katsayi: r.katsayi }]));
}

export function kullanilanKaliteler(db: Db): Promise<s.KullanilanKaliteSatiri[]> {
  return s.kullanilanKaliteSatirlari(db);
}

export const ARAMA_SAYFA_BOYU = 50;
// İptal edilmiş kart aranmaz; boş metin bütün kartları sayfalar. Sayfa 1'den başlar, sayfa boyu 1-200.
// `hizmetYonu` verilirse yalnız o yöndeki hizmet kartları döner (satın alma alınan hizmeti seçer).
export async function malzemeAra(
  db: Db, g: { metin: string | null; turler?: readonly KatalogTuru[]; yalnizAktif?: boolean; hizmetYonu?: HizmetYonu; sayfa: number; sayfaBoyu?: number },
): Promise<SayfaliListe<KatalogMalzemeOzeti>> {
  const sayfa = Math.max(1, Math.trunc(g.sayfa));
  const sayfaBoyu = Math.min(200, Math.max(1, Math.trunc(g.sayfaBoyu ?? ARAMA_SAYFA_BOYU)));
  const metin = g.metin?.trim() || null;
  const r = await s.katalogMalzemeAra(db, {
    metin, turler: g.turler ?? [], yalnizAktif: g.yalnizAktif ?? false, hizmetYonu: g.hizmetYonu ?? null, sinir: sayfaBoyu, atla: (sayfa - 1) * sayfaBoyu,
  });
  return { satirlar: r.satirlar, toplam: r.toplam, sayfa, sayfaBoyu };
}

// Ortak seçici (kart #1319): aktif kart onaylanmış ve kullanımdaki karttır; taslak, onayda, pasif ve iptal yalnız istenirse gelir.
export async function malzemeSecimAra(
  db: Db, g: { q: string; tur?: KatalogTuru | undefined; pasifler: boolean; sayfa: number },
): Promise<MalzemeSecimCevabi> {
  const r = await malzemeAra(db, {
    metin: g.q, turler: g.tur ? [g.tur] : [], yalnizAktif: !g.pasifler, sayfa: g.sayfa, sayfaBoyu: MALZEME_SECIM_SAYFA_BOYU,
  });
  return {
    sonuclar: r.satirlar.map((m) => ({ id: m.id, kod: m.kod, ad: m.ad ?? '', aktif: m.onayDurumu === 'aktif', ust: null })),
    dahaVar: g.sayfa * MALZEME_SECIM_SAYFA_BOYU < (r.toplam ?? 0),
  };
}

// Pasifler de döner (eski kartın birimi gösterilir); seçim listesi yalnız aktifleri sunar.
export function olcuBirimleri(db: Db): Promise<{ kod: string; aktif: boolean }[]> {
  return s.olcuBirimleri(db);
}

export async function olcuBirimleriniGetir(db: Db): Promise<OlcuBirimleriCevabi> {
  return { birimler: await s.olcuBirimleri(db) };
}

// Yeni hareket, sipariş ya da rota satırı yalnız aktif karta bağlanır.
export async function malzemeKullanilabilirMi(db: Db, id: number): Promise<boolean> {
  return (await s.katalogMalzemeOzeti(db, id))?.onayDurumu === 'aktif';
}

// Kart yoksa null; operasyonu olmayan kartta boş dizi. Yetki denetlemez, çağıran modül kendi yetkisiyle çağırır.
// C1: satır, operasyon tipinin ve (eski merkez metninden) istasyonun kimliğini de taşır; çözülemeyen null.
export async function malzemeOperasyonlari(db: Db, id: number): Promise<KimlikliKartOperasyonu[] | null> {
  const k = await s.katalogKartKaydiNoIle(db, id);
  if (k === null) return null;
  if (kartOperasyonlari(k.kayit).length === 0) return [];
  const tipler = await operasyonTipleri(db, { pasiflerDahil: true });
  const istasyonlar = await istasyonListesi(db, { pasiflerDahil: true });
  return kartOperasyonKimlikleri(k.kayit, tipler, istasyonlar);
}

// 233 a: kartın rotası Rota modülündedir; Rota bu modülü ithal ettiği için tersini sunucu/kablolama.ts kaydeder. Kayıt yokken kartın
// rotası yok sayılır (kablolama eksik bağda süreci zaten açmaz).
export type RotaRevizyonlariCozucusu = (db: Db, malzemeNo: number) => Promise<readonly unknown[]>;
let rotaRevizyonlari: RotaRevizyonlariCozucusu | null = null;
export function rotaRevizyonlariCozucusuKaydet(cozucu: RotaRevizyonlariCozucusu): void { rotaRevizyonlari = cozucu; }
async function rotasiVarMi(db: Db, no: number): Promise<boolean> {
  return rotaRevizyonlari !== null && (await rotaRevizyonlari(db, no)).length > 0;
}

// Ekran kartın Operasyonlar ve Reçete adımını rotası varsa salt okunur gösterir; kart yoksa 404.
export async function katalogKartiRotasi(db: Db, kimlik: string): Promise<KatalogKartiRotasiCevabi> {
  const no = await s.katalogKartNoKimlikten(db, kimlik);
  if (no === null) throw bulunamadi('Malzeme kataloğu kartı bulunamadı.');
  return { rotali: await rotasiVarMi(db, no) };
}

// Rota'nın taslak açma işi için: kodlu operasyonu olan aktif mamul ve yarı mamul kartlar. kisiId, kartı onaya gönderen; onaysız
// aktif olan kartta açan (soru 520 2 b: taslağı açan rota yetkisi olmayan onaylayıcı görünmesin).
export async function operasyonluAktifKartlar(db: Db): Promise<{ no: number; kisiId: number }[]> {
  return (await s.operasyonluAktifKartKayitlari(db))
    .filter((k) => kartOperasyonlari(k.kayit).length > 0)
    .map(({ no, kisiId }) => ({ no, kisiId }));
}

// Boş dizide sorgu atılmaz; yinelenen kimlik tek kayıt; olmayan kimlik haritada yok; adı olmayan kart koduyla yer alır;
// pasif kart da adıyla döner.
export async function malzemeAdlari(db: Db, idler: number[]): Promise<Map<number, string>> {
  const benzersiz = [...new Set(idler)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await s.katalogMalzemeAdlari(db, benzersiz)).map((k) => [k.id, k.ad]));
}

/* ---------------- Logo'ya gönderime hazırlık (kart #232): bağlantı modülüne ---------------- */

export interface LogoyaGidecekMalzeme {
  no: number;
  stokKodu: string;
  ad: string | null;
  birim: string | null;
  tur: string;
  // Yalnız hizmette dolu; Logo'da kart türü yönden çıkar (alınan, verilen).
  hizmetYonu: HizmetYonu | null;
  // O anki karşılık; boşsa `eksikler` içinde.
  logoKartTuru: string | null;
  logoBirimSeti: string | null;
  // Kartın Açıklama 1, 2, 3'ü (334 a); kart yeniden kaydedilene kadar boş olabilir.
  aciklama1: string | null;
  aciklama2: string | null;
  aciklama3: string | null;
  durum: 'bekliyor' | 'hata';
  sonHata: string | null;
  // Boş değilse kart gönderilmez (MKL-4).
  eksikler: LogoEksik[];
}

// Bekleyen ve hatalı kartlar, en eski aktiflik önce, en çok `sinir` kart. Yetki denetlemez: çağıranın işidir.
// Hizmet kartı yalnız `hizmetDahil` ile gelir: Logo hizmet gönderimini yazana kadar hizmet malzeme olarak gitmesin (Logo planı madde 5).
export async function logoyaGidecekMalzemeler(db: Db, sinir: number, secenek: { hizmetDahil?: boolean } = {}): Promise<LogoyaGidecekMalzeme[]> {
  if (!Number.isSafeInteger(sinir) || sinir < 1) throw new Error(`Logo kuyruğu sınırı pozitif tam sayı olmalı: ${sinir}`);
  return (await s.logoKuyrugu(db, sinir, secenek.hizmetDahil ?? false)).map((k) => ({
    no: k.id, stokKodu: k.kod, ad: k.ad, birim: k.birim, tur: k.tur, hizmetYonu: k.hizmetYonu, logoKartTuru: k.logoKartTuru, logoBirimSeti: k.logoBirimSeti,
    aciklama1: k.aciklama1, aciklama2: k.aciklama2, aciklama3: k.aciklama3,
    durum: k.durum === 'hata' ? 'hata' : 'bekliyor', sonHata: k.hata,
    eksikler: logoEksikleri({ tur: k.tur, stokKodu: k.kod, ad: k.ad, birim: k.birim, logoKartTuru: k.logoKartTuru, logoBirimSeti: k.logoBirimSeti }),
  }));
}

// `logoKartTuru` ve `logoBirimSeti`: Logo'ya giden değerler (kuyruktaki `logoKartTuru`, `logoBirimSeti`). Verilmezse karta o anki karşılık yazılır.
export type MalzemeLogoSonucu = { kayitNo: string; logoKartTuru?: string | null; logoBirimSeti?: string | null } | { hata: string };

// MKL-5: Logo'nun cevabı. `{ kayitNo }`: kart "gonderildi" olur, zaman ve gönderilen (verilmezse o anki) tür/birim karşılığı yazılır; `{ hata }`: "hata" olur,
// metin saklanır (yeniden gönderilebilir). Aynı kayıt numarası ikinci karta yazılamaz (409); gönderilmiş ya da kuyrukta olmayan kart 422.
// Gönderilen karşılık boş ya da dolu metindir; boşluklu metin tablonun kısıtına takılmadan reddedilir.
function gonderilenDeger(deger: string | null | undefined, alan: string): string | null {
  if (deger === undefined || deger === null) return null;
  const d = deger.trim();
  if (d === '' || d.length > 40) throw dogrulama('Logo karşılığı 1-40 karakter olmalı.', alan);
  return d;
}

export async function malzemeLogoSonucu(db: Db, no: number, sonuc: MalzemeLogoSonucu): Promise<void> {
  const kart = await s.logoKartiKilitle(db, no);
  if (!kart) throw bulunamadi('Malzeme kartı bulunamadı.');
  if (kart.durum === null) throw gecersiz('Kart Logo gönderim kuyruğunda değil.');
  if (kart.durum === 'gonderildi') throw gecersiz('Kart Logo\'ya zaten gönderilmiş; sonucu değişmez.');
  if ('kayitNo' in sonuc) {
    const kayitNo = sonuc.kayitNo.trim();
    if (kayitNo === '' || kayitNo.length > 64) throw dogrulama('Logo kayıt numarası 1-64 karakter olmalı.', 'kayitNo');
    const verildi = sonuc.logoKartTuru !== undefined || sonuc.logoBirimSeti !== undefined;
    const gonderilen = verildi
      ? { logoKartTuru: gonderilenDeger(sonuc.logoKartTuru, 'logoKartTuru'), logoBirimSeti: gonderilenDeger(sonuc.logoBirimSeti, 'logoBirimSeti') }
      : undefined;
    await kisitKorumali(
      { malzeme_katalog_karti_logo_kayit_no_tek: { ileti: 'Bu Logo kayıt numarası başka bir karta yazılmış.', alan: 'kayitNo' } },
      () => s.logoGonderildiYaz(db, no, kayitNo, gonderilen),
    );
    // Gönderim yarışı (2114b): istek yoldayken kart silindiyse Logo'da açılan kart da pasife alınmak üzere kuyruğa girer; silen, isteyendir.
    if (kart.iptal) await s.logoPasifIste(db, no, kart.silenId);
    return;
  }
  const hata = logoHataMetni(sonuc.hata);
  if (hata === null) throw dogrulama('Logo hata metni boş olamaz.', 'hata');
  await s.logoHataYaz(db, no, hata);
}

/* ---------------- Logo'da ad güncellemesi (kart #783, S4 b) ---------------- */

export type LogoyaGuncellemeGidecekMalzeme = s.LogoGuncellemeSatiri;

// Logo'ya gitmiş ve adı değişmiş kartlar (bekleyen ve hatalı), en eski önce. Yetki denetlemez; çağıran Logo işidir.
export async function logoyaGuncellemeGidecekMalzemeler(db: Db, sinir: number): Promise<LogoyaGuncellemeGidecekMalzeme[]> {
  if (!Number.isSafeInteger(sinir) || sinir < 1) throw new Error(`Logo güncelleme kuyruğu sınırı pozitif tam sayı olmalı: ${sinir}`);
  return s.logoGuncellemeKuyrugu(db, sinir);
}

// `ad`: Logo'ya gönderilen ad (kuyruktan alınan). Ad bu arada yine değiştiyse güncelleme bekliyor kalır. Kuyrukta olmayan kart 422.
export async function malzemeLogoGuncellemeSonucu(db: Db, no: number, sonuc: LogoGuncellemeSonucu): Promise<void> {
  const kart = await s.logoGuncellemeKilitle(db, no);
  if (!kart) throw bulunamadi('Malzeme kartı bulunamadı.');
  if (kart.durum !== 'bekliyor' && kart.durum !== 'hata') throw gecersiz('Kart Logo güncelleme kuyruğunda değil.');
  const yazilacak = logoGuncellemeSonucuDurumu(sonuc, kart.ad);
  if (yazilacak === 'bos-hata') throw dogrulama('Logo hata metni boş olamaz.', 'hata');
  if (yazilacak !== null) await s.logoGuncellemeSonucuYaz(db, no, yazilacak.durum, yazilacak.hata);
}

/* ---------------- Logo'da pasife alma (2114b, 2114-7, ADR 0017 eki 8) ---------------- */

export type LogoyaPasifGidecekMalzeme = s.LogoPasifSatiri;
// `kalici`: Logo reddetti (kart yok ya da kod uyuşmuyor); yeniden denenmez, kart pasif kalır. Değilse (ulaşılamadı, belirsiz) iş yeniden dener.
export type LogoPasifSonucu = { tamam: true } | { hata: string; kalici: boolean };

// Logo'da pasife alınması istenen kartlar (bekleyen ve hatalı), en eski önce. Yetki denetlemez; çağıran Logo işidir.
export async function logoyaPasifGidecekMalzemeler(db: Db, sinir: number): Promise<LogoyaPasifGidecekMalzeme[]> {
  if (!Number.isSafeInteger(sinir) || sinir < 1) throw new Error(`Logo pasife alma kuyruğu sınırı pozitif tam sayı olmalı: ${sinir}`);
  return s.logoPasifKuyrugu(db, sinir);
}

export async function malzemeLogoPasifSonucu(db: Db, no: number, sonuc: LogoPasifSonucu): Promise<void> {
  const kart = await s.logoPasifKilitle(db, no);
  if (!kart) throw bulunamadi('Malzeme kartı bulunamadı.');
  if (kart.durum !== 'bekliyor' && kart.durum !== 'hata') throw gecersiz('Kart Logo pasife alma kuyruğunda değil.');
  if ('tamam' in sonuc) {
    await s.logodaPasifYaz(db, no);
    return;
  }
  const hata = logoHataMetni(sonuc.hata);
  if (hata === null) throw dogrulama('Logo hata metni boş olamaz.', 'hata');
  await s.logoPasifHataYaz(db, no, sonuc.kalici ? 'reddedildi' : 'hata', hata);
}

/* ---------------- Logo durumu ekranı ve karşılık tablosu ---------------- */

// LOG-1 a: geçerli Logo birim seti kodlarının listesi Logo modülündedir; Logo bu modülü ithal ettiği için tersini sunucu/kablolama.ts
// kaydeder. Kayıt yokken (yalnız birim testleri; kablolama eksik bağda süreci açmaz) birim karşılığı denetlenmez.
export type LogoBirimSetiCozucusu = (db: Db) => Promise<ReadonlySet<string>>;
let logoBirimSetleri: LogoBirimSetiCozucusu | null = null;
export function logoBirimSetiCozucusuKaydet(cozucu: LogoBirimSetiCozucusu): void { logoBirimSetleri = cozucu; }

export async function logoDurumunuGetir(db: Db, kullanici: Kullanici): Promise<LogoDurumuCevabi> {
  const gecerli = logoBirimSetleri === null ? null : await logoBirimSetleri(db);
  const kartlar = (await s.logoDurumluKartlar(db)).map((k) => ({
    id: k.id, kod: k.kod, ad: k.ad, tur: k.tur, birim: k.birim, durum: k.durum, hata: k.hata, zaman: k.zaman, kayitNo: k.kayitNo,
    guncelleme: k.guncellemeDurumu === null || k.guncellemeZamani === null ? null : { durum: k.guncellemeDurumu, hata: k.guncellemeHata, zaman: k.guncellemeZamani },
    pasif: k.pasifDurumu === null || k.pasifZamani === null ? null : { durum: k.pasifDurumu, hata: k.pasifHata, zaman: k.pasifZamani },
    eksikler: k.durum === 'gonderildi' ? [] : logoEksikleri({ tur: k.tur, stokKodu: k.kod, ad: k.ad, birim: k.birim, logoKartTuru: k.logoKartTuru, logoBirimSeti: k.logoBirimSeti }, gecerli),
  }));
  return {
    kartlar: kartlar.sort(logoDurumSirasi),
    karsiliklar: await s.logoKarsiliklari(db),
    kartTuruSecenekleri: LOGO_KART_TURLERI.map((t) => ({ kod: t.kod, ad: t.ad })),
    karsilikYazabilir: kullanici.islemler.includes('malzemeler.tanim-yaz'),
  };
}

export async function logoKarsiligiKaydet(db: Db, kullanici: Kullanici, k: LogoKarsiligi): Promise<{ id: string }> {
  const izinsiz = logoKarsiligiHatasi(k) ?? (k.cesit === 'birim' && k.logoDegeri !== null && logoBirimSetleri !== null
    ? logoBirimSetiGecersizHatasi(k.logoDegeri, await logoBirimSetleri(db))
    : null);
  if (izinsiz) throw gecersiz(izinsiz);
  await kisitKorumali(
    {
      malzeme_logo_karsiligi_tur: { ileti: 'Tür karşılığı yalnız altı malzeme türü için yazılır.', alan: 'tmiDegeri' },
      malzeme_logo_karsiligi_izinli: { ileti: 'Logo karşılığı izinli değerlerin dışında.', alan: 'logoDegeri' },
      malzeme_logo_karsiligi_birim: { ileti: 'Birim, birim listesinde yok.', alan: 'tmiDegeri' },
    },
    () => s.logoKarsiligiYaz(db, k.cesit, k.tmiDegeri, k.logoDegeri, kullanici.id),
  );
  return { id: `${k.cesit}:${k.tmiDegeri}` };
}

/* ---------------- Malzeme Kataloğu (prototip) kartları ---------------- */

export async function malzemelerOzeti(db: Db, islemler: readonly string[]): Promise<MalzemelerOzetiCevabi> {
  return { onayBekleyen: islemler.includes('malzemeler.onayla') ? await s.onayBekleyenKartSayisi(db) : null };
}

// Kartın tam kaydı büyüktür: sayfa boyu cevabı birkaç yüz KB'ta tutar (bir kart birkaç KB, VARSAYIM: ölçülmedi).
export async function katalogKartlariniGetir(
  db: Db, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; sonra?: string | undefined },
): Promise<KatalogKartlariCevabi> {
  const sonra = sorgu.sonra ?? null;
  const an = await s.okumaAni(db);
  const liste = await sayfaliListe(sorgu, {
    say: () => s.katalogKartSayisi(db, sonra),
    satirlar: (d) => s.katalogKartlari(db, sonra, d),
    sayfaBoyu: { varsayilan: 200, azami: 500 },
  });
  return { ...liste, an };
}

async function katalogGenelAyari(db: Db): Promise<Record<string, unknown> | null> {
  return (await s.katalogAyarlari(db)).find((a) => a.anahtar === 'genel')?.deger ?? null;
}

async function katalogMalzemeAyari(db: Db): Promise<Record<string, unknown> | null> {
  return (await s.katalogAyarlari(db)).find((a) => a.anahtar === 'malzeme')?.deger ?? null;
}

// MKK-16: türün çakışma alanları değişince o türün kartlarının anahtarı aynı işlemde yeniden kurulur. Liste boşalırsa kart ekranın
// varsayılan anahtarına döner. Yeni kural etkin kartları birbirine çakıştırıyorsa ayar yazılmaz: önce kartlar birleştirilmeli.
async function cakismaAnahtarlariniYenile(db: Db, onceki: Record<string, unknown> | null, yeni: Record<string, unknown>): Promise<void> {
  for (const tur of KATALOG_TURLERI) {
    const alanlar = katalogCakismaAlanlari(yeni, tur);
    if (JSON.stringify(alanlar) === JSON.stringify(katalogCakismaAlanlari(onceki, tur))) continue;
    const kartlar = (await s.katalogTurAnahtarKartlari(db, tur)).map((k) => ({ ...k, anahtar: katalogYeniAnahtar(tur, alanlar, k) }));
    const gruplar = katalogAnahtarCakismalari(kartlar);
    if (gruplar.length) {
      throw cakisma(`Bu çakışma kuralıyla var olan kartlar birbirine çakışıyor: ${gruplar.slice(0, 5).map((g) => g.join(' = ')).join('; ')}. Önce kartları birleştirin ya da pasife alın.`, { gruplar });
    }
    await s.katalogAnahtarlariYaz(db, kartlar.map((k) => ({ kimlik: k.kimlik, anahtar: k.anahtar })));
  }
}

// Stok kodundan kart sayı kimliği (büyük-küçük harf ve boşluk farkı yok sayılır); kart yoksa null. Başka modüller kartı koddan bulur (kart #906).
export function malzemeNoKoddan(db: Db, stokKodu: string): Promise<number | null> {
  const kod = stokKodu.trim().toUpperCase();
  return kod === '' ? Promise.resolve(null) : s.katalogKartNoKoddan(db, kod);
}

// Örnek veri kartının sayı kimliği; örnek veri yüklenmemişse null (kart #906).
export function ornekMalzemeNo(db: Db, anahtar: OrnekMalzemeAnahtari): Promise<number | null> {
  return s.katalogKartNoKimlikten(db, ornekKartKimligi(anahtar));
}

export const ornekKartVarMi = (db: Db): Promise<boolean> => s.ornekKartVarMi(db);

// Kurumun firma kodu (Malzeme ayarları > genel); yoksa null. Başka modüllerin numara kuralları için (kart #802).
export async function firmaKodu(db: Db): Promise<string | null> {
  return katalogFirmaKodu(await katalogGenelAyari(db));
}

// 2089-2 a: Logo'da kullanılan malzeme kodları Logo modülündedir; Logo bu modülü ithal ettiği için tersini sunucu/kablolama.ts kaydeder.
// Çözücü verilen kodlardan Logo'da olanları döner (Logo'nun yerel aynası, ağ yok). Kayıt yokken (yalnız birim testleri) atlama yapılmaz.
export type LogoKodCozucusu = (db: Db, kodlar: readonly string[]) => Promise<string[]>;
let logodaKullanilanKodlar: LogoKodCozucusu | null = null;
export function logoKodCozucusuKaydet(cozucu: LogoKodCozucusu): void { logodaKullanilanKodlar = cozucu; }

// Logo'da art arda bu kadar dolu numaradan sonra sıradaki verilir; çakışma gönderimde yakalanır (kart "hata").
export const LOGO_KOD_ATLAMA_EN_COK = 1000;

// Sıradaki numara; Logo'da kullanılıyorsa atlanır, atlanan numara bu önekte bir daha verilmez (2089-2 a).
async function logoyuAtlayanSira(db: Db, onek: string): Promise<number> {
  let sira = await s.katalogSiraAl(db, onek);
  if (logodaKullanilanKodlar === null) return sira;
  for (let i = 0; i < LOGO_KOD_ATLAMA_EN_COK && (await logodaKullanilanKodlar(db, [katalogStokKodu(onek, sira)])).length > 0; i += 1) {
    sira = await s.katalogSiraAl(db, onek);
  }
  return sira;
}

// Yeni kart ve taslakta tür değişimi: önek ekranın kodundan (yalnız standart biçim), sıra sunucudan; boşalan eski kod yeniden verilmez.
// Firma kodu ayarlıysa firma kodlu türün (varsayılan mamul ve yarı mamul) önekini ayar verir; ekranın gönderdiği önek yok sayılır.
async function yeniStokKodu(db: Db, gelenKod: string | null, tur: string): Promise<{ onek: string; sira: number; stokKodu: string }> {
  const firmaOneki = katalogFirmaOneki(await katalogGenelAyari(db), tur);
  if (firmaOneki) {
    const sira = await logoyuAtlayanSira(db, firmaOneki);
    return { onek: firmaOneki, sira, stokKodu: katalogStokKodu(firmaOneki, sira) };
  }
  const onek = katalogKodOneki(gelenKod);
  if (!onek) throw dogrulama('Stok kodu öneki tür-grup-sıra biçiminde olmalı (ör. HM-PAS-00001); kodu sunucu verir.', 'kayit.com.kod');
  if (!katalogOnekiTureUyarMi(onek, tur)) throw dogrulama('Stok kodu öneki malzeme türüne uymuyor.', 'kayit.com.kod');
  const sira = await logoyuAtlayanSira(db, onek);
  return { onek, sira, stokKodu: katalogStokKodu(onek, sira) };
}

// Servis bu kuralları yazmadan önce de denetler; kısıt yalnız eşzamanlı yazmada ya da servisi atlayan yolda tetiklenir.
// Anahtar dizini: iki kişi aynı malzemeyi aynı anda açarsa ön denetim kaydedilmemiş kartı göremez, kaybeden buraya düşer.
const KART_KISITLARI = {
  malzeme_katalog_karti_anahtar_tek: {
    ileti: 'Bu malzemenin kartı az önce başka biri tarafından açıldı. Listeyi yenileyip mevcut kartı kullan ya da gerekçe yaz.',
    alan: 'ozet.benzersiz_anahtar',
  },
  malzeme_katalog_karti_tedarikci_firma: { ileti: 'Kartın tedarikçi firması bulunamadı; tedarikçiyi yeniden seçin.', alan: 'kayit.com.tedId' },
  malzeme_katalog_karti_dort_goz: 'Dört göz açıkken kartı onaya gönderen kişi onaylayamaz.',
  malzeme_katalog_karti_degismez: 'Kartın türü ve stok kodu yalnız hiç aktif olmamış taslakta değişir.',
} as const;

function kayitBirimDonusumu(kayit: Record<string, unknown>): BirimDonusumu | null {
  const d = kartBirimDonusumu(kayit);
  return d === null || 'mesaj' in d ? null : d;
}

export async function katalogKartiKaydet(
  db: Db, kullanici: Kullanici, kimlik: string, g: z.output<typeof katalogKartiKaydetGovdesi>,
): Promise<KatalogKartiKaydetCevabi> {
  if (g.kayit['id'] !== kimlik) throw dogrulama('Kartın kimliği adresle aynı olmalı.', 'kayit.id');
  const com = g.kayit['com'];
  if (com === null || typeof com !== 'object' || Array.isArray(com)) throw dogrulama('Kartın ortak alanları (com) nesne olmalı.', 'kayit.com');
  const alanlar = katalogKaydiAlanlari(g.kayit, g.ozet);
  if ('alan' in alanlar) throw dogrulama(alanlar.mesaj, alanlar.alan);
  const { tur, onayDurumu: yeniDurum, hizmetYonu } = alanlar;
  const kayitli = await s.katalogKartiKilitle(db, kimlik);
  if (kayitli && !katalogSurumUyarMi(kayitli.surum, g.surum)) {
    throw cakisma('Bu kartı başka biri değiştirdi; listeyi yenileyip yeniden dene.', { stokKodu: kayitli.stokKodu, surum: kayitli.surum });
  }
  if (!kayitli && g.surum !== null) throw bulunamadi('Malzeme kataloğu kartı bulunamadı.');
  // Tür yalnız hiç aktif olmamış taslakta değişir (kayıtlı durum esastır; aynı yazımda taslaktan çıkış serbest) ve yeni kod alır.
  // Kodu sunucu verir: gelen kod yalnız hiç aktif olmamış taslakta öneki için okunur (Kural 1a), sayısı hiç okunmaz; öteki durumlarda kayıtlı kod kalır.
  const turDegisti = kayitli !== null && kayitli.tur !== tur;
  if (kayitli && turDegisti && !katalogKodDegisebilirMi(kayitli.onayDurumu, kayitli.aktifOlmus)) {
    throw gecersiz('Kartın türü ve stok kodu yalnız hiç aktif olmamış taslakta değişir.');
  }
  if (kayitli && kayitli.hizmetYonu !== hizmetYonu && !katalogKodDegisebilirMi(kayitli.onayDurumu, kayitli.aktifOlmus)) {
    throw gecersiz('Hizmet kartının yönü yalnız hiç aktif olmamış taslakta değişir; öteki yön için yeni kart açın.');
  }
  if (kayitli && kartRotaIcerigiDegistiMi(kayitli.kayit, g.kayit) && await rotasiVarMi(db, kayitli.no)) throw cakisma(ROTALI_KART_ILETISI);
  const tanimHatasi = hammaddeTanimHatasi(kayitli?.kayit ?? null, g.kayit);
  if (tanimHatasi) throw dogrulama(tanimHatasi.mesaj, tanimHatasi.alan);
  const olcuHatasi = hammaddeOlcuHatasi(kayitli?.kayit ?? null, g.kayit);
  if (olcuHatasi) throw dogrulama(olcuHatasi, 'kayit.dims');
  // 323 b: alış birimi, stok birimi gibi (SH4 a) yalnız yeni ya da değişmişse listede aranır.
  for (const { onek, donusum } of kartBirimDonusumleri(g.kayit)) {
    if (donusum === null) continue;
    if ('mesaj' in donusum) throw dogrulama(donusum.mesaj, onek + donusum.alan);
    const eski = kayitli ? kartBirimDonusumu(kayitli.kayit) : null;
    if ((eski === null || 'mesaj' in eski || eski.alisBirimi !== donusum.alisBirimi) && !(await s.birimSecilebilirMi(db, donusum.alisBirimi))) {
      throw dogrulama(`"${donusum.alisBirimi}" birim listesinde yok; Ayarlar'daki birim listesinden seçin.`, `${onek}alisBirimi`);
    }
  }
  // Madde 6 ve TM3: hizmet ve ticari mal reçete bileşeni ya da operasyon sarfı olamaz.
  const yasakBilesenler = await s.katalogBilesenOlamayanKodlar(db, kartBilesenKimlikleri(g.kayit));
  if (yasakBilesenler.length) throw gecersiz(`Hizmet ve ticari mal kartı reçeteye ya da operasyon sarfına girmez: ${yasakBilesenler.join(', ')}.`);
  // Kart #466: yeni seçilen tedarikçi Müşteriler ve Tedarikçiler'de aktif bir tedarikçi firma olmalı (aramanın süzgeci); kayıtlı bağ değişmeden
  // kalıyorsa firma sonradan pasif olsa da kart yeniden kaydedilir.
  for (const tedId of kartTedarikciKimlikleri(g.kayit)) {
    if (tedId === 'gecersiz') throw dogrulama('Tedarikçi firma kimliği geçersiz.', 'kayit.com.tedId');
    if (!tedarikciDegistiMi(kayitli?.kayit ?? null, tedId)) continue;
    const firma = await firmaOzeti(db, tedId);
    if (!firma) throw gecersiz('Seçilen tedarikçi firma finansta bulunamadı.');
    if (!firma.aktif || !tedarikciOlabilirMi(firma.tur)) throw gecersiz(`${firma.ad} aktif bir tedarikçi firma değil; Müşteriler ve Tedarikçiler sayfasında tedarikçi olarak açılmış aktif firmayı seçin.`);
  }
  // 885 a: ölçü aleti yalnız demirbaşa bağlanır ve Kalibrasyon'da kayıtlı olmalıdır (talebin önerdiği bağ da). Kullanım dışı alet de bağlanır;
  // kart aletin durumunu gösterir.
  for (const no of kartAletNolari(g.kayit)) {
    if (no === 'gecersiz') throw dogrulama('Ölçü aleti numarası geçersiz.', 'kayit.g.aletNo');
    if (tur !== 'demirbas') throw dogrulama('Ölçü aleti yalnız demirbaş kartına bağlanır.', 'kayit.g.aletNo');
    if (!(await aletNoIleGetir(db, no))) throw dogrulama(`"${no}" numaralı ölçü aleti Kalibrasyon'da yok.`, 'kayit.g.aletNo');
  }
  // Malzeme denetimi 1/5: yeni ya da değişen kategori listede açık olmalı; ekran bu alanla kategori açmaya yönlendirir.
  for (const kat of denetlenecekKategoriler(g.kayit, tur, kayitli)) {
    if (!(await s.kategoriAcikMi(db, tur, kat))) {
      throw dogrulama(`"${kat}" kategorisi listede yok ya da kapalı; listedeki bir kategoriyi seçin ya da kategoriyi Malzeme ayarlarından açın.`, 'kayit.g.kat');
    }
  }
  const malzemeAyari = await katalogMalzemeAyari(db);
  const zorunluEksigi = kartZorunluAlanEksigi(kayitli, g.kayit, tur, malzemeAyari);
  if (zorunluEksigi) throw dogrulama(zorunluEksigi.mesaj, zorunluEksigi.alan);
  const dortGozAcik = await dortGozAcikMi(db);
  // Türün varsayılan anahtarını sunucu ekranın kuralıyla kurar (B11); yalnız hizmette ekranınki kalır. Türün çakışma alanı seçiliyse
  // geçerli anahtar o alanlardan kurulur (MKK-16). Kuraldan önce anahtarı kurulamayan içerikle kaydolmuş kart (ör. ölçüsüz hammadde)
  // kayıtlı anahtarını korur: eski kayıt kilitlenmez.
  const cakismaAlanlari = katalogCakismaAlanlari(malzemeAyari, tur);
  const sunucuAnahtari = katalogSunucuAnahtari(tur, g.kayit);
  const eskiAnahtar = kayitli && kayitli.tur === tur && !cakismaAlanlari ? kayitli.benzersizAnahtar : null;
  const varsayilanAnahtar = sunucuAnahtari === undefined ? g.ozet.benzersiz_anahtar?.trim() || null : sunucuAnahtari ?? eskiAnahtar;
  const anahtar = cakismaAlanlari ? katalogKuralAnahtari(tur, cakismaAlanlari, g.kayit) : varsayilanAnahtar;
  // Ekranın değişiklik talebi uygulanınca `mukerrerOnay` düşer (`talepOlustur`); anahtar aynıysa kayıtlı gerekçe korunur,
  // yoksa gerekçeli mükerrer kart bir daha güncellenemezdi.
  const gerekce = g.ozet.mukerrer_gerekcesi?.trim() || (kayitli && kayitli.benzersizAnahtar === anahtar ? kayitli.mukerrerGerekcesi : null) || null;
  const onaylar = kullanici.islemler.includes('malzemeler.onayla');
  const gelen = { kayit: g.kayit, benzersizAnahtar: anahtar, mukerrerGerekcesi: gerekce };
  const onaysizIcerikDegisti = kayitli ? katalogIcerigiDegistiMi(kayitli, gelen, false) : false;
  const onceki = kayitli?.onayDurumu ?? null;
  const gonderildi = yeniDurum === 'onayda' && (onceki !== 'onayda' || onaysizIcerikDegisti);
  const kim = { by: kullanici.id, byAd: (await kisiAdlari(db, [kullanici.id])).get(kullanici.id) ?? kullanici.ad, t: Date.now() };
  const talepOnaylandi = onceki === 'aktif' && yeniDurum === 'aktif' && onaysizIcerikDegisti
    && !katalogTalepYokMu(kayitli?.kayit ?? {}) && katalogTalepYokMu(g.kayit);
  if (!katalogTalepBicimiGecerliMi(g.kayit)) throw dogrulama('Değişiklik talebinin önerilen içeriği (yeni) nesne olmalı.', 'kayit.talep.yeni');
  if (talepOnaylandi && kayitli) {
    const uygulamaHatasi = katalogTalepUygulamaDenetle(kayitli.kayit, g.kayit);
    if (uygulamaHatasi) throw uygulamaHatasi.kod === 'CAKISMA' ? cakisma(uygulamaHatasi.mesaj) : gecersiz(uygulamaHatasi.mesaj);
  }
  const gecmisHatasi = katalogGecmisiDenetle(kayitli?.kayit ?? null, g.kayit);
  if (gecmisHatasi) throw gecmisHatasi.kod === 'YETKI_YOK' ? yetkiYok(gecmisHatasi.mesaj) : dogrulama(gecmisHatasi.mesaj, 'kayit.rev');
  const talepHatasi = katalogTalepDenetle(kayitli?.kayit ?? null, g.kayit, kullanici.id, onaylar);
  if (talepHatasi) throw yetkiYok(talepHatasi);
  const aletNo = kartAletNo(g.kayit);
  const alet = aletNo === null ? null : await aletNoIleGetir(db, aletNo);
  const kayit = kartAletNoYaz(eskiKalibrasyonAlanlariniKoru(katalogGecmisiniBas(
    kayitli?.kayit ?? null,
    katalogTalebiBas(
      katalogOnayiBas({ kayit: g.kayit, kayitli: kayitli?.kayit ?? null, onceki, yeni: yeniDurum, gonderildi, talepOnaylandi, kim }),
      kayitli?.kayit ?? null, kim,
    ),
    kim,
  ), kayitli?.kayit ?? null), alet?.no ?? null);
  const hata = katalogGecisiDenetle({
    onceki, yeni: yeniDurum, islemler: kullanici.islemler, kisiId: kullanici.id,
    acanKisiId: kayitli?.acanKisiId ?? null, gonderenKisiId: kayitli?.gonderenKisiId ?? null, dortGozAcik,
    onayAkisiAcik: katalogOnayAkisiAcikMi(await katalogGenelAyari(db)),
    icerikDegisti: kayitli ? katalogIcerigiDegistiMi(kayitli, { ...gelen, kayit }, true) : false, onaysizIcerikDegisti,
    hicOnaylanmadi: kayitli ? katalogHicOnaylanmadiMi(kayitli.kayit) : true,
  });
  if (hata) throw hata.kod === 'YETKI_YOK' ? yetkiYok(hata.mesaj) : gecersiz(hata.mesaj);
  if (gonderildi || (yeniDurum === 'aktif' && onceki !== 'aktif')) {
    const eksik = katalogOnayEksigi(kayit, malzemeAyari, tur, g.ozet.uygulanmayan_zorunlu ?? []);
    if (eksik) throw dogrulama(eksik.mesaj, eksik.alan);
  }
  // MKL-3: Logo'ya gitmiş kartın birimi değişmez (stok kodu ve tür aktif kilidinde; üçünü tetikleyici de tutar).
  if (kayitli?.logoKayitNo && logoBirimiDegistiMi(kayitli.kayit, kayit)) throw gecersiz('Logo\'ya gönderilmiş kartın birimi değişmez.');
  // SH4 a: yeni kart ya da birimi değişen kart yalnız listedeki seçilebilir birimi alır; birimi değişmeyen eski kart olduğu gibi kaydedilir.
  const birim = kartBirimi(kayit);
  if (birim !== null && (!kayitli || kartBirimi(kayitli.kayit) !== birim) && !(await s.birimSecilebilirMi(db, birim))) {
    throw gecersiz(`"${birim}" birim listesinde yok; Ayarlar'daki birim listesinden seçin.`);
  }
  if (!cakismaAlanlari && !anahtar && katalogAnahtarZorunluMu(tur)) throw dogrulama('Bu malzeme türünde benzersiz anahtar zorunludur.', 'ozet.benzersiz_anahtar');
  if (mukerrerGerekcesiKisaMi(gerekce, kayitli?.mukerrerGerekcesi ?? null)) throw dogrulama(MUKERRER_GEREKCE_ILETISI, 'ozet.mukerrer_gerekcesi');
  if (anahtar && !gerekce && yeniDurum !== 'pasif') {
    const ayni = await s.katalogAyniAnahtarli(db, anahtar, kimlik);
    if (ayni.length) throw cakisma(`Bu malzemenin kartı zaten var: ${ayni.map((k) => k.stokKodu).join(', ')}. Mevcut kartı kullan ya da gerekçe yaz.`, { kartlar: ayni });
  }
  const gkk = katalogGkkAyari(tur, g.ozet.gkk_gerekli);
  if ('hata' in gkk) throw dogrulama(gkk.hata, 'ozet.gkk_gerekli');
  const onaylandi = yeniDurum === 'aktif' && kayitli?.onayDurumu !== 'aktif';
  const yazim: s.KatalogKartiYazimi = {
    kimlik, tur: tur, hizmetYonu, benzersizAnahtar: anahtar, varsayilanAnahtar, mukerrerGerekcesi: gerekce, onayDurumu: yeniDurum, kayit,
    kisiId: kullanici.id, gonderenKisiId: gonderildi ? kullanici.id : kayitli?.gonderenKisiId ?? null,
    onaylayanKisiId: onaylandi ? kullanici.id : null, onaylandi, dortGozsuz: onaylandi && !dortGozAcik,
    logoAdGuncellemesi: !!kayitli?.logoKayitNo && logoAdiDegistiMi(kayitli.kayit, kayit),
    agirlik: katalogAgirlikAlanlari(tur, g.ozet),
    netAgirlikKg: katalogNetAgirlikKg(tur, kayit),
    tedarikciFirmaId: kartTedarikciFirmaId(kayit),
    olcuAletiId: alet?.id ?? null,
    aciklamalar: katalogAciklamalari(g.ozet),
    birimDonusumu: kayitBirimDonusumu(kayit),
    gkk,
  };
  // Firma kodlu türde önek ayardan gelir, gelen kod okunmaz.
  const onekDegisti = kayitli !== null && !turDegisti && katalogFirmaOneki(await katalogGenelAyari(db), tur) === null
    && katalogYeniOnek({ durum: kayitli.onayDurumu, aktifOlmus: kayitli.aktifOlmus, kayitliOnek: kayitli.onek, tur, gelenKod: alanlar.stokKodu }) !== null;
  let r: { stokKodu: string; surum: number };
  if (kayitli && !turDegisti && !onekDegisti) {
    r = await kisitKorumali(KART_KISITLARI, () => s.katalogKartiGuncelle(db, yazim, null));
  } else {
    const { onek, sira, stokKodu } = await yeniStokKodu(db, alanlar.stokKodu, tur);
    r = kayitli
      ? await kisitKorumali(KART_KISITLARI, () => s.katalogKartiGuncelle(db, yazim, { tur: tur, onek, sira, stokKodu }))
      : await kisitKorumali(KART_KISITLARI, () => s.katalogKartiEkle(db, yazim, onek, sira));
  }
  await kartOnayiBildir(db, {
    kimlik, stokKodu: r.stokKodu, ad: katalogKartAdi(kayit), gonderildi, onceki, yeni: yeniDurum,
    geriCekildi: katalogGeriCekildiMi(kayit), gonderenKisiId: kayitli?.gonderenKisiId ?? null, kisiId: kullanici.id,
  });
  return { id: kimlik, stok_kodu: r.stokKodu, surum: r.surum };
}

// MLZ-5 a: onaya gönderilen kart onaycılara, reddedilen kart gönderene bildirilir; onaydan çıkan kartın bekleyen bildirimi kapanır; yazımla aynı transaction'da (ADR 0006).
// Yol türün yolunda kalır: kartın derin bağı (`?kart=`) tür yolu denetimine uymaz. Kaynak kimlik kartın kimliğidir; okunmamış bildirim yinelenmez.
async function kartOnayiBildir(db: Db, g: {
  kimlik: string; stokKodu: string; ad: string | null; gonderildi: boolean; onceki: string | null; yeni: string;
  geriCekildi: boolean; gonderenKisiId: number | null; kisiId: number;
}): Promise<void> {
  const metin = g.ad ? `${g.stokKodu} · ${g.ad}` : g.stokKodu;
  // Onaydan çıkan kart (onay, ret, geri çekme) artık onay beklemez: açık bildirimi bütün onaycılarda kapanır.
  if (g.onceki === 'onayda' && g.yeni !== 'onayda') await bildirimKapat(db, { tur: 'malzemeler.kart-onay-bekliyor', kaynakKimlik: g.kimlik });
  if (g.gonderildi) {
    await bildirimGonder(db, {
      tur: 'malzemeler.kart-onay-bekliyor', baslik: `Onay bekleyen malzeme kartı: ${g.stokKodu}`, metin, yol: '/malzemeler', kaynakKimlik: g.kimlik, haric: g.kisiId,
    });
  }
  // Geri çekme (ret damgasında `geri`) ret değildir; gönderen kendi kartını taslağa aldıysa `haric` onu düşürür.
  if (g.onceki === 'onayda' && g.yeni === 'taslak' && !g.geriCekildi && g.gonderenKisiId !== null) {
    await bildirimGonder(db, {
      tur: 'malzemeler.kart-reddedildi', baslik: `Malzeme kartın reddedildi: ${g.stokKodu}`, metin, yol: '/malzemeler', kaynakKimlik: g.kimlik,
      kisiler: [g.gonderenKisiId], haric: g.kisiId,
    });
  }
}

const LOGO_PASIF_KAPALI = 'Logo\'da kullanım dışı bırakma Sistem Ayarları\'nda kapalı ("Logo: silinen kartı Logo\'da kullanım dışı bırakma"); Logo\'ya gönderilmiş kart şimdi silinemez, pasife alın.';
const KART_KULLANIMDA = 'Kart başka kayıtlarda kullanılıyor; silinemez, pasife alın.';
// Silme denemesinin başarı işareti: kayıt noktası bununla geri döner, kart satırı kalır.
const DENEME_BITTI = gecersiz('Silme denemesi geri alındı.');

// TMI'nin Logo'da açtığı kart Logo'dan silinmez, Logo'da kullanım dışı bırakılır (2114-7): istek kuyruğa girer, kart o sürede pasiftir; Logo
// bağlantısı ya da kendi ayarı (3073 a, varsayılan kapalı) kapalıyken istek alınmaz. Logo onaylayınca kart iptal olur, reddederse pasif kalır (Logo işi, malzemeLogoPasifSonucu).
// "Al" ya da "Bağla" ile Logo'dan gelen kart Logo'nun kendi kartıdır (2114b yalnız TMI'nin gönderdiği kart içindir): silinince yalnız TMI'de
// iptal olur, Logo'ya istek yazılmaz. Hangisi olduğunu Logo bağlantısının gönderim izi söyler (çözücü yoksa istek yazılmaz).
// Kullanılmamış kart silinir (2114-1 a): katalogdan ve seçimlerden kalkar, satırı iptal olarak kalır (2114-3 a). Kullanımı
// başka modüllerin yabancı anahtarı bir silme denemesiyle söyler; aparat kapasitesi karta anahtarsız bağlı olduğundan ayrıca
// sorulur (yön malzemeler -> istasyonlar). Satır kaldığı için anahtarsız bağlar ve kayıtlardaki kart izi kopmaz.
export type LogoAcilisCozucusu = (db: Db, kartNo: number) => Promise<boolean>;
let logoAcilisi: LogoAcilisCozucusu | null = null;
export function logoAcilisCozucusuKaydet(c: LogoAcilisCozucusu): void { logoAcilisi = c; }

export async function katalogKartiIptal(db: Db, kullanici: Kullanici, kimlik: string): Promise<KatalogKartiIptalCevabi> {
  const kayitli = await s.katalogKartiKilitle(db, kimlik);
  if (!kayitli || kayitli.onayDurumu === 'iptal') throw bulunamadi('Malzeme kataloğu kartı bulunamadı.');
  if (!katalogIptalYetkiliMi({ islemler: kullanici.islemler, kisiId: kullanici.id, acanKisiId: kayitli.acanKisiId })) {
    throw yetkiYok('Onay yetkisi olmayan yalnız kendi açtığı kartı siler.');
  }
  const logoda = !katalogSilinirMi(kayitli.logoKayitNo);
  if (logoda && (kayitli.logoPasifDurumu === 'bekliyor' || kayitli.logoPasifDurumu === 'hata')) throw gecersiz('Kart Logo\'da pasife alınmayı bekliyor.');
  const logodaPasif = logoda && logoAcilisi !== null && (await logoAcilisi(db, kayitli.no));
  if (logodaPasif && !(await sistemAyariOku(db, 'logo.baglanti'))) throw gecersiz('Logo bağlantısı kapalı; Logo\'ya gönderilmiş kart şimdi silinemez, pasife alın.');
  if (logodaPasif && !(await sistemAyariOku(db, 'logo.malzeme-pasif-gonderimi'))) throw gecersiz(LOGO_PASIF_KAPALI);
  if ((await aparatKapasiteleri(db)).some((a) => a.aparatKartiId === kayitli.no)) throw bagimliKayit(KART_KULLANIMDA);
  // Logo'daki kartın pasife alma isteği denemeden önce yazılır: tetik Logo kaydı olan kartın silme denemesine yalnız bekleyen istekte izin
  // verir. Kullanılan kartta hata transaction'ı, istekle birlikte geri alır. Logo'dan gelen kartta istek denemenin içindedir ve onunla geri alınır.
  if (logodaPasif) await s.logoPasifIste(db, kayitli.no, kullanici.id);
  const deneme = await kayitNoktasi(db, async () => {
    if (logoda && !logodaPasif) await s.logoPasifIste(db, kayitli.no, kullanici.id);
    await s.katalogKartiSilmeyiDene(db, kimlik);
    throw DENEME_BITTI;
  });
  if (!deneme.tamam && deneme.hata !== DENEME_BITTI) throw deneme.hata.kod === 'BAGIMLI_KAYIT' ? bagimliKayit(KART_KULLANIMDA) : deneme.hata;
  if (logodaPasif) return { id: kimlik, logodaPasifeAliniyor: true };
  await s.katalogKartiIptal(db, kimlik, kullanici.id);
  return { id: kimlik, logodaPasifeAliniyor: false };
}

// Arşiv (2114c): kartın başka modüllerdeki izi. Modüller kendi tablolarını sayar; ters yöndeki bağ sunucu/kablolama.ts'tedir.
export type KartIzleriCozucusu = (db: Db, kartlar: readonly MalzemeKartiAnahtari[]) => Promise<readonly (MalzemeKartiIzi & { modul: string })[]>;
let kartIzleri: KartIzleriCozucusu | null = null;
export function kartIzleriCozucusuKaydet(cozucu: KartIzleriCozucusu): void { kartIzleri = cozucu; }

async function arsivIzleri(db: Db, satirlar: readonly s.ArsivSatiri[]): Promise<Map<number, ArsivIzi[]> | null> {
  if (!kartIzleri) return null;
  const izler = new Map<number, ArsivIzi[]>(satirlar.map((k) => [k.no, []]));
  if (satirlar.length === 0) return izler;
  for (const iz of await kartIzleri(db, satirlar.map((k) => ({ no: k.no, kimlik: k.kimlik, stokKodu: k.stokKodu })))) {
    izler.get(iz.no)?.push({ modul: iz.modul, kayit: iz.kayit, tur: iz.tur, adet: iz.adet, ornek: iz.ornek });
  }
  return izler;
}

function arsivKartiCevabi(k: s.ArsivSatiri, adlar: ReadonlyMap<number, string>, izler: readonly ArsivIzi[] | null): ArsivKarti {
  const adet = arsivIzAdetleri(izler);
  const silenAd = adlar.get(k.silenId);
  return {
    kimlik: k.kimlik, no: k.no, stokKodu: k.stokKodu, ad: k.ad, tur: k.tur, silinme: k.silinme, logoyaGitti: k.logoyaGitti,
    silen: silenAd === undefined ? null : { id: k.silenId, ad: silenAd }, kesinAdet: adet.kesin, olasiAdet: adet.olasi,
  };
}

export async function arsivKartlariniGetir(db: Db): Promise<ArsivKartlariCevabi> {
  const satirlar = await s.arsivKartlari(db);
  const adlar = await kisiAdlari(db, satirlar.map((k) => k.silenId));
  const izler = await arsivIzleri(db, satirlar);
  return { kartlar: satirlar.map((k) => arsivKartiCevabi(k, adlar, izler?.get(k.no) ?? null)) };
}

export async function arsivKartiniGetir(db: Db, kimlik: string): Promise<ArsivKartiCevabi> {
  const k = await s.arsivKarti(db, kimlik, false);
  if (!k) throw bulunamadi('Arşivde bu kart yok.');
  const adlar = await kisiAdlari(db, [k.silenId]);
  const izler = await arsivIzleri(db, [k]);
  const kartIzi = izler?.get(k.no) ?? null;
  return { kart: arsivKartiCevabi(k, adlar, kartIzi), izler: kartIzi };
}

export async function arsivdenGeriGetir(db: Db, kullanici: Kullanici, kimlik: string): Promise<{ id: string }> {
  const k = await s.arsivKarti(db, kimlik, true);
  if (!k) throw bulunamadi('Arşivde bu kart yok.');
  await s.arsivdenGeriGetir(db, kimlik, arsivdenDonusDurumu(k.aktifOlmus), kullanici.id);
  return { id: kimlik };
}

// Kalıcı silme: izler kilitli satırla yeniden sayılır; sayımın görmediği yabancı anahtarlı bağı silmenin kendisi reddeder.
export async function arsivdenKaliciSil(db: Db, kimlik: string, girilenKod: string): Promise<{ id: string }> {
  const k = await s.arsivKarti(db, kimlik, true);
  if (!k) throw bulunamadi('Arşivde bu kart yok.');
  const izler = (await arsivIzleri(db, [k]))?.get(k.no) ?? null;
  const engel = arsivKaliciSilmeEngeli({ izler, logoyaGitti: k.logoyaGitti, stokKodu: k.stokKodu, girilenKod });
  if (engel !== null) throw izler !== null && izler.length > 0 ? bagimliKayit(engel) : gecersiz(engel);
  const silme = await kayitNoktasi(db, () => s.katalogKartiSilmeyiDene(db, kimlik));
  if (!silme.tamam) throw silme.hata.kod === 'BAGIMLI_KAYIT' ? bagimliKayit('Kart başka kayıtlarda kullanılıyor; kalıcı silinemez.') : silme.hata;
  return { id: kimlik };
}

export async function katalogSablonlariniGetir(db: Db, kullanici: Kullanici): Promise<KatalogSablonlariCevabi> {
  const satirlar = await s.katalogSablonlari(db);
  // Ekran kaldırma düğmesini yalnız bunlarda gösterir; asıl denetim kaldırma ucundaki koşullu silmededir.
  const yazar = kullanici.islemler.includes('malzemeler.yaz');
  const onayci = kullanici.islemler.includes('malzemeler.onayla');
  return {
    sablonlar: satirlar.map((x) => x.sablon),
    surumler: Object.fromEntries(satirlar.map((x) => [x.kimlik, x.surum])),
    kaldirabilir: satirlar.filter((x) => yazar && (onayci || x.kaydedenKisiId === kullanici.id)).map((x) => x.kimlik),
  };
}

export async function katalogSablonuKaydet(
  db: Db, kullanici: Kullanici, kimlik: string, sablon: Record<string, unknown>, surum: number | null,
): Promise<{ id: string; surum: number }> {
  if (sablon['id'] !== kimlik) throw dogrulama('Şablonun kimliği adresle aynı olmalı.', 'sablon.id');
  const r = await s.katalogSablonuYaz(db, kimlik, sablon, kullanici.id, kullanici.islemler.includes('malzemeler.onayla'), surum);
  if (r === 'yetkisiz') throw yetkiYok('Başkasının şablonunun üstüne yalnız onay yetkilisi yazar.');
  if (r === 'cakisma') throw eskiSurum();
  return { id: kimlik, surum: r.surum };
}

export async function katalogSablonuKaldir(db: Db, kullanici: Kullanici, kimlik: string): Promise<{ id: string }> {
  const sonuc = await s.katalogSablonuKaldir(db, kimlik, kullanici.id, kullanici.islemler.includes('malzemeler.onayla'));
  if (sonuc === 'yok') throw bulunamadi('Şablon bulunamadı.');
  if (sonuc === 'yetkisiz') throw yetkiYok('Şablonu yalnız kaydeden ya da onay yetkilisi kaldırır.');
  return { id: kimlik };
}

export async function katalogAyarlariniGetir(db: Db, kullanici: Kullanici): Promise<KatalogAyarlariCevabi> {
  const satirlar = await s.katalogAyarlari(db);
  const a = new Map(satirlar.map((x) => [x.anahtar, x.deger]));
  const surum = (anahtar: string) => satirlar.find((x) => x.anahtar === anahtar)?.surum ?? null;
  return {
    surumler: { malzeme: surum('malzeme'), operasyonlar: surum('operasyonlar'), genel: surum('genel') },
    malzeme: a.get('malzeme') ?? null, operasyonlar: a.get('operasyonlar') ?? null, genel: a.get('genel') ?? null,
    operasyonTipleri: (await operasyonTipleri(db, { pasiflerDahil: true }))
      .map((t) => ({ kod: t.kod, ad: t.ad, grup: t.grup, grupAdi: OPERASYON_GRUP_ADLARI[t.grup], aktif: t.aktif })),
    dortGoz: await dortGozAcikMi(db), rol: katalogRolu(kullanici.islemler), ayarYazabilir: kullanici.islemler.includes('malzemeler.tanim-yaz'),
  };
}

export async function katalogAyariKaydet(
  db: Db, kullanici: Kullanici, anahtar: string, deger: Record<string, unknown>, surum: number | null,
): Promise<{ id: string; surum: number }> {
  if (anahtar === 'operasyonlar') throw gecersiz(OPERASYON_AYARI_ILETISI);
  // Onay akışını yalnız bayraklı yönetici açıp kapatır (#227 madde 1): tanım ve onay işlemlerini birlikte taşıyan rol (müdür) ya da iki rollü kişi
  // onay adımını kapatıp dört gözü dolanamaz. İşlem listesi bayrağı söylemez (iki rol aynı listeyi verir); bayrak kişiden sorulur.
  if (anahtar === 'genel' && katalogOnayAkisiAcikMi(deger) !== katalogOnayAkisiAcikMi(await katalogGenelAyari(db)) && !(await kisiBayrakliMi(db, kullanici.id))) {
    throw yetkiYok('Onay akışını yalnız yönetici açıp kapatır.');
  }
  if (anahtar === 'genel' && !katalogFirmaKoduGecerliMi(deger['firmaKodu'])) {
    throw dogrulama('Firma kodu 2-5 büyük harf ya da rakam olmalı ve tür kısaltması (HM, YM, MM, SF, DB, HZ) olamaz.', 'deger.firmaKodu');
  }
  if (anahtar === 'genel' && !katalogFirmaKoduTurleriGecerliMi(deger['firmaKoduTurleri'])) {
    throw dogrulama('Firma kodlu türler, malzeme türlerinden tekrarsız bir liste olmalı.', 'deger.firmaKoduTurleri');
  }
  // Ekran genel ayarı bütün olarak yazar; alan eklenmeden önce açılmış bir sekme onu göndermez ve kayıtlı değeri silmemeli. Boş metin siler.
  if (anahtar === 'genel') {
    const kayitliGenel = await katalogGenelAyari(db);
    for (const alan of ['firmaKodu', 'firmaKoduTurleri']) {
      if (deger[alan] === undefined && kayitliGenel?.[alan] !== undefined) deger = { ...deger, [alan]: kayitliGenel[alan] };
    }
  }
  if (anahtar === 'malzeme' && !katalogKurallariGecerliMi(deger['kurallar'])) {
    throw dogrulama('Çakışma alanları, alan adlarından oluşan bir liste olmalı.', 'deger.kurallar');
  }
  const oncekiMalzeme = anahtar === 'malzeme' ? await katalogMalzemeAyari(db) : null;
  // Tür kuralları eklenmeden önce açılmış sekme `kurallar` göndermez; çakışma alanları sessizce silinip anahtarlar değişmemeli.
  if (anahtar === 'malzeme' && deger['kurallar'] === undefined && oncekiMalzeme?.['kurallar'] !== undefined) deger = { ...deger, kurallar: oncekiMalzeme['kurallar'] };
  const yazilan = await s.katalogAyariYaz(db, anahtar, deger, kullanici.id, surum);
  if (yazilan === 'cakisma') throw eskiSurum();
  if (anahtar === 'malzeme') await cakismaAnahtarlariniYenile(db, oncekiMalzeme, deger);
  // ML2 b: birim ve kategori listesi prototipin ayarında düzenlenir; tablolar aynı işlemde ayardan yeniden hesaplanır.
  if (anahtar === 'malzeme') {
    const birimler = ayarBirimleri(deger, await s.birimTablosu(db));
    if ('hata' in birimler) throw dogrulama(birimler.hata, 'deger.listeler');
    await s.birimleriYaz(db, birimler);
    const kategoriler = ayarKategorileri(deger, await s.kategoriTablosu(db));
    if ('hata' in kategoriler) throw dogrulama(kategoriler.hata, 'deger.kategoriler');
    await s.kategorileriYaz(db, kategoriler);
  }
  return { id: anahtar, surum: yazilan.surum };
}

// 2465 (2459 a): kategori ağacı; ailelerin eki ve gizlisi Malzeme ayarından. Yetki denetlemez.
export async function kategoriAgaci(db: Db): Promise<KategoriAgaciDugumu[]> {
  return kategoriAgaciKur(await katalogMalzemeAyari(db), await s.kategoriSatirlari(db));
}

// Logo modülü bir birim setini kaldırmadan önce sorar (kart #207 isteği madde 4): bütün birim karşılıklarına bakar, kuyruktakilere değil.
export async function logoBirimSetiKullaniliyorMu(db: Db, kod: string): Promise<boolean> {
  return s.logoBirimSetiKullanimda(db, kod);
}

// Kart #466: tedarikçi alanı Müşteriler ve Tedarikçiler'in aktif tedarikçi firmalarından seçilir (satın almanın firma seçimiyle aynı süzgeç).
export async function firmaSecenekleri(db: Db, ara: string): Promise<{ id: number; ad: string; kod: string | null }[]> {
  return firmaAra(db, { metin: ara, sinir: FIRMA_SECENEK_SINIRI, yalnizAktif: true, tur: 'tedarikci' });
}
const FIRMA_SECENEK_SINIRI = 50;

// 885 a: kart ekranı alet seçicisini ve bağlı aletin vadesini Kalibrasyon'dan bu yolla okur; kartı okuyan Kalibrasyon yetkisi istemez.
export async function olcuAletiSecenekleri(db: Db): Promise<OlcuAletiSecenekleriCevabi> {
  return { aletler: (await aletKimlikleri(db)).map((a) => ({ no: a.no, tur: a.tur, vade: a.vade, durum: a.durum })) };
}

// 1469 a: ham önerisinin stok listesi (aktif hammadde kartları, istenen formlarda). Yetki denetlemez.
// 1480: yogunluk (g/cm³) sunucunun bildiği yerden: kartın özel kalitesi, yoksa Malzeme ayarlarında eklenen kalite. Yerleşik kalitenin
// yoğunluğu yalnız istemcinin Malzemeler tablosundadır: burada null, `aile` ve `kaliteKodu` ile istemci bulur.
export interface HammaddeStokOlcusu {
  malzemeNo: number; kod: string; ad: string | null; kalite: string | null; form: string; olcu: Record<string, unknown>;
  aile: string | null; kaliteKodu: string | null; yogunluk: number | null;
}
export async function hammaddeStokOlculeri(db: Db, formlar: readonly string[], kalite: string | null = null): Promise<HammaddeStokOlcusu[]> {
  if (formlar.length === 0) return [];
  const satirlar = await s.hammaddeStokSatirlari(db, formlar, kalite);
  const eklenen = ayarKaliteYogunluklari(await katalogMalzemeAyari(db));
  return satirlar.map(({ no, ozelYogunluk, ...r }) => ({
    malzemeNo: no, ...r,
    yogunluk: ozelYogunluk ?? (r.aile !== null && r.kaliteKodu !== null ? eklenen.get(`${r.aile}|${r.kaliteKodu}`) ?? null : null),
  }));
}

/* ---------------- Demirbaş teknik bilgisi (1595) ---------------- */
const DEMIRBAS_KISITLARI = {
  malzemeler_demirbas_teknik_makine_tek: { ileti: 'Bu makine başka bir demirbaş kartına bağlı.', alan: 'makineId' },
  malzemeler_demirbas_teknik_makine: { ileti: 'Makine bulunamadı.', alan: 'makineId' },
} as const;

async function demirbasMakinesi(db: Db, makineId: number | null): Promise<{ id: number; kod: string; ad: string; aktif: boolean } | null> {
  if (makineId === null) return null;
  const m = await makineGetir(db, makineId);
  return m ? { id: m.id, kod: m.kod, ad: m.ad, aktif: m.aktif } : null;
}

export async function demirbasTeknikOku(db: Db, kimlik: string): Promise<DemirbasTeknikCevabi> {
  if (!(await s.katalogKartTuru(db, kimlik))) throw bulunamadi('Malzeme kataloğu kartı bulunamadı.');
  const t = await s.demirbasTeknikGetir(db, kimlik);
  if (!t) return { teknik: null };
  return {
    teknik: {
      surum: t.surum, alanlar: t.alanlar, ozellikler: await s.demirbasOzellikleri(db, kimlik),
      makine: await demirbasMakinesi(db, t.makineId), guncelleme: t.guncelleme,
    },
  };
}

// Teknik kayıt ve özellik listesi birlikte yazılır; kart satırı kilitlenir ki kart aynı anda iptal edilemesin.
export function demirbasTeknikKaydet(db: Db, kullanici: Kullanici, kimlik: string, g: z.output<typeof demirbasTeknikKaydetGovdesi>): Promise<DemirbasTeknikCevabi> {
  return kisitKorumali(DEMIRBAS_KISITLARI, async () => {
    const kart = await s.katalogKartiKilitle(db, kimlik);
    if (!kart) throw bulunamadi('Malzeme kataloğu kartı bulunamadı.');
    const red = demirbasTeknikYazilabilirMi(kart.tur, kart.onayDurumu);
    if (red) throw gecersiz(red);
    const tekrar = tekrarlananOzellik(g.ozellikler.map((o) => o.ad));
    if (tekrar !== null) throw dogrulama(`"${tekrar}" özelliği iki kez yazılmış.`, 'ozellikler');
    if (g.makineId !== null && !(await makineGetir(db, g.makineId))) throw dogrulama('Makine bulunamadı.', 'makineId');
    const mevcut = await s.demirbasTeknikGetir(db, kimlik, true);
    const yazim = demirbasTeknikYazimi(mevcut?.surum ?? null, g.surum);
    if (yazim === 'eski-surum') throw eskiSurum();
    if (yazim === 'ekle') await s.demirbasTeknikEkle(db, kimlik, g.makineId, g.alanlar, kullanici.id);
    else if ((await s.demirbasTeknikGuncelle(db, kimlik, g.surum!, g.makineId, g.alanlar, kullanici.id)) === null) throw eskiSurum();
    await s.demirbasOzellikleriYaz(db, kimlik, g.ozellikler);
    return demirbasTeknikOku(db, kimlik);
  });
}

export async function demirbasMakineSecenekleri(db: Db): Promise<DemirbasMakineSecenekleriCevabi> {
  const liste = await makineler(db, { pasiflerDahil: true });
  const bagli = await s.makineBagliKartlari(db);
  return { makineler: liste.map((m) => ({ id: m.id, kod: m.kod, ad: m.ad, aktif: m.aktif, bagliKart: bagli.get(m.id) ?? null })) };
}

/* ---------------- Logo'dan gelen kartlar (2116; kararlar 2116-2 a, 2116-3 c, 2116-4 a) ---------------- */

// Logo'daki kartların aynası, kod eşlemesi ve ters çevirisi logo modülündedir; logo bu modülü ithal ettiği için sunucu/kablolama.ts kaydeder.
// Kayıt yokken (bağ kurulmamış) liste boş döner, alma ve bağlama reddedilir. Ağ yok: hepsi logo modülünün yerel tablosu.
export interface LogoAynaKarti {
  logoKayitNo: number; kod: string; ad: string | null; aciklama2: string | null; aciklama3: string | null;
  kartTuru: number | null; birimSeti: string | null; aktif: boolean; sonOkuma: string;
}
export type LogoKartAynasiCozucusu = (db: Db, o: { kodlar?: readonly string[]; ara?: string; sinir: number; sonra: number }) => Promise<LogoAynaKarti[]>;
export type LogoEslemeYazici = (db: Db, e: { stokKodu: string; logoKodu: string; logoKayitNo: number }) => Promise<void>;
export type LogoTmiKodCozucusu = (db: Db, logoKodlari: readonly string[]) => Promise<Map<string, string>>;
let logoKartAynasi: LogoKartAynasiCozucusu | null = null;
let logoEslemeYazici: LogoEslemeYazici | null = null;
let logoTmiKodlari: LogoTmiKodCozucusu | null = null;
export function logoKartAynasiKaydet(c: LogoKartAynasiCozucusu): void { logoKartAynasi = c; }
// 3068: geçiş sayfası aynanın hafif özetini (süzgeç, sayaç) ve okuma durumunu logo modülünden alır; sunucu/kablolama.ts bağlar.
export interface LogoAynaOzeti {
  kartlar: { logoKayitNo: number; kod: string; aktif: boolean; stok: string | null; sonHareket: string | null; acikSiparis: boolean | null }[];
  okuma: { acik: boolean; suruyor: boolean; okunan: number | null; sonTamam: string | null };
  kullanim: { acik: boolean; sonTamam: string | null };
  arama: { acik: boolean };
}
export type LogoAynaOzetiCozucusu = (db: Db, o: { ara?: string }) => Promise<LogoAynaOzeti>;
let logoAynaOzeti: LogoAynaOzetiCozucusu | null = null;
export function logoAynaOzetiKaydet(c: LogoAynaOzetiCozucusu): void { logoAynaOzeti = c; }
export function logoEslemeYaziciKaydet(c: LogoEslemeYazici): void { logoEslemeYazici = c; }
export function logoTmiKodCozucusuKaydet(c: LogoTmiKodCozucusu): void { logoTmiKodlari = c; }

const LOGO_BAGI_YOK = 'Logo malzeme okuması bağlı değil; Sistem Ayarları\'nda "Logo: malzeme kartı okuması"nı açın.';

async function logoGelenTmiKartlari(db: Db, kartlar: readonly LogoAynaKarti[]) {
  const esleme = kartlar.length && logoTmiKodlari ? await logoTmiKodlari(db, kartlar.map((k) => k.kod)) : new Map<string, string>();
  const tmi = await s.logoIcinTmiKartlari(db, kartlar.map((k) => String(k.logoKayitNo)), [...kartlar.map((k) => k.kod), ...esleme.values()]);
  return {
    esleme,
    refle: new Map(tmi.filter((k) => k.logoKayitNo !== null).map((k) => [k.logoKayitNo!, k])),
    kodla: new Map(tmi.map((k) => [k.stokKodu, k])),
  };
}

export async function logodanGelenler(db: Db, q: z.output<typeof logoGelenSorgusu>): Promise<LogoGelenCevabi> {
  if (!logoKartAynasi) return { baglanti: false, kartlar: [], sonraki: null };
  const kartlar = await logoKartAynasi(db, { ...(q.ara ? { ara: q.ara } : {}), sinir: LOGO_GELEN_SAYFA_BOYU, sonra: q.sonra });
  const { esleme, refle, kodla } = await logoGelenTmiKartlari(db, kartlar);
  const firma = katalogFirmaKodu(await katalogGenelAyari(db));
  return {
    baglanti: true,
    kartlar: kartlar.map((k) => {
      const { durum, tmi } = logoGelenDurumu(k, refle, kodla, esleme);
      return {
        logoKayitNo: k.logoKayitNo, kod: k.kod, ad: k.ad, aciklama2: k.aciklama2, aciklama3: k.aciklama3,
        kartTuru: k.kartTuru === null ? null : String(k.kartTuru), birimSeti: k.birimSeti, aktif: k.aktif, sonOkuma: k.sonOkuma, durum,
        koduUyar: logoKodBicimi(k.kod, firma) !== null,
        tmi: tmi && { kimlik: tmi.kimlik, stokKodu: tmi.stokKodu, ad: tmi.ad, onayDurumu: tmi.onayDurumu, surum: tmi.surum, logoKayitli: tmi.logoKayitNo !== null },
        farklar: durum === 'bagli' && tmi ? logoKartFarklari(k, tmi) : [],
      };
    }),
    sonraki: kartlar.length < LOGO_GELEN_SAYFA_BOYU ? null : kartlar.at(-1)!.logoKayitNo,
  };
}

const stokVar = (stok: string | null): boolean => stok !== null && Number(stok) > 0;

// 3068: Logo geçişi. Süzgeç ve sayaçlar bütün aynanın hafif özetinden, sayfa satırları yalnız o sayfanın kartlarından kurulur;
// sayaçlar aramadan bağımsızdır (aynanın tamamı), süzgece uyan sayı aramayla birlikte.
export async function logoGecisi(db: Db, q: z.output<typeof logoGecisSorgusu>, bugun = new Date()): Promise<LogoGecisCevabi> {
  const bos = { toplam: 0, stoklu: 0, yeni: 0, bagsiz: 0, bagli: 0, kullanimDisi: 0, kullanilan: null, kararBekleyen: 0 };
  if (!logoKartAynasi || !logoAynaOzeti) {
    return {
      baglanti: false, okuma: { acik: false, suruyor: false, okunan: null, sonTamam: null }, sayilar: bos, suzgec: q.suzgec ?? 'stoklu', kullanim: false, canliArama: false,
      uyan: 0, kartlar: [], sayfa: 0, sonrakiSayfa: null,
    };
  }
  const ozet = await logoAynaOzeti(db, {});
  // 3079 a: kullanım izi bir tam turda okunduysa süzgeç ve nedenler kurulur; ayar sonradan kapansa da okunmuş iz geçerlidir.
  const kullanim = ozet.kullanim.sonTamam !== null;
  const suzgec = q.suzgec ?? (kullanim ? 'kullanilan' : 'stoklu');
  const esik = logoKullanimEsigi(bugun.toISOString().slice(0, 10));
  const nedenler = (k: { stok: string | null; sonHareket: string | null; acikSiparis: boolean | null }) =>
    (kullanim ? logoKullanimNedenleri(k, esik) : null);
  const firma = katalogFirmaKodu(await katalogGenelAyari(db));
  const birimKarsiliklari = (await s.logoKarsiliklari(db)).filter((k) => k.cesit === 'birim');
  const tumKartlar = ozet.kartlar.map((k) => ({ ...k, ad: null, aciklama2: null, aciklama3: null, kartTuru: null, birimSeti: null, sonOkuma: '' }));
  const { esleme, refle, kodla } = await logoGelenTmiKartlari(db, tumKartlar);
  const satirlar = ozet.kartlar.map((k) => {
    const { durum, tmi } = logoGelenDurumu(k, refle, kodla, esleme);
    return { k, durum, tmi, koduUyar: logoKodBicimi(k.kod, firma) !== null };
  });
  const sayilar: LogoGecisCevabi['sayilar'] = { ...bos, toplam: satirlar.length, kullanilan: kullanim ? 0 : null };
  for (const r of satirlar) {
    if (stokVar(r.k.stok)) sayilar.stoklu += 1;
    if (sayilar.kullanilan !== null && nedenler(r.k)!.length > 0) sayilar.kullanilan += 1;
    if (!r.k.aktif) sayilar.kullanimDisi += 1;
    if (r.durum === 'yeni') sayilar.yeni += 1;
    else if (r.durum === 'bagsiz') sayilar.bagsiz += 1;
    else sayilar.bagli += 1;
  }
  const arananlar = q.ara ? new Set((await logoAynaOzeti(db, { ara: q.ara })).kartlar.map((k) => k.logoKayitNo)) : null;
  const uyanlar = satirlar.filter((r) => (arananlar === null || arananlar.has(r.k.logoKayitNo)) && (
    suzgec === 'tumu' ? true
      : suzgec === 'stoklu' ? stokVar(r.k.stok)
        : suzgec === 'kullanilan' ? (nedenler(r.k) ?? []).length > 0 || (!kullanim && stokVar(r.k.stok))
          : suzgec === 'kullanim-disi' ? !r.k.aktif
            : r.durum === suzgec));
  const sayfaSatirlari = uyanlar.slice(q.sayfa * LOGO_GECIS_SAYFA_BOYU, (q.sayfa + 1) * LOGO_GECIS_SAYFA_BOYU);
  const tam = new Map((sayfaSatirlari.length === 0 ? [] : await logoKartAynasi(db, {
    kodlar: sayfaSatirlari.map((r) => r.k.kod), sinir: sayfaSatirlari.length, sonra: 0,
  })).map((k) => [k.logoKayitNo, k]));
  const kartlar = sayfaSatirlari.map((r) => {
    const t = tam.get(r.k.logoKayitNo);
    const birimSeti = t?.birimSeti ?? null;
    const aday = logoGecisAdayligi({ durum: r.durum, aktif: r.k.aktif, koduUyar: r.koduUyar, logoBirimSeti: birimSeti, tmi: r.tmi, birimKarsiliklari });
    return {
      logoKayitNo: r.k.logoKayitNo, kod: r.k.kod, ad: t?.ad ?? null, birimSeti, kartTuru: t?.kartTuru == null ? null : String(t.kartTuru),
      aktif: r.k.aktif, stok: r.k.stok, sonHareket: r.k.sonHareket, kullanimNedenleri: nedenler(r.k), durum: r.durum, koduUyar: r.koduUyar, ...aday,
      tmi: r.tmi && {
        kimlik: r.tmi.kimlik, stokKodu: r.tmi.stokKodu, ad: r.tmi.ad, birim: r.tmi.birim, onayDurumu: r.tmi.onayDurumu, surum: r.tmi.surum, logoKayitli: r.tmi.logoKayitNo !== null,
      },
      farklar: r.durum === 'bagli' && r.tmi && t ? logoKartFarklari(t, r.tmi) : [],
    };
  });
  // Karar bekleyen sayısı yalnız birim farkı dışındakiler için bütün aynadan sayılır; birim için tam kart gerekir, sayfa kadarı yazılır.
  sayilar.kararBekleyen = satirlar.filter((r) => r.k.aktif && ((r.durum === 'yeni' && !r.koduUyar) || (r.durum === 'bagsiz' && r.tmi?.onayDurumu === 'iptal'))).length
    + kartlar.filter((k) => k.kararNedeni === 'birim-farki').length;
  return {
    baglanti: true, okuma: ozet.okuma, sayilar, suzgec, kullanim, canliArama: ozet.arama.acik, uyan: uyanlar.length, kartlar, sayfa: q.sayfa,
    sonrakiSayfa: (q.sayfa + 1) * LOGO_GECIS_SAYFA_BOYU < uyanlar.length ? q.sayfa + 1 : null,
  };
}

async function aynadakiKart(db: Db, ref: number): Promise<LogoAynaKarti> {
  if (!logoKartAynasi) throw gecersiz(LOGO_BAGI_YOK);
  const k = (await logoKartAynasi(db, { sinir: 1, sonra: ref - 1 }))[0];
  if (!k || k.logoKayitNo !== ref) throw bulunamadi('Logo kartı okunan listede yok; Logo malzeme okumasını bekleyin.');
  return k;
}

// 2116-4 a: Logo'daki kart TMI'de taslak açılır; tür ve birim seçilir, öteki zorunlu alanlar onaydan önce sihirbazda tamamlanır.
// Kart Logo'da olduğu için gönderilmiş sayılır (yeniden gönderilmez); kodu TMI biçimine uymuyorsa yeni kod alır ve eşlemesi yazılır (2116-3 c).
export async function logodanKartAl(
  db: Db, kullanici: Kullanici, ref: number, g: z.output<typeof logodanAlGovdesi>, secenek: { yalnizKendiKodu?: boolean } = {},
): Promise<LogodanAlCevabi> {
  const k = await aynadakiKart(db, ref);
  if (!k.aktif) throw gecersiz('Logo\'da kullanım dışı kart alınmaz.');
  const { refle, kodla, esleme } = await logoGelenTmiKartlari(db, [k]);
  const { durum, tmi } = logoGelenDurumu(k, refle, kodla, esleme);
  if (durum === 'bagli') throw cakisma(`Bu Logo kartı TMI'de zaten var: ${tmi!.stokKodu}.`);
  if (durum === 'bagsiz') throw cakisma(`TMI'de aynı kodlu kart var: ${tmi!.stokKodu}. Yeni kart açmak yerine bağlayın.`);
  if (!(await s.birimSecilebilirMi(db, g.birim))) throw dogrulama(`"${g.birim}" birim listesinde yok; Ayarlar'daki birim listesinden seçin.`, 'birim');
  const genel = await katalogGenelAyari(db);
  const firmaOneki = katalogFirmaOneki(genel, g.tur);
  const bicim = logoKodBicimi(k.kod, katalogFirmaKodu(genel));
  let kod: { onek: string; sira: number; stokKodu: string };
  if (bicim && logoKoduTureUyar(bicim, g.tur, firmaOneki)) {
    await s.katalogSirasiniIlerlet(db, bicim.onek, bicim.sira);
    kod = { ...bicim, stokKodu: k.kod };
  } else {
    // Toplu almada kod eşlemesi yazılmaz: geri alma eşlemeyi silemez (eşleme değişmez), kod eşlenecek kart tek tek alınır.
    if (secenek.yalnizKendiKodu) throw gecersiz('Logo kodu seçilen türün koduna uymuyor; tek tek alın.');
    if (!logoEslemeYazici) throw gecersiz(LOGO_BAGI_YOK);
    if (!firmaOneki && !g.onek) throw dogrulama('Logo kodu TMI kod biçimine ya da seçilen türe uymuyor; yeni kodun önekini seçin (ör. HM-GEN-).', 'onek');
    kod = await yeniStokKodu(db, firmaOneki ? null : `${g.onek!.toUpperCase()}1`, g.tur);
  }
  if (kodla.has(kod.stokKodu)) throw cakisma(`TMI'de ${kod.stokKodu} kodlu kart var.`);
  const ad = k.ad ?? k.kod;
  const kimlik = `logo-${ref}`;
  const kayit = { id: kimlik, tur: g.tur, com: { kod: kod.stokKodu, ad, birim: g.birim }, onay: { durum: 'taslak' } };
  const yazim: s.KatalogKartiYazimi = {
    kimlik, tur: g.tur, hizmetYonu: null, benzersizAnahtar: null, varsayilanAnahtar: null, mukerrerGerekcesi: null, onayDurumu: 'taslak', kayit,
    kisiId: kullanici.id, gonderenKisiId: null, onaylayanKisiId: null, onaylandi: false, dortGozsuz: false, logoAdGuncellemesi: false,
    agirlik: null, netAgirlikKg: null, tedarikciFirmaId: null, olcuAletiId: null, aciklamalar: [k.ad, k.aciklama2, k.aciklama3],
    birimDonusumu: null, gkk: { yaz: false, deger: null },
  };
  const r = await kisitKorumali(KART_KISITLARI, () => s.katalogKartiEkle(db, yazim, kod.onek, kod.sira));
  await s.logoKaydiYaz(db, kimlik, { kayitNo: String(ref), kartTuru: k.kartTuru === null ? null : String(k.kartTuru), birimSeti: k.birimSeti }, { surum: null, kisiId: kullanici.id });
  const eslendi = r.stokKodu !== k.kod;
  if (eslendi) await logoEslemeYazici!(db, { stokKodu: r.stokKodu, logoKodu: k.kod, logoKayitNo: ref });
  return { id: kimlik, stok_kodu: r.stokKodu, eslendi };
}

// 2116-2 a: aynı kodlu bağsız kart bağlanır: Logo kayıt numarası yazılır, kart yeniden gönderilmez; TMI'deki alanlar ezilmez.
// 2116h (kullanıcı onayı 05.11): aynı kod aynı malzeme demek değildir. Aynı kodlu TMI kartı Logo'dakinden farklı malzemeyse aynı
// önekte sıradaki boş koda geçer (Logo'da kullanılanlar atlanır); eski kod önceki kod olarak kalır. Bağlar kartın iç numarasıyla
// olduğu için başka kayıt değişmez. Logo kaydı olan kartın kodu Logo'da yaşadığı için değişmez.
export async function logoKartiYeniKodaGec(db: Db, kullanici: Kullanici, ref: number, surum: number): Promise<LogoYeniKodCevabi> {
  const k = await aynadakiKart(db, ref);
  const { refle, kodla, esleme } = await logoGelenTmiKartlari(db, [k]);
  const { durum, tmi } = logoGelenDurumu(k, refle, kodla, esleme);
  if (durum === 'bagli') throw cakisma(`Bu Logo kartı ${tmi!.stokKodu} kartına bağlı; aynı malzeme sayılıyor.`);
  if (!tmi) throw bulunamadi('TMI\'de aynı kodlu kart yok; değiştirilecek kod yok.');
  if (tmi.logoKayitNo !== null) throw gecersiz(`${tmi.stokKodu} Logo'ya gönderilmiş; kodu Logo'da yaşadığı için değişmez.`);
  if (tmi.onayDurumu === 'iptal') throw gecersiz('Silinmiş kartın kodu değişmez.');
  const onek = await s.kartinOneki(db, tmi.kimlik);
  if (onek === null) throw bulunamadi('Kart bulunamadı.');
  const r = await s.yeniKodaGec(db, tmi.kimlik, await logoyuAtlayanSira(db, onek), { surum, kisiId: kullanici.id });
  if (!r) throw eskiSurum();
  return { id: tmi.kimlik, stok_kodu: r.stokKodu, eski_kod: r.eskiKod, surum: r.surum };
}

export async function logoKartiBagla(db: Db, kullanici: Kullanici, ref: number, surum: number): Promise<{ id: string; surum: number }> {
  const k = await aynadakiKart(db, ref);
  const { refle, kodla, esleme } = await logoGelenTmiKartlari(db, [k]);
  const { durum, tmi } = logoGelenDurumu(k, refle, kodla, esleme);
  if (durum === 'bagli') throw cakisma(`Bu Logo kartı zaten ${tmi!.stokKodu} kartına bağlı.`);
  if (!tmi) throw bulunamadi('TMI\'de aynı kodlu kart yok; kartı Logo\'dan alın.');
  if (tmi.logoKayitNo !== null) throw cakisma(`${tmi.stokKodu} başka bir Logo kaydına bağlı.`);
  if (tmi.onayDurumu === 'iptal') throw gecersiz('Silinmiş kart bağlanmaz.');
  const r = await s.logoKaydiYaz(db, tmi.kimlik, { kayitNo: String(ref), kartTuru: k.kartTuru === null ? null : String(k.kartTuru), birimSeti: k.birimSeti }, { surum, kisiId: kullanici.id });
  if (!r) throw eskiSurum();
  return { id: tmi.kimlik, surum: r.surum };
}

// 2116-2 a: bağlı kartta kullanıcı isterse Logo'daki açıklamalar alınır (kart kart). Logo'ya geri gönderilmez.
export async function logoFarkiniAl(db: Db, kullanici: Kullanici, ref: number, surum: number): Promise<{ id: string; surum: number }> {
  const k = await aynadakiKart(db, ref);
  const { refle, kodla, esleme } = await logoGelenTmiKartlari(db, [k]);
  const { durum, tmi } = logoGelenDurumu(k, refle, kodla, esleme);
  if (durum !== 'bagli' || !tmi) throw gecersiz('Logo\'dakini almak için kart önce bağlanmalı.');
  if (tmi.onayDurumu === 'iptal') throw gecersiz('Silinmiş kart değiştirilmez.');
  const r = await s.logoAciklamalariniYaz(db, tmi.kimlik, [k.ad, k.aciklama2, k.aciklama3], { surum, kisiId: kullanici.id });
  if (!r) throw eskiSurum();
  return { id: tmi.kimlik, surum: r.surum };
}

// 3068 a: toplu bağla ve al. Her kart kendi kayıt noktasında tek kart işlemiyle (aynı kurallar) işlenir; olmayan atlanır ve nedeni döner.
// İşlenen kart izle yazılır; "Bu işlemi geri al" yalnız bu izle ve yalnız CORE'da geri döner. Logo'ya hiçbir şey gitmez.
export async function logoTopluBagla(db: Db, kullanici: Kullanici, g: z.output<typeof logoTopluBaglaGovdesi>): Promise<LogoTopluCevabi> {
  return topluIsle(db, kullanici, 'bagla', g.kartlar, async (ref, surum) => {
    if (surum === null) throw gecersiz('CORE kartının sürümü yok; listeyi yenileyin.');
    const k = await aynadakiKart(db, ref);
    const { refle, kodla, esleme } = await logoGelenTmiKartlari(db, [k]);
    const { tmi } = logoGelenDurumu(k, refle, kodla, esleme);
    const birimKarsiliklari = (await s.logoKarsiliklari(db)).filter((x) => x.cesit === 'birim');
    const aday = logoGecisAdayligi({ durum: logoGelenDurumu(k, refle, kodla, esleme).durum, aktif: k.aktif, koduUyar: true, logoBirimSeti: k.birimSeti, tmi, birimKarsiliklari });
    if (!aday.topluBaglanir) throw gecersiz(aday.kararNedeni === 'birim-farki' ? 'Birim farklı; tek tek bağlayın.' : 'Toplu bağlanamaz; satırdan işleyin.');
    const onceki = tmi ? await s.logoGonderimAlanlari(db, tmi.kimlik) : null;
    const r = await logoKartiBagla(db, kullanici, ref, surum);
    return { kimlik: r.id, kod: k.kod, stokKodu: tmi!.stokKodu, onceki };
  });
}

export async function logoTopluAl(db: Db, kullanici: Kullanici, g: z.output<typeof logoTopluAlGovdesi>): Promise<LogoTopluCevabi> {
  const karsiliklar = await s.logoKarsiliklari(db);
  const tek = (cesit: 'tur' | 'birim', logo: string | null): string | null => {
    const uyan = karsiliklar.filter((x) => x.cesit === cesit && logo !== null && x.logoDegeri === logo);
    return uyan.length === 1 ? uyan[0]!.tmiDegeri : null;
  };
  return topluIsle(db, kullanici, 'al', g.kartlar, async (ref) => {
    const k = await aynadakiKart(db, ref);
    const tur = g.tur ?? tek('tur', k.kartTuru === null ? null : String(k.kartTuru));
    const birim = g.birim ?? tek('birim', k.birimSeti);
    if (tur === null) throw gecersiz('Türün Logo karşılığı yok; türü seçin ya da tek tek alın.');
    if (birim === null) throw gecersiz('Birimin Logo karşılığı yok; birimi seçin ya da tek tek alın.');
    const turu = LOGO_TUR_KARSILIGI_TURLERI.find((x) => x === tur);
    if (!turu) throw gecersiz('Türün Logo karşılığı alınabilen bir tür değil; tek tek alın.');
    const r = await logodanKartAl(db, kullanici, ref, { tur: turu, birim, onek: null }, { yalnizKendiKodu: true });
    return { kimlik: r.id, kod: k.kod, stokKodu: r.stok_kodu, onceki: null };
  });
}

async function topluIsle(
  db: Db, kullanici: Kullanici, tur: 'al' | 'bagla', kartlar: readonly { logoKayitNo: number; surum: number | null }[],
  isle: (ref: number, surum: number | null) => Promise<{ kimlik: string; kod: string; stokKodu: string; onceki: s.LogoGonderimAlanlari | null }>,
): Promise<LogoTopluCevabi> {
  if (!logoKartAynasi) throw gecersiz(LOGO_BAGI_YOK);
  const islem = randomUUID();
  const basarili: LogoTopluCevabi['basarili'] = [];
  const atlanan: LogoTopluCevabi['atlanan'] = [];
  const aynadaKod = async (ref: number): Promise<string> => {
    const k = (await logoKartAynasi!(db, { sinir: 1, sonra: ref - 1 }))[0];
    return k?.logoKayitNo === ref ? k.kod : String(ref);
  };
  for (const k of kartlar) {
    const r = await kayitNoktasi(db, async () => {
      const sonuc = await isle(k.logoKayitNo, k.surum);
      await s.gecisIziYaz(db, { islem, kimlik: sonuc.kimlik, tur, logoKayitNo: String(k.logoKayitNo), onceki: sonuc.onceki, kisiId: kullanici.id });
      return sonuc;
    });
    if (r.tamam) basarili.push({ logoKayitNo: k.logoKayitNo, kod: r.deger.kod, stokKodu: r.deger.stokKodu });
    else atlanan.push({ logoKayitNo: k.logoKayitNo, kod: await aynadaKod(k.logoKayitNo), neden: r.hata.message });
  }
  return { islem, tur, basarili, atlanan };
}

// Geri alma: işlemi yapan kişi, işlemden sonra değişmemiş kartta. Bağ boşaltılır ve önceki gönderim alanları döner; alınan taslak silinir.
// Logo'ya istek gitmez; koruma tetiği yalnız geri alınan kart için gevşer (göç 20261112083200).
export async function logoGecisiGeriAl(db: Db, kullanici: Kullanici, islem: string): Promise<LogoGeriAlCevabi> {
  const izler = await s.gecisIzleri(db, islem, kullanici.id);
  if (izler.length === 0) throw bulunamadi('Geri alınacak işlem yok ya da başkasının işlemi.');
  let geriAlinan = 0;
  const atlanan: LogoGeriAlCevabi['atlanan'] = [];
  for (const iz of izler) {
    if (iz.surum !== iz.izSurumu) { atlanan.push({ stokKodu: iz.stokKodu, neden: 'Kart işlemden sonra değişti.' }); continue; }
    if (iz.logoKayitNo !== iz.izKayitNo || iz.logoPasifDurumu !== null) { atlanan.push({ stokKodu: iz.stokKodu, neden: 'Kartın Logo bağı değişti.' }); continue; }
    const r = await kayitNoktasi(db, async () => {
      await s.geriAlinanKart(db, iz.kimlik);
      try {
        if (iz.tur === 'bagla') {
          await s.logoBaginiGeriAl(db, iz.kimlik, iz.onceki!, kullanici.id);
          await s.gecisIziSil(db, islem, iz.kartNo);
        } else {
          await s.katalogKartiSilmeyiDene(db, iz.kimlik);
        }
      } finally {
        await s.geriAlinanKart(db, null);
      }
    });
    if (r.tamam) geriAlinan += 1;
    else atlanan.push({ stokKodu: iz.stokKodu, neden: r.hata.kod === 'BAGIMLI_KAYIT' ? 'Kart başka kayıtta kullanılıyor.' : r.hata.message });
  }
  return { geriAlinan, atlanan };
}

// Aktif kartların sayfasız, sınırlı okuması (Reçete-Rota ve planlama bağlı durumu): stok kodu ve no sırasıyla en çok `sinir` kart;
// sınırdan fazlası varsa `kesildi`. Sayfa sayfa okumak her sayfada kataloğu baştan sayardı; burada tek okuma ve tek sayım vardır.
export async function aktifMalzemelerSinirli(db: Db, sinir: number): Promise<{ kartlar: KatalogMalzemeOzeti[]; kesildi: boolean }> {
  const r = await s.katalogMalzemeAra(db, { metin: null, turler: [], yalnizAktif: true, hizmetYonu: null, sinir: sinir + 1, atla: 0 });
  return { kartlar: r.satirlar.slice(0, sinir), kesildi: r.satirlar.length > sinir };
}
