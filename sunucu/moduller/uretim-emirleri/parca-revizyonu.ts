import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { ParcaRevizyonlariCevabi, ParcaRevizyonuDurumu } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { malzemelerinParcaCizimleri } from '../belge-merkezi/disari.ts';
import {
  kartinYeniParcaRevizyonu, PARCA_REVIZYONU_YOK, parcaRevizyonuAcikMi, parcaRevizyonuMetni, parcaRevizyonuSecimIhlali, rotaCizimFarkiUyarisi, rotaninCizimRevizyonu,
  varsayilanParcaRevizyonu,
} from './kurallar.ts';
import type { ParcaRevizyonuSecenegi } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3755: emre sabitlenen parça (çizim) revizyonu. Seçenekler malzeme kartının çiziminin yayına girmiş revizyonlarıdır (Belge Merkezi);
// rota revizyonunun yürürlüğe alındığı an rota modülünden kablolamayla gelir (uretim-emirleri rotayı ithal etmez).

export type RotaYururlukCozucusu = (db: Db, idler: readonly number[]) => Promise<Map<number, { harf: string; yururlugeAlma: string | null }>>;
let rotaYururlukleri: RotaYururlukCozucusu | null = null;
export function rotaYururlukCozucusuKaydet(c: RotaYururlukCozucusu | null): RotaYururlukCozucusu | null {
  const onceki = rotaYururlukleri;
  rotaYururlukleri = c;
  return onceki;
}

export interface ParcaRevizyonuYazisi { kod: string | null; belgeId: number; revizyonId: number }

interface Secenekler { belgeId: number; ad: string; revizyonlar: ParcaRevizyonuSecenegi[] }
async function secenekler(db: Db, malzemeNo: number): Promise<Secenekler | null> {
  return (await malzemelerinParcaCizimleri(db, [malzemeNo])).get(malzemeNo) ?? null;
}

async function rotaninCizimi(db: Db, rotaRevizyonId: number | null, liste: readonly ParcaRevizyonuSecenegi[]): Promise<{ harf: string | null; cizim: ParcaRevizyonuSecenegi | null }> {
  if (rotaRevizyonId === null || rotaYururlukleri === null) return { harf: null, cizim: null };
  const r = (await rotaYururlukleri(db, [rotaRevizyonId])).get(rotaRevizyonId);
  return { harf: r?.harf ?? null, cizim: rotaninCizimRevizyonu(liste, r?.yururlugeAlma ?? null) };
}

// Emir açma formunun listesi: kartın yayına girmiş çizim revizyonları, varsayılan (yayındaki) ve rotanın çizimi. Yetki uçta (emir açma).
export async function parcaRevizyonlari(db: Db, malzemeNo: number, rotaRevizyonId: number | null): Promise<ParcaRevizyonlariCevabi> {
  const sec = await secenekler(db, malzemeNo);
  const liste = sec?.revizyonlar ?? [];
  const rota = await rotaninCizimi(db, rotaRevizyonId, liste);
  return {
    cizim: sec === null ? null : { belgeId: sec.belgeId, ad: sec.ad },
    revizyonlar: liste.map((r) => ({
      revizyonId: r.revizyonId, kod: parcaRevizyonuMetni(r.revKodu), durum: r.durum, yayinlandi: r.yayinlandi, rotaUyarisi: rotaCizimFarkiUyarisi(rota.harf, rota.cizim, r),
    })),
    varsayilanRevizyonId: varsayilanParcaRevizyonu(liste)?.revizyonId ?? null,
    rotaCizimRevizyonId: rota.cizim?.revizyonId ?? null,
    rotaHarfi: rota.harf,
  };
}

// Açılışta sabitlenecek revizyon: istenen (listede olmalı) ya da kartın yayındaki çizimi; çizimi olmayan kartta null. Rotanın çizimi
// farklıysa uyarı döner, açılış durmaz.
export async function acilisParcaRevizyonu(
  db: Db, malzemeNo: number, istenenRevizyonId: number | null | undefined, rotaRevizyonId: number | null,
): Promise<{ yazi: ParcaRevizyonuYazisi | null; uyari: string | null }> {
  const sec = await secenekler(db, malzemeNo);
  const liste = sec?.revizyonlar ?? [];
  const secilen = istenenRevizyonId == null ? varsayilanParcaRevizyonu(liste) : liste.find((r) => r.revizyonId === istenenRevizyonId) ?? null;
  if (istenenRevizyonId != null && secilen === null) throw dogrulama(PARCA_REVIZYONU_YOK, 'parcaCizimRevizyonId');
  if (sec === null || secilen === null) return { yazi: null, uyari: null };
  const rota = await rotaninCizimi(db, rotaRevizyonId, liste);
  return { yazi: { kod: secilen.revKodu, belgeId: sec.belgeId, revizyonId: secilen.revizyonId }, uyari: rotaCizimFarkiUyarisi(rota.harf, rota.cizim, secilen) };
}

// Revizyonu boş açık emirde seçim (yetki emir düzenleme); eski ve yeni değer emrin değişiklik defterine tetikle düşer.
export async function parcaRevizyonuSec(db: Db, kullanici: Kullanici, id: number, revizyonId: number, surum: number): Promise<void> {
  if (!islemVarMi(kullanici, 'uretim-emirleri.duzenle')) throw yetkiYok();
  const e = await s.ustEmirBul(db, id, true);
  if (e === null || e.malzemeNo === null) throw bulunamadi('Üretim emri bulunamadı.');
  if (e.surum !== surum) throw eskiSurum();
  const ihlal = parcaRevizyonuSecimIhlali(e.durum, e.arsiv, e.parcaCizimRevizyonId);
  if (ihlal !== null) throw cakisma(ihlal);
  const { yazi } = await acilisParcaRevizyonu(db, e.malzemeNo, revizyonId, null);
  if (yazi === null) throw dogrulama(PARCA_REVIZYONU_YOK, 'revizyonId');
  if ((await s.parcaRevizyonuYaz(db, id, e.surum, yazi)) === null) throw eskiSurum();
}

// Ayrıntı ekranı: kartta başka revizyon yayında mı, seçim isteniyor mu. Çizimi olmayan kartta seçim istenmez (seçenek yoktur).
export async function parcaRevizyonuDurumu(
  db: Db, e: { malzemeNo: number | null; durum: Parameters<typeof parcaRevizyonuAcikMi>[0]; arsiv: boolean; parcaCizimRevizyonId: number | null },
): Promise<ParcaRevizyonuDurumu> {
  if (e.malzemeNo === null) return { yeniRevizyon: null, secimGerekli: false };
  const liste = (await secenekler(db, e.malzemeNo))?.revizyonlar ?? [];
  return {
    yeniRevizyon: kartinYeniParcaRevizyonu(e.parcaCizimRevizyonId, liste),
    secimGerekli: e.parcaCizimRevizyonId === null && parcaRevizyonuAcikMi(e.durum, e.arsiv) && liste.length > 0,
  };
}

// Öteki modüller (Arkon paketi, Kalite, CNC Kurulum, Atölye, plan) emrin "Rev"ini buradan okur: kod gösterim kuralıyla ("R00" -> "00");
// seçilmemiş emirde null ("Rev —"). Yetki denetlemez.
export interface EmrinParcaRevizyonu { kod: string | null; belgeId: number; revizyonId: number }
export async function emirlerinParcaRevizyonlari(db: Db, emirIdleri: readonly number[]): Promise<Map<number, EmrinParcaRevizyonu | null>> {
  if (emirIdleri.length === 0) return new Map();
  return new Map((await s.ustEmirlerBul(db, emirIdleri)).map((e) => [e.id, e.parcaCizimRevizyonId === null || e.parcaCizimBelgeId === null ? null
    : { kod: parcaRevizyonuMetni(e.parcaRevizyonKodu), belgeId: e.parcaCizimBelgeId, revizyonId: e.parcaCizimRevizyonId }]));
}

// Liste satırı: emrin "Rev"i ve seçim isteniyor mu (açık, revizyonu boş, kartın çizimi var). Belge Merkezi tek istekte okunur.
export interface ListeParcaRevizyonu { parcaRevizyonu: string | null; parcaRevizyonuSecimGerekli: boolean }
export async function listeParcaRevizyonlari(db: Db, emirIdleri: readonly number[]): Promise<Map<number, ListeParcaRevizyonu>> {
  if (emirIdleri.length === 0) return new Map();
  const emirler = await s.ustEmirlerBul(db, emirIdleri);
  const bos = emirler.filter((e) => e.parcaCizimRevizyonId === null && e.malzemeNo !== null && parcaRevizyonuAcikMi(e.durum, e.arsiv));
  const cizimli = bos.length === 0 ? new Set<number>()
    : new Set([...(await malzemelerinParcaCizimleri(db, [...new Set(bos.flatMap((e) => (e.malzemeNo === null ? [] : [e.malzemeNo])))])).entries()]
      .filter(([, c]) => c.revizyonlar.length > 0).map(([no]) => no));
  return new Map(emirler.map((e) => [e.id, {
    parcaRevizyonu: e.parcaCizimRevizyonId === null ? null : parcaRevizyonuMetni(e.parcaRevizyonKodu),
    parcaRevizyonuSecimGerekli: e.parcaCizimRevizyonId === null && e.malzemeNo !== null && parcaRevizyonuAcikMi(e.durum, e.arsiv) && cizimli.has(e.malzemeNo),
  }]));
}

// Basılan ve terminale giden "Rev": emre sabitlenen revizyon; seçilmemiş emirde kartın yayındaki çizimi (üretim durmaz, bugünkü gibi basılır).
// İkisi de yoksa null. Kod gösterim kuralıyla. Yetki denetlemez.
export async function emirlerinBaskiRevizyonlari(db: Db, emirIdleri: readonly number[]): Promise<Map<number, string | null>> {
  if (emirIdleri.length === 0) return new Map();
  const emirler = await s.ustEmirlerBul(db, emirIdleri);
  const bos = [...new Set(emirler.flatMap((e) => (e.parcaCizimRevizyonId === null && e.malzemeNo !== null ? [e.malzemeNo] : [])))];
  const kart = bos.length === 0 ? new Map<number, string | null>()
    : new Map([...(await malzemelerinParcaCizimleri(db, bos)).entries()].map(([no, c]) => [no, parcaRevizyonuMetni(varsayilanParcaRevizyonu(c.revizyonlar)?.revKodu ?? null)]));
  return new Map(emirler.map((e) => [e.id, e.parcaCizimRevizyonId !== null ? parcaRevizyonuMetni(e.parcaRevizyonKodu)
    : e.malzemeNo === null ? null : kart.get(e.malzemeNo) ?? null]));
}
