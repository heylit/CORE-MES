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

export async function sablonEkle(db: Db, g: { ad: string; adimlar: { operasyonTipiId: number; ad: string }[] }): Promise<SablonCevabi> {
  await sablonAdimlariDenetle(db, g.adimlar, new Set());
  const id = await adiKoru(() => s.sablonEkle(db, g.ad));
  await s.sablonAdimlariniYaz(db, id, g.adimlar);
  // İlk şablon kendiliğinden varsayılandır: "Standart rotadan başla" boşa düşmesin.
  if ((await s.varsayilanSablonId(db)) === null) await s.varsayilanYap(db, id);
  return sablonGetir(db, id);
}

export async function sablonKaydet(db: Db, id: number, g: { ad: string; surum: number; adimlar: { operasyonTipiId: number; ad: string }[] }): Promise<SablonCevabi> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== g.surum) throw eskiSurum();
  await sablonAdimlariDenetle(db, g.adimlar, new Set((await s.sablonAdimlari(db, [id])).map((a) => a.operasyonTipiId)));
  if (!(await adiKoru(() => s.sablonAdiYaz(db, id, g.ad, g.surum)))) throw eskiSurum();
  await s.sablonAdimlariniYaz(db, id, g.adimlar);
  return sablonGetir(db, id);
}

export async function sablonuVarsayilanYap(db: Db, id: number, surum: number): Promise<SablonCevabi> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== surum) throw eskiSurum();
  await s.varsayilanYap(db, id);
  return sablonGetir(db, id);
}

// Varsayılan şablon silinmez: önce başka bir şablon varsayılan yapılır. Şablondan açılmış rotalar etkilenmez (kopya alınır).
export async function sablonuSil(db: Db, id: number, surum: number): Promise<void> {
  const mevcut = await s.sablonKilitle(db, id);
  if (!mevcut) throw bulunamadi('Şablon bulunamadı.');
  if (mevcut.surum !== surum) throw eskiSurum();
  if (mevcut.varsayilan) throw gecersiz('Varsayılan şablon silinmez; önce başka bir şablonu varsayılan yapın.');
  await s.sablonSil(db, id);
}
