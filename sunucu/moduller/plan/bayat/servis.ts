// 2319 (2311 S7): canlı planı eskiten saha olayları. Dinleyiciler komutla aynı işlemde koşar (bağ sunucu/kablolama.ts); yalnız işaret yazar,
// planı değiştirmez. Okuma yetki denetlemez: çağıran uç denetler.
import { kayitNoktasi, type Db } from '#cekirdek/db.ts';
import { makineDurumlari, makineler } from '../../istasyonlar/disari.ts';
import { emirlerinIsEmriIdleri, emirlerinMalzemeIhtiyaci, emirNolari, fasonHareketiOzeti, isEmriPlanBilgileri } from '../../uretim-emirleri/disari.ts';
import { planSurumu, sonCanliyaAlma } from '../sorgular.ts';
import { bayatDuruslar, bayatOzeti, terminEtkiledigiEmirler, type BayatOlayi, type PlanBayatligi } from './kurallar.ts';
import * as s from './sorgular.ts';

const isEmirleri = async (db: Db, uretimEmriId: number): Promise<number[]> =>
  (await emirlerinIsEmriIdleri(db, [uretimEmriId])).get(uretimEmriId) ?? [];

// 2320 (CEO): işaret operatörün komutunu (bitir, fason dönüşü) düşürmez. İş kayıt noktasında koşar; hata işareti geri alır ve yutulur, komut
// sürer. Dinleyicinin günlüğü yoktur (olay yalnız db taşır); yutulan hatanın günlüğe yazılması çekirdek isteğidir (YAMA-NOTU).
export async function isaretYaz(db: Db, is: () => Promise<void>): Promise<void> {
  try {
    await kayitNoktasi(db, is);
  } catch {
    // İşaret kaybolur; plan değişmediği için veri bozulmaz, planlamacı şeritte yalnız bu olayı görmez.
  }
}

export async function emirBittiYansit(db: Db, olay: { uretimEmriId: number }): Promise<void> {
  await isaretYaz(db, async () => {
    if (await s.bitmemisSatirVar(db, await isEmirleri(db, olay.uretimEmriId), new Date().toISOString())) {
      await s.olayYaz(db, 'emir-bitti', olay.uretimEmriId, null);
    }
  });
}

export async function fasonHareketiYansit(db: Db, olay: { hareketId: number }): Promise<void> {
  await isaretYaz(db, async () => {
    const h = await fasonHareketiOzeti(db, olay.hareketId);
    if (h === null || h.yon !== 'donus') return;
    if (await s.canlidaVar(db, await isEmirleri(db, h.uretimEmriId))) await s.olayYaz(db, 'fason-donusu', h.uretimEmriId, h.id);
  });
}

// 2327-1 a: emrin adımı değişti ve emir canlıdaysa işaret. kaynak_id canlı plan sürümüdür: aynı canlı planda emir başına bir satır,
// yeni canlıya almadan sonraki değişiklik yeniden yazılır (tekil dizin ON CONFLICT ile önceki canlının satırına takılmaz).
export async function isEmirleriDegistiYansit(db: Db, olay: { uretimEmriId: number }): Promise<void> {
  await isaretYaz(db, async () => {
    if (await s.canlidaVar(db, await isEmirleri(db, olay.uretimEmriId))) await s.olayYaz(db, 'rota-degisti', olay.uretimEmriId, await planSurumu(db));
  });
}

// 2732: emir iptal edildi ya da arşive alındı (ikisi de iptal olayını yayar) ve canlıdaysa işaret. Emir bir kez iptal olur: kaynak yok.
export async function emirIptalYansit(db: Db, olay: { uretimEmriId: number }): Promise<void> {
  await isaretYaz(db, async () => {
    if (await s.canlidaVar(db, await isEmirleri(db, olay.uretimEmriId))) await s.olayYaz(db, 'emir-iptal', olay.uretimEmriId, null);
  });
}

// B-2499-12: adım bitti ve canlıda o adımın şimdiden sonra biten satırı var: plan ona hâlâ yer ayırıyor. kaynak_id adımdır (iş emri):
// aynı adım bir kez sayılır.
export async function adimBittiYansit(db: Db, olay: { isEmriId: number; uretimEmriId: number }): Promise<void> {
  await isaretYaz(db, async () => {
    if (await s.bitmemisSatirVar(db, [olay.isEmriId], new Date().toISOString())) await s.olayYaz(db, 'adim-bitti', olay.uretimEmriId, olay.isEmriId);
  });
}

// 3256-1: satın almada gelişi ya da termini değişen malzemeyi canlıda bitmemiş adımında kullanan emir işaretlenir. kaynak_id canlı plan
// sürümüdür (rota-degisti gibi): aynı planda emir başına bir satır, yeni canlıya almadan sonraki değişiklik yeniden yazılır.
export async function satinAlmaTerminiYansit(db: Db, olay: { malzemeNolar: readonly number[] }): Promise<void> {
  await isaretYaz(db, async () => {
    if (olay.malzemeNolar.length === 0 || (await sonCanliyaAlma(db)) === null) return;
    const bilgi = await isEmriPlanBilgileri(db, await s.bitmemisIsEmirleri(db, new Date().toISOString()));
    if (bilgi.size === 0) return;
    const adimlar = [...bilgi.values()].map((b) => ({ uretimEmriId: b.uretimEmriId, opNo: b.opNo }));
    const ihtiyaclar = await emirlerinMalzemeIhtiyaci(db, [...new Set(adimlar.map((a) => a.uretimEmriId))]);
    const emirler = terminEtkiledigiEmirler(adimlar, ihtiyaclar, olay.malzemeNolar);
    if (emirler.length === 0) return;
    const surum = await planSurumu(db);
    for (const e of emirler) await s.olayYaz(db, 'satin-alma-termini', e, surum);
  });
}

export async function planBayatligi(db: Db, simdi: number = Date.now()): Promise<PlanBayatligi> {
  const son = await sonCanliyaAlma(db);
  if (son === null) return bayatOzeti(null, []);
  const kayitli = await s.olaylar(db, son.zaman);
  const canliMakineler = new Set(await s.bitmemisMakineler(db, new Date(simdi).toISOString()));
  const duruslar = canliMakineler.size === 0 ? []
    : bayatDuruslar((await makineDurumlari(db)).map((d) => ({ makineId: d.makineId, durum: d.durum, degisme: d.degisme })), son.zaman, canliMakineler);
  const nolar = kayitli.length === 0 ? new Map<number, string>() : await emirNolari(db, [...new Set(kayitli.map((o) => o.uretimEmriId))]);
  const kodlar = duruslar.length === 0 ? new Map<number, string>()
    : new Map((await makineler(db, { pasiflerDahil: true })).map((m) => [m.id, m.kod]));
  const olaylar: BayatOlayi[] = [
    ...kayitli.map((o) => ({ neden: o.neden, zaman: o.zaman, uretimEmriId: o.uretimEmriId, emirNo: nolar.get(o.uretimEmriId) ?? null, makineId: null, makineKod: null })),
    ...duruslar.map((d) => ({ neden: 'durus' as const, zaman: d.degisme, uretimEmriId: null, emirNo: null, makineId: d.makineId, makineKod: kodlar.get(d.makineId) ?? null })),
  ];
  return bayatOzeti(son.zaman, olaylar);
}
