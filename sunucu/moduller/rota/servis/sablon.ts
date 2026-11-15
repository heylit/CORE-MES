import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import type { Sablon, SablonCevabi, SablonlarCevabi } from '#paylasilan/sozlesme/rota.ts';
import * as s from '../sorgular.ts';
import { operasyonTipleri } from './ortak.ts';

/* ---------------- şablonlar (#698) ---------------- */

const SABLON_ADI_KULLANILIYOR = 'Bu adla bir şablon var.';

async function sablonlariKur(db: Db, satirlar: readonly s.SablonSatiri[]): Promise<Sablon[]> {
  const adimlar = await s.sablonAdimlari(db, satirlar.map((x) => x.id));
  const tipler = new Map((await operasyonTipleri(db)).map((t) => [t.id, { id: t.id, kod: t.kod, ad: t.ad, aktif: t.aktif }]));
  return satirlar.map((x) => ({
    ...x,
    oneriSozcukleri: [...x.oneriSozcukleri],
    adimlar: adimlar.filter((a) => a.sablonId === x.id).map((a) => ({
      sira: a.sira, ad: a.ad, operasyonTipi: tipler.get(a.operasyonTipiId) ?? { id: a.operasyonTipiId, kod: '?', ad: 'Bilinmeyen tip', aktif: false },
    })),
  }));
}

export async function sablonListesi(db: Db): Promise<SablonlarCevabi> {
  return { sablonlar: await sablonlariKur(db, await s.sablonlar(db)) };
}

async function sablonGetir(db: Db, id: number): Promise<SablonCevabi> {
  const satir = (await s.sablonlar(db)).find((x) => x.id === id);
  if (!satir) throw bulunamadi('Şablon bulunamadı.');
  return { sablon: (await sablonlariKur(db, [satir]))[0]! };
}

// Pasif tipe yeni adım yazılmaz; şablonda zaten olan pasif tipli adım korunabilir (rota adımıyla aynı kural).
async function sablonAdimlariDenetle(db: Db, adimlar: readonly { operasyonTipiId: number }[], eskiTipler: ReadonlySet<number>): Promise<void> {
  const tipler = new Map((await operasyonTipleri(db)).map((t) => [t.id, t]));
  for (const [i, a] of adimlar.entries()) {
    const tip = tipler.get(a.operasyonTipiId);
    if (!tip) throw dogrulama('Operasyon tipi bulunamadı.', `adimlar.${i}.operasyonTipiId`);
    if (!tip.aktif && !eskiTipler.has(a.operasyonTipiId)) throw dogrulama('Bu operasyon tipi kullanıma kapalı.', `adimlar.${i}.operasyonTipiId`);
  }
}

async function adiKoru<T>(is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (hata) {
    if (kisitIhlali(hata)?.iz.kisit === 'rota_sablonu_ad_tekil') throw cakisma(SABLON_ADI_KULLANILIYOR);
    throw hata;
  }
}

interface SablonGirdisi {
  ad: string; aciklama?: string | null | undefined; oneriSozcukleri?: string[] | undefined; adimlar: { operasyonTipiId: number; ad: string }[];
}

// Sözcükler büyük harfe çevrilip tekilleştirilir: "mil" ile "MİL" aynı sözcüktür (karşılaştırma istemcide harf farkını gözetmez).
const sozcukler = (l: readonly string[]): string[] => [...new Set(l.map((x) => x.trim().toLocaleUpperCase('tr')).filter((x) => x !== ''))];

const bilgi = (g: SablonGirdisi, eski: s.SablonSatiri | null): s.SablonBilgisi => ({
  ad: g.ad,
  aciklama: g.aciklama === undefined ? eski?.aciklama ?? null : g.aciklama,
  oneriSozcukleri: g.oneriSozcukleri === undefined ? eski?.oneriSozcukleri ?? [] : sozcukler(g.oneriSozcukleri),
});

export async function sablonEkle(db: Db, g: SablonGirdisi): Promise<SablonCevabi> {
  await sablonAdimlariDenetle(db, g.adimlar, new Set());
  const id = await adiKoru(() => s.sablonEkle(db, bilgi(g, null)));
  await s.sablonAdimlariniYaz(db, id, g.adimlar);
  // İlk şablon kendiliğinden varsayılandır: "Standart rotadan başla" boşa düşmesin.
  if ((await s.varsayilanSablonId(db)) === null) await s.varsayilanYap(db, id);
  return sablonGetir(db, id);
}

export async function sablonKaydet(db: Db, id: number, g: SablonGirdisi & { surum: number }): Promise<SablonCevabi> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== g.surum) throw eskiSurum();
  await sablonAdimlariDenetle(db, g.adimlar, new Set((await s.sablonAdimlari(db, [id])).map((a) => a.operasyonTipiId)));
  if (!(await adiKoru(() => s.sablonBilgisiYaz(db, id, bilgi(g, mevcut), g.surum)))) throw eskiSurum();
  await s.sablonAdimlariniYaz(db, id, g.adimlar);
  return sablonGetir(db, id);
}

export async function sablonuVarsayilanYap(db: Db, id: number, surum: number): Promise<SablonCevabi> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== surum) throw eskiSurum();
  if (!mevcut.aktif) throw gecersiz(KULLANIMDA_DEGIL);
  await s.varsayilanYap(db, id);
  return sablonGetir(db, id);
}

const VARSAYILAN_SILINMEZ = 'Varsayılan şablon silinmez; önce başka bir şablonu varsayılan yapın.';
const VARSAYILAN_KALDIRILMAZ = 'Varsayılan şablon kullanımdan kaldırılmaz; önce başka bir şablonu varsayılan yapın.';
export const KULLANIMDA_DEGIL = 'Bu şablon kullanımdan kaldırılmış.';
export const KULLANILMIS_SABLON = 'Bu şablondan rota açıldı; silinmez, kullanımdan kaldırılabilir.';

// Varsayılan şablon silinmez: önce başka bir şablon varsayılan yapılır. Kullanılmış şablon da silinmez (3273 a, Risk K1): veritabanı
// bağı (ON DELETE NO ACTION) aynı kuralı tutar; kullanım denetimi kilit altındadır, şablondan taslak açmayla yarışmaz.
export async function sablonuSil(db: Db, id: number, surum: number): Promise<void> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== surum) throw eskiSurum();
  if (mevcut.varsayilan) throw gecersiz(VARSAYILAN_SILINMEZ);
  if (mevcut.kullanim.revizyon > 0) throw cakisma(KULLANILMIS_SABLON);
  try {
    await s.sablonSil(db, id);
  } catch (hata) {
    if (kisitIhlali(hata)?.iz.kisit === 'rota_revizyonu_kaynak_sablon_bagi') throw cakisma(KULLANILMIS_SABLON);
    throw hata;
  }
}

// Kullanımdan kalkan şablon seçicide görünmez ve ondan taslak açılmaz; açılmış rotalar etkilenmez. Geri alınabilir.
export async function sablonDurumuYaz(db: Db, id: number, g: { aktif: boolean; surum: number }): Promise<SablonCevabi> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== g.surum) throw eskiSurum();
  if (!g.aktif && mevcut.varsayilan) throw gecersiz(VARSAYILAN_KALDIRILMAZ);
  if (mevcut.aktif !== g.aktif && !(await s.sablonAktifYaz(db, id, g.aktif, g.surum))) throw eskiSurum();
  return sablonGetir(db, id);
}
