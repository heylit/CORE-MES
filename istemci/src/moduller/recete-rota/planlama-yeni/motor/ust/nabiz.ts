import type { PlanlamaCalismasi } from '../../tipler.ts';
import {
  degisenIs, donemAraligi, donemEtiketi, donemKumesi, donemYaz, nabizFarki, nabizOlc, nabizReferansi, nabizTarihcesi, saatYazi,
  type Derleme, type Donem, type NabizGostergesi, type NabizReferansi, type OkunanPlan,
} from '../kurallar.ts';

// Plan nabzı (zh-nabiz.betik nbHtml, zs-olcek-ortak dönem): altı gösterge seçili dönemle ölçülür, referans aynı dönemle. Gecikme
// ağırlıksız saattir (dönemler arası kıyas). TL karşılığı bedel ayarı ve maliyet ister; burada saat gösterilir.
export interface NabizTanimi { id: NabizGostergesi; ad: string; simge: 'check' | 'alert' | 'clock' | 'gauge' | 'wrench' | 'rotate'; kucukIyi: boolean; sayfa: string; ipucu: string }
export const NABIZ_GOSTERGELERI: readonly NabizTanimi[] = [
  { id: 'zam', ad: 'Zamanında', simge: 'check', kucukIyi: false, sayfa: 'siparisler', ipucu: 'Termininden önce biten siparişlerin payı.' },
  { id: 'late', ad: 'Geç sipariş', simge: 'alert', kucukIyi: true, sayfa: 'siparisler', ipucu: 'Termininden sonra biten sipariş sayısı.' },
  { id: 'wT', ad: 'Gecikme', simge: 'clock', kucukIyi: true, sayfa: 'tahta', ipucu: 'Seçili dönemdeki siparişlerin toplam gecikmesi (saat).' },
  { id: 'dar', ad: 'Darboğaz', simge: 'gauge', kucukIyi: true, sayfa: 'tezgahlar', ipucu: 'En dolu tezgâhın doluluğu; %95 üstü sıkışma demektir.' },
  { id: 'suH', ad: 'Ayar', simge: 'wrench', kucukIyi: true, sayfa: 'ayar', ipucu: 'Planın toplam ayar süresi.' },
  { id: 'deg', ad: 'Değişen iş', simge: 'rotate', kucukIyi: true, sayfa: 'senaryolar', ipucu: 'Referansa göre tezgâhı ya da 8 saatten çok yeri değişen iş.' },
];
export function nabizDegeri(id: NabizGostergesi, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  return id === 'zam' || id === 'dar' ? `%${Math.round(v)}` : id === 'wT' || id === 'suH' ? saatYazi(v) : String(v);
}

type Olcu = Record<NabizGostergesi, number | null>;
export interface NabizDurumu {
  donemYazi: string; etiket: string; ref: NabizReferansi; surum: number;
  cur: Olcu; kar: Olcu | null; ozet: { metin: string; ton: '' | 'iyi' | 'kotu' };
  // Sürüm eğrisi yalnız bütün planı kapsayan dönemde (yıl, kaydırılmamış).
  egri: Partial<Record<NabizGostergesi, number[]>>;
}
export function nabizDurumu(c: PlanlamaCalismasi, p: OkunanPlan, cx: Derleme, donem: Donem, kayma: number): NabizDurumu {
  const r = donemAraligi(cx.now, donem, kayma); const kume = donemKumesi(c, p, cx, r);
  const o = nabizOlc({ J: p.J, ops: p.ops }, kume, cx, r);
  const ref = nabizReferansi(c);
  const cur: Olcu = { zam: o.zam, late: o.late, wT: o.wT, dar: o.dar, suH: o.suH, deg: degisenIs(p.ops, ref.kayit?.ops ?? null) };
  const k = ref.kayit?.J && ref.kayit.ops ? nabizOlc({ J: ref.kayit.J, ops: ref.kayit.ops }, kume, cx, r) : null;
  const kar: Olcu | null = k ? { zam: k.zam, late: k.late, wT: k.wT, dar: k.dar, suH: k.suH, deg: 0 } : null;
  let iyi = 0, kotu = 0;
  if (kar) for (const g of NABIZ_GOSTERGELERI) { const f = nabizFarki(g.id, cur[g.id], kar[g.id], g.kucukIyi); if (f.ton === 'iyi') iyi++; if (f.ton === 'kotu') kotu++; }
  const ozet = !kar ? { metin: 'Karşılaştırma için referans yok.', ton: '' as const }
    : kotu ? { metin: `Referansa göre ${kotu} gösterge kötü, ${iyi} iyi.`, ton: 'kotu' as const }
      : iyi ? { metin: `Referansa göre ${iyi} gösterge iyi, kötüleşen yok.`, ton: 'iyi' as const } : { metin: 'Referansla aynı.', ton: '' as const };
  const tarihce = nabizTarihcesi(c);
  const egri: NabizDurumu['egri'] = {};
  if (donem === 'yil' && !kayma) for (const g of NABIZ_GOSTERGELERI) {
    if (g.id === 'deg') continue;
    const l = tarihce.map((x) => x.o?.[g.id]).filter((x): x is number => x != null && Number.isFinite(x)).slice(-20);
    const v = cur[g.id]; if (v != null && Number.isFinite(v)) l.push(v);
    if (l.length >= 2) egri[g.id] = l;
  }
  return { donemYazi: donemYaz(c.D, donem, r), etiket: donemEtiketi(donem, kayma), ref, surum: tarihce.length, cur, kar, ozet, egri };
}

// Sürüm eğrisinin noktaları (nbEgri): 64 x 18 kutu.
export function egriNoktalari(l: number[]): { noktalar: string; son: number } {
  const a = Math.min(...l), b = Math.max(...l); const W = 64, H = 18;
  const y = (v: number) => (b - a < 1e-9 ? H / 2 : H - 2 - (v - a) / (b - a) * (H - 4));
  return { noktalar: l.map((v, i) => `${(i / (l.length - 1) * W).toFixed(1)},${y(v).toFixed(1)}`).join(' '), son: Number(y(l[l.length - 1] ?? 0).toFixed(1)) };
}

// Şu anki planı referans al (nb-sabitle): ölçü, kısa iş kaydı [tezgâh, başlangıç, bitiş, ayar] ve sipariş [bitiş, gecikme].
export function sabitReferans(p: OkunanPlan, cur: Record<string, number | null>, an: Date) {
  const iki = (x: number) => String(x).padStart(2, '0');
  const ad = `${iki(an.getDate())}.${iki(an.getMonth() + 1)} ${iki(an.getHours())}:${iki(an.getMinutes())}`;
  const ops: Record<string, [string, number, number, number]> = {};
  for (const [id, r] of Object.entries(p.ops)) if (Number.isFinite(r.S)) ops[id] = [r.m, Math.round(r.S * 4) / 4, Math.round(r.C * 4) / 4, r.su];
  const J: Record<string, [number | null, number | null]> = {};
  for (const [id, x] of Object.entries(p.J)) J[id] = [x.C, x.T];
  const { deg: _, ...o } = cur;
  return { ad, o, ops, J };
}

export { nabizFarki };
