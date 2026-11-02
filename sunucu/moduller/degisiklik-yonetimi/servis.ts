import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import { ACILIYET_ADLARI, IMZA_ANLAMLARI, KARAR_KODU_ADLARI, kapanisImzaAnlami, SINIF_ADLARI, TALEP_DURUM_ADLARI } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import type {
  AcikDegisiklik, CcbGovdesi, EmirCevabi, EmirListeCevabi, EmirlerSorgusu, FaiOnayGovdesi, Gecerlilik, GecmisOlayi, GecmisSatiri,
  GeriGonderGovdesi, GorevKapsami, GorevSatiri, GorevlerimCevabi, HatAsamasi, IzlenebilirlikCevabi, IzlenebilirlikSorgusu, KalemKaydetGovdesi, KapatGovdesi,
  KararGovdesi, KararHedefi, KonfigurasyonCevabi, MusteriOnayiGovdesi, OlayListeCevabi, OlaylarSorgusu, ParcaAdaylariCevabi, RaporCevabi,
  RaporSorgusu, SeriListeCevabi, SerilerSorgusu, SiniflandirGovdesi, SonUrunlerCevabi, TalepAcGovdesi, TalepCevabi, TalepListeCevabi, TaleplerSorgusu, YayinlaGovdesi,
} from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeAra, malzemeOzetleri } from '../malzemeler/disari.ts';
import {
  MRB_KODU_LISTESI, PARAMETRE_ILETISI, benimGorevimMi, emirAdimiUygunMu, emirGorevleri, emirHatti, emirIlerler, emirKarariOner, etkiAnaliziKur, gorevSuresi,
  cevrimIsGunu, ilkParcaTuru, izinliKodlar, kapanisKosullari, kapatilabilirMi, kararIslemi, kendiTalebiMi, musteriOnayiIstenirMi, stokKarariOner,
  talepAdimiUygunMu, talepGerekmezMi, talepGorevi, talepHatti, topluUygulanirMi, yayinaGonderimEksigi, yeniParcaNoGerekirMi,
} from './kurallar.ts';
import type { EMIR_ADIMLARI, EtkilenenEmir, TALEP_ADIMLARI } from './kurallar.ts';
import * as s from './sorgular.ts';
import type { EmirSatiri, GecmisSatiriHam, KararSatiriHam, TalepSatiri } from './sorgular.ts';

// Akış: yetkiyi uç verir; burada kilit, sürüm, durum kuralı, yazma, imzalı geçmiş ve iç olay aynı transaction'da. Kişi ve zaman sunucudan.

const TALEP_YOK = 'Değişiklik talebi bulunamadı.';
const EMIR_YOK = 'Değişiklik emri bulunamadı.';
// Talepte seçilebilen parça: üretilen kart (prototipte yalnız aktif ve üretilen parça).
const PARCA_TURLERI = ['mamul', 'yarimamul'] as const;
const SON_KAYIT_SAYISI = 8;

type MalzemeOzeti = { malzemeId: number; kod: string | null; ad: string | null };

async function malzemeOzetHaritasi(db: Db, idler: number[]): Promise<(id: number) => MalzemeOzeti> {
  const harita = await malzemeOzetleri(db, idler);
  return (id) => {
    const o = harita.get(id);
    return { malzemeId: id, kod: o?.kod ?? null, ad: o?.ad ?? null };
  };
}

async function gecmisCevabi(db: Db, satirlar: GecmisSatiriHam[]): Promise<GecmisSatiri[]> {
  const adlar = await kisiAdlari(db, satirlar.map((g) => g.kisiId));
  return satirlar.map((g) => ({
    kisiId: g.kisiId, kisiAdi: adlar.get(g.kisiId) ?? null, zaman: g.zaman, olay: g.olay, imzaAnlami: g.imzaAnlami, aciklama: g.aciklama, ozet: g.ozet,
  }));
}

// İmzalı olayın anlamı sözleşmeden; imzasız olayda null.
function imza(olay: GecmisOlayi): string | null {
  return (IMZA_ANLAMLARI as Partial<Record<GecmisOlayi, string>>)[olay] ?? null;
}

/* ---------------- Talep ---------------- */

export async function talepCevabi(db: Db, id: number): Promise<TalepCevabi> {
  const t = await s.talepGetir(db, id);
  if (t === null) throw bulunamadi(TALEP_YOK);
  const kalemler = await s.talepMalzemeleri(db, [id]);
  const gecmis = await s.talepGecmisi(db, id);
  const ozet = await malzemeOzetHaritasi(db, kalemler.map((k) => k.malzemeId));
  const acanAdi = (await kisiAdlari(db, [t.acanKisiId])).get(t.acanKisiId) ?? null;
  return {
    id: t.id, no: t.no, baslik: t.baslik, aciklama: t.aciklama, onSinif: t.onSinif, sinif: t.sinif, aciliyet: t.aciliyet, durum: t.durum,
    malzemeler: kalemler.map((k) => ({ ...ozet(k.malzemeId), cizimRevizyonu: null, tasarimOtoritesi: null, sozlesmeKonfigurasyonu: null, kullanimYeri: null })),
    cevaplar: t.cevaplar, etki: t.etki, musteriReferansi: t.musteriReferansi,
    acan: { kisiId: t.acanKisiId, kisiAdi: acanAdi, zaman: t.acilis },
    emirId: await s.talebinEmri(db, id),
    gecmis: await gecmisCevabi(db, gecmis),
    surum: t.surum,
  };
}

export async function talepleriListele(db: Db, q: TaleplerSorgusu): Promise<TalepListeCevabi> {
  const suzgec = { kapsam: q.kapsam, durum: q.durum, sinif: q.sinif, ara: q.ara };
  const liste = await sayfaliListe(q, { say: () => s.talepSay(db, suzgec), satirlar: (dilim) => s.talepListesi(db, suzgec, dilim) });
  const kalemler = await s.talepMalzemeleri(db, liste.satirlar.map((t) => t.id));
  const [ozet, adlar] = [await malzemeOzetHaritasi(db, kalemler.map((k) => k.malzemeId)), await kisiAdlari(db, liste.satirlar.map((t) => t.acanKisiId))];
  return {
    ...liste,
    satirlar: liste.satirlar.map((t) => ({
      id: t.id, no: t.no, baslik: t.baslik, sinif: t.sinif, aciliyet: t.aciliyet, durum: t.durum,
      malzemeler: kalemler.filter((k) => k.talepId === t.id).map((k) => ozet(k.malzemeId)),
      acilis: t.acilis, acanAdi: adlar.get(t.acanKisiId) ?? null, emirNo: t.emirNo,
    })),
  };
}

export async function parcaAdaylari(db: Db, ara: string | undefined): Promise<ParcaAdaylariCevabi> {
  const liste = await malzemeAra(db, { metin: ara ?? null, turler: PARCA_TURLERI, yalnizAktif: true, sayfa: 1, sayfaBoyu: 50 });
  return { parcalar: liste.satirlar.map((m) => ({ malzemeId: m.id, kod: m.kod, ad: m.ad })) };
}

// DY-20: talepteki her parça var olan, aktif, üretilen (mamul ya da yarı mamul) karttır.
async function talepParcalariniDenetle(db: Db, idler: readonly number[]): Promise<void> {
  const ozetler = await malzemeOzetleri(db, [...idler]);
  for (const id of idler) {
    const o = ozetler.get(id);
    if (o === undefined) throw dogrulama('Seçilen parça bulunamadı.', 'malzemeIdleri');
    if (o.onayDurumu !== 'aktif' || !(PARCA_TURLERI as readonly string[]).includes(o.tur)) {
      throw dogrulama(`${o.kod}: değişiklik talebi yalnız aktif mamul veya yarı mamul kartına açılır.`, 'malzemeIdleri');
    }
  }
}

export async function talepAc(db: Db, kullanici: Kullanici, g: TalepAcGovdesi): Promise<TalepCevabi> {
  await talepParcalariniDenetle(db, g.malzemeIdleri);
  const id = await s.talepEkle(db, {
    baslik: g.baslik, aciklama: g.aciklama ?? null, onSinif: g.onSinif ?? null, aciliyet: g.aciliyet, acanKisiId: kullanici.id, malzemeIdleri: g.malzemeIdleri,
  });
  const t = await s.talepGetir(db, id);
  if (t === null) throw new Error('Yazılan talep okunamadı.');
  await s.gecmisEkle(db, { talepId: id, olay: 'talep_gonderildi', kisiId: kullanici.id, imzaAnlami: null, aciklama: null, ozet: 'Talep gönderildi' });
  await s.olayEkle(db, { tur: 'talep_gonderildi', ilgili: null, kayitNo: t.no, alanlar: {
    ...(t.onSinif === null ? {} : { onSinif: SINIF_ADLARI[t.onSinif] }), aciliyet: ACILIYET_ADLARI[t.aciliyet],
  } });
  return talepCevabi(db, id);
}

// Kilit, sürüm ve durum sırasıyla: eski sürüm durumdan önce bildirilir.
async function talepAdimi(db: Db, id: number, surum: number, adim: keyof typeof TALEP_ADIMLARI): Promise<TalepSatiri> {
  const t = await s.talepKilitle(db, id);
  if (t === null) throw bulunamadi(TALEP_YOK);
  if (t.surum !== surum) throw eskiSurum();
  if (!talepAdimiUygunMu(adim, t.durum)) throw cakisma(`Talep bu aşamada (${TALEP_DURUM_ADLARI[t.durum]}) bu adıma açık değil.`);
  return t;
}

async function talepYaz(db: Db, t: TalepSatiri, surum: number, y: s.TalepYazimi): Promise<void> {
  await surumluGuncelle({ guncelle: () => s.talepGuncelle(db, t.id, surum, y), varMi: () => s.talepVarMi(db, t.id), bulunamadiIletisi: TALEP_YOK });
}

export async function siniflandir(db: Db, kullanici: Kullanici, id: number, g: SiniflandirGovdesi): Promise<TalepCevabi> {
  const t = await talepAdimi(db, id, g.surum, 'siniflandir');
  if (talepGerekmezMi(g.cevaplar)) throw dogrulama(PARAMETRE_ILETISI, 'cevaplar');
  await talepYaz(db, t, g.surum, { durum: 'analizde', sinif: g.sinif, aciliyet: g.aciliyet, cevaplar: g.cevaplar });
  await s.gecmisEkle(db, {
    talepId: id, olay: 'siniflandirildi', kisiId: kullanici.id, imzaAnlami: null, aciklama: g.not ?? null,
    ozet: `Sınıflandırıldı: ${SINIF_ADLARI[g.sinif]}, aciliyet ${ACILIYET_ADLARI[g.aciliyet]}`,
  });
  return talepCevabi(db, id);
}

export async function etkiAnalizi(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<TalepCevabi> {
  const t = await talepAdimi(db, id, surum, 'etkiAnalizi');
  if (t.sinif === null) throw new Error('Analizdeki talebin sınıfı yok.');
  const etki = etkiAnaliziKur(t.sinif, await s.simdi(db));
  await talepYaz(db, t, surum, { durum: 'ccb_bekliyor', etki });
  await s.gecmisEkle(db, {
    talepId: id, olay: 'etki_analizi', kisiId: kullanici.id, imzaAnlami: null, aciklama: null,
    ozet: 'Etki analizi: etkilenen emir ve stok kaynağı bağlı değil',
  });
  await s.olayEkle(db, { tur: 'etki_analizi', ilgili: null, kayitNo: t.no, alanlar: { fai: etki.fai } });
  return talepCevabi(db, id);
}

export async function ccbKarari(db: Db, kullanici: Kullanici, id: number, g: CcbGovdesi): Promise<TalepCevabi> {
  const t = await talepAdimi(db, id, g.surum, 'ccb');
  if (kendiTalebiMi(t.acanKisiId, kullanici.id)) throw yetkiYok('Görevler ayrılığı: talebi açan kişi kendi talebine CCB kararı veremez.');
  if (t.sinif === null || t.etki === null) throw new Error('CCB bekleyen talebin sınıfı ya da etki analizi yok.');
  const aciklama = g.aciklama ?? null;
  if (g.karar === 'ret') {
    // Gerekçesiz ret izlenemez; ekranın zorunlu alanı tek başına yetmez.
    if (aciklama === null) throw dogrulama('Ret gerekçesini yazın.', 'aciklama');
    await talepYaz(db, t, g.surum, { durum: 'reddedildi' });
    await s.gecmisEkle(db, { talepId: id, olay: 'ccb_ret', kisiId: kullanici.id, imzaAnlami: imza('ccb_ret'), aciklama, ozet: 'CCB reddetti' });
    await s.olayEkle(db, { tur: 'talep_reddedildi', ilgili: null, kayitNo: t.no, alanlar: { gerekce: aciklama } });
    return talepCevabi(db, id);
  }
  const musteri = musteriOnayiIstenirMi(t.sinif, t.etki.musteriOnayiGerekir);
  await talepYaz(db, t, g.surum, { durum: musteri ? 'musteri_onayi_bekliyor' : 'onaylandi' });
  await s.gecmisEkle(db, {
    talepId: id, olay: 'ccb_onay', kisiId: kullanici.id, imzaAnlami: imza('ccb_onay'), aciklama,
    ozet: musteri ? 'CCB onayladı. Müşteri onayı gerekiyor.' : 'CCB onayladı.',
  });
  if (musteri) await s.olayEkle(db, { tur: 'musteri_onayi_istendi', ilgili: null, kayitNo: t.no, alanlar: { sinif: t.sinif } });
  return talepCevabi(db, id);
}

export async function musteriOnayi(db: Db, kullanici: Kullanici, id: number, g: MusteriOnayiGovdesi): Promise<TalepCevabi> {
  const t = await talepAdimi(db, id, g.surum, 'musteriOnayi');
  await talepYaz(db, t, g.surum, { durum: 'onaylandi', musteriReferansi: g.referans });
  await s.gecmisEkle(db, {
    talepId: id, olay: 'musteri_onayi', kisiId: kullanici.id, imzaAnlami: imza('musteri_onayi'), aciklama: g.aciklama ?? null,
    ozet: `Müşteri onayı kaydedildi: ${g.referans}`,
  });
  return talepCevabi(db, id);
}

export async function emirAc(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<EmirCevabi> {
  const t = await talepAdimi(db, id, surum, 'emirAc');
  if (t.sinif === null) throw new Error('Onaylı talebin sınıfı yok.');
  await talepYaz(db, t, surum, { durum: 'emir_acildi' });
  const emirId = await s.emirEkle(db, {
    talepId: id, baslik: t.baslik, sinif: t.sinif, aciliyet: t.aciliyet, musteriReferansi: t.musteriReferansi, koordinatorKisiId: kullanici.id,
  });
  const e = await s.emirGetir(db, emirId);
  if (e === null) throw new Error('Yazılan emir okunamadı.');
  await s.gecmisEkle(db, { talepId: id, olay: 'emir_acildi', kisiId: kullanici.id, imzaAnlami: null, aciklama: null, ozet: `${e.no} açıldı` });
  await s.gecmisEkle(db, { emirId, olay: 'emir_acildi', kisiId: kullanici.id, imzaAnlami: null, aciklama: null, ozet: `ECO açıldı. Kaynak: ${t.no}` });
  await s.olayEkle(db, { tur: 'emir_acildi', ilgili: null, kayitNo: e.no, alanlar: { talep: t.no, sinif: e.sinif } });
  return emirCevabi(db, emirId);
}

/* ---------------- Emir ---------------- */

function gecerlilikCevabi(e: EmirSatiri, ozet: (id: number) => MalzemeOzeti): EmirCevabi['gecerlilik'] {
  switch (e.gecerlilikTuru) {
    case 'seri':
      if (e.gecerlilikSonUrunId === null || e.gecerlilikIlkSeri === null) throw new Error(`Seri geçerliliği eksik: ${e.no}`);
      return { tur: 'seri', sonUrun: ozet(e.gecerlilikSonUrunId), ilkSeri: e.gecerlilikIlkSeri };
    case 'tarih':
      if (e.gecerlilikTarihi === null) throw new Error(`Tarih geçerliliği eksik: ${e.no}`);
      return { tur: 'tarih', tarih: e.gecerlilikTarihi };
    case 'tum': return { tur: 'tum' };
    case null:
    default: return null;
  }
}

const revizyonBagi = (id: number | null): { id: number; etiket: string | null } | null => (id === null ? null : { id, etiket: null });

export async function emirCevabi(db: Db, id: number): Promise<EmirCevabi> {
  const e = await s.emirGetir(db, id);
  if (e === null) throw bulunamadi(EMIR_YOK);
  const kalemler = await s.emirKalemleri(db, id);
  const kararlar = await s.emirKararlari(db, id);
  const fai = await s.emirIlkParcalari(db, id);
  const gecmis = await s.emirGecmisi(db, id);
  const ozet = await malzemeOzetHaritasi(db, [...kalemler.map((k) => k.malzemeId), ...(e.gecerlilikSonUrunId === null ? [] : [e.gecerlilikSonUrunId])]);
  const adlar = await kisiAdlari(db, [e.koordinatorKisiId, ...kararlar.flatMap((k) => k.verenKisiId ?? []), ...fai.flatMap((f) => f.onaylayanKisiId ?? [])]);
  const kisi = (kisiId: number, zaman: string) => ({ kisiId, kisiAdi: adlar.get(kisiId) ?? null, zaman });
  return {
    id: e.id, no: e.no, baslik: e.baslik, sinif: e.sinif, durum: e.durum,
    talep: e.talepId === null || e.talepNo === null ? null : { id: e.talepId, no: e.talepNo },
    musteriReferansi: e.musteriReferansi,
    kalemler: kalemler.map((k) => ({
      id: k.id, malzeme: ozet(k.malzemeId),
      eskiCizimRevizyonu: revizyonBagi(k.eskiCizimRevizyonuId), yeniCizimRevizyonu: revizyonBagi(k.yeniCizimRevizyonuId),
      eskiRotaRevizyonu: revizyonBagi(k.eskiRotaRevizyonuId), yeniRotaRevizyonu: revizyonBagi(k.yeniRotaRevizyonuId),
      eskiYeniyeUyar: k.eskiYeniyeUyar, yeniEskiyeUyar: k.yeniEskiyeUyar,
      yeniParcaNoGerekir: yeniParcaNoGerekirMi(e.sinif, k.eskiYeniyeUyar, k.yeniEskiyeUyar),
      yeniParcaNo: k.yeniParcaNo, yeniParcaAdi: k.yeniParcaAdi, ozet: k.ozet,
    })),
    gecerlilik: gecerlilikCevabi(e, ozet),
    kararlar: kararlar.map((k) => ({
      id: k.id, hedef: k.hedef, hedefId: k.hedefId, hedefEtiketi: null, onerilenKod: k.onerilenKod, mod: k.mod, gerekce: k.gerekce,
      izinliKodlar: k.izinliKodlar, verilenKod: k.verilenKod,
      veren: k.verenKisiId === null || k.verilme === null ? null : kisi(k.verenKisiId, k.verilme),
      sapmaReferansi: k.sapmaReferansi, not: k.not,
    })),
    fai: fai.map((f) => ({
      id: f.id, kalemId: f.kalemId, tur: f.tur, durum: f.durum, kanitVar: null,
      onaylayan: f.onaylayanKisiId === null || f.onayZamani === null ? null : kisi(f.onaylayanKisiId, f.onayZamani),
    })),
    kapanisKosullari: kapanisKosullari({
      kaynakBagli: e.kararKaynagiBagli === true,
      bekleyenKarar: kararlar.filter((k) => k.verilenKod === null).length,
      bekleyenFai: fai.filter((f) => f.durum === 'bekliyor').length,
    }),
    hurdaMaliyeti: null, reworkMaliyeti: null,
    koordinator: kisi(e.koordinatorKisiId, e.acilis),
    kapanis: e.kapanis,
    gecmis: await gecmisCevabi(db, gecmis),
    surum: e.surum,
  };
}

export async function emirleriListele(db: Db, q: EmirlerSorgusu): Promise<EmirListeCevabi> {
  const suzgec = { kapsam: q.kapsam, durum: q.durum, sinif: q.sinif, ara: q.ara };
  const liste = await sayfaliListe(q, { say: () => s.emirSay(db, suzgec), satirlar: (dilim) => s.emirListesi(db, suzgec, dilim) });
  const ozet = await malzemeOzetHaritasi(db, liste.satirlar.flatMap((e) => e.gecerlilikSonUrunId ?? []));
  return {
    ...liste,
    satirlar: liste.satirlar.map((e) => ({
      id: e.id, no: e.no, baslik: e.baslik, sinif: e.sinif, durum: e.durum, acilis: e.acilisTarihi, kapanis: e.kapanis,
      gecerlilik: gecerlilikCevabi(e, ozet), bekleyenKarar: e.bekleyenKarar, bekleyenFai: e.bekleyenFai,
    })),
  };
}

async function emirAdimi(db: Db, id: number, surum: number, adim: keyof typeof EMIR_ADIMLARI): Promise<EmirSatiri> {
  const e = await s.emirKilitle(db, id);
  if (e === null) throw bulunamadi(EMIR_YOK);
  if (e.surum !== surum) throw eskiSurum();
  if (!emirAdimiUygunMu(adim, e.durum)) throw cakisma('Değişiklik emri bu aşamada bu adıma açık değil.');
  return e;
}

async function emirYaz(db: Db, e: EmirSatiri, surum: number, y: s.EmirYazimi): Promise<void> {
  await surumluGuncelle({ guncelle: () => s.emirGuncelle(db, e.id, surum, y), varMi: () => s.emirVarMi(db, e.id), bulunamadiIletisi: EMIR_YOK });
}

async function emirGecmisiYaz(db: Db, emirId: number, kisiId: number, olay: GecmisOlayi, ozet: string, aciklama: string | null = null): Promise<void> {
  await s.gecmisEkle(db, { emirId, olay, kisiId, imzaAnlami: imza(olay), aciklama, ozet });
}

export async function taslakAc(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<EmirCevabi> {
  const e = await emirAdimi(db, id, surum, 'taslakAc');
  await emirYaz(db, e, surum, { durum: 'revizyon_hazirlaniyor' });
  await emirGecmisiYaz(db, id, kullanici.id, 'taslak_acildi', 'Revizyon hazırlığı başladı');
  return emirCevabi(db, id);
}

export async function kalemKaydet(db: Db, kullanici: Kullanici, id: number, g: KalemKaydetGovdesi): Promise<EmirCevabi> {
  const e = await emirAdimi(db, id, g.surum, 'kalemKaydet');
  const prosesMi = e.sinif === 'P1' || e.sinif === 'P2';
  if (prosesMi && (g.yeniParcaNo != null || g.yeniParcaAdi != null)) throw dogrulama('Proses değişikliğinde yeni parça numarası verilmez.', 'yeniParcaNo');
  const yazilan = await s.kalemYaz(db, id, g.kalemId, {
    yeniCizimRevizyonuId: g.yeniCizimRevizyonuId, yeniRotaRevizyonuId: g.yeniRotaRevizyonuId,
    eskiYeniyeUyar: prosesMi ? null : g.eskiYeniyeUyar, yeniEskiyeUyar: prosesMi ? null : g.yeniEskiyeUyar,
    yeniParcaNo: g.yeniParcaNo ?? null, yeniParcaAdi: g.yeniParcaAdi ?? null, ozet: g.ozet ?? '',
  });
  if (yazilan === null) throw bulunamadi('Kalem bu değişiklik emrinde yok.');
  await emirYaz(db, e, g.surum, { durum: e.durum });
  const kalem = (await s.emirKalemleri(db, id)).find((k) => k.id === g.kalemId);
  const ad = kalem === undefined ? null : (await malzemeOzetHaritasi(db, [kalem.malzemeId]))(kalem.malzemeId).kod;
  await emirGecmisiYaz(db, id, kullanici.id, 'kalem_kaydedildi', `${ad ?? 'Kalem'}: taslak kaydedildi`);
  return emirCevabi(db, id);
}

export async function yayinaGonder(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<EmirCevabi> {
  const e = await emirAdimi(db, id, surum, 'yayinaGonder');
  const kalemler = await s.emirKalemleri(db, id);
  const ozet = await malzemeOzetHaritasi(db, kalemler.map((k) => k.malzemeId));
  const eksik = yayinaGonderimEksigi(e.sinif, kalemler.map((k) => ({
    malzemeAdi: ozet(k.malzemeId).kod ?? `Parça ${k.malzemeId}`, eskiYeniyeUyar: k.eskiYeniyeUyar, yeniEskiyeUyar: k.yeniEskiyeUyar,
    yeniParcaNo: k.yeniParcaNo, ozet: k.ozet,
  })));
  if (eksik !== null) throw dogrulama(eksik);
  await emirYaz(db, e, surum, { durum: 'yayina_hazir' });
  await emirGecmisiYaz(db, id, kullanici.id, 'yayina_gonderildi', 'Revizyonlar yayın onayına gönderildi');
  return emirCevabi(db, id);
}

export async function geriGonder(db: Db, kullanici: Kullanici, id: number, g: GeriGonderGovdesi): Promise<EmirCevabi> {
  const e = await emirAdimi(db, id, g.surum, 'geriGonder');
  await emirYaz(db, e, g.surum, { durum: 'revizyon_hazirlaniyor' });
  await emirGecmisiYaz(db, id, kullanici.id, 'geri_gonderildi', 'Düzeltme için hazırlığa geri gönderildi', g.aciklama);
  return emirCevabi(db, id);
}

// Etkilenen emir ve stoku sahibi modüller verir (Aşama 2). null: kaynak bağlı değil; boş diziler: kaynak bağlı, etkilenen yok.
export interface EtkiKaynagi {
  emirler: { uretimEmriId: number; malzemeId: number; emir: EtkilenenEmir }[];
  stok: { stokId: number; malzemeId: number }[];
}
export type EtkiCozucusu = (db: Db, g: { malzemeIdleri: number[]; gecerlilik: Gecerlilik }) => Promise<EtkiKaynagi | null>;
export const ETKI_KAYNAGI_BAGLI_DEGIL: EtkiCozucusu = async () => null;

function yayinOzeti(g: Gecerlilik, sonUrunKodu: string | null): string {
  if (g.tur === 'seri') return `${sonUrunKodu ?? 'Son ürün'}, seri ${g.ilkSeri} ve sonrası`;
  if (g.tur === 'tarih') return `${g.tarih} ve sonrası başlayan emirler`;
  return 'Tüm açık emirler, karar tablosuna göre';
}

export async function yayinla(
  db: Db, kullanici: Kullanici, id: number, g: YayinlaGovdesi, etkiCozucusu: EtkiCozucusu = ETKI_KAYNAGI_BAGLI_DEGIL,
): Promise<EmirCevabi> {
  const e = await emirAdimi(db, id, g.surum, 'yayinla');
  const gecerlilik = g.gecerlilik;
  let sonUrunKodu: string | null = null;
  if (gecerlilik.tur === 'seri') {
    const son = (await malzemeOzetleri(db, [gecerlilik.sonUrunMalzemeId])).get(gecerlilik.sonUrunMalzemeId);
    if (son === undefined) throw dogrulama('Son ürün bulunamadı.', 'gecerlilik');
    sonUrunKodu = son.kod;
  }
  const kalemler = await s.emirKalemleri(db, id);
  for (const k of kalemler) {
    const tur = ilkParcaTuru(e.sinif, k.yeniParcaNo);
    if (tur !== null) await s.ilkParcaEkle(db, id, k.id, tur);
  }
  const kaynak = await etkiCozucusu(db, { malzemeIdleri: kalemler.map((k) => k.malzemeId), gecerlilik });
  const kararlar = kaynak === null ? [] : await kararlariOner(db, e, kalemler, gecerlilik, kaynak, kullanici.id);
  const bekleyenKarar = kararlar.filter((k) => !k.verildi).length;
  const bekleyenFai = (await s.emirIlkParcalari(db, id)).length;
  const durum = emirIlerler('karar', bekleyenKarar === 0, bekleyenFai === 0);
  await emirYaz(db, e, g.surum, {
    durum,
    gecerlilik: {
      tur: gecerlilik.tur, sonUrunId: gecerlilik.tur === 'seri' ? gecerlilik.sonUrunMalzemeId : null,
      ilkSeri: gecerlilik.tur === 'seri' ? gecerlilik.ilkSeri : null, tarih: gecerlilik.tur === 'tarih' ? gecerlilik.tarih : null,
    },
    kararKaynagiBagli: kaynak !== null, yayinlandi: true,
  });
  const ozetMetni = yayinOzeti(gecerlilik, sonUrunKodu);
  // Yayın bugün yalnız kayıttır: çizim ve rota revizyonu sahibi modülde yayınlanmaz (UYUM-BORCU 3, 6); metin olmayanı söylemesin.
  await emirGecmisiYaz(db, id, kullanici.id, 'yayinlandi', `Yayın kaydedildi; çizim ve rota revizyonu sahibi modülde ayrıca yayınlanır (bağlı değil). Geçerlilik: ${ozetMetni}`, g.aciklama ?? null);
  if (kararlar.length > 0 && bekleyenKarar === 0) await emirGecmisiYaz(db, id, kullanici.id, 'kararlar_tamam', 'Tüm disposition kararları uygulandı');
  if (durum === 'dogrulama' && bekleyenFai === 0 && kalemler.length > 0) await emirGecmisiYaz(db, id, kullanici.id, 'fai_tamam', 'İlk parça kontrolü gerekmiyor');
  for (const k of kalemler) {
    await s.olayEkle(db, {
      tur: 'revizyon_yayinlandi', ilgili: 'rota', kayitNo: e.no,
      alanlar: { malzemeId: String(k.malzemeId), yeniCizimRevizyonuId: String(k.yeniCizimRevizyonuId ?? ''), yeniRotaRevizyonuId: String(k.yeniRotaRevizyonuId ?? ''), yeniParcaNo: k.yeniParcaNo ?? '' },
    });
  }
  await s.olayEkle(db, { tur: 'gecerlilik', ilgili: 'plan', kayitNo: e.no, alanlar: { gecerlilik: ozetMetni } });
  if (kararlar.length > 0) {
    await s.olayEkle(db, { tur: 'karar_onerildi', ilgili: 'uretim-emirleri', kayitNo: e.no, alanlar: { toplam: String(kararlar.length), bekleyen: String(bekleyenKarar) } });
  }
  return emirCevabi(db, id);
}

// DY-9, DY-10, DY-11: her etkilenen hedefe öneri ve izinli kodlar yazılır; otomatik öneri yayını imzalayanın adıyla hemen uygulanır.
async function kararlariOner(
  db: Db, e: EmirSatiri, kalemler: s.KalemSatiri[], gecerlilik: Gecerlilik, kaynak: EtkiKaynagi, kisiId: number,
): Promise<{ verildi: boolean }[]> {
  const sonuc: { verildi: boolean }[] = [];
  const hedefler: { hedef: KararHedefi; hedefId: number; malzemeId: number; emir: EtkilenenEmir | null }[] = [
    ...kaynak.emirler.map((x) => ({ hedef: 'emir' as const, hedefId: x.uretimEmriId, malzemeId: x.malzemeId, emir: x.emir })),
    ...kaynak.stok.map((x) => ({ hedef: 'stok' as const, hedefId: x.stokId, malzemeId: x.malzemeId, emir: null })),
  ];
  for (const h of hedefler) {
    const kalem = kalemler.find((k) => k.malzemeId === h.malzemeId);
    const oneri = h.emir === null ? stokKarariOner(e.sinif) : emirKarariOner(e.sinif, gecerlilik, h.emir);
    const izinli = izinliKodlar(h.hedef, h.emir, kalem?.yeniParcaNo != null);
    // Öneri izinli değilse (ör. bekletme stokta yoktur) otomatik uygulanmaz; liste öneriyi taşır ki karar verilebilsin.
    const kodlar = izinli.includes(oneri.kod) ? izinli : [...izinli, oneri.kod];
    const kararId = await s.kararEkle(db, { emirId: e.id, hedef: h.hedef, hedefId: h.hedefId, onerilenKod: oneri.kod, mod: oneri.mod, gerekce: oneri.gerekce, izinliKodlar: kodlar });
    const otomatik = oneri.mod === 'otomatik' && oneri.kod !== 'beklet';
    if (otomatik) await s.kararVer(db, { emirId: e.id, kararId, kod: oneri.kod, kisiId, sapmaReferansi: null, not: 'Otomatik uygulandı' });
    sonuc.push({ verildi: otomatik });
  }
  return sonuc;
}

async function kararSonrasi(db: Db, e: EmirSatiri, surum: number, kisiId: number): Promise<void> {
  const kararlar = await s.emirKararlari(db, e.id);
  const fai = await s.emirIlkParcalari(db, e.id);
  const kararlarTamam = kararlar.every((k) => k.verilenKod !== null);
  const faiTamam = fai.every((f) => f.durum === 'onaylandi');
  const durum = emirIlerler(e.durum, kararlarTamam, faiTamam);
  await emirYaz(db, e, surum, { durum });
  if (e.durum === 'karar' && durum !== 'karar') await emirGecmisiYaz(db, e.id, kisiId, 'kararlar_tamam', 'Tüm disposition kararları uygulandı');
  if (durum === 'dogrulama' && e.durum !== 'dogrulama') {
    await emirGecmisiYaz(db, e.id, kisiId, 'fai_tamam', fai.length > 0 ? 'İlk parça kontrolleri tamamlandı' : 'İlk parça kontrolü gerekmiyor');
  }
}

async function kararOlayi(db: Db, e: EmirSatiri, k: KararSatiriHam, kod: KararGovdesi['kod'], kisiAdi: string): Promise<void> {
  await s.olayEkle(db, {
    tur: k.hedef === 'emir' ? 'emir_karari' : 'stok_karari', ilgili: k.hedef === 'emir' ? 'uretim-emirleri' : 'stok', kayitNo: e.no,
    alanlar: { hedefId: String(k.hedefId), karar: KARAR_KODU_ADLARI[kod], mod: k.mod, kararVeren: kisiAdi },
  });
  if (kod === 'rework') await s.olayEkle(db, { tur: 'rework_istendi', ilgili: 'kalite-merkezi', kayitNo: e.no, alanlar: { hedef: k.hedef, hedefId: String(k.hedefId) } });
  if (kod === 'eskiyle_tamamla_sapma') await s.olayEkle(db, { tur: 'sapma_acildi', ilgili: 'kalite-merkezi', kayitNo: e.no, alanlar: { hedefId: String(k.hedefId) } });
}

// `islem` kararı veren uçtur; kural DY-12 doğru ucu seçer, öteki 403 alır.
export async function kararVer(
  db: Db, kullanici: Kullanici, id: number, g: KararGovdesi,
  islem: Extract<Islem, 'degisiklik-yonetimi.karar-ver' | 'degisiklik-yonetimi.mrb-karar'>,
): Promise<EmirCevabi> {
  const e = await emirAdimi(db, id, g.surum, 'karar');
  const k = (await s.emirKararlari(db, id)).find((x) => x.id === g.kararId);
  if (k === undefined) throw bulunamadi('Karar bu değişiklik emrinde yok.');
  if (k.verilenKod !== null) throw cakisma('Karar zaten verilmiş.');
  if (!k.izinliKodlar.includes(g.kod)) throw dogrulama('Bu karar seçilen hedef için uygulanamaz.', 'kod');
  const gereken = kararIslemi(k.mod, g.kod);
  if (gereken !== islem) {
    throw yetkiYok(gereken === 'degisiklik-yonetimi.mrb-karar'
      ? 'Bu karar MRB kararıdır; MRB kararı olarak verilir.'
      : 'Bu karar MRB kararı değildir; disposition olarak verilir.');
  }
  const aciklama = g.aciklama ?? null;
  if (g.kod === 'beklet') {
    await s.kararNotuYaz(db, id, k.id, aciklama === null ? 'MRB toplantısına ertelendi' : `MRB toplantısına ertelendi: ${aciklama}`);
    await emirYaz(db, e, g.surum, { durum: e.durum });
    await emirGecmisiYaz(db, id, kullanici.id, 'karar_ertelendi', `Karar ertelendi: ${k.hedef} ${k.hedefId}`, aciklama);
    return emirCevabi(db, id);
  }
  await s.kararVer(db, { emirId: id, kararId: k.id, kod: g.kod, kisiId: kullanici.id, sapmaReferansi: g.sapmaReferansi ?? null, not: aciklama });
  const olay = islem === 'degisiklik-yonetimi.mrb-karar' ? 'mrb_karar' : 'karar';
  await emirGecmisiYaz(db, id, kullanici.id, olay, `Disposition: ${k.hedef} ${k.hedefId} → ${KARAR_KODU_ADLARI[g.kod]}`, aciklama);
  await kararOlayi(db, e, k, g.kod, kullanici.ad);
  await kararSonrasi(db, e, g.surum, kullanici.id);
  return emirCevabi(db, id);
}

export async function topluKarar(db: Db, kullanici: Kullanici, id: number, surum: number): Promise<EmirCevabi> {
  const e = await emirAdimi(db, id, surum, 'karar');
  const uygulanacak = (await s.emirKararlari(db, id)).filter(topluUygulanirMi);
  if (uygulanacak.length === 0) throw cakisma('Toplu onaylanabilecek bekleyen öneri yok.');
  for (const k of uygulanacak) {
    await s.kararVer(db, { emirId: id, kararId: k.id, kod: k.onerilenKod, kisiId: kullanici.id, sapmaReferansi: null, not: null });
    await kararOlayi(db, e, k, k.onerilenKod, kullanici.ad);
  }
  await emirGecmisiYaz(db, id, kullanici.id, 'toplu_karar', `${uygulanacak.length} öneri toplu onaylandı`);
  await kararSonrasi(db, e, surum, kullanici.id);
  return emirCevabi(db, id);
}

export async function faiOnayla(db: Db, kullanici: Kullanici, id: number, g: FaiOnayGovdesi): Promise<EmirCevabi> {
  const e = await emirAdimi(db, id, g.surum, 'faiOnayla');
  const f = (await s.emirIlkParcalari(db, id)).find((x) => x.id === g.faiId);
  if (f === undefined) throw bulunamadi('İlk parça şartı bu değişiklik emrinde yok.');
  if (f.durum === 'onaylandi') throw cakisma('Bu ilk parça zaten onaylı.');
  // Yeni rotayla üretim kanıtı (prototipte onay öncesi şart) rota ve üretim emirleri bağlanınca denetlenir; Aşama 1'de bilinmiyor (UYUM-BORCU).
  await s.ilkParcaOnayla(db, id, f.id, kullanici.id);
  await emirGecmisiYaz(db, id, kullanici.id, 'fai_onaylandi', `İlk parça onaylandı (${f.tur === 'tam' ? 'tam' : 'kısmi'})`, g.aciklama ?? null);
  await s.olayEkle(db, { tur: 'fai_onaylandi', ilgili: 'kalite-merkezi', kayitNo: e.no, alanlar: { kalemId: String(f.kalemId), tur: f.tur } });
  await kararSonrasi(db, e, g.surum, kullanici.id);
  return emirCevabi(db, id);
}

export async function kapat(db: Db, kullanici: Kullanici, id: number, g: KapatGovdesi): Promise<EmirCevabi> {
  const e = await emirAdimi(db, id, g.surum, 'kapat');
  const kararlar = await s.emirKararlari(db, id);
  const fai = await s.emirIlkParcalari(db, id);
  const kosullar = kapanisKosullari({
    kaynakBagli: e.kararKaynagiBagli === true, bekleyenKarar: kararlar.filter((k) => k.verilenKod === null).length,
    bekleyenFai: fai.filter((f) => f.durum === 'bekliyor').length,
  });
  if (!kapatilabilirMi(kosullar)) throw cakisma('Kapanış koşulları sağlanmadı.');
  await emirYaz(db, e, g.surum, { durum: 'kapandi', kapandi: true });
  const bilinmeyen = kosullar.filter((k) => k.durum === 'bilinmiyor').length;
  await s.gecmisEkle(db, {
    emirId: id, olay: 'kapandi', kisiId: kullanici.id, imzaAnlami: kapanisImzaAnlami(kosullar), aciklama: g.aciklama ?? null,
    ozet: bilinmeyen > 0 ? `ECO kapandı; ${bilinmeyen} koşul bilinmiyor (bağlı değil)` : 'ECO kapandı',
  });
  await s.olayEkle(db, { tur: 'emir_kapandi', ilgili: null, kayitNo: e.no, alanlar: {} });
  return emirCevabi(db, id);
}

/* ---------------- Görevlerim ---------------- */

export async function gorevlerim(db: Db, kullanici: Kullanici, kapsam: GorevKapsami): Promise<GorevlerimCevabi> {
  const bugun = await s.bugun(db);
  const talepler = await s.acikTalepGorevleri(db);
  const emirler = await s.acikEmirGorevleri(db, MRB_KODU_LISTESI);
  // Ekip bütün bekleyen adımlardır; benim, ekibin işlemi ve kendi talebi kuralıyla süzülmüşüdür. İki sayı da her cevapta.
  const ekip: { satir: GorevSatiri; benim: boolean }[] = [];
  for (const t of talepler) {
    const g = talepGorevi(t.durum);
    if (g === null) continue;
    ekip.push({
      satir: { tur: 'talep', id: t.id, no: t.no, baslik: t.baslik, sinif: t.sinif, aciliyet: t.aciliyet, adim: g.adim, islem: g.islem, ...gorevSuresi(t.aciliyet, t.sonAdim ?? bugun, bugun) },
      benim: benimGorevimMi(g, kullanici.islemler, kendiTalebiMi(t.acanKisiId, kullanici.id)),
    });
  }
  for (const e of emirler) {
    for (const g of emirGorevleri(e)) {
      ekip.push({
        satir: { tur: 'emir', id: e.id, no: e.no, baslik: e.baslik, sinif: e.sinif, aciliyet: e.aciliyet, adim: g.adim, islem: g.islem, ...gorevSuresi(e.aciliyet, e.sonAdim ?? bugun, bugun) },
        benim: benimGorevimMi(g, kullanici.islemler, false),
      });
    }
  }
  const benimSayisi = ekip.filter((g) => g.benim).length;
  const gorevler = (kapsam === 'ekip' ? ekip : ekip.filter((g) => g.benim)).map((g) => g.satir);
  gorevler.sort((a, b) => (b.yasIsGunu - b.hedefIsGunu) - (a.yasIsGunu - a.hedefIsGunu) || a.no.localeCompare(b.no));
  const sayac = new Map<HatAsamasi, number>();
  for (const a of [...talepler.map((t) => talepHatti(t.durum)), ...emirler.map((e) => emirHatti(e.durum))]) {
    if (a !== null) sayac.set(a, (sayac.get(a) ?? 0) + 1);
  }
  const sonlar = await s.sonGecmis(db, SON_KAYIT_SAYISI);
  const sonSatirlar = await gecmisCevabi(db, sonlar);
  return {
    gorevler,
    hat: (['talep', 'revizyon', 'yayin', 'karar', 'fai', 'kapanis'] as const).map((asama) => ({ asama, adet: sayac.get(asama) ?? 0 })),
    benimSayisi,
    ekipSayisi: ekip.length,
    kapanan90Gun: await s.kapanan90Gun(db),
    sonKayitlar: sonSatirlar.map((g, i) => {
      const ham = sonlar[i];
      if (ham === undefined) throw new Error('Geçmiş satırı eşlenemedi.');
      return ham.talepId !== null
        ? { ...g, tur: 'talep' as const, id: ham.talepId, kayitNo: ham.kayitNo }
        : { ...g, tur: 'emir' as const, id: ham.emirId ?? 0, kayitNo: ham.kayitNo };
    }),
  };
}

/* ---------------- Konfigürasyon, izlenebilirlik, raporlar, olaylar ---------------- */

export async function sonUrunler(db: Db): Promise<SonUrunlerCevabi> {
  const idler = await s.sonUrunAdaylari(db);
  const ozet = await malzemeOzetHaritasi(db, idler);
  return { sonUrunler: idler.map((id) => ({ ...ozet(id), seriIzlenir: null })) };
}

async function sonUrunOzeti(db: Db, malzemeId: number): Promise<MalzemeOzeti> {
  const o = (await malzemeOzetleri(db, [malzemeId])).get(malzemeId);
  if (o === undefined) throw bulunamadi('Parça bulunamadı.');
  return { malzemeId, kod: o.kod, ad: o.ad };
}

export async function konfigurasyon(db: Db, malzemeId: number): Promise<KonfigurasyonCevabi> {
  const sonUrun = await sonUrunOzeti(db, malzemeId);
  const acik = await s.malzemeninAcikDegisiklikleri(db, malzemeId);
  return {
    sonUrun,
    baseline: null,
    acikDegisiklikler: acik.map((a) => a as AcikDegisiklik),
    seriler: null,
    revizyonStogu: null,
    gecerlilikler: await s.seriGecerlilikleri(db, malzemeId),
    aileIpligi: null,
  };
}

// Seri kaydı (markalama) bağlı değil: uyum bilinmiyor, iplik null. Sapmalar son ürünün emirlerinden; hangi serileri kapsadığı bilinmez.
export async function izlenebilirlik(db: Db, q: IzlenebilirlikSorgusu): Promise<IzlenebilirlikCevabi> {
  const sonUrun = await sonUrunOzeti(db, q.sonUrunMalzemeId);
  const sapmalar = await s.sonUrunSapmalari(db, q.sonUrunMalzemeId);
  return {
    sonUrun, seriNo: q.seriNo, uyum: 'bilinmiyor', modSeviyesi: null, emirRevizyonu: null, not: null, iplik: null,
    soyAgaci: { bilesenler: null, operasyonlar: null },
    sapmalar: sapmalar.map((x) => ({ ...x, kapsam: null, kalem: null, revizyon: null, emirNo: null, bitis: null })),
  };
}

// Seri kaydı (markalama) bağlı değil: satır yok, toplam bilinmiyor (null). Bağlamada sahibi modülün listesinden gelir.
export function seriler(q: SerilerSorgusu): Promise<SeriListeCevabi> {
  return sayfaliListe(q, { satirlar: () => Promise.resolve([]) });
}

export async function raporlar(db: Db, q: RaporSorgusu): Promise<RaporCevabi> {
  const varsayilan = await s.oncekiYil(db);
  const baslangic = q.baslangic ?? varsayilan.baslangic;
  const bitis = q.bitis ?? varsayilan.bitis;
  if (baslangic > bitis) throw dogrulama('Başlangıç bitişten sonra olamaz.', 'baslangic');
  return {
    cevrim: (await s.kapananEmirler(db, baslangic, bitis)).map(({ musteriBeklemeBaslangici: b, musteriBeklemeBitisi: e, ...c }) => ({
      ...c, isGunu: cevrimIsGunu(c.acilis, c.kapanis, b !== null && e !== null ? { baslangic: b, bitis: e } : null),
    })),
    kararDagilimi: await s.kararDagilimi(db, baslangic, bitis),
    // Rota revizyon geçmişi recete-rota'dadır; bağlanana kadar null (1176 a).
    rotaOlgunlugu: null,
    maliyetler: (await s.emirNolari(db, baslangic, bitis)).map((e) => ({ emirNo: e.emirNo, hurda: null, rework: null })),
    hurdaMaliyeti: null,
    reworkMaliyeti: null,
    engellenenNcDenemesi: null,
  };
}

export function olaylar(db: Db, q: OlaylarSorgusu): Promise<OlayListeCevabi> {
  const suzgec = { ilgili: q.ilgili, tur: q.tur, ara: q.ara };
  return sayfaliListe(q, { say: () => s.olaySay(db, suzgec), satirlar: (dilim) => s.olayListesi(db, suzgec, dilim) });
}
