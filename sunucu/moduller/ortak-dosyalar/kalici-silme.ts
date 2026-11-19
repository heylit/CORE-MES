import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, yetkiYok } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { DenetimSecimi } from '#cekirdek/uc.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { DENETIM_EKI_SATIR_SINIRI } from '#cekirdek/uc.ts';
import type { OrtakDosya } from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { denetimSatiri, dosyaTutamagi } from '../dosya/disari.ts';
import { ILETILER, silmeAdiUyarMi, silmeGeriCekebilirMi, silmeOnaylayabilirMi } from './kurallar.ts';
import { MODUL, dosyaIste, dosyalariKur, gorunumKur } from './servis.ts';
import * as s from './sorgular.ts';

// Kalıcı silme (kart 3443, 3443 a; ADR 0030 madde 6). Yalnız arşivdeki dosya, klasörde Yönetir düzeyiyle silinir; kişi dosyanın
// adını yazar. `ortak-dosyalar.silme-dort-goz` açıkken silme istektir, başka bir Yönetir kişi onaylar. Silinen dosyanın sürümleri ve
// dosya bağları kalkar; içerik başka bağı yoksa dosya modülünün temizliğiyle (DS4) depodan çıkar. Defter satırı ve denetim kaydı kalır.

const tutamak = dosyaTutamagi(MODUL);
const ISTEK_KISITLARI = { ortak_dosyalar_silme_acik_tekil: { ileti: ILETILER.silmeIstegiVar, alan: 'dosyaId' } };

// Ayar ayarlar modülündedir (üst kat); okuyucu sunucu/kablolama.ts'te bağlanır. Bağlı değilse ayar okunamaz: silme durur
// (dört göz sessizce kapalı sayılmaz).
export type DortGozOkuyucu = (db: Db) => Promise<boolean>;
let dortGozOkuyucu: DortGozOkuyucu | null = null;
export function silmeDortGozOkuyucuKaydet(f: DortGozOkuyucu | null): void { dortGozOkuyucu = f; }
export function dortGozAcikMi(db: Db): Promise<boolean> {
  if (dortGozOkuyucu === null) throw new Error('Ortak Dosyalar silme dört göz ayarı bağlı değil (sunucu/kablolama.ts).');
  return dortGozOkuyucu(db);
}

// Görünürlük ve düzey (404/403), sonra satır kilidi; kilitli satırda arşiv ve sürüm yeniden denetlenir (Risk S3, K2).
async function arsivdekiDosya(db: Db, kullanici: Kullanici, klasorId: number, dosyaId: number, surum: number) {
  const g = await gorunumKur(db, kullanici);
  await dosyaIste(db, g, klasorId, dosyaId, 'yonetir');
  const d = await s.dosyaKilitle(db, klasorId, dosyaId);
  if (d === null) throw bulunamadi(ILETILER.dosyaYok);
  if (!d.arsiv) throw cakisma(ILETILER.silmeArsivde);
  if (d.surum !== surum) throw cakisma(ILETILER.silmeIstegiEski);
  return { g, d };
}

// Bağlar kaldırılır, sürümler ve dosya silinir; denetim ekine her kalkan bağ ve silmenin kendisi yazılır. Ek satır sınırını aşan
// dosyada bağ satırları yerine sayısı yazılır (sınırı aşan ek uç hatasıdır, kırpılmaz).
async function sil(db: Db, dosyaId: number, ad: string, denetimEki: (satirlar: readonly DenetimSecimi[]) => void): Promise<number> {
  const surumler = await s.surumleriOku(db, dosyaId);
  const kalkan: DenetimSecimi[] = [];
  for (const v of surumler) {
    for (const b of await tutamak.bagKaldir(db, String(v.id), null)) kalkan.push({ ...denetimSatiri('kaldir', b), dosyaId, surumSirasi: v.sira });
  }
  await s.dosyaVeSurumleriniSil(db, dosyaId);
  const ozet: DenetimSecimi = { islem: 'kalici-sil', dosyaId, ad, surumSayisi: surumler.length, bagSayisi: kalkan.length };
  denetimEki(kalkan.length + 1 <= DENETIM_EKI_SATIR_SINIRI ? [ozet, ...kalkan] : [ozet]);
  return surumler.length;
}

// Dört göz kapalıyken doğrudan silme. Açıkken reddedilir: istek açılır.
export async function kaliciSil(
  db: Db, kullanici: Kullanici, klasorId: number, dosyaId: number, g: { surum: number; ad: string },
  denetimEki: (satirlar: readonly DenetimSecimi[]) => void,
): Promise<undefined> {
  const { d } = await arsivdekiDosya(db, kullanici, klasorId, dosyaId, g.surum);
  if (await dortGozAcikMi(db)) throw cakisma(ILETILER.silmeDortGozAcik);
  // Ayar kapatılmadan önce açılmış istek ikinci kişiyle sonuçlanır; doğrudan silme onu atlamaz (Risk soru 1).
  if (await s.acikIstekKilitle(db, d.id) !== null) throw cakisma(ILETILER.silmeIstegiVar);
  if (!silmeAdiUyarMi(g.ad, d.ad)) throw dogrulama(ILETILER.silmeAdUyusmuyor, 'ad');
  const surumSayisi = await sil(db, d.id, d.ad, denetimEki);
  await s.dogrudanSilmeYaz(db, { klasorId, dosyaId: d.id, dosyaAdi: d.ad, dosyaSurumu: d.surum, surumSayisi, kisiId: kullanici.id });
  return undefined;
}

// Dört göz açıkken istek. Dosya listede "Silme onayı bekliyor" ile kalır.
export async function silmeIste(db: Db, kullanici: Kullanici, klasorId: number, dosyaId: number, surum: number): Promise<OrtakDosya> {
  const { g, d } = await arsivdekiDosya(db, kullanici, klasorId, dosyaId, surum);
  if (!(await dortGozAcikMi(db))) throw cakisma(ILETILER.silmeDortGozKapali);
  await kisitKorumali(ISTEK_KISITLARI, () => s.silmeIstegiAc(db, { klasorId, dosyaId: d.id, dosyaAdi: d.ad, dosyaSurumu: d.surum, kisiId: kullanici.id }));
  return dosyaCevabi(db, g, klasorId, d.id);
}

async function acikIstek(db: Db, dosyaId: number): Promise<s.SilmeIstegi> {
  const i = await s.acikIstekKilitle(db, dosyaId);
  if (i === null) throw cakisma(ILETILER.silmeIstegiYok);
  return i;
}

// İkinci kişinin onayı: o da adı yazar. Ayar sonradan kapatılmış olsa da açık istek aynı kuralla sonuçlanır.
export async function silmeOnayla(
  db: Db, kullanici: Kullanici, klasorId: number, dosyaId: number, g: { surum: number; ad: string },
  denetimEki: (satirlar: readonly DenetimSecimi[]) => void,
): Promise<undefined> {
  const { d } = await arsivdekiDosya(db, kullanici, klasorId, dosyaId, g.surum);
  const i = await acikIstek(db, d.id);
  if (!silmeOnaylayabilirMi(i.isteyenId, kullanici.id)) throw yetkiYok(ILETILER.silmeKendiIstegi);
  if (i.dosyaSurumu !== d.surum) throw cakisma(ILETILER.silmeIstegiEski);
  if (!silmeAdiUyarMi(g.ad, d.ad)) throw dogrulama(ILETILER.silmeAdUyusmuyor, 'ad');
  const surumSayisi = await sil(db, d.id, d.ad, denetimEki);
  await s.istekSonucla(db, i.id, 'silindi', kullanici.id, surumSayisi);
  return undefined;
}

export async function silmeReddet(db: Db, kullanici: Kullanici, klasorId: number, dosyaId: number, surum: number): Promise<OrtakDosya> {
  const { g, d } = await arsivdekiDosya(db, kullanici, klasorId, dosyaId, surum);
  const i = await acikIstek(db, d.id);
  if (!silmeOnaylayabilirMi(i.isteyenId, kullanici.id)) throw yetkiYok(ILETILER.silmeKendiIstegi);
  await s.istekSonucla(db, i.id, 'reddedildi', kullanici.id, null);
  return dosyaCevabi(db, g, klasorId, d.id);
}

export async function silmeGeriCek(db: Db, kullanici: Kullanici, klasorId: number, dosyaId: number, surum: number): Promise<OrtakDosya> {
  const { g, d } = await arsivdekiDosya(db, kullanici, klasorId, dosyaId, surum);
  const i = await acikIstek(db, d.id);
  if (!silmeGeriCekebilirMi(i.isteyenId, kullanici.id)) throw yetkiYok(ILETILER.silmeGeriCekmeKendi);
  await s.istekSonucla(db, i.id, 'geri-cekildi', kullanici.id, null);
  return dosyaCevabi(db, g, klasorId, d.id);
}

async function dosyaCevabi(db: Db, g: Awaited<ReturnType<typeof gorunumKur>>, klasorId: number, dosyaId: number): Promise<OrtakDosya> {
  const satir = await s.dosyaOku(db, klasorId, dosyaId);
  if (satir === null) throw new Error(`Dosya okunamadı: ${dosyaId}`);
  const [cevap] = await dosyalariKur(db, g, [satir]);
  if (cevap === undefined) throw new Error(`Dosya kurulamadı: ${dosyaId}`);
  return cevap;
}
