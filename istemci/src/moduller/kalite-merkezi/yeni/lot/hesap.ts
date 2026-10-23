import { aqlPlani, butunAnahtarlar, gecisDurumu, kabulOlasiligi, lotAnahtari, oranBul, planSatirlari, SIKI, YUZDE_YUZ, type AqlPlani } from '../aql.ts';
import type { Lot, Tedarikci } from '../tipler.ts';

type LotPlani = NonNullable<Lot['plan']>[string];

export type LotDegeri = Partial<Lot>;
export const SINIFLAR = ['Kritik', 'Majör', 'Minör'] as const;
export type Sinif = typeof SINIFLAR[number];
export const SINIF_ANAHTARI: Record<Sinif, 'kr' | 'mj' | 'mn'> = { Kritik: 'kr', Majör: 'mj', Minör: 'mn' };

export { aqlMetni, varsayilanAql, yuzdeMetni as yuzde } from '../aql.ts';

export interface PlanHucresi { c: Sinif; a: string; p: AqlPlani | null }

// K0'ın plan satırları sınıf adıyla; eksik AQL boş metin olur (plan çıkmaz).
export function planHucreleri(N: unknown, seviye: string | undefined, cfg: { kr?: string; mj?: string; mn?: string }, sev: string): PlanHucresi[] {
  const satirlar = planSatirlari(Number(N), seviye ?? 'II', { kr: cfg.kr ?? '', mj: cfg.mj ?? '', mn: cfg.mn ?? '' }, sev);
  return satirlar.map((r) => ({ c: r.sinif, a: r.aql, p: r.plan }));
}

export const bulunanlar = (d: { bKr?: number | null; bMj?: number | null; bMn?: number | null }): Record<Sinif, number | null | undefined> => ({ Kritik: d.bKr, Majör: d.bMj, Minör: d.bMn });

// Kayıtlı lotun sıkılığı kayıttan, yeni lotun sıkılığı aynı parça ve tedarikçinin lot geçmişinden gelir.
export function lotSikiligi(lotlar: readonly Lot[], d: LotDegeri, kayit: Lot | null): { st: string; sonraki: string } {
  if (kayit) return { st: kayit.siddet || 'Normal', sonraki: 'Kayıtlı sıkılık' };
  return gecisDurumu(lotlar, lotAnahtari(d.parcaNo, d.tedarikci));
}

const sayilarVar = (d: LotDegeri) => [d.bKr, d.bMj, d.bMn].every((x) => x != null);

// Uygulamadaki toplama: sıkılık, sınıf başına plan ve karar (sayılar girilmeden "Bekliyor").
export function lotTopla(lotlar: readonly Lot[], d: LotDegeri, kayit: Lot | null): LotDegeri {
  const st = lotSikiligi(lotlar, d, kayit);
  const sev = st.st === SIKI ? SIKI : 'Normal';
  const rows = planHucreleri(d.N, d.seviye, d, sev);
  const plan: Record<string, LotPlani> = {};
  rows.forEach((r) => { if (r.p) plan[r.c] = { kod: r.p.kodK, n: r.p.n, ac: r.p.ac, re: r.p.re, aql: r.a }; });
  const b = bulunanlar(d);
  const hepsi = rows.every((r) => r.p) && sayilarVar(d);
  const karar = hepsi ? (rows.every((r) => (b[r.c] ?? 0) <= r.p!.ac) ? 'Kabul' : 'Ret') : 'Bekliyor';
  return { ...d, siddet: sev, plan, karar };
}

export function lotEksikleri(d: LotDegeri): { metin: string; adim: number; alan?: string }[] {
  return [
    ...(!(Number(d.N) >= 2) ? [{ metin: 'Geçerli bir parti büyüklüğü girin', adim: 0, alan: 'N' }] : []),
    ...(!sayilarVar(d) ? [{ metin: 'Bulunan uygunsuz sayılarını girin (yoksa 0)', adim: 2 }] : []),
  ];
}

export function lotKayitEngeli(lotlar: readonly Lot[], d: LotDegeri, kayit: Lot | null): string | null {
  const st = lotSikiligi(lotlar, d, kayit);
  if (!kayit && st.st === 'Durduruldu') return 'Bu parça ve tedarikçi için kabul muayenesi durduruldu. Önce Sıkılık geçiş tablosundan yeniden başlatın.';
  const sev = st.st === SIKI ? SIKI : 'Normal';
  if (planHucreleri(d.N, d.seviye, d, sev).some((r) => !r.p)) return 'Geçerli bir parti büyüklüğü girin.';
  if (!sayilarVar(d)) return 'Her sınıf için bulunan uygunsuz sayısını girin (yoksa 0).';
  return null;
}

export function retAciklamasi(d: LotDegeri): string {
  const b = bulunanlar(d);
  return SINIFLAR.filter((c) => d.plan?.[c] && (b[c] ?? 0) > (d.plan[c]!.ac ?? 0)).map((c) => `${c}: ${b[c]} bulundu (Ac ${d.plan![c]!.ac})`).join('; ');
}

export function lotRetNcrOnDegeri(d: LotDegeri): Record<string, unknown> {
  return {
    kaynak: d.tedarikci ? 'Giriş muayene' : 'Final muayene', ciddiyet: (d.bKr ?? 0) > 0 ? 'Kritik' : 'Majör',
    parcaNo: d.parcaNo, parcaAdi: d.parcaAdi, lot: d.lotNo, miktar: d.N, tedarikci: d.tedarikci,
    tanim: `${d.no} AQL lot muayenesinde ret (${d.siddet}, seviye ${d.seviye}). ${retAciklamasi(d)}. ${d.not || ''}`,
  };
}

// OC özeti: AQL'de kabul olasılığı, %95 ve %10 kabul edilen hata oranları ve AOQL (en kötü ortalama çıkış kalitesi).
export function ocOzeti(p: AqlPlani, aql: string, N: number) {
  const p95 = oranBul(p.n, p.ac, 0.95);
  const p10 = oranBul(p.n, p.ac, 0.10);
  const aq = aql === YUZDE_YUZ ? null : parseFloat(aql) / 100;
  let aoql = 0;
  for (let k = 1; k <= 200; k++) {
    const x = p10 * 1.5 * k / 200;
    const v = x * kabulOlasiligi(p.n, p.ac, x) * Math.max(0, N - p.n) / N;
    if (v > aoql) aoql = v;
  }
  return { aqldeKabul: aq != null ? kabulOlasiligi(p.n, p.ac, aq) : null, p95, p10, aoql };
}

// OC eğrisi: seçili sıkılık ve karşılaştırma için öteki sıkılık (yalnız %100 değilse).
export function ocEgrisi(N: number, lvl: string, aql: string, sev: string, p: AqlPlani) {
  const pmax = Math.min(1, oranBul(p.n, p.ac, 0.01) * 1.15);
  const obur = aql === YUZDE_YUZ ? null : aqlPlani(N, lvl, aql, sev === SIKI ? 'Normal' : SIKI);
  const xs: string[] = [];
  const ys: number[] = [];
  const yt: number[] = [];
  for (let i = 0; i <= 60; i++) {
    const x = pmax * i / 60;
    xs.push((x * 100).toFixed(x * 100 < 1 ? 3 : 2));
    ys.push(kabulOlasiligi(p.n, p.ac, x));
    if (obur) yt.push(kabulOlasiligi(obur.n, obur.ac, x));
  }
  return { xs, ys, yt, obur };
}

export const tedarikciAdi = (sup: readonly Tedarikci[], id?: string) => (id ? sup.find((s) => s._id === id)?.ad : undefined) ?? 'İç üretim';

export function tedarikciBazinda(lotlar: readonly Lot[], sup: readonly Tedarikci[]): { ad: string; kabul: number; ret: number }[] {
  const m = new Map<string, { kabul: number; ret: number }>();
  lotlar.filter((l) => l.tip !== 'reset' && !l.yenidenSunum).forEach((l) => {
    const ad = tedarikciAdi(sup, l.tedarikci);
    const x = m.get(ad) ?? { kabul: 0, ret: 0 };
    if (l.karar === 'Kabul') x.kabul++; else x.ret++;
    m.set(ad, x);
  });
  return [...m.entries()].map(([ad, x]) => ({ ad, ...x }));
}

export function lotSuz(lotlar: readonly Lot[]): Lot[] {
  return lotlar.filter((l) => l.tip !== 'reset').sort((a, b) => (b.tarih ?? '').localeCompare(a.tarih ?? '') || (b.no ?? '').localeCompare(a.no ?? ''));
}

// İkinci menü sayacı: normal olmayan parça/tedarikçi sayısı; durdurulan varsa kötü.
export function lotSayaci(lotlar: readonly Lot[]): { n: number; kotu: boolean } | null {
  const k = butunAnahtarlar(lotlar).filter((x) => x.s.st !== 'Normal');
  return k.length ? { n: k.length, kotu: k.some((x) => x.s.st === 'Durduruldu') } : null;
}

export const sikilikTonu = (st?: string) => (st === 'Normal' ? 'tamam' : st === SIKI ? 'uyari' : 'hata');
