import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { KisitEslemesi } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { KayitAramaKaynagi } from '#paylasilan/kayit-aramasi.ts';
import { HIZMET_PUANI_SINIRI, YILLIK_KARNE_SINIRI, karneOlayKaynagi, karneOlayi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type {
  HizmetPuaniGovdesi, KarneCevabi, KarneOlayKaynagi, KarneOlayi, KarneOzeti, LotKarari, YillikKarneGovdesi,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { TESIS_SAAT_DILIMI, tesisGunu } from '#paylasilan/zaman.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  Adres, AdresKimligi, Firma, FirmaAyrintiCevabi, FirmaDuzeltmesi, FirmaKimligi, FirmaSatiri, FirmaTuru, MusteriSinifi, firmaListeSorgusu,
  firmaSecimSorgusu,
} from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import type { z } from 'zod';
import {
  LOGO_KILIDI_ILETISI, adresSiniriHatasi, gecikmeOzetleri, karneDonemi, karneHesapla, karneYazmaHatasi, zamanindaMi, aramaSiniri, defterFarki, durumGecisiHatasi, firmaAramaSonucu, firmaKaydiHatasi, koordinatHatasi, logoKilidiIhlali, turKapsami,
} from './kurallar.ts';
import type { DefterSatiri, FirmaDurumu, GecikmeOrnegi, GecikmeOzeti, KarneSayilari } from './kurallar.ts';
import * as sorgular from './sorgular.ts';

// Uç katmanının denetim eki (çekirdek `denetimEki`): komut başına bir kez çağrılır.
export type DefterEki = (satirlar: readonly DefterSatiri[]) => void;
function farkYaz(ek: DefterEki, kayit: string, onceki: object, sonraki: object): void {
  const satirlar = defterFarki(kayit, onceki as Record<string, unknown>, sonraki as Record<string, unknown>);
  if (satirlar.length > 0) ek(satirlar);
}

// Kısıt adı -> kullanıcıya gösterilecek ileti. Kuralı veritabanı tutar; servis yalnız iletiye çevirir.
const FIRMA_KISITLARI: KisitEslemesi = {
  musteri_tedarikci_firma_kod_tekil: { ileti: 'Bu firma kodu başka bir firmada kullanılıyor.', alan: 'kod' },
  musteri_tedarikci_firma_vergi_no_tekil: { ileti: 'Bu vergi numarası başka bir firmada kayıtlı.', alan: 'vergiNo' },
  musteri_tedarikci_firma_logo_cari_kodu_tekil: { ileti: 'Bu Logo cari kodu başka bir firmada kullanılıyor.', alan: 'logoCariKodu' },
  musteri_tedarikci_firma_logo_kayit_no_tekil: 'Bu Logo kayıt numarası başka bir firmada kayıtlı.',
  musteri_tedarikci_firma_logo_kilidi: { ileti: LOGO_KILIDI_ILETISI, alan: 'kod' },
  musteri_tedarikci_firma_vergi_no_bicim: { ileti: 'Vergi numarası biçimi geçersiz.', alan: 'vergiNo' },
  musteri_tedarikci_firma_ad_bos: { ileti: 'Firma adı boş olamaz.', alan: 'ad' },
  musteri_tedarikci_firma_koordinat_butun: { ileti: 'Enlem ve boylam birlikte girilir.', alan: 'enlem' },
};
const ADRES_KISITLARI: KisitEslemesi = {
  musteri_tedarikci_adres_ad_tekil: { ileti: 'Bu firmada aynı adlı bir adres var.', alan: 'ad' },
  musteri_tedarikci_adres_koordinat_butun: { ileti: 'Enlem ve boylam birlikte girilir.', alan: 'enlem' },
};

type ListeSorgusu = z.output<typeof firmaListeSorgusu>;
type SecimSorgusu = z.output<typeof firmaSecimSorgusu>;

export function firmalariListele(db: Db, sorgu: ListeSorgusu): Promise<SayfaliListe<FirmaSatiri>> {
  const suzgec: sorgular.FirmaSuzgeci = {
    ara: sorgu.ara ? sorgu.ara : null,
    turler: turKapsami(sorgu.tur),
    fason: sorgu.fason ?? null,
    aktif: sorgu.aktif ?? null,
  };
  const siralama = sorgular.firmaSiralamasi(sorgu);
  return sayfaliListe(sorgu, {
    say: () => sorgular.firmaSay(db, suzgec),
    satirlar: (dilim) => sorgular.firmaSatirlari(db, suzgec, siralama, dilim),
  });
}

export async function firmaGetir(db: Db, id: number): Promise<Firma> {
  const firma = await sorgular.firmaGetir(db, id);
  if (!firma) throw bulunamadi('Firma bulunamadı.');
  return firma;
}

export async function firmaAyrintisi(db: Db, id: number): Promise<FirmaAyrintiCevabi> {
  const firma = await firmaGetir(db, id);
  return { firma, adresler: await sorgular.adresleriGetir(db, id) };
}

export function firmaSecimi(db: Db, sorgu: SecimSorgusu): Promise<sorgular.SecimSatiri[]> {
  return sorgular.firmaAra(db, { metin: sorgu.ara === '' ? null : sorgu.ara, turler: turKapsami(sorgu.tur), yalnizAktif: true, sinir: aramaSiniri(Infinity) });
}

function kimligiDenetle(k: FirmaKimligi): void {
  const hata = firmaKaydiHatasi(k);
  if (hata) throw dogrulama(hata.ileti, hata.alan);
}

// Kayıt zamanı ve kişi sunucudan yazılır (MT-4): gövdede gelse de şema onları geçirmez.
export async function firmaEkle(db: Db, kullanici: Kullanici, k: FirmaKimligi): Promise<Firma> {
  kimligiDenetle(k);
  const firma = await kisitKorumali(FIRMA_KISITLARI, () => sorgular.firmaEkle(db, k, kullanici.id));
  if (!firma) throw new Error('Firma eklenemedi.');
  return firma;
}

// Sıra: kilit, sürüm, kural. Eski sürümle gelen istek kural iletisi değil 409 alır.
async function kilitliGetir(db: Db, id: number, surum: number): Promise<Firma> {
  const firma = await sorgular.firmaGetir(db, id, true);
  if (!firma) throw bulunamadi('Firma bulunamadı.');
  if (firma.surum !== surum) throw eskiSurum();
  return firma;
}

export async function firmaGuncelle(db: Db, kullanici: Kullanici, id: number, d: FirmaDuzeltmesi, ek: DefterEki): Promise<Firma> {
  const eski = await kilitliGetir(db, id, d.surum);
  const koordinatYok = d.enlem === undefined && d.boylam === undefined;
  const k = {
    ...d, enlem: koordinatYok ? eski.enlem : (d.enlem ?? null), boylam: koordinatYok ? eski.boylam : (d.boylam ?? null),
    musteriSinifi: d.musteriSinifi === undefined ? (eski.musteriSinifi ?? null) : d.musteriSinifi,
  };
  kimligiDenetle(k);
  if (logoKilidiIhlali(eski, k)) throw gecersiz(LOGO_KILIDI_ILETISI);
  const yeni = await kisitKorumali(FIRMA_KISITLARI, () => surumluGuncelle({
    guncelle: () => sorgular.firmaGuncelle(db, id, k.surum, k, kullanici.id),
    varMi: async () => (await sorgular.firmaVarMi(db, id)) !== null,
    bulunamadiIletisi: 'Firma bulunamadı.',
  }));
  farkYaz(ek, `firma:${id}`, eski, yeni);
  return yeni;
}

// Aktiflik geçişi (MT-8). Pasife almayı engelleyen öteki modül kuralı (finansın açık kayıtları, FNS-60) çağıranın ucundadır:
// akışı üstteki modül başlatır ve engeli kendi kaydından sorar (ADR 0006); bu fonksiyon engeli aynı transaction'da, kilitten sonra çağırır.
export async function firmaDurumuDegistir(
  db: Db, kisiId: number, id: number, surum: number, hedef: FirmaDurumu, pasifEngeli?: (firmaId: number) => Promise<string | null>,
): Promise<Firma> {
  const eski = await kilitliGetir(db, id, surum);
  const hata = durumGecisiHatasi(eski.aktif, hedef);
  if (hata) throw gecersiz(hata);
  if (hedef === 'pasif' && pasifEngeli) {
    const engel = await pasifEngeli(id);
    if (engel) throw gecersiz(engel);
  }
  return surumluGuncelle({
    guncelle: () => sorgular.firmaAktiflikYaz(db, id, surum, hedef === 'aktif', kisiId),
    varMi: async () => (await sorgular.firmaVarMi(db, id)) !== null,
    bulunamadiIletisi: 'Firma bulunamadı.',
  });
}

// ---- Adresler (MT-9, MT-10, MT-11) ----

function adresiDenetle(a: AdresKimligi): void {
  const hata = koordinatHatasi(a);
  if (hata) throw dogrulama(hata.ileti, hata.alan);
}

// Adres yazması önce kartı kilitler ve sürümünü artırır: eski sürümle gelen adres isteği 409 alır.
async function karttanSonra(db: Db, kisiId: number, id: number, surum: number): Promise<Firma> {
  await kilitliGetir(db, id, surum);
  const firma = await sorgular.firmaSurumuArtir(db, id, surum, kisiId);
  if (!firma) throw eskiSurum();
  return firma;
}

export async function adresEkle(db: Db, kullanici: Kullanici, id: number, a: AdresKimligi & { surum: number }): Promise<FirmaAyrintiCevabi> {
  adresiDenetle(a);
  const firma = await karttanSonra(db, kullanici.id, id, a.surum);
  const sinir = adresSiniriHatasi(await sorgular.adresSayisi(db, id));
  if (sinir) throw gecersiz(sinir);
  await kisitKorumali(ADRES_KISITLARI, () => sorgular.adresEkle(db, id, a, kullanici.id));
  return { firma, adresler: await sorgular.adresleriGetir(db, id) };
}

export async function adresGuncelle(
  db: Db, kullanici: Kullanici, id: number, adresId: number, a: AdresKimligi & { surum: number }, ek: DefterEki,
): Promise<FirmaAyrintiCevabi> {
  adresiDenetle(a);
  const firma = await karttanSonra(db, kullanici.id, id, a.surum);
  const eski = (await sorgular.adresleriGetir(db, id)).find((x) => x.id === adresId);
  if (!eski) throw bulunamadi('Adres bulunamadı.');
  const yeni = await kisitKorumali(ADRES_KISITLARI, () => sorgular.adresGuncelle(db, id, adresId, a, kullanici.id));
  if (!yeni) throw bulunamadi('Adres bulunamadı.');
  farkYaz(ek, `adres:${adresId}`, eski, yeni);
  return { firma, adresler: await sorgular.adresleriGetir(db, id) };
}

export async function adresKaldir(db: Db, kullanici: Kullanici, id: number, adresId: number, surum: number): Promise<FirmaAyrintiCevabi> {
  const firma = await karttanSonra(db, kullanici.id, id, surum);
  if (!(await sorgular.adresSil(db, id, adresId))) throw bulunamadi('Adres bulunamadı.');
  return { firma, adresler: await sorgular.adresleriGetir(db, id) };
}

// ---- disari.ts için (yetki denetlemez, finans rakamı döndürmez) ----

export async function firmaAdlari(db: Db, idler: number[]): Promise<Map<number, string>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgular.firmaAdlariniBul(db, tekil)).map((s) => [s.id, s.ad]));
}

export function firmaNoKoddan(db: Db, kod: string): Promise<number | null> {
  return sorgular.firmaNoKoddan(db, kod.trim());
}

export async function firmaVarMi(db: Db, id: number): Promise<{ var: boolean; aktif: boolean }> {
  const satir = await sorgular.firmaVarMi(db, id);
  return satir === null ? { var: false, aktif: false } : { var: true, aktif: satir.aktif };
}

export const tumFirmalar = (db: Db) => sorgular.tumFirmalar(db);

// fason: true yalnız fason işaretli firmaları döner (rota fason adımı seçicisi); verilmezse süzmez.
export async function firmaAra(
  db: Db, secenek: { metin: string; sinir: number; yalnizAktif?: boolean; tur?: FirmaTuru; fason?: boolean },
): Promise<{ id: number; ad: string; kod: string | null }[]> {
  const metin = secenek.metin.trim();
  const satirlar = await sorgular.firmaAra(db, {
    metin: metin === '' ? null : metin, turler: turKapsami(secenek.tur), yalnizAktif: secenek.yalnizAktif ?? true, sinir: aramaSiniri(secenek.sinir),
    fason: secenek.fason ?? null,
  });
  return satirlar.map(({ id, ad, kod }) => ({ id, ad, kod }));
}

// Ctrl K firma kaynağı (kart 1235, sözleşme 1233). Kartı okuyabilen bütün firmaları (pasif dahil) bulur; çekirdek
// işlemi olmayanı kaynağa hiç sokmaz.
export const firmaKayitKaynagi: KayitAramaKaynagi<Db> = {
  tur: 'firma',
  yetki: ['musteri-tedarikci.oku'],
  ara: async (db, istek) =>
    (await sorgular.kayitAra(db, { sade: istek.sade, icinde: istek.icindeDeseni, bas: istek.basDeseni, sinir: istek.sinir })).map(firmaAramaSonucu),
};

export interface FirmaOzeti {
  id: number; kod: string | null; ad: string; tur: FirmaTuru; fason: boolean; vergiNo: string | null;
  paraBirimi: string; vadeGunu: number | null; aktif: boolean; logoCariKodu: string | null;
  telefon: string | null; ePosta: string | null; adres: string | null; ilce: string | null; il: string | null;
  postaKodu: string | null; enlem: number | null; boylam: number | null; surum: number;
}
const ozetle = (f: Firma): FirmaOzeti => ({
  id: f.id, kod: f.kod, ad: f.ad, tur: f.tur, fason: f.fason, vergiNo: f.vergiNo, paraBirimi: f.paraBirimi,
  vadeGunu: f.vadeGunu, aktif: f.aktif, logoCariKodu: f.logoCariKodu, telefon: f.telefon, ePosta: f.ePosta,
  adres: f.adres, ilce: f.ilce, il: f.il, postaKodu: f.postaKodu, enlem: f.enlem, boylam: f.boylam, surum: f.surum,
});
export async function firmaOzeti(db: Db, id: number): Promise<FirmaOzeti | null> {
  const f = await sorgular.firmaGetir(db, id);
  return f ? ozetle(f) : null;
}
// Satın alma tedarikçi başına çağırmaz; tek sorgu. Pasif firma da döner, olmayan kimlik haritada yoktur.
export async function firmaOzetleri(db: Db, idler: number[]): Promise<Map<number, FirmaOzeti>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgular.firmalariGetir(db, tekil)).map((f) => [f.id, ozetle(f)]));
}

// Sevkiyat ve harita için: firmanın koordinatlı adresleri (kartın merkez adresi "merkez" türüyle başta). Olmayan kimlik haritada yoktur.
export interface FirmaKonumu { adresId: number | null; tur: 'merkez' | Adres['tur']; ad: string; adres: string | null; enlem: number; boylam: number }
export async function firmaKonumlari(db: Db, idler: number[]): Promise<Map<number, FirmaKonumu[]>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  const sonuc = new Map<number, FirmaKonumu[]>();
  for (const f of await sorgular.firmalariGetir(db, tekil)) {
    sonuc.set(f.id, f.enlem !== null && f.boylam !== null
      ? [{ adresId: null, tur: 'merkez', ad: 'Merkez', adres: f.adres, enlem: f.enlem, boylam: f.boylam }] : []);
  }
  for (const a of await sorgular.firmalarinAdresleri(db, tekil)) {
    if (a.enlem === null || a.boylam === null) continue;
    sonuc.get(a.firmaId)?.push({ adresId: a.id, tur: a.tur, ad: a.ad, adres: a.adres, enlem: a.enlem, boylam: a.boylam });
  }
  return sonuc;
}

// Plan bedelinin müşteri sınıfı (265 a): tek sorgu; boş dizide sorgu yok; olmayan kimlik haritada yok, sınıfsız firma null.
export async function musteriSiniflari(db: Db, idler: readonly number[]): Promise<Map<number, MusteriSinifi | null>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sorgular.musteriSiniflariniBul(db, tekil)).map((s) => [s.id, s.sinif]));
}

// ---- Tedarikçi karnesi (1259 c, 1260 a) ----

const YILLIK_KARNE_KISITLARI: KisitEslemesi = {
  musteri_tedarikci_yillik_karne_tekil: { ileti: 'Bu firmanın bu yıl için karnesi kayıtlı.', alan: 'yil' },
};

// disari.ts: satın alma teslimi, Kalite Merkezi lot kararını kendi transaction'ında bildirir; olay kaynağın kaydıyla birlikte
// yazılır ya da birlikte geri alınır. Aynı kaynak ve anahtar önceki olayın yerine geçer.
export async function karneOlayiYaz(db: Db, girdi: KarneOlayi): Promise<void> {
  const o = karneOlayi.parse(girdi);
  if ((await sorgular.firmaVarMi(db, o.firmaId)) === null) throw bulunamadi('Firma bulunamadı.');
  await sorgular.karneOlayiYaz(db, {
    firmaId: o.firmaId, kaynak: o.kaynak, anahtar: o.anahtar, tur: o.tur, zaman: o.zaman,
    termin: o.tur === 'teslim' ? o.termin : null, teslimGunu: o.tur === 'teslim' ? o.teslimGunu : null,
    tam: o.tur === 'teslim' ? o.tam : null, lotKarari: o.tur === 'lot' ? o.karar : null,
  });
}

// Kart 1474: kaynağın kaydı geri alınınca olay kalkar (ör. mal kabul düzeltmesiyle teslimin tamamı geri alındı). Çağıranın işlemindedir.
const OLAY_ANAHTARI_EN_COK = 120;
export async function karneOlayiKaldir(db: Db, girdi: { kaynak: KarneOlayKaynagi; anahtar: string }): Promise<void> {
  const kaynak = karneOlayKaynagi.parse(girdi.kaynak);
  const anahtar = girdi.anahtar.trim();
  if (anahtar.length === 0 || anahtar.length > OLAY_ANAHTARI_EN_COK) throw gecersiz('Karne olayı anahtarı geçersiz.');
  await sorgular.karneOlayiKaldir(db, kaynak, anahtar);
}

// Kart 1474: tedarikçinin teslim gecikmesi, kayan 12 ay (karneyle aynı dönem; teslim gününe göre). Plan motoru ve malzeme
// planlaması okur. Tam teslimi olmayan firma haritada yoktur (sıfır uydurulmaz); kaynaklar ayrı özetlenir.
export interface TeslimGecikmesi { firmaId: number; donemBasi: string; donemSonu: string; kaynaklar: GecikmeOzeti[] }
export async function teslimGecikmeleri(db: Db, idler: readonly number[], an: number = Date.now()): Promise<Map<number, TeslimGecikmesi>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  const { donemBasi, donemSonu } = karneDonemi(tesisGunu(an));
  const firmalar = new Map<number, GecikmeOrnegi[]>();
  for (const { firmaId, ...o } of await sorgular.gecikmeGruplari(db, tekil, donemBasi, donemSonu)) firmalar.set(firmaId, [...(firmalar.get(firmaId) ?? []), o]);
  return new Map([...firmalar].map(([firmaId, l]) => [firmaId, { firmaId, donemBasi, donemSonu, kaynaklar: gecikmeOzetleri(l) }]));
}

// Kayan 12 aylık karne; dönem sunucunun tesis gününde biter. Teklif kıyası ve firma kartı buradan okur.
export async function karneOzetleri(db: Db, idler: readonly number[], an: number = Date.now()): Promise<Map<number, KarneOzeti>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  const { donemBasi, donemSonu } = karneDonemi(tesisGunu(an));
  const teslimler = await sorgular.teslimGruplari(db, tekil, donemBasi, donemSonu);
  const lotlar = await sorgular.lotGruplari(db, tekil, donemBasi, donemSonu, TESIS_SAAT_DILIMI);
  const hizmetler = await sorgular.hizmetGruplari(db, tekil, donemBasi, donemSonu, TESIS_SAAT_DILIMI);
  const sayilar = new Map<number, KarneSayilari>(tekil.map((id) => [id, {
    teslimToplam: 0, teslimZamaninda: 0, lotKararlari: {} as Partial<Record<LotKarari, number>>, hizmetSayisi: 0, hizmetToplami: 0,
  }]));
  for (const t of teslimler) {
    const s = sayilar.get(t.firmaId);
    if (!s) continue;
    s.teslimToplam += t.sayi;
    if (zamanindaMi(t)) s.teslimZamaninda += t.sayi;
  }
  for (const l of lotlar) {
    const s = sayilar.get(l.firmaId);
    if (s) s.lotKararlari[l.lotKarari] = (s.lotKararlari[l.lotKarari] ?? 0) + l.sayi;
  }
  for (const h of hizmetler) {
    const s = sayilar.get(h.firmaId);
    if (s) { s.hizmetSayisi = h.sayi; s.hizmetToplami = h.toplam; }
  }
  return new Map([...sayilar].map(([id, s]) => [id, { firmaId: id, donemBasi, donemSonu, ...karneHesapla(s) }]));
}

export async function firmaKarnesi(db: Db, id: number): Promise<KarneCevabi> {
  await firmaGetir(db, id);
  const ozet = await karneOzetleri(db, [id]);
  const yillik = await sorgular.yillikKarneler(db, id, YILLIK_KARNE_SINIRI);
  const hizmet = await sorgular.hizmetPuanlari(db, id, HIZMET_PUANI_SINIRI);
  const karne = ozet.get(id);
  if (!karne) throw new Error('Karne hesaplanamadı.');
  const adlar = await kisiAdlari(db, [...yillik.map((y) => y.degerlendirenId), ...hizmet.map((h) => h.girenId)]);
  const ad = (kisiId: number): string => adlar.get(kisiId) ?? `#${kisiId}`;
  return {
    karne,
    yillikKarneler: yillik.map(({ degerlendirenId, ...y }) => ({ ...y, degerlendiren: ad(degerlendirenId) })),
    hizmetPuanlari: hizmet.map(({ girenId, ...h }) => ({ ...h, giren: ad(girenId) })),
  };
}

async function karneYazilabilir(db: Db, id: number): Promise<void> {
  const firma = await sorgular.firmaGetir(db, id, true);
  if (!firma) throw bulunamadi('Firma bulunamadı.');
  const hata = karneYazmaHatasi(firma.tur);
  if (hata) throw gecersiz(hata);
}

// Kişi ve zaman sunucudan yazılır; gövde yalnız puanı ve notu taşır.
export async function hizmetPuaniEkle(db: Db, kullanici: Kullanici, id: number, g: HizmetPuaniGovdesi): Promise<KarneCevabi> {
  await karneYazilabilir(db, id);
  await sorgular.hizmetPuaniEkle(db, id, g.puan, g.not ?? null, kullanici.id);
  return firmaKarnesi(db, id);
}

// Yıllık karne o anki kayan karnenin kaydıdır; puanı ve sınıfı sunucu hesaplar.
export async function yillikKarneEkle(db: Db, kullanici: Kullanici, id: number, g: YillikKarneGovdesi): Promise<KarneCevabi> {
  await karneYazilabilir(db, id);
  const karne = (await karneOzetleri(db, [id])).get(id);
  if (!karne) throw new Error('Karne hesaplanamadı.');
  await kisitKorumali(YILLIK_KARNE_KISITLARI, () => sorgular.yillikKarneEkle(db, {
    firmaId: id, yil: g.yil, teslimOrani: karne.teslim.oran, kalitePuani: karne.kalite.puan, hizmetPuani: karne.hizmet.puan,
    puan: karne.puan, sinif: karne.sinif, not: g.not ?? null, degerlendirenId: kullanici.id,
  }));
  return firmaKarnesi(db, id);
}
