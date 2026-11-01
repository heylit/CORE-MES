import type { Db } from '#cekirdek/db.ts';
import { yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { AsimlarCevabi, Emir, EmirDurumu, KaliteKarari, KatilimCevabi, RefakatKartiCevabi, SayimKaydi, SureOzetiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { adimlardanGorunum, SAYIM_DUZELTME_ISLEMI } from './kurallar.ts';
import * as isEmri from './is-emri-servis.ts';
import * as servis from './servis.ts';
import { hazirlikCozucusuKaydet } from './hazirlik.ts';
import type { HazirlikCozucusu } from './hazirlik.ts';
import { kapanisCozucusuKaydet } from './kapanis.ts';
import type { KapanisCozucusu } from './kapanis.ts';
import {
  adimGirdileriGetir, adimUretimSatiriGetir, emirAdimZinciriGetir, akisEmriGetir, akisFasonGetir, akisIsEmirleriGetir, akisOlaylariGetir, akisSayimlariGetir, aralikAdetleriGetir, gunlukAralikAdetleriGetir, kisininGunlukIsEmirleriGetir,
  tasinanGirdiGetir, dugumleriGetir, emirBul, emirDurumlariGetir, isEmirleriGetir, siparisSatiriEmirleriGetir, isEmriPlanBilgileriGetir, isEmriZamanlariGetir, katilimSureleriGetir, kisininAcikIstasyonu, kisininHurdalariGetir,
  bitenEmirler as bitenEmirlerGetir, bitenIsEmirleriGetir, calismayaGecisAnlari as gecisAnlariGetir, istasyonDurusSureleri as istasyonDuruslariGetir, kisininIsEmirleriGetir, makineKullanimAraliklariGetir, makineSayimAnlariGetir, makineSureleriGetir, sonGirisleriGetir, standartSureleriGetir,
} from './sorgular.ts';
import type {
  AkisEmirSatiri, AkisFasonSatiri, AkisIsEmriSatiri, AkisOlaySatiri, AkisSayimSatiri, BitenIsEmriSatiri, IsEmriZamanSatiri, KisiIsEmriSatiri, SayimKirilimi,
} from './sorgular.ts';
import { hurdaNedenleriniListele } from '../durus-nedenleri/disari.ts';

export type { Emir, Katilim, KatilimCevabi, MakineDoluAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// Planlı ve başlamış emirler: bitmemiş, iptal edilmemiş iş.
export async function acikEmirler(db: Db): Promise<Emir[]> {
  const emirler: Emir[] = [];
  // Transaction tek bağlantıdır: sorgular sırayla koşar.
  for (const durum of ACIK_EMIR_DURUMLARI) emirler.push(...(await servis.emirleriListele(db, durum)).emirler);
  return emirler;
}

// Arkon tek paket okuması: bir emri, bütün açık emirleri kurmadan, acikEmirler'deki biçimiyle verir; açık değilse null.
export const acikEmir = (db: Db, id: number): Promise<Emir | null> => servis.acikEmir(db, id);

// Komut uçlarının aradığı işlem. Uç katmanı işlemi yalnız kendi ucunda arar: başka modülün ucundan gelen çağrıda
// o ucun işlemi aranmıştır, bu değil. Dışa açık komut bu yüzden işlemi kendisi arar.
export const KOMUT_ISLEMI = 'terminal.uret' satisfies Islem;

function uretenKisi(kullanici: Kullanici): number {
  if (!islemVarMi(kullanici, KOMUT_ISLEMI)) throw yetkiYok();
  return kullanici.id;
}

// Üst modülün kendi transaction'ında çağırdığı komutlar (ADR 0006): çağıranın db'sini alır; işlemi, kişinin veri
// kapsamını ve durum kuralını kendisi denetler, emri kendisi kilitler; ret UygulamaHatasi olarak çıkar. Başlatmadaki
// ve devamdaki yarış reddi kısıt ihlalinden doğar ve transaction'ı iptal eder: reddi kaydedip süren çağıran komutu
// kayıt noktasında koşar.
// an (isteğe bağlı, denetim #25): çevrimdışı kuyruktan gelen kaydın kendi anı; emrin son olayından önce ya da ileride olamaz (DOGRULAMA).
// Verilmezse an sunucu saatidir.
// Aynı transaction'da art arda komut koşan çağıran (Arkon kayıt ekleme) komutlarını bunun içinde çağırır: kişi kapsamı ve ad
// tabloları kapsam boyunca bir kez okunur. Çağıran kapsam içinde kişi, rol, iş merkezi ataması ya da istasyon yazmaz.
export const komutOnbellegiyle = <T>(db: Db, is: () => Promise<T>): Promise<T> => servis.komutOnbellegiyle(db, is);
// isEmriId (isteğe bağlı, paralel adım 639): komutun adımı. Verilmezse emrin tek açık adımı, yoksa sıradaki; iki açık adım varsa
// CAKISMA (adım seçilmeli). Verilen adım bu emrin değilse BULUNAMADI.
export const emirAyar = (db: Db, kullanici: Kullanici, id: number, an?: string, isEmriId?: number): Promise<{ emir: Emir }> =>
  servis.kayitAniyla(db, an, () => servis.emirAyar(db, uretenKisi(kullanici), id, isEmriId));
// Makine seçimi isteğe bağlı: verilmezse iş emrinin makinesi kullanılır. Makine doluysa CAKISMA, ayrıntısı `MakineDoluAyrintisi`.
// Sıra dışı başlatma (önceki adım bitmeden, devir adedi gelmeden) reddedilmez, uyarı döner (626 a).
export const emirBaslat = (
  db: Db, kullanici: Kullanici, id: number, makineIdleri?: readonly number[], an?: string, isEmriId?: number,
): Promise<{ emir: Emir; uyari: string | null }> =>
  servis.kayitAniyla(db, an, () => servis.emirBaslat(db, uretenKisi(kullanici), id, makineIdleri, isEmriId));
export const makineDevral = (db: Db, kullanici: Kullanici, id: number, kullanimId: number, an?: string, isEmriId?: number): Promise<{ emir: Emir }> =>
  servis.kayitAniyla(db, an, () => servis.makineDevral(db, uretenKisi(kullanici), id, kullanimId, isEmriId));
// Adet verilirse sayım ona eşitlenir: başkasının sayımını düşürmesin diye kişi işe katılmış ya da düzeltme işlemli olmalı (185 a).
// Akışlı ya da bekleyen adım önceki adım bitmeden bitmez (CAKISMA, 649 a); eksi bakiyeyle bitiş uyarı döner (654 a).
export const emirBitir = (
  db: Db, kullanici: Kullanici, id: number, saglamAdet?: number, an?: string, isEmriId?: number,
): Promise<{ emir: Emir; uyari: string | null }> =>
  servis.kayitAniyla(db, an, () => servis.emirBitir(db, uretenKisi(kullanici), id, saglamAdet, null, islemVarMi(kullanici, SAYIM_DUZELTME_ISLEMI), isEmriId));
// kararBekliyor: ilk parça kararı beklenirken sayılan parça sağlama katılmaz (131 b); türü çağıran seçer.
// Eksi sayım (düzeltme) işe katılmamış kişide düzeltme işlemi ister (185 a). Adıma girenden fazla sayım reddedilmez, uyarı döner (647 a).
// ilkParca (744 a): adımın ilk parça isteyip istemediği; çağıran rota seçiminden ve iş türünden bilir (verilmezse emir başına, 327 a).
export type { IlkParcaGereksinimi } from './servis.ts';
export const emirSayim = (
  db: Db, kullanici: Kullanici, id: number, govde: SayimKaydi,
  secenek?: { kararBekliyor?: boolean; an?: string; isEmriId?: number; ilkParca?: servis.IlkParcaGereksinimi },
): Promise<{ emir: Emir; uyari: string | null }> => servis.kayitAniyla(db, secenek?.an, () => servis.emirSayim(
  db, uretenKisi(kullanici), id, govde,
  { kararBekliyor: secenek?.kararBekliyor, duzeltebilir: islemVarMi(kullanici, SAYIM_DUZELTME_ISLEMI), isEmriId: secenek?.isEmriId, ilkParca: secenek?.ilkParca },
));
// Karar bekleyen sayımı kalite kararıyla kapatır; terminal yetkisi istemez, kalite yetkisini çağıran denetler. Bekleyen yoksa adet 0.
// isEmriId verilirse yalnız o adımın bekleyeni kapanır (744 a).
export const kararliSayimiSonuclandir = (db: Db, kisiId: number, id: number, karar: KaliteKarari, isEmriId?: number | null): Promise<{ emir: Emir; adet: number }> =>
  servis.kararliSayimiSonuclandir(db, kisiId, id, karar, isEmriId ?? null);
// Adım (iş emri) başına karar bekleyen ve redde kalan adet (744 a); karar satırı olmayan adım gelmez.
export type { AdimKararSayaci } from './servis.ts';
export const adimKararSayaclari = (db: Db, idler: readonly number[]): Promise<Map<number, servis.AdimKararSayaci[]>> => servis.adimKararSayaclari(db, idler);
// Emir düzeyinde karar bekleyen ve redde kalan adet; sayımı olmayan emir sıfırla gelir.
export const kararSayaclari = (db: Db, idler: readonly number[]): Promise<Map<number, { kararBekliyor: number; red: number }>> =>
  servis.kararSayaclari(db, idler);
export const emirDuraklat = (db: Db, kullanici: Kullanici, id: number, an?: string, isEmriId?: number): Promise<{ emir: Emir }> =>
  servis.kayitAniyla(db, an, () => servis.emirDuraklat(db, uretenKisi(kullanici), id, isEmriId));
export const emirDevam = (
  db: Db, kullanici: Kullanici, id: number, makineIdleri?: readonly number[], an?: string, isEmriId?: number,
): Promise<{ emir: Emir }> =>
  servis.kayitAniyla(db, an, () => servis.emirDevam(db, uretenKisi(kullanici), id, makineIdleri, isEmriId));
export const emirDurdur = (db: Db, kullanici: Kullanici, id: number, durusNedeniId: number, an?: string, isEmriId?: number): Promise<{ emir: Emir }> =>
  servis.kayitAniyla(db, an, () => servis.emirDurdur(db, uretenKisi(kullanici), id, durusNedeniId, isEmriId));

// Aynı işe katılım (kart #1144): kişi kendi çalışmasını açar, duraklatır, bitirir. Başka çalışan varken katılım uyarı döner.
// Katılım adım başınadır (648 a).
export const katil = (db: Db, kullanici: Kullanici, id: number, an?: string, isEmriId?: number): Promise<KatilimCevabi> =>
  servis.kayitAniyla(db, an, () => servis.katil(db, uretenKisi(kullanici), id, isEmriId));
export const katilimDuraklat = (db: Db, kullanici: Kullanici, id: number, an?: string, isEmriId?: number): Promise<KatilimCevabi> =>
  servis.kayitAniyla(db, an, () => servis.katilimDuraklat(db, uretenKisi(kullanici), id, isEmriId));
export const katilimAyril = (db: Db, kullanici: Kullanici, id: number, an?: string, isEmriId?: number): Promise<KatilimCevabi> =>
  servis.kayitAniyla(db, an, () => servis.katilimAyril(db, uretenKisi(kullanici), id, isEmriId));
// 647 a: adımın sayım aşımı izi; salt okuma.
export const asimlar = (db: Db, emirId: number, isEmriId: number): Promise<AsimlarCevabi> => servis.asimlar(db, emirId, isEmriId);
export const katilimlar = (db: Db, id: number): Promise<KatilimCevabi> => servis.katilimlar(db, id);

export interface EmirOzeti {
  id: number;
  emirNo: string;
  durum: EmirDurumu;
  istasyonId: number;
}

// Emri kimliğiyle bulur; yoksa null (hata değil). Okuma uçları gibi yalnız oturum ister: işlem aramaz, kilit almaz,
// kapsam denetlemez; karar için komutun reddine bakılır. İş emirli emirde istasyon satırdaki (sıradaki iş emrinin) istasyonudur;
// o boşsa son başlamış iş emrininki; hiçbir iş emri bir istasyona düşmemişse emir burada yok sayılır (null). Yeni kullanıcı
// `uretimEmriOzeti` ve `isEmriOzeti` ile okur.
export async function emirOzeti(db: Db, id: number): Promise<EmirOzeti | null> {
  const satir = await emirBul(db, id);
  if (satir === null) return null;
  const istasyonId = satir.istasyonId ?? (satir.malzemeNo === null ? null : await isEmri.emrinIstasyonu(db, id));
  return istasyonId === null ? null : { id: satir.id, emirNo: satir.emirNo, durum: satir.durum, istasyonId };
}

// Kimlik listesiyle satırdaki durum (emirOzeti'nin durumu) tek sorguda; olmayan kimlik haritada yoktur (Arkon AR2).
export async function emirDurumlari(db: Db, idler: readonly number[]): Promise<Map<number, EmirDurumu>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await emirDurumlariGetir(db, tekil)).map((r) => [r.id, r.durum]));
}

// Satır başına bağlı emirler (iptal dahil, kimlik sırasıyla); emirsiz satır haritada yoktur (Sevkiyat, Finans).
export async function siparisSatirlarininEmirleri(db: Db, satirIdleri: readonly number[]): Promise<Map<number, number[]>> {
  const tekil = [...new Set(satirIdleri)];
  if (tekil.length === 0) return new Map();
  return new Map((await siparisSatiriEmirleriGetir(db, tekil)).map((r) => [r.satirId, r.emirIdleri]));
}

// Plan katkı payı (1379 a): emrin bütün iş emirleri, durumu ve kaynağı ne olursa olsun (bitmiş ve fason dahil), sıra düzeniyle.
// İş emri olmayan emir haritada yoktur.
export async function emirlerinIsEmriIdleri(db: Db, emirIdleri: readonly number[]): Promise<Map<number, number[]>> {
  const tekil = [...new Set(emirIdleri)];
  const harita = new Map<number, number[]>();
  if (tekil.length === 0) return harita;
  for (const i of await isEmirleriGetir(db, tekil)) harita.set(i.uretimEmriId, [...(harita.get(i.uretimEmriId) ?? []), i.id]);
  return harita;
}

/* ---------------- anomali okumaları (kart #1145) ---------------- */

export type { SayimKirilimi } from './sorgular.ts';
export interface AralikAdedi {
  saglam: number;
  hurda: number;
}

// İstasyon, kişi, makine ya da iş emri başına [baslangic, bitis) aralığındaki net sayım (düzeltme dahil); makine kırılımı sayımı,
// zamanında iş emrinin o makinedeki açık kullanımından bulur. İş emri kırılımında baslangic '-infinity' verilirse pencere
// başına kadarki bütün sayım gelir (kalan adet = adet - önceki sağlam). İş emirsiz eski emrin sayımı iş emri kırılımında yoktur. Sayımı olmayan kimlik haritada
// yoktur: sıfır uydurulmaz, "giriş yok" ile "sıfır net" ayrı kalır. Zamanlar saat dilimli ISO metni.
export async function aralikAdetleri(
  db: Db, kirilim: SayimKirilimi, idler: readonly number[], baslangic: string, bitis: string,
): Promise<Map<number, AralikAdedi>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await aralikAdetleriGetir(db, kirilim, tekil, baslangic, bitis)).map((r) => [r.id, { saglam: r.saglam, hurda: r.hurda }]));
}

// aralikAdetleri'nin gün kırılımlı hâli, tek sorgu (Arkon Özetim günleri): artan sınırlardan ardışık [sinirlar[g], sinirlar[g + 1])
// aralıkları kurulur, sonuçta aralık başına aralikAdetleri ile aynı harita vardır (sınır sayısından bir eksik). Sınır yoksa ya da tekse dizi boş.
export async function gunlukAralikAdetleri(
  db: Db, kirilim: SayimKirilimi, idler: readonly number[], sinirlar: readonly string[],
): Promise<Map<number, AralikAdedi>[]> {
  const gunler = Array.from({ length: Math.max(sinirlar.length - 1, 0) }, () => new Map<number, AralikAdedi>());
  const tekil = [...new Set(idler)];
  if (tekil.length === 0 || gunler.length === 0) return gunler;
  for (const r of await gunlukAralikAdetleriGetir(db, kirilim, tekil, sinirlar)) gunler[r.gun]?.set(r.id, { saglam: r.saglam, hurda: r.hurda });
  return gunler;
}

// İstasyon, kişi, makine ya da iş emri başına son sayım girişinin zamanı (sağlam, hurda ya da düzeltme). Hiç girişi olmayan kimlik haritada yoktur.
export async function sonGirisler(db: Db, kirilim: SayimKirilimi, idler: readonly number[]): Promise<Map<number, string>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await sonGirisleriGetir(db, kirilim, tekil)).map((r) => [r.id, r.zaman]));
}

// Kişi başına [baslangic, bitis) içinde işlerde çalışılan süre (saniye, katılım aralıklarından). Aynı anda iki işte
// çalışılan süre iki kez sayılır. Açık çalışma şimdiye kadar sayılır; penceresinde çalışması olmayan kişi haritada yoktur.
export async function katilimSureleri(
  db: Db, kisiIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<Map<number, number>> {
  const tekil = [...new Set(kisiIdleri)];
  if (tekil.length === 0) return new Map();
  return new Map((await katilimSureleriGetir(db, tekil, baslangic, bitis)).map((r) => [r.id, r.saniye]));
}

// Makine başına [baslangic, bitis) içinde iş tuttuğu süre (saniye, makine kullanım satırlarından; makinede aynı anda tek
// iş). Açık kullanım şimdiye kadar sayılır; penceresinde kullanımı olmayan makine haritada yoktur.
export async function makineSureleri(
  db: Db, makineIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<Map<number, number>> {
  const tekil = [...new Set(makineIdleri)];
  if (tekil.length === 0) return new Map();
  return new Map((await makineSureleriGetir(db, tekil, baslangic, bitis)).map((r) => [r.id, r.saniye]));
}

// makineSureleri'nin aralıklı hâli (OEE çalışmayı vardiya takvimiyle keser): makine başına kullanımların pencereyle kesişen parçaları,
// başlama sırasıyla; aynı makinede aynı anda tek iş olduğundan parçalar örtüşmez. Penceresinde kullanımı olmayan makine haritada yoktur.
export async function makineKullanimAraliklari(
  db: Db, makineIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<Map<number, { baslangic: string; bitis: string }[]>> {
  const tekil = [...new Set(makineIdleri)];
  const sonuc = new Map<number, { baslangic: string; bitis: string }[]>();
  if (tekil.length === 0) return sonuc;
  for (const { id, ...a } of await makineKullanimAraliklariGetir(db, tekil, baslangic, bitis)) {
    const liste = sonuc.get(id);
    if (liste) liste.push(a);
    else sonuc.set(id, [a]);
  }
  return sonuc;
}

export interface MakineSayimAni {
  zaman: string;
  saglam: number;
  hurda: number;
  // Kalite kararıyla reddedilen adet (karar bekleyen sayılmaz).
  red: number;
  standartSaniye: number;
  suresizSaglam: number;
}

// Makine başına sayımlar an an (OEE vardiya içini ve dışını ayırır): aralikAdetleri ve kirilimStandartSureleri'nin makine kırılımıyla
// aynı yere düşer, toplamları onlarınkine eşittir. Sayımı olmayan makine haritada yoktur.
export async function makineSayimAnlari(
  db: Db, makineIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<Map<number, MakineSayimAni[]>> {
  const tekil = [...new Set(makineIdleri)];
  const sonuc = new Map<number, MakineSayimAni[]>();
  if (tekil.length === 0) return sonuc;
  for (const { id, ...a } of await makineSayimAnlariGetir(db, tekil, baslangic, bitis)) {
    const liste = sonuc.get(id);
    if (liste) liste.push(a);
    else sonuc.set(id, [a]);
  }
  return sonuc;
}

/* ---------------- kişinin özeti (kart #1295, Operatör Özetim; Arkon okur, yetkiyi o denetler) ---------------- */
// Zamanlar saat dilimli ISO metni, pencere [baslangic, bitis). Veri yoksa satır ya da anahtar yoktur; sıfır uydurulmaz.

export interface KisiIsEmri extends Omit<KisiIsEmriSatiri, 'malzemeNo' | 'parcaNo' | 'parcaAd'> {
  urun: { malzemeNo: number | null; parcaNo: string; parcaAd: string };
}

// Kişinin pencerede sayımı ya da katılımı olan işleri, en son çalışılan önce. saglam ve hurda kişinin net sayımıdır (girişi
// yoksa null), saniye katılım süresidir (katılımı yoksa null); iş emirsiz eski emirde isEmriId null, durum emrinkinden eşlenir.
export async function kisininIsEmirleri(db: Db, kisiId: number, baslangic: string, bitis: string): Promise<KisiIsEmri[]> {
  return (await kisininIsEmirleriGetir(db, kisiId, baslangic, bitis)).map(({ malzemeNo, parcaNo, parcaAd, ...r }) => ({
    ...r, urun: { malzemeNo, parcaNo, parcaAd },
  }));
}

// kisininIsEmirleri'nin gün kırılımlı hâli, tek sorgu: aralık başına kisininIsEmirleri ile aynı satırlar aynı sırayla (sınırlar gunlukAralikAdetleri gibi).
export async function kisininGunlukIsEmirleri(db: Db, kisiId: number, sinirlar: readonly string[]): Promise<KisiIsEmri[][]> {
  const gunler = Array.from({ length: Math.max(sinirlar.length - 1, 0) }, (): KisiIsEmri[] => []);
  if (gunler.length === 0) return gunler;
  for (const { gun, malzemeNo, parcaNo, parcaAd, ...r } of await kisininGunlukIsEmirleriGetir(db, kisiId, sinirlar)) {
    gunler[gun]?.push({ ...r, urun: { malzemeNo, parcaNo, parcaAd } });
  }
  return gunler;
}

// Pencerede [baslangic, bitis) biten iş emirleri (Arkon beklenen adedi, borç 90): istasyonlar verilirse yalnız onlardaki. saglamAdet
// iş emrinin kapanış sağlamıdır; yazılmamışsa null. Yetkiyi çağıran denetler.
export type { BitenIsEmriSatiri as BitenIsEmri } from './sorgular.ts';
export function bitenIsEmirleri(
  db: Db, baslangic: string, bitis: string, istasyonIdleri: readonly number[] | null = null,
): Promise<BitenIsEmriSatiri[]> {
  return bitenIsEmirleriGetir(db, baslangic, bitis, istasyonIdleri);
}

// Kişinin net hurdası neden başına (düzeltme dahil), çoktan aza; net sıfır olan neden gelmez. Pasif neden de adıyla gelir.
export async function kisininHurdaNedenleri(
  db: Db, kisiId: number, baslangic: string, bitis: string,
): Promise<{ hurdaNedeniId: number; kod: string | null; ad: string; adet: number }[]> {
  const satirlar = await kisininHurdalariGetir(db, kisiId, baslangic, bitis);
  if (satirlar.length === 0) return [];
  const nedenler = new Map((await hurdaNedenleriniListele(db, { yalnizAktif: false })).map((n) => [n.id, n]));
  return satirlar.map((s) => {
    const n = nedenler.get(s.hurdaNedeniId);
    return { hurdaNedeniId: s.hurdaNedeniId, kod: n?.kod ?? null, ad: n?.ad ?? `#${s.hurdaNedeniId}`, adet: s.adet };
  });
}

export interface StandartSure {
  standartSaniye: number;
  suresizSaglam: number;
}

// Kişi başına standart süre: net sağlam x iş emrinin birim süresi (saniye). Birim süresi olmayan iş emrindeki sağlam ayrıca
// döner (verimden düşer). Verim = standartSaniye / katilimSureleri; hesap okuyan taraftadır. Sağlam sayımı olmayan kişi yoktur.
export function standartSureler(
  db: Db, kisiIdleri: readonly number[], baslangic: string, bitis: string,
): Promise<Map<number, StandartSure>> {
  return kirilimStandartSureleri(db, 'kisi', kisiIdleri, baslangic, bitis);
}

// Aynı standart süre istasyon, makine ya da iş emri kırılımıyla (kart #1306, anomali performansı). Sayım `aralikAdetleri` ile
// aynı yere düşer; makinede payda `makineSureleri`dir. Sağlam sayımı olmayan kimlik haritada yoktur.
export async function kirilimStandartSureleri(
  db: Db, kirilim: SayimKirilimi, idler: readonly number[], baslangic: string, bitis: string,
): Promise<Map<number, StandartSure>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await standartSureleriGetir(db, kirilim, tekil, baslangic, bitis))
    .map((r) => [r.id, { standartSaniye: r.standartSaniye, suresizSaglam: r.suresizSaglam }]));
}

export interface IsEmriPlanBilgisi {
  uretimEmriId: number;
  opNo: number;
  // Emrin adedi.
  adet: number;
  // Proje maliyeti (6c) iş emrinin ayar süresini de fiyatlar.
  ayarSureDk: string | null;
  birimSureDk: string | null;
  kaynak: { tur: 'makine' | 'kisi' | 'fason'; id: number } | null;
  istasyonId: number | null;
}

// Üretim anomalisi (Arkon, kart 764) ve plan sapması (plan, kart 782): iş emrinin ayar başı, başlama, bitiş, bağımlılığı, emrin teslim
// tarihi ve çalıştığı makineler; bitmiş iş emri dahil. Bilinmeyen değer null, kullanımı yoksa makineler boş. Olmayan kimlik haritada yoktur.
export type { IsEmriZamanSatiri as IsEmriZamani } from './sorgular.ts';
export async function isEmriZamanlari(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, IsEmriZamanSatiri>> {
  const tekil = [...new Set(isEmriIdleri)];
  if (tekil.length === 0) return new Map();
  return new Map((await isEmriZamanlariGetir(db, tekil)).map((r) => [r.isEmriId, r]));
}

// Geçmiş günün beklenen adedi için iş emrinin plan bilgisi; bitmiş iş emri dahil. Olmayan kimlik haritada yoktur.
export async function isEmriPlanBilgileri(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, IsEmriPlanBilgisi>> {
  const tekil = [...new Set(isEmriIdleri)];
  if (tekil.length === 0) return new Map();
  return new Map((await isEmriPlanBilgileriGetir(db, tekil)).map((r) => {
    const kaynak = r.fasonFirmaId !== null ? { tur: 'fason' as const, id: r.fasonFirmaId }
      : r.makineId !== null ? { tur: 'makine' as const, id: r.makineId }
        : r.kisiId !== null ? { tur: 'kisi' as const, id: r.kisiId } : null;
    return [r.id, { uretimEmriId: r.uretimEmriId, opNo: r.opNo, adet: r.adet, ayarSureDk: r.ayarSureDk, birimSureDk: r.birimSureDk, kaynak, istasyonId: r.istasyonId }];
  }));
}

/* ---------------- iş emirli üretim emri (kart #262; ADR 0006: plan > rota > uretim-emirleri) ---------------- */

export type {
  FasonHareketiOzeti, FasonTahmini, IsEmriGirdisi, IsEmriOzeti, MalzemeIhtiyaci, PlanIsEmri, UretimEmriGirdisi, UretimEmriOzeti,
} from './is-emri-servis.ts';

// 1248 a, 1245 a: adımın öncülleri tek ortak saf işlevden; plan önizlemesi kendi denediği adımlarla (id yerine op numarası olabilir) çağırır.
// Gerçek emirde PlanIsEmri.onculler bu işlevle çözülmüş gelir. Rota açılış girdisinde IsEmriGirdisi.dal ve .onculler (op numarasıyla) verir.
export { DAL_AZAMI, ONCUL_TURLERI, adimOnculleri } from './kurallar.ts';
export type { AdimOnculu, OnculTuru, OnculluAdim } from './kurallar.ts';

// Rota (UE1): emir, yürürlükteki rotanın kopyasıyla açılır; "emirlere uygula" güvenli kipte yeniler. Liste ve ayrıntı rota ekranı içindir.
export const uretimEmriAc = isEmri.uretimEmriAc;
export const isEmirleriniYenile = isEmri.isEmirleriniYenile;
export const adimliEmirListesi = isEmri.adimliListe;
export const adimliEmirAyrintisi = isEmri.adimliAyrinti;
// Reçete ve Rota'nın emir ilerlemesi (kart #1185): iş emirlerinin durumu ve sağlam adedi; arşivdeki eski (adımsız) emir yoktur.
export const emirDilimi = isEmri.emirDilimi;
export type { EmirDilimiSatiri } from './is-emri-servis.ts';

// Plan (UE4, UE5, P6): planlanacak iş emirleri; kaynak, plan bilgisi, plana alma ve iptal komutları.
export const planlanacakIsEmirleri = isEmri.planlanacakIsEmirleri;
// Arkon Hazırlık (kart #1257): rotasız emrin açık adımları, plan satırı biçiminde; plana girmez.
export const rotasizIsEmirleri = isEmri.rotasizIsEmirleri;
// Arkon iş emri paketi (kart #199 adım 1, istek 11): iş emrine kopyalanmış kontrol listesi.
export const isEmriKontrolListesi = isEmri.isEmriKontrolListesi;
// Proje maliyeti (197 a): projenin iş emirleri (iptal hariç) ve gerçekleşen işleme, ayar ve katılım süreleri.
export const projeninIsEmirleri = isEmri.projeninIsEmirleri;
// Emrin projesi (664): kimlik başına proje kimliği, tek sorgu; projesiz emir haritada yoktur.
export { emirlerinProjeleri } from './emir-projeleri/sorgular.ts';
export const isEmriSureleri = isEmri.isEmriSureleri;
export type { IsEmriSuresi, ProjeIsEmri } from './is-emri-servis.ts';
export type { RotasizIsEmri } from './is-emri-servis.ts';
export const isEmriKaynagiYaz = isEmri.isEmriKaynagiYaz;
export const emirPlanBilgisiYaz = isEmri.planBilgisiYaz;
// Plan stüdyosundaki öncelik denemesi canlıya alınınca (281 a); yetki burada da aranır.
export const emirOnceligiYaz = (db: Db, kullanici: Kullanici, id: number, oncelik: number): Promise<void> => isEmri.oncelikDegistir(db, kullanici, id, oncelik, null);
export const emirPlanaAl = isEmri.planaAl;
export const emirIptalEt = isEmri.adimliIptal;

// Stok (UE12-UE14, K-080).
export const emirNolari = isEmri.emirNolari;
export const isEmriOzeti = isEmri.isEmriOzeti;
// Plan, elle sırası olan ama artık planlanmayan iş emrinin silindiğini ya da fasona alındığını buradan anlar.
export { isEmriVarliklari } from './sorgular.ts';
// 1476-E: çok katmanlı emirde iş emrinin düğümü, düğüm malzemesi, rotadaki op numarası (kaynak_op_no) ve emrin patlatması; yetki denetlemez.
export { isEmriDugumleri } from './sorgular.ts';
export type { IsEmriDugumu } from './sorgular.ts';
// CNC kurulum (266 a): açık iş emirleri; yetki denetlemez, çağıran korur.
export { acikIsEmirleri, acikIsEmri } from './sorgular.ts';
export type { AcikIsEmri } from './sorgular.ts';
// Hazırlık durdurucuları (120-122 a, denetim #14): maddenin sahibi durumunu verir, bağı kablolama.ts kurar (sahipler bu modülü okur).
export const cncHazirlikCozucusu = (c: HazirlikCozucusu | null): void => { hazirlikCozucusuKaydet('cnc', c); };
export const cizimHazirlikCozucusu = (c: HazirlikCozucusu | null): void => { hazirlikCozucusuKaydet('cizim', c); };
export const kalibrasyonHazirlikCozucusu = (c: HazirlikCozucusu | null): void => { hazirlikCozucusuKaydet('kalibrasyon', c); };
export type { HazirlikCozucusu };
// Onaylı kapanış (1072 a, 1074 a): dış maddenin sahibi durumunu verir, bağı kablolama.ts kurar. Kayıtsız ya da null dönen madde 'bilinmiyor'dur
// ve durdurmaz; yalnız 'eksik' durdurur, müdür gerekçeyle muaf tutabilir (1076 a).
export const olcumKapanisCozucusu = (c: KapanisCozucusu | null): void => { kapanisCozucusuKaydet('olcum', c); };
export const izlenebilirlikKapanisCozucusu = (c: KapanisCozucusu | null): void => { kapanisCozucusuKaydet('izlenebilirlik', c); };
export const fasonKapanisCozucusu = (c: KapanisCozucusu | null): void => { kapanisCozucusuKaydet('fason', c); };
export const stokKapanisCozucusu = (c: KapanisCozucusu | null): void => { kapanisCozucusuKaydet('stok', c); };
export const sevkiyatKapanisCozucusu = (c: KapanisCozucusu | null): void => { kapanisCozucusuKaydet('sevkiyat', c); };
export const ncrKapanisCozucusu = (c: KapanisCozucusu | null): void => { kapanisCozucusuKaydet('ncr', c); };
export type { KapanisCozucusu };
// Kapanış sonucu (1082 a): reçete-rota ve etiket kendi emir okumalarına buradan alır; yetki denetlemez, çağıran korur.
export { kapanisSonuclari } from './kapanis.ts';
// Gerçekleşen süreler (plan ve rota karşılaştırması için): brüt ve net birim süre, hazırlık, 1'er giriş dizisi.
export const isEmriSureOzeti = (db: Db, isEmriId: number): Promise<SureOzetiCevabi> => servis.isEmriSureOzeti(db, isEmriId);
export const partiKomutuReddi = isEmri.partiKomutuReddi;
export const uretimEmriOzeti = isEmri.uretimEmriOzeti;
export const emirHurdalari = isEmri.emirHurdalari;
export type { EmirHurdasi } from './is-emri-servis.ts';
export const fasonHareketiOzeti = isEmri.fasonHareketiOzeti;
export const fasonDonusuKaydet = isEmri.fasonDonusuKaydet;
// Sevkiyat Tüm işler (960): depo çıkışı fason gidişini emre yazar (aynı transaction); yetki denetlemez, çağıran korur.
export const fasonGidisYaz = isEmri.fasonGidisYaz;
// Satın alma dış operasyonlar (#542 U3); yetki denetlemez, çağıran korur.
export const fasonIsEmirleri = isEmri.fasonIsEmirleri;
export type { FasonIsEmri } from './is-emri-servis.ts';
// Sevkiyat Tüm işler (960): fason adımının sırası ve gidebilecek adedi; yetki denetlemez, çağıran korur.
export const fasonGonderimleri = isEmri.fasonGonderimleri;
export type { FasonGonderimi } from './is-emri-servis.ts';
// Fason iş emri belgesi (FİE): stok depo çıkışında basar; yetki denetlemez, çağıran korur. Fason olmayan adımda null, iptal emirde CAKISMA.
export const fasonIsEmriBelgesi = isEmri.fasonIsEmriBelgesi;
export type { FasonIsEmriBelgesi } from './is-emri-servis.ts';
// Satın almanın fason süresi tahmini (CA-2) geçmişi buradan okur; yetki denetlemez, çağıran korur. Süre = sonDonus - ilkGidis.
export const fasonGecmisi = isEmri.fasonGecmisi;
export type { FasonGecmisSatiri } from './sorgular.ts';

// Stok ve plan (EK "Malzeme ihtiyacı", "Stok ve tamamlama"): emrin brüt malzeme ihtiyacı; net ihtiyaç ve eksikler stoğu okuyan tarafta.
export const emirMalzemeIhtiyaci = isEmri.emirMalzemeIhtiyaci;
export const emirlerinMalzemeIhtiyaci = isEmri.emirlerinMalzemeIhtiyaci;

// Stok, emrin refakat kartlarına (Arkon kart listesi) sayılanı ve sınırı buradan alır; kartla verilen miktarı kendisi verir. Yetki denetlemez.
export const refakatKartiSayimlari = isEmri.refakatKartiSayimlari;
export type { KartSayimi } from './is-emri-servis.ts';

// Malzeme · Teslim (kart #1208): kişinin açık işinin istasyonu, "nereden" kendiliğinden dolsun diye. Yetki denetlemez.
export const acikIstasyon = (db: Db, kisiId: number): Promise<number | null> => kisininAcikIstasyonu(db, kisiId);

// Sağlam ve hurda sayım olayı (kart #1289): sayım yazan her komut (terminal, Arkon) farkı sayımla aynı işlemde dinleyicilere verir.
// Stok kendi dinleyicisini kaydeder; stok bu modülü okuduğu için çağrı bu yönde kurulur (modül döngüsü olmaz).
export { hurdaSayimDinle, kaliteKarariDinle, saglamSayimDinle } from './sayim-olayi.ts';
// Başlatma denetimi (kart #1289, karar 110 b): stok, adımın girdisi istasyonda yoksa eksiği istek olarak açar ve uyarı döner; denetçisini
// kendisi kaydeder.
export { baslatmaDenetle } from './baslatma-denetimi.ts';
export type { BaslatmaDenetimi, BaslatmaOlayi } from './baslatma-denetimi.ts';
export type {
  HurdaSayimDinleyicisi, HurdaSayimOlayi, KaliteKarariDinleyicisi, KaliteKarariOlayi, SaglamSayimDinleyicisi, SaglamSayimOlayi,
} from './sayim-olayi.ts';

// Emir bitti ve fason hareketi olayları (kart #1310): sevkiyat bekleme listesine ve sevkiyat işine, stok fason konumlarına yazar.
// Dinleyiciler kendini kaydeder; çağrı sayım olayıyla aynı yönde kurulur (modül döngüsü olmaz).
export { emirAcildiDinle, emirBirlestiDinle, emirBittiDinle, emirIptalDinle, fasonHareketiDinle, hazirlikTamamlandiDinle, isEmriKopyalandiDinle } from './emir-olaylari.ts';
export type {
  EmirBittiDinleyicisi, EmirBittiOlayi, EmirIptalDinleyicisi, EmirIptalOlayi, FasonHareketiDinleyicisi, FasonHareketiOlayi, HazirlikTamamlandiDinleyicisi, HazirlikTamamlandiOlayi,
  IsEmriKopyalandiDinleyicisi, IsEmriKopyalandiOlayi,
} from './emir-olaylari.ts';

// Akış Süresi (kart #1338): emrin iş emirleri, terminal olayları, sayımları ve fason hareketleri zaman sırasıyla; yalnız okuma,
// yetki denetlemez (çağıran korur). Emir yoksa null. Fasonda gidişin hurdası yoktur (null).
export interface EmirAkisKaydi {
  emir: AkisEmirSatiri;
  isEmirleri: AkisIsEmriSatiri[];
  olaylar: AkisOlaySatiri[];
  sayimlar: AkisSayimSatiri[];
  fason: AkisFasonSatiri[];
}
// İş emri süre özetinin saf hesabı: Akış Süresi refakat kartının adımdaki penceresini ve sayımlarını aynı kuralla ölçer (kart #708).
export { isEmriSureOzeti as sureOzetiHesapla } from './kurallar.ts';
export type { SureGirdisi, SureOzeti } from './kurallar.ts';
export async function emirAkisKaydi(db: Db, emirId: number): Promise<EmirAkisKaydi | null> {
  const satir = await akisEmriGetir(db, emirId);
  if (satir === null) return null;
  // Sırayla: işlem içindeki tek bağlantıda sorgular eşzamanlı koşamaz.
  const isEmirleri = await akisIsEmirleriGetir(db, emirId);
  const { durum, baslama } = adimlardanGorunum({ ...satir, saglamAdet: null }, isEmirleri.map((i) => ({ ...i, saglamAdet: null })));
  return {
    emir: { ...satir, durum, baslama }, isEmirleri, olaylar: await akisOlaylariGetir(db, emirId),
    sayimlar: await akisSayimlariGetir(db, emirId), fason: await akisFasonGetir(db, emirId),
  };
}

// Terminal üretim girişinin stok yansıması (sayım olayıyla aynı işlemde stok okur): adımın yeri, girdileri (bir adet için reçete miktarı)
// ve emrin taşıdığı malzeme (statü kuralı: ilk adımın ilk girdisi). İş emri yoksa null. Yetki denetlemez.
export interface AdimUretimBilgisi {
  uretimEmriId: number;
  opNo: number;
  // Emirde bu adımdan önceki adımlar, sırayla; ilk adımda boş.
  oncekiOpNolari: number[];
  // 1348 a: dallı emirde adımın öncülleri (op no, sırayla; boş: dal başı); 1248 öncesi emirde null (sıra kuralı geçerli).
  onculOpNolari: number[] | null;
  // Emrin bütün adımları sırayla; stok her dalın taşıdığı malzemeyi bundan çözer (dal: Reçete ve Rota statü kuralındaki dal geçişi).
  // adetCarpani: 1257 a dal çarpanı (boş: 1); birleştirmede gelen parça adedi adimAdetleri'ndeki oranla.
  emirAdimlari: { opNo: number; dal: string | null; adetCarpani: number | null; onculOpNolari: number[] | null; girdiler: { malzemeNo: number; miktar: string }[] }[];
  sonAdim: boolean;
  girdiler: { malzemeNo: number; miktar: string }[];
  tasinan: { malzemeNo: number; miktar: string } | null;
  // 1205: adım fason adımının arkasındaki GKK ise o fason iş emri (girdisi karantinadaki fason dönüşü), değilse null.
  gkkFasonIsEmriId: number | null;
}
export async function adimUretimBilgisi(db: Db, isEmriId: number): Promise<AdimUretimBilgisi | null> {
  const a = await adimUretimSatiriGetir(db, isEmriId);
  if (a === null) return null;
  const hepsi = await isEmirleriGetir(db, [a.uretimEmriId]);
  const adim = hepsi.find((i) => i.id === isEmriId);
  const fason = adim === undefined ? null : await isEmri.gkkFasonuBul(db, hepsi, adim);
  return {
    ...a, girdiler: await adimGirdileriGetir(db, isEmriId), tasinan: await tasinanGirdiGetir(db, a.uretimEmriId), gkkFasonIsEmriId: fason?.id ?? null,
    emirAdimlari: await emirAdimZinciriGetir(db, a.uretimEmriId),
  };
}

// 1476-C: çok katmanlı emirde adımın düğümü; stok statüyü ve çıktıyı emrin ürününün değil düğümün malzemesi ve rotadaki op numarasıyla
// çözer. Anahtar emir içindeki op numarasıdır; tek katmanlı emirde harita boştur. Yetki denetlemez.
// dugumSonu: alt düğümün son adımı; çıktısı düğümün malzemesidir ve tüketen üst adıma gider (1482 a).
export interface AdimDugumu { dugum: string; malzemeNo: number; kaynakOpNo: number; birimCarpani: string; dugumSonu: boolean }
export async function emirDugumleri(db: Db, uretimEmriId: number): Promise<Map<number, AdimDugumu>> {
  return new Map((await dugumleriGetir(db, [uretimEmriId])).map((d) => [d.opNo, { dugum: d.dugum, malzemeNo: d.malzemeNo, kaynakOpNo: d.kaynakOpNo, birimCarpani: d.birimCarpani, dugumSonu: d.dugumSonu }]));
}

// Plan, rotadan önizlediği emirde de aynı fason varsayılanını kullanır.
export { FASON_VARSAYILAN_GUN } from './kurallar.ts';
// 1527: emri açılmamış rotanın adım adetleri (planın deneme emri, satış teklifi); plan dal çarpanını kendisi uygulamaz.
export { rotadanAdimAdetleri } from './kurallar.ts';

// Kalite Merkezi emir numarasıyla gelen kaydı emre bağlar: numaradan kimlik; bulunamayan numara haritada yok.
export { emirIdleri } from './sorgular.ts';
// Etiket Merkezi refakat kartını basar: uçtaki kartla aynı veri. Yetki denetlemez, çağıran kendi ucunda denetler; iptal emirde CAKISMA.
export const refakatKarti = (db: Db, emirId: number): Promise<RefakatKartiCevabi> => isEmri.refakatKarti(db, emirId);

// Saat (pano): pencerede biten emirler (istasyon son bitirme kaydından), istasyon başına duruş saniyesi (duraklatma hariç) ve emrin
// çalışmaya son geçiş anı. Pencere [baslangic, bitis) ISO zamanıdır; veri yoksa istasyon ya da emir haritada yoktur.
export async function bitenEmirler(db: Db, istasyonIdleri: readonly number[], baslangic: string, bitis: string) {
  return istasyonIdleri.length === 0 ? [] : bitenEmirlerGetir(db, istasyonIdleri, baslangic, bitis);
}
export async function istasyonDurusSureleri(db: Db, istasyonIdleri: readonly number[], baslangic: string, bitis: string): Promise<Map<number, number>> {
  if (istasyonIdleri.length === 0) return new Map();
  return new Map((await istasyonDuruslariGetir(db, istasyonIdleri, baslangic, bitis)).map((r) => [r.istasyonId, r.saniye]));
}
export async function calismayaGecisAnlari(db: Db, emirIdleri: readonly number[]): Promise<Map<number, string>> {
  if (emirIdleri.length === 0) return new Map();
  return new Map((await gecisAnlariGetir(db, emirIdleri)).map((r) => [r.emirId, r.an]));
}

// 393 d: plan, makinelerin canlı ayrımlarını verir (kablolama.ts).
export const planAyrimiCozucusu = (cozucu: servis.PlanAyrimiCozucusu | null): void => servis.planAyrimiCozucusuKaydet(cozucu);
// Arkon makine seçicisi: seçilen makinelerin başka emre ayrımları, başlatma ve devamın 409 kuralıyla aynı yoldan.
export const makineAyrimlari = (db: Db, emirId: number, makineIdleri: readonly number[]) => servis.makineAyrimlari(db, emirId, makineIdleri);

// Hatalı parça (1034, 1038 a): Kalite Merkezi açık kayıtları listeler ve kararı formundan yazar. Karar kalite adımını kapatır, rework
// adımı planlamayı bekler; hurda ve red parçayı ayırır (kol katılır ya da sağlamsız biter). İşlem (kalite-merkezi.onayla) burada da
// aranır; çağıranın transaction'ında yazar. Kayıt yoksa BULUNAMADI, karar verilmişse ya da kalite adımı kalkmışsa CAKISMA.
export type { HataliKarari, HataliKaydiOzeti } from '#paylasilan/sozlesme/uretim-emirleri.ts';
export { hataliKarariVer, hataliKaydi, hataliKayitlari } from './hatali-parca.ts';

// Takvim (891): planlı başlangıcı ya da teslimi aralıktaki emirler; yetkiyi çağıran denetler (sayfa.uretim-emirleri).
export const takvimKayitlari = isEmri.takvimKayitlari;
