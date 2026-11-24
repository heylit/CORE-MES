import { getHeapStatistics } from 'node:v8';
import type { Db } from '#cekirdek/db.ts';
import { surenIstekler } from '#cekirdek/istek-izleme.ts';
import type { SuAnCevabi } from '#paylasilan/sozlesme/saglik.ts';
import { sorguMetniniTemizle } from './kurallar.ts';
import { vtSuAnOku } from './sorgular.ts';
import type { VtSuAn } from './sorgular.ts';

// Şu an (3668 B): süren istekler, hesaplar, oturumlar, veritabanı bağlantıları ve kilit beklemeleri. Her çağrıda taze okunur; ekran
// 5 saniyede bir yalnız sekme açıkken ister (yük ayrı bir iş değildir, sayaçlar bellekte).
export const SU_AN_UCU_ADRESI = '/saglik/su-an';

// Başka modüllerin okumaları katı aşağı kata doğru değildir (ADR 0006): sağlık yalnız bu iki işlevi tanır, bağı `kablolama.ts` kurar.
// Kayıt yoksa ilgili alan okunamamış sayılır (oturum null, plan hesapları boş), uydurulmaz.
export interface PlanHesapTuruSayaci {
  calisan: number; toplam: number; zamanAsimi: number; bellek: number; hata: number; sonSureMs: number | null; enUzunSureMs: number | null;
}
export type PlanHesapOkuyucu = () => Record<'motor' | 'degerlendirme' | 'teklif' | 'yillik', PlanHesapTuruSayaci>;
export type OturumSayisiOkuyucu = (db: Db) => Promise<number>;

const BOS_PLAN: PlanHesapTuruSayaci = { calisan: 0, toplam: 0, zamanAsimi: 0, bellek: 0, hata: 0, sonSureMs: null, enUzunSureMs: null };
let planOkuyucu: PlanHesapOkuyucu = () => ({ motor: BOS_PLAN, degerlendirme: BOS_PLAN, teklif: BOS_PLAN, yillik: BOS_PLAN });
let oturumOkuyucu: OturumSayisiOkuyucu | null = null;
export const planHesapOkuyucusuKaydet = (o: PlanHesapOkuyucu): void => { planOkuyucu = o; };
export const oturumSayisiOkuyucusuKaydet = (o: OturumSayisiOkuyucu): void => { oturumOkuyucu = o; };

export interface SuAnKaynagi {
  simdi: () => number;
  suren: typeof surenIstekler;
  plan: PlanHesapOkuyucu;
  oturum: (db: Db) => Promise<number | null>;
  vt: (db: Db) => Promise<VtSuAn | null>;
  bellek: () => { yiginBayt: number; yiginSiniriBayt: number; rssBayt: number };
  acilis: () => string;
}

export const SUREC_SU_AN_KAYNAGI: Omit<SuAnKaynagi, 'acilis'> = {
  simdi: () => Date.now(),
  suren: surenIstekler,
  plan: () => planOkuyucu(),
  oturum: (db) => (oturumOkuyucu === null ? Promise.reject(new Error('Oturum okuyucusu bağlı değil')) : oturumOkuyucu(db)),
  vt: vtSuAnOku,
  bellek: () => ({ yiginBayt: process.memoryUsage().heapUsed, yiginSiniriBayt: getHeapStatistics().heap_size_limit, rssBayt: process.memoryUsage().rss }),
};

const TURLER = ['motor', 'degerlendirme', 'teklif', 'yillik'] as const;

// Bir okuma başarısızsa o alan null kalır, ekranın geri kalanı düşmez: uydurulmuş sıfır yerine "okunamadı".
async function dene<T>(is: () => Promise<T>): Promise<T | null> {
  try { return await is(); } catch { return null; }
}

export async function suAnTopla(db: Db, k: SuAnKaynagi): Promise<SuAnCevabi> {
  const simdi = k.simdi();
  const plan = k.plan();
  // Aynı db istemcisine eşzamanlı sorgu verilmez: sırayla okunur.
  const acikOturum = await dene(() => k.oturum(db));
  const vt = await dene(() => k.vt(db));
  return {
    an: new Date(simdi).toISOString(),
    // Bu uç da süren bir istektir; ekran kendini göstermesin.
    surenIstekler: k.suren(simdi).filter((i) => i.adres !== SU_AN_UCU_ADRESI).map((i) => ({ yontem: i.yontem, adres: i.adres, kisiId: i.kisiId, sureSn: Math.round(i.sureMs / 100) / 10 })),
    planHesaplari: TURLER.map((tur) => ({
      tur, calisan: plan[tur].calisan, biten: plan[tur].toplam, zamanAsimi: plan[tur].zamanAsimi, bellekAsimi: plan[tur].bellek, hata: plan[tur].hata,
      sonSureMs: plan[tur].sonSureMs, enUzunSureMs: plan[tur].enUzunSureMs,
    })),
    acikOturum,
    veritabani: vt === null ? null : { baglanti: vt.baglanti, azami: vt.azami, kilitBekleyen: vt.kilitler.length },
    kilitler: (vt?.kilitler ?? []).map((l) => ({ sorgu: l.sorgu === null ? 'Görünmeyen sorgu' : sorguMetniniTemizle(l.sorgu), bekletenIslem: l.bekletenIslem, beklemeSn: Math.round(l.beklemeSn * 10) / 10 })),
    bellek: k.bellek(),
    sunucuAcilis: k.acilis(),
  };
}
