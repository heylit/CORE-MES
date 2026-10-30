
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz, yetkiYok } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { tedarikciOlabilirMi } from '../finans/disari.ts';
import { firmaAra, firmaOzeti } from '../musteri-tedarikci/disari.ts';
import { aletKimlikleri, aletNoIleGetir } from '../kalibrasyon/disari.ts';
import { operasyonTipleri } from '../istasyonlar/disari.ts';
import { OPERASYON_GRUP_ADLARI } from '#paylasilan/sozlesme/istasyonlar.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { KATALOG_TURLERI, LOGO_KART_TURLERI, MALZEME_SECIM_SAYFA_BOYU } from '#paylasilan/sozlesme/malzemeler.ts';
import type {
  HizmetYonu, LogoDurumuCevabi, LogoEksik, LogoKarsiligi,
  KatalogAyarlariCevabi, KatalogKartiKaydetCevabi, MalzemelerOzetiCevabi, KatalogKartlariCevabi, KatalogMalzemeOzeti, KatalogSablonlariCevabi, KatalogTuru, MalzemeSecimCevabi,
  OlcuAletiSecenekleriCevabi, OlcuBirimleriCevabi, katalogKartiKaydetGovdesi, KatalogKartiRotasiCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import type { z } from 'zod';
import { kisiAdlari, kisiBayrakliMi } from '../kisiler/disari.ts';
import {
  katalogAnahtarCakismalari, katalogAnahtarZorunluMu, katalogOnayEksigi, katalogCakismaAlanlari, katalogKuralAnahtari, katalogKurallariGecerliMi, katalogYeniAnahtar, katalogGecisiDenetle, katalogGecmisiDenetle, katalogGecmisiniBas, katalogIcerigiDegistiMi, katalogIptalEdilirMi,
  katalogIptalYetkiliMi, katalogKodDegisebilirMi, katalogYeniOnek, katalogFirmaKodu, katalogFirmaKoduGecerliMi, katalogFirmaKoduTurleriGecerliMi, katalogKodOneki, katalogFirmaOneki, katalogOnayAkisiAcikMi, katalogStokKodu,
  katalogAgirlikAlanlari, katalogNetAgirlikKg, katalogOnayiBas, katalogOnekiTureUyarMi, katalogRolu, katalogSurumUyarMi, katalogTalebiBas, katalogTalepBicimiGecerliMi, katalogTalepYokMu,
  katalogTalepDenetle, katalogTalepUygulamaDenetle, katalogKaydiAlanlari, ayarBirimleri, ayarKategorileri, kartBilesenKimlikleri, kartOperasyonlari, kartRotaIcerigiDegistiMi, ROTALI_KART_ILETISI, hammaddeOlcuHatasi, hammaddeTanimHatasi, kartZorunluAlanEksigi, katalogSunucuAnahtari, kartTedarikciFirmaId, katalogAciklamalari, kartBirimDonusumu, kartBirimDonusumleri, kartBirimi, kartTedarikciKimlikleri, tedarikciDegistiMi, kartAletNo, kartAletNolari, kartAletNoYaz, eskiKalibrasyonAlanlariniKoru, denetlenecekKategoriler, MUKERRER_GEREKCE_ILETISI, mukerrerGerekcesiKisaMi, logoAdiDegistiMi, logoBirimiDegistiMi, logoGuncellemeSonucuDurumu, logoKarsiligiHatasi, logoDurumSirasi, logoEksikleri, logoHataMetni, ornekKartKimligi,
} from './kurallar.ts';
import type { BirimDonusumu, KartOperasyonu, LogoGuncellemeSonucu, OrnekMalzemeAnahtari } from './kurallar.ts';
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

// 1104 a: satın almanın kart ayrıntısı. Olmayan ve iptal kart haritada yok. Yetki denetlemez; neyin tedarikçiye gideceğine satın alma karar verir.
export type MalzemeSatinAlmaAyrintisi = Omit<s.KatalogSatinAlmaSatiri, 'no'>;
export async function malzemeSatinAlmaAyrintilari(db: Db, nolar: readonly number[]): Promise<Map<number, MalzemeSatinAlmaAyrintisi>> {
  const benzersiz = [...new Set(nolar)];
  if (benzersiz.length === 0) return new Map();
  return new Map((await s.katalogSatinAlmaSatirlari(db, benzersiz)).map(({ no, ...r }) => [no, r]));
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
export async function malzemeOperasyonlari(db: Db, id: number): Promise<KartOperasyonu[] | null> {
  const k = await s.katalogKartKaydiNoIle(db, id);
  return k === null ? null : kartOperasyonlari(k.kayit);
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

/* ---------------- Logo durumu ekranı ve karşılık tablosu ---------------- */

export async function logoDurumunuGetir(db: Db, kullanici: Kullanici): Promise<LogoDurumuCevabi> {
  const kartlar = (await s.logoDurumluKartlar(db)).map((k) => ({
    id: k.id, kod: k.kod, ad: k.ad, tur: k.tur, birim: k.birim, durum: k.durum, hata: k.hata, zaman: k.zaman, kayitNo: k.kayitNo,
    guncelleme: k.guncellemeDurumu === null || k.guncellemeZamani === null ? null : { durum: k.guncellemeDurumu, hata: k.guncellemeHata, zaman: k.guncellemeZamani },
    eksikler: k.durum === 'gonderildi' ? [] : logoEksikleri({ tur: k.tur, stokKodu: k.kod, ad: k.ad, birim: k.birim, logoKartTuru: k.logoKartTuru, logoBirimSeti: k.logoBirimSeti }),
  }));
  return {
    kartlar: kartlar.sort(logoDurumSirasi),
    karsiliklar: await s.logoKarsiliklari(db),
    kartTuruSecenekleri: LOGO_KART_TURLERI.map((t) => ({ kod: t.kod, ad: t.ad })),
    karsilikYazabilir: kullanici.islemler.includes('malzemeler.tanim-yaz'),
  };
}

export async function logoKarsiligiKaydet(db: Db, kullanici: Kullanici, k: LogoKarsiligi): Promise<{ id: string }> {
  const izinsiz = logoKarsiligiHatasi(k);
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

// Yeni kart ve taslakta tür değişimi: önek ekranın kodundan (yalnız standart biçim), sıra sunucudan; boşalan eski kod yeniden verilmez.
// Firma kodu ayarlıysa firma kodlu türün (varsayılan mamul ve yarı mamul) önekini ayar verir; ekranın gönderdiği önek yok sayılır.
async function yeniStokKodu(db: Db, gelenKod: string | null, tur: string): Promise<{ onek: string; sira: number; stokKodu: string }> {
  const firmaOneki = katalogFirmaOneki(await katalogGenelAyari(db), tur);
  if (firmaOneki) {
    const sira = await s.katalogSiraAl(db, firmaOneki);
    return { onek: firmaOneki, sira, stokKodu: katalogStokKodu(firmaOneki, sira) };
  }
  const onek = katalogKodOneki(gelenKod);
  if (!onek) throw dogrulama('Stok kodu öneki tür-grup-sıra biçiminde olmalı (ör. HM-PAS-00001); kodu sunucu verir.', 'kayit.com.kod');
  if (!katalogOnekiTureUyarMi(onek, tur)) throw dogrulama('Stok kodu öneki malzeme türüne uymuyor.', 'kayit.com.kod');
  const sira = await s.katalogSiraAl(db, onek);
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
  };
  // Firma kodlu türde önek ayardan gelir, gelen kod okunmaz.
  const onekDegisti = kayitli !== null && !turDegisti && katalogFirmaOneki(await katalogGenelAyari(db), tur) === null
    && katalogYeniOnek({ durum: kayitli.onayDurumu, aktifOlmus: kayitli.aktifOlmus, kayitliOnek: kayitli.onek, tur, gelenKod: alanlar.stokKodu }) !== null;
  if (kayitli && !turDegisti && !onekDegisti) {
    const r = await kisitKorumali(KART_KISITLARI, () => s.katalogKartiGuncelle(db, yazim, null));
    return { id: kimlik, stok_kodu: r.stokKodu, surum: r.surum };
  }
  const { onek, sira, stokKodu } = await yeniStokKodu(db, alanlar.stokKodu, tur);
  if (kayitli) {
    const r = await kisitKorumali(KART_KISITLARI, () => s.katalogKartiGuncelle(db, yazim, { tur: tur, onek, sira, stokKodu }));
    return { id: kimlik, stok_kodu: r.stokKodu, surum: r.surum };
  }
  const r = await kisitKorumali(KART_KISITLARI, () => s.katalogKartiEkle(db, yazim, onek, sira));
  return { id: kimlik, stok_kodu: r.stokKodu, surum: r.surum };
}

export async function katalogKartiIptal(db: Db, kullanici: Kullanici, kimlik: string): Promise<{ id: string }> {
  const kayitli = await s.katalogKartiKilitle(db, kimlik);
  if (!kayitli) throw bulunamadi('Malzeme kataloğu kartı bulunamadı.');
  if (!katalogIptalEdilirMi(kayitli.onayDurumu)) throw gecersiz('Yalnız taslak kart silinir; kullanılan kart pasife alınır.');
  if (!katalogIptalYetkiliMi({ islemler: kullanici.islemler, kisiId: kullanici.id, acanKisiId: kayitli.acanKisiId, kayit: kayitli.kayit })) {
    throw yetkiYok('Onay yetkisi olmayan yalnız kendi açtığı, hiç onaylanmamış taslağı siler.');
  }
  await s.katalogKartiIptal(db, kimlik, kullanici.id);
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
