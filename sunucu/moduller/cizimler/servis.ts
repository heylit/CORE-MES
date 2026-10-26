import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { DenetimSecimi, IkiliCevap } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  BagModulu, BelgeAyrintisi, BelgeGuncelleGovdesi, BelgeListesiSuzgeci, BelgeOlusturGovdesi, BelgeSatiri, BelgeTuru, MalzemeSecimiCevabi, OnizlemeGovdesi,
  RevizyonEkleGovdesi,
} from '#paylasilan/sozlesme/cizimler.ts';
import { BELGE_TURLERI, ONIZLEME_SINIRLARI } from '#paylasilan/sozlesme/cizimler.ts';
import type { BagliDosya } from '#paylasilan/sozlesme/dosya.ts';
import { denetimSatiri, dosyaTutamagi } from '../dosya/disari.ts';
import { istasyonAdlari, istasyonGetir } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeAra, malzemeOzetleri } from '../malzemeler/disari.ts';
import {
  AZAMI_BAYT, ILETILER, IZINLI_DOSYA_TURLERI, menuAnahtari, merkezBagReddi, onizlemeBoyutReddi, onizlemeKareReddi, onizlemeRevizyonReddi, revizyonHarfi,
  silmeReddi, yayinReddi,
} from './kurallar.ts';
import * as sorgular from './sorgular.ts';
import type { BelgeKaydi } from './sorgular.ts';

// `dosya_bagi`nda modül adı ve kayıt anahtarı: dosya belgeye bağlanır, revizyon dosyayı özetiyle anar.
export const MODUL = 'cizimler';
const kayitAnahtari = (belgeId: number): string => String(belgeId);
// Önizleme kareleri revizyon dosyalarından ayrı kayıt anahtarında durur: belge ayrıntısındaki revizyon-dosya eşlemesine karışmaz.
const onizlemeKaydi = (belgeId: number, revizyonId: number): string => `${belgeId}/onizleme/${revizyonId}`;
const dosyaTutamak = dosyaTutamagi(MODUL);

type DenetimEki = (satirlar: readonly DenetimSecimi[]) => void;

const BELGE_ISLETILERI = {
  cizimler_revizyon_dosya_tekil: { ileti: ILETILER.ayniDosya, alan: 'ozet' },
  cizimler_revizyon_silinmez: ILETILER.taslakDegil,
  cizimler_revizyon_tek_yayinda: 'Belgede aynı anda tek revizyon yayında olur; sayfayı yenileyip yeniden deneyin.',
} as const;

async function kilitliBelge(db: Db, id: number): Promise<BelgeKaydi> {
  const b = await sorgular.belgeKilitle(db, id);
  if (b === null) throw bulunamadi('Belge bulunamadı.');
  return b;
}

// CZ-08: arşivdeki belgeye revizyon eklenmez, yayın yapılmaz, bağ kurulmaz.
function etkinOlmali(b: BelgeKaydi): void {
  if (!b.aktif) throw cakisma(ILETILER.arsivde);
}

// CZ-10: belgeye dokunan her komut beklenen sürümle ana satırı ilerletir.
async function surumuIlerlet(db: Db, id: number, surum: number): Promise<void> {
  await surumluGuncelle({ guncelle: () => sorgular.belgeSurumuArtir(db, id, surum), varMi: () => sorgular.belgeVarMi(db, id) });
}

// CZ-03: dosya türü belge türüne uymalı; sınırı dosya modülü uygular (içeriği yükleyen bağlar, tür içerikten bulunur).
async function dosyayiBagla(db: Db, kullanici: Kullanici, belgeId: number, tur: BelgeTuru, ozet: string, dosyaAdi: string): Promise<BagliDosya> {
  return dosyaTutamak.dosyaBagla(
    db, kullanici,
    { ozet, kayit: kayitAnahtari(belgeId), ad: dosyaAdi, belgeTuru: tur },
    { turler: IZINLI_DOSYA_TURLERI[tur], azamiBayt: AZAMI_BAYT },
  );
}

async function revizyonYaz(
  db: Db, kullanici: Kullanici, b: { id: number; tur: BelgeTuru }, g: { ozet: string; dosyaAdi: string; not?: string | null | undefined },
  denetimEki: DenetimEki,
): Promise<void> {
  // CZ-06: aynı dosya bir belgede iki revizyon olmaz. Bağ yazılmadan önce bakılır: bağ satırı aynı özette adı ezerdi.
  if ((await sorgular.revizyonlar(db, b.id)).some((r) => r.ozet === g.ozet)) throw dogrulama(ILETILER.ayniDosya, 'ozet');
  const bag = await dosyayiBagla(db, kullanici, b.id, b.tur, g.ozet, g.dosyaAdi);
  const sira = await sorgular.sonrakiSira(db, b.id);
  await kisitKorumali(BELGE_ISLETILERI, () => sorgular.revizyonEkle(db, {
    belgeId: b.id, sira, ozet: g.ozet, dosyaTuru: bag.tur, not: g.not ?? null, kisiId: kullanici.id,
  }));
  denetimEki([{ ...denetimSatiri('bagla', bag), revizyon: revizyonHarfi(sira) }]);
}

export async function belgeOlustur(db: Db, kullanici: Kullanici, g: BelgeOlusturGovdesi, denetimEki: DenetimEki): Promise<BelgeAyrintisi> {
  const id = await sorgular.belgeEkle(db, { ad: g.ad.trim(), tur: g.tur, aciklama: g.aciklama ?? null, kisiId: kullanici.id });
  await revizyonYaz(db, kullanici, { id, tur: g.tur }, g, denetimEki);
  return belgeAyrintisi(db, id);
}

export async function belgeGuncelle(db: Db, id: number, g: BelgeGuncelleGovdesi): Promise<BelgeAyrintisi> {
  etkinOlmali(await kilitliBelge(db, id));
  await surumluGuncelle({
    guncelle: () => sorgular.belgeGuncelle(db, id, g.surum, g.ad.trim(), g.aciklama ?? null),
    varMi: () => sorgular.belgeVarMi(db, id),
  });
  return belgeAyrintisi(db, id);
}

export async function belgeArsivi(db: Db, id: number, surum: number, aktif: boolean): Promise<BelgeAyrintisi> {
  await kilitliBelge(db, id);
  await surumluGuncelle({ guncelle: () => sorgular.belgeAktifligi(db, id, surum, aktif), varMi: () => sorgular.belgeVarMi(db, id) });
  return belgeAyrintisi(db, id);
}

export async function revizyonEkle(db: Db, kullanici: Kullanici, id: number, g: RevizyonEkleGovdesi, denetimEki: DenetimEki): Promise<BelgeAyrintisi> {
  const b = await kilitliBelge(db, id);
  etkinOlmali(b);
  await surumuIlerlet(db, id, g.surum);
  await revizyonYaz(db, kullanici, b, g, denetimEki);
  return belgeAyrintisi(db, id);
}

export async function revizyonYayinla(db: Db, kullanici: Kullanici, id: number, revizyonId: number, surum: number): Promise<BelgeAyrintisi> {
  etkinOlmali(await kilitliBelge(db, id));
  await surumuIlerlet(db, id, surum);
  const r = await sorgular.revizyon(db, id, revizyonId);
  if (r === null) throw bulunamadi('Revizyon bulunamadı.');
  const ret = yayinReddi(r.durum);
  if (ret !== null) throw cakisma(ILETILER[ret]);
  await kisitKorumali(BELGE_ISLETILERI, () => sorgular.revizyonYayinla(db, id, revizyonId, kullanici.id));
  return belgeAyrintisi(db, id);
}

export async function revizyonSil(db: Db, id: number, revizyonId: number, surum: number, denetimEki: DenetimEki): Promise<BelgeAyrintisi> {
  etkinOlmali(await kilitliBelge(db, id));
  await surumuIlerlet(db, id, surum);
  const r = await sorgular.revizyon(db, id, revizyonId);
  if (r === null) throw bulunamadi('Revizyon bulunamadı.');
  const ret = silmeReddi(r.durum, await sorgular.revizyonSayisi(db, id));
  if (ret !== null) throw cakisma(ILETILER[ret]);
  await kisitKorumali(BELGE_ISLETILERI, () => sorgular.revizyonSil(db, id, revizyonId));
  // Dosyanın bağı kalkar; bağı kalmayan dosyayı dosya modülü süresi dolunca siler.
  for (const kalkan of await dosyaTutamak.bagKaldir(db, kayitAnahtari(id), r.ozet)) {
    denetimEki([{ ...denetimSatiri('kaldir', kalkan), revizyon: revizyonHarfi(r.sira) }]);
  }
  return belgeAyrintisi(db, id);
}

// Önizleme belgeyi değiştirmez: sürüm ilerlemez, eşzamanlı düzenleme çatışması çıkmaz. Yeniden üretim eski karelerin yerini alır.
export async function onizlemeYaz(
  db: Db, kullanici: Kullanici, id: number, revizyonId: number, g: OnizlemeGovdesi, denetimEki: DenetimEki,
): Promise<BelgeAyrintisi> {
  etkinOlmali(await kilitliBelge(db, id));
  const r = await sorgular.revizyon(db, id, revizyonId);
  if (r === null) throw bulunamadi('Revizyon bulunamadı.');
  const revizyonRet = onizlemeRevizyonReddi(r);
  if (revizyonRet === 'onizlemeTaslak') throw cakisma(ILETILER.onizlemeTaslak);
  if (revizyonRet !== null) throw dogrulama(ILETILER[revizyonRet], 'revizyonId');
  const kareRet = onizlemeKareReddi(g.kareler);
  if (kareRet !== null) throw dogrulama(ILETILER[kareRet], 'kareler');

  const kayit = onizlemeKaydi(id, revizyonId);
  const kalkanlar = await dosyaTutamak.bagKaldir(db, kayit, null);
  await sorgular.onizlemeSil(db, revizyonId);
  // Aynı içerikli iki kare tek bağ olur (bağ özet başınadır); kare satırları yine ayrıdır.
  const bagli = new Map<string, BagliDosya>();
  for (const { kare, ozet } of g.kareler) {
    if (bagli.has(ozet)) continue;
    bagli.set(ozet, await dosyaTutamak.dosyaBagla(
      db, kullanici, { ozet, kayit, ad: `onizleme-${revizyonHarfi(r.sira)}-${kare}.png`, belgeTuru: null },
      { turler: ['png'], azamiBayt: ONIZLEME_SINIRLARI.kareBayt },
    ));
  }
  const boyutRet = onizlemeBoyutReddi(g.kareler.map((k) => bagli.get(k.ozet) as BagliDosya));
  if (boyutRet !== null) throw dogrulama(ILETILER[boyutRet], 'kareler');
  for (const { kare, ozet } of g.kareler) await sorgular.onizlemeEkle(db, { revizyonId, kare, ozet, kisiId: kullanici.id });
  denetimEki([
    ...kalkanlar.map((d) => ({ ...denetimSatiri('kaldir', d), revizyon: revizyonHarfi(r.sira) })),
    ...[...bagli.values()].map((d) => ({ ...denetimSatiri('bagla', d), revizyon: revizyonHarfi(r.sira) })),
  ]);
  return belgeAyrintisi(db, id);
}

export async function onizlemeKaresi(db: Db, id: number, revizyonId: number, kare: number): Promise<IkiliCevap> {
  const k = await sorgular.onizlemeKaresi(db, id, revizyonId, kare);
  if (k === null) throw bulunamadi('Önizleme karesi bulunamadı.');
  const akis = await dosyaTutamak.dosyaAkisi(db, onizlemeKaydi(id, revizyonId), k.ozet);
  if (akis === null) throw bulunamadi('Önizleme karesi bulunamadı.');
  return akis;
}

async function bagYaz(db: Db, kullanici: Kullanici, id: number, hedefModul: BagModulu, hedefId: number): Promise<void> {
  await kisitKorumali({ cizimler_bag_pkey: ILETILER.bagVar }, () => sorgular.bagEkle(db, id, hedefModul, hedefId, kullanici.id));
}

// Merkezden malzeme kartına (CM3 a) ve istasyona (CZ-14, makine eşleştirmesi) bağ kurulur; öbür modüller kendi ekranından
// `disari.ts` ile bağlar. İstasyon başına tek 3B model: haritanın göstereceği model belli olsun diye yeni bağ istasyonun öbür
// 3B model bağlarını kaldırır (atölyenin kendi seçicisi de böyle yapar).
export async function bagEkle(
  db: Db, kullanici: Kullanici, id: number, g: { hedefModul: BagModulu; hedefId: number; surum: number },
): Promise<BelgeAyrintisi> {
  const b = await kilitliBelge(db, id);
  const red = merkezBagReddi(g.hedefModul, b.tur);
  if (red !== null) throw dogrulama(red, 'hedefModul');
  etkinOlmali(b);
  if (g.hedefModul === 'istasyonlar' && (await istasyonGetir(db, g.hedefId)) === null) throw dogrulama(ILETILER.hedefYok, 'hedefId');
  await surumuIlerlet(db, id, g.surum);
  await bagYaz(db, kullanici, id, g.hedefModul, g.hedefId);
  if (g.hedefModul === 'istasyonlar') {
    for (const o of await sorgular.bagliBelgeler(db, 'istasyonlar', g.hedefId)) {
      if (o.id !== id && o.tur === '3b-model') await kayittanKaldir(db, o.id, 'istasyonlar', g.hedefId);
    }
  }
  return belgeAyrintisi(db, id);
}

const SECIM_SINIRI = 20;

export async function malzemeSecimi(db: Db, ara: string): Promise<MalzemeSecimiCevabi['malzemeler']> {
  const r = await malzemeAra(db, { metin: ara === '' ? null : ara, yalnizAktif: true, sayfa: 1, sayfaBoyu: SECIM_SINIRI });
  return r.satirlar.map((m) => ({ id: m.id, kod: m.kod, ad: m.ad, birim: m.birim }));
}

export async function bagKaldir(db: Db, id: number, g: { hedefModul: BagModulu; hedefId: number; surum: number }): Promise<BelgeAyrintisi> {
  await kilitliBelge(db, id);
  await surumuIlerlet(db, id, g.surum);
  if (!(await sorgular.bagSil(db, id, g.hedefModul, g.hedefId))) throw bulunamadi('Bağ bulunamadı.');
  return belgeAyrintisi(db, id);
}

// Bağın okunur adı, sahibinin disari.ts'inden toplu okunur (test raporu: "Malzeme kartı #54"). Adı veren yalnız malzemeler ve
// istasyonlar; öteki modüllerde ve silinmiş kayıtta null.
async function bagHedefAdlari(db: Db, baglar: readonly { hedefModul: BagModulu; hedefId: number }[]): Promise<(g: { hedefModul: BagModulu; hedefId: number }) => string | null> {
  const idler = (m: BagModulu) => baglar.filter((g) => g.hedefModul === m).map((g) => g.hedefId);
  const [malzemeler, istasyonlar] = [await malzemeOzetleri(db, idler('malzemeler')), await istasyonAdlari(db, idler('istasyonlar'))];
  return (g) => {
    if (g.hedefModul === 'istasyonlar') return istasyonlar.get(g.hedefId) ?? null;
    if (g.hedefModul !== 'malzemeler') return null;
    const m = malzemeler.get(g.hedefId);
    return m === undefined ? null : m.ad === null ? m.kod : `${m.kod} ${m.ad}`;
  };
}

export async function belgeAyrintisi(db: Db, id: number): Promise<BelgeAyrintisi> {
  const b = await sorgular.belge(db, id);
  if (b === null) throw bulunamadi('Belge bulunamadı.');
  const [revizyonlar, baglar, dosyalar, kareler] = [
    await sorgular.revizyonlar(db, id), await sorgular.baglar(db, id), await dosyaTutamak.bagliDosyalar(db, kayitAnahtari(id)),
    await sorgular.onizlemeSayilari(db, id),
  ];
  const dosya = new Map(dosyalar.map((d) => [d.ozet, d]));
  const hedefAdi = await bagHedefAdlari(db, baglar);
  const adlar = await kisiAdlari(db, [
    b.olusturanId, ...revizyonlar.flatMap((r) => [r.yukleyenId, ...(r.yayinlayanId === null ? [] : [r.yayinlayanId])]), ...baglar.map((g) => g.ekleyenId),
  ]);
  return {
    id: b.id, ad: b.ad, tur: b.tur, aciklama: b.aciklama, aktif: b.aktif, olusturanAd: adlar.get(b.olusturanId) ?? null,
    olusturuldu: b.olusturuldu, guncellendi: b.guncellendi, surum: b.surum,
    revizyonlar: revizyonlar.map((r) => {
      const d = dosya.get(r.ozet);
      // Bağ revizyonla aynı transaction'da yazılır ve revizyon dururken kaldırılmaz; yoksa veri bozuktur.
      if (d === undefined) throw new Error(`Revizyonun dosya bağı yok: belge ${id}, revizyon ${r.id}`);
      return {
        id: r.id, sira: r.sira, harf: revizyonHarfi(r.sira), durum: r.durum, ozet: r.ozet, dosyaAdi: d.ad, dosyaTuru: r.dosyaTuru,
        boyut: d.boyut, not: r.not, yukleyenAd: adlar.get(r.yukleyenId) ?? null, yuklendi: r.yuklendi,
        yayinlayanAd: r.yayinlayanId === null ? null : adlar.get(r.yayinlayanId) ?? null, yayinlandi: r.yayinlandi,
        onizlemeKareSayisi: kareler.get(r.id) ?? 0,
      };
    }),
    baglar: baglar.map((g) => ({ hedefModul: g.hedefModul, hedefId: g.hedefId, hedefAdi: hedefAdi(g), ekleyenAd: adlar.get(g.ekleyenId) ?? null, eklendi: g.eklendi })),
  };
}

export async function belgeListesi(db: Db, sorgu: BelgeListesiSuzgeci): Promise<SayfaliListe<BelgeSatiri>> {
  const suzgec = { ara: sorgu.ara ?? null, tur: sorgu.tur ?? null, aktif: sorgu.arsiv === 'hayir', makine: sorgu.makine === undefined ? null : sorgu.makine === 'evet' };
  return sayfaliListe(sorgu, {
    say: () => sorgular.belgeSay(db, suzgec),
    satirlar: async (dilim) => (await sorgular.belgeSatirlari(db, suzgec, sorgu, dilim)).map((s) => ({
      id: s.id, ad: s.ad, tur: s.tur, aktif: s.aktif, yayindakiHarf: s.yayindakiSira === null ? null : revizyonHarfi(s.yayindakiSira),
      sonHarf: revizyonHarfi(s.sonSira), dosyaTuru: s.dosyaTuru, bagSayisi: s.bagSayisi, guncellendi: s.guncellendi, surum: s.surum,
    })),
  });
}

// Sayı belge türü anahtarıyla; "tumu" etkinlerin toplamı, "arsiv" arşivdekiler.
export async function menuSayaclari(db: Db): Promise<Record<string, number>> {
  const satirlar = await sorgular.sayaclar(db);
  const sayac: Record<string, number> = { tumu: 0, arsiv: 0 };
  for (const t of BELGE_TURLERI) sayac[menuAnahtari(t)] = 0;
  for (const s of satirlar) {
    if (s.aktif) {
      sayac[menuAnahtari(s.tur)] = (sayac[menuAnahtari(s.tur)] ?? 0) + s.n;
      sayac.tumu = (sayac.tumu ?? 0) + s.n;
    } else {
      sayac.arsiv = (sayac.arsiv ?? 0) + s.n;
    }
  }
  return sayac;
}

// Revizyonun dosyası: yalnız o belgeye bağlı dosya akar (dosya modülü kaydı ve özeti birlikte denetler).
export async function revizyonDosyasi(db: Db, id: number, revizyonId: number): Promise<IkiliCevap> {
  const r = await sorgular.revizyon(db, id, revizyonId);
  if (r === null) throw bulunamadi('Revizyon bulunamadı.');
  const akis = await dosyaTutamak.dosyaAkisi(db, kayitAnahtari(id), r.ozet);
  if (akis === null) throw bulunamadi('Dosya bulunamadı.');
  return akis;
}

/* ---------------- Başka modüllere (disari.ts) ---------------- */

export interface BagliBelge {
  id: number;
  ad: string;
  tur: BelgeTuru;
  // Yayındaki revizyon yoksa (yalnız taslak) null.
  revizyonId: number | null;
  harf: string | null;
  dosyaTuru: BagliDosya['tur'] | null;
  // Yayındaki dosyanın özeti: kullanan modül kendi kopyasının ya da hizalamasının eskidiğini bununla anlar.
  ozet: string | null;
}

const bagliBelge = (s: sorgular.BagliBelgeSatiri): BagliBelge => ({
  id: s.id, ad: s.ad, tur: s.tur, revizyonId: s.yayindakiRevizyonId,
  harf: s.yayindakiSira === null ? null : revizyonHarfi(s.yayindakiSira), dosyaTuru: s.dosyaTuru, ozet: s.ozet,
});

export async function kaydaBagliBelgeler(db: Db, hedefModul: BagModulu, hedefId: number): Promise<BagliBelge[]> {
  return (await sorgular.bagliBelgeler(db, hedefModul, hedefId)).map(bagliBelge);
}

// Liste ekranı (ör. fabrika yerleşimi) kayıt başına sorgu atmasın diye. Bağı olmayan kayıt haritada yoktur.
export async function kayitlaraBagliBelgeler(db: Db, hedefModul: BagModulu, hedefIdler: readonly number[]): Promise<Map<number, BagliBelge[]>> {
  const sonuc = new Map<number, BagliBelge[]>();
  if (hedefIdler.length === 0) return sonuc;
  for (const s of await sorgular.bagliBelgelerToplu(db, hedefModul, hedefIdler)) {
    const liste = sonuc.get(s.hedefId) ?? [];
    liste.push(bagliBelge(s));
    sonuc.set(s.hedefId, liste);
  }
  return sonuc;
}

// Bağlayan modül kendi komutunda çağırır; belge sürümü ilerler (beklenen sürüm sorulmaz: çağıranın kaydı değişiyor).
export async function kaydaBagla(db: Db, kullanici: Kullanici, belgeId: number, hedefModul: BagModulu, hedefId: number): Promise<void> {
  const b = await kilitliBelge(db, belgeId);
  etkinOlmali(b);
  await surumuIlerlet(db, belgeId, b.surum);
  await bagYaz(db, kullanici, belgeId, hedefModul, hedefId);
}

// CZ-13: başka modülün kaydına ait sertifika ya da rapor (ör. mal kabulde parti sertifikası): belge açılır, ilk revizyon yayınlanır
// ve kayda bağlanır. `cizimler.yaz` ve `cizimler.yayinla` sorulmaz; yetkiyi çağıran modülün ucu denetler, belge yalnız o
// kayıttan görünür. Dosyayı içeriği yükleyen kişi bağlar (CZ-04), tür belge türüne uyar (CZ-03).
export type KayitBelgesiTuru = Extract<BelgeTuru, 'sertifika' | 'rapor'>;
export async function belgeAcVeBagla(
  db: Db, kullanici: Kullanici, g: { ad: string; tur: KayitBelgesiTuru; ozet: string; dosyaAdi: string },
  hedefModul: BagModulu, hedefId: number, denetimEki: DenetimEki,
): Promise<number> {
  const id = await sorgular.belgeEkle(db, { ad: g.ad.trim(), tur: g.tur, aciklama: null, kisiId: kullanici.id });
  await revizyonYaz(db, kullanici, { id, tur: g.tur }, g, denetimEki);
  const r = (await sorgular.revizyonlar(db, id))[0];
  if (!r) throw bulunamadi('Revizyon bulunamadı.');
  await kisitKorumali(BELGE_ISLETILERI, () => sorgular.revizyonYayinla(db, id, r.id, kullanici.id));
  await bagYaz(db, kullanici, id, hedefModul, hedefId);
  return id;
}

export async function kayittanKaldir(db: Db, belgeId: number, hedefModul: BagModulu, hedefId: number): Promise<boolean> {
  const b = await sorgular.belgeKilitle(db, belgeId);
  if (b === null) return false;
  const silindi = await sorgular.bagSil(db, belgeId, hedefModul, hedefId);
  if (silindi) await surumuIlerlet(db, belgeId, b.surum);
  return silindi;
}

// Bağlayan modülün okuma ucu için: belge o kayda bağlı değilse null (modül başka kaydın belgesini kendi ucundan veremez).
export async function kayittakiBelgeDosyasi(db: Db, hedefModul: BagModulu, hedefId: number, belgeId: number): Promise<IkiliCevap | null> {
  const bagli = (await sorgular.bagliBelgeler(db, hedefModul, hedefId)).find((s) => s.id === belgeId);
  if (bagli === undefined || bagli.yayindakiRevizyonId === null) return null;
  return revizyonDosyasi(db, belgeId, bagli.yayindakiRevizyonId);
}

export interface YayindakiBelge {
  id: number;
  ad: string;
  tur: BelgeTuru;
  revizyonId: number;
  harf: string;
  dosyaTuru: BagliDosya['tur'];
  ozet: string;
}

const SECICI_SINIRI = 200;

// Başka modülün seçicisi için (Arkon, atölye): yayındaki belgeler. Okuma yetkisi çağıran modülün ucundadır.
export async function yayindakiBelgeler(db: Db, s: { tur?: BelgeTuru; ara?: string; sinir?: number } = {}): Promise<YayindakiBelge[]> {
  const ara = s.ara?.trim() ? s.ara.trim() : null;
  const sinir = Math.min(Math.max(1, s.sinir ?? SECICI_SINIRI), SECICI_SINIRI);
  return (await sorgular.yayindakiBelgeler(db, { tur: s.tur ?? null, ara, sinir })).map((b) => ({
    id: b.id, ad: b.ad, tur: b.tur, revizyonId: b.yayindakiRevizyonId, harf: revizyonHarfi(b.yayindakiSira), dosyaTuru: b.dosyaTuru, ozet: b.ozet,
  }));
}

// Seçilen belgenin yayındaki dosyası; belge yoksa, arşivdeyse ya da yalnız taslaksa null (hata değil). İçerik akış olarak verilir:
// büyük dosya belleğe alınmaz; çağıran kendi ikili ucundan `dosya`yı döndürür ya da akışı okuyup kendi deposuna yazar.
export interface YayindakiBelgeDosyasi {
  ad: string;
  tur: BelgeTuru;
  ozet: string;
  dosyaTuru: BagliDosya['tur'];
  dosya: IkiliCevap;
}

export async function yayindakiBelgeDosyasi(db: Db, belgeId: number): Promise<YayindakiBelgeDosyasi | null> {
  const b = await sorgular.belge(db, belgeId);
  if (b === null || !b.aktif) return null;
  const r = await sorgular.yayindakiRevizyon(db, belgeId);
  if (r === null) return null;
  return { ad: b.ad, tur: b.tur, ozet: r.ozet, dosyaTuru: r.dosyaTuru, dosya: await revizyonDosyasi(db, belgeId, r.id) };
}

// Başka modülün aldığı revizyon (belge kimliği ve özetle): belge sonradan yeni revizyona geçse de alınan revizyonun dosyası verilir
// (Kalite Merkezi balonları o resmin üstündedir, 597 a). Kural yayındaki dosyayla aynıdır: arşivdeki belge ve taslak revizyon null.
// Okuma yetkisi ve veri kapsamı çağıranın ucundadır.
export async function alinanRevizyonDosyasi(db: Db, belgeId: number, ozet: string): Promise<YayindakiBelgeDosyasi | null> {
  const b = await sorgular.belge(db, belgeId);
  if (b === null || !b.aktif) return null;
  const r = await sorgular.yayinlanmisRevizyonOzetle(db, belgeId, ozet);
  if (r === null) return null;
  return { ad: b.ad, tur: b.tur, ozet: r.ozet, dosyaTuru: r.dosyaTuru, dosya: await revizyonDosyasi(db, belgeId, r.id) };
}

export interface YayindakiOnizleme {
  belgeId: number;
  revizyonId: number;
  // Üretilmiş karelerin sırası (0'dan); çoğunlukla 0..n-1 ama çağıran bunu varsaymaz.
  kareler: number[];
}

// Saat gibi gösteren modüller için: kayda bağlı 3B model belgelerinden, yayındaki revizyonunun karesi olan İLKİ (bağın eklenme sırası,
// eşitse belge kimliği). Okuma yetkisi ve veri kapsamı çağıran modülün ucundadır.
export async function yayindakiOnizleme(db: Db, hedef: { hedefModul: BagModulu; hedefId: number }): Promise<YayindakiOnizleme | null> {
  return sorgular.kayitOnizlemesi(db, hedef.hedefModul, hedef.hedefId);
}

// Revizyon o kayda bağlı belgenin yayındaki revizyonu değilse ya da kare yoksa null: başka kaydın karesi bu yoldan okunamaz.
export async function yayindakiOnizlemeKaresi(
  db: Db, hedef: { hedefModul: BagModulu; hedefId: number }, revizyonId: number, kare: number,
): Promise<IkiliCevap | null> {
  const k = await sorgular.yayindakiOnizlemeKaresi(db, hedef.hedefModul, hedef.hedefId, revizyonId, kare);
  if (k === null) return null;
  return dosyaTutamak.dosyaAkisi(db, onizlemeKaydi(k.belgeId, revizyonId), k.ozet);
}
