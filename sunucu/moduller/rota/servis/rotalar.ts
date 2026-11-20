import { kisitIhlali } from '#cekirdek/db.ts';
import type { Db } from '#cekirdek/db.ts';
import { cakisma, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import type { EmirTuru } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EMIR_TURU_ADLARI } from '#paylasilan/sozlesme/emir-turleri.ts';
import * as s from '../sorgular.ts';
import { ROTA_BASKA_URUNUN, rotaKurulabilirUrun, rotaliTurMu, urunOzetiAl } from './ortak.ts';
import { urunRevizyonlari } from './liste.ts';

/* ---------------- ürünün rotaları (3247 a) ---------------- */

const ROTA_ADI_KULLANILIYOR = 'Bu üründe bu adla bir rota var; başka bir ad yazın.';
const turunRotasiVarIletisi = (tur: string): string => `Bu üründe ${tur} türünün rotası var.`;
const STANDART_TURSUZ = 'Seri rotasına emir türü bağlanmaz; bağlanmayan her tür zaten Seri rotasını kullanır.';

async function adiKoru<T>(is: () => Promise<T>): Promise<T> {
  try {
    return await is();
  } catch (hata) {
    if (kisitIhlali(hata)?.iz.kisit === 'rota_tanimi_ad_tekil') throw cakisma(ROTA_ADI_KULLANILIYOR);
    throw hata;
  }
}

async function urununRotasi(db: Db, urunId: number, rotaId: number): Promise<s.RotaSatiri> {
  const rota = await s.rotaKilitle(db, rotaId);
  if (!rota || rota.malzemeId !== urunId) throw cakisma(ROTA_BASKA_URUNUN);
  return rota;
}

// Yeni rota emir türüyle açılır (3411 a): tür hemen bağlanır; ad verilmezse türün adıdır (3482-1 b: ad serbest, sonradan da değişir); rota yürürlüğe girene kadar o türün emirleri Seri
// (Standart) rotasıyla açılır, bu yüzden bağlama onay yetkisi istemez. Revizyonu "taslak aç" ile gelir. Ürünün Standart rotası henüz
// yoksa önce o açılır. Türün rotası varsa yeni rota açılmaz.
export async function rotaEkle(db: Db, kullanici: Kullanici, urunId: number, emirTuru: EmirTuru, ad?: string): Promise<UrunRevizyonlariCevabi> {
  await rotaKurulabilirUrun(db, urunId);
  await s.standartRotaAc(db, urunId, kullanici.id);
  if ((await s.urunRotalari(db, urunId)).some((r) => r.emirTurleri.includes(emirTuru))) throw cakisma(turunRotasiVarIletisi(EMIR_TURU_ADLARI[emirTuru]));
  const id = await adiKoru(() => s.rotaEkle(db, urunId, ad ?? EMIR_TURU_ADLARI[emirTuru], kullanici.id));
  if ((await s.rotaTurleriniYaz(db, id, urunId, [emirTuru], 1)) === null) throw eskiSurum();
  return urunRevizyonlari(db, kullanici, urunId);
}

export async function rotaAdiYaz(db: Db, kullanici: Kullanici, urunId: number, rotaId: number, ad: string, surum: number): Promise<UrunRevizyonlariCevabi> {
  const urun = await urunOzetiAl(db, urunId);
  if (!rotaliTurMu(urun.tur)) throw gecersiz('Rota yalnız mamul ya da yarımamul kartına kurulur.');
  await urununRotasi(db, urunId, rotaId);
  if ((await adiKoru(() => s.rotaAdiYaz(db, rotaId, ad, surum))) === null) throw eskiSurum();
  return urunRevizyonlari(db, kullanici, urunId);
}

// Eşleme değişikliği yürürlükteki revizyon seçimini değiştirdiği için onay yetkisi ister (uçta); her satır değişiklik defterine düşer.
export async function rotaTurleriYaz(db: Db, kullanici: Kullanici, urunId: number, rotaId: number, turler: readonly EmirTuru[], surum: number): Promise<UrunRevizyonlariCevabi> {
  const rota = await urununRotasi(db, urunId, rotaId);
  if (rota.standart && turler.length > 0) throw gecersiz(STANDART_TURSUZ);
  if ((await s.rotaTurleriniYaz(db, rotaId, urunId, [...new Set(turler)], surum)) === null) throw eskiSurum();
  return urunRevizyonlari(db, kullanici, urunId);
}
