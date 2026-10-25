import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatYaz, saKisa, sayiEki, sayiYaz } from '../kurallar.ts';
import { grupAdi, yorumlar, type Metin, type OzetVerisi, type Yorum } from '../ozet/veri.ts';

// Keşfet (zn-kesif.betik): planı başka gözle okumak. Gösterimler ekrandaki genişlikte çizilir (W), yazı her genişlikte aynı boyda kalır.
export type KesifGorunumu = 'pay' | 'hat' | 'hazir' | 'anlat';
export type Ton = 'hata' | 'uyari' | 'tamam' | 'bilgi';
export const KESIF_GORUNUMLERI: [KesifGorunumu, string, 'flag' | 'layers' | 'check' | 'play', string][] = [
  ['pay', 'Pay şeridi', 'flag', 'Her nokta bir sipariş. Sağa gittikçe termine daha çok pay var; kırmızı bölge geç.'],
  ['hat', 'Sipariş hatları', 'layers', 'Her çizgi bir siparişin atölyedeki yolu. Büyük durak, o bölümde uzun bekleme demek.'],
  ['hazir', 'Hazırlık', 'check', 'Emir üretime hazır mı? Durduran madde eksikse emir taslaktır, kesin plana giremez.'],
  ['anlat', 'Planı anlat', 'play', 'Plan birkaç adımda, sırayla. Kendiliğinden ilerler; oklarla da gezilir.'],
];
// Planı anlat kendiliğinden bu aralıkla ilerler (ksZamanla).
export const ANLAT_SURE_MS = 7000;

// Pay: planlanan bitişle termin arası (saat); termini olmayan siparişin payı yoktur.
const payi = (s: { due: number | null; C: number }): number | null => (s.due == null ? null : s.due - s.C);
export const payTonu = (p: number | null): Ton => (p == null ? 'tamam' : p < 0 ? 'hata' : p < 24 ? 'uyari' : 'tamam');
export function payGun(h: number): string { const g = Math.abs(h) / 24; return g < 1 ? `${sayiYaz(Math.abs(h), 0)} sa` : `${sayiYaz(g, g < 10 ? 1 : 0)} gün`; }
export const payYazi = (p: number): string => (p < 0 ? `${payGun(p)} geç` : `${payGun(p)} pay`);

export function paySayilari(v: OzetVerisi): { gec: number; risk: number; rahat: number } {
  const l = v.sip.map(payi).filter((p): p is number => p != null);
  const gec = l.filter((p) => p < 0).length, risk = l.filter((p) => p >= 0 && p < 24).length;
  return { gec, risk, rahat: l.length - gec - risk };
}

export interface PayNoktasi { id: string; urun: string; p: number; C: number; x: number; y: number; ton: Ton; i: number }
export interface PayDuzeni {
  W: number; H: number; r: number; ust: number; pad: number; orta: number; x0: number; x1: number;
  tikler: { p: number; x: number; yazi: string; yon: 'start' | 'middle' | 'end' }[]; noktalar: PayNoktasi[]; etiketli: Set<string>;
}
// Arı kovanı dağılımı (ksPaySvg): noktalar üst üste binmez, aynı paydakiler dikine dizilir.
export function payDuzeni(v: OzetVerisi, olcu: number, kucuk: boolean, secJob: string | null): PayDuzeni | null {
  const l = v.sip.flatMap((s) => { const p = payi(s); return p == null ? [] : [{ s, p }]; }).sort((a, b) => a.p - b.p);
  const ilk = l[0], son = l[l.length - 1];
  if (!ilk || !son) return null;
  const W = Math.max(320, olcu || (kucuk ? 600 : 1000)), r = W < 520 ? 7 : kucuk ? 8 : 10, ust = 34, pad = W < 520 ? 16 : kucuk ? 40 : 72;
  const min = Math.min(-24, Math.floor(ilk.p / 24) * 24), max = Math.max(72, Math.min(240, Math.ceil(son.p / 24) * 24));
  const X = (p: number) => pad + (Math.max(min, Math.min(max, p)) - min) / (max - min) * (W - 2 * pad);
  const yer: { x: number; y: number; s: (typeof l)[number] }[] = []; let yMax = 0;
  for (const o of l) {
    const x = X(o.p); let k = 0, y = 0;
    for (;;) { y = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (2 * r + 3); if (!yer.some((q) => Math.hypot(q.x - x, q.y - y) < 2 * r + 2)) break; k++; }
    yer.push({ x, y, s: o }); yMax = Math.max(yMax, Math.abs(y));
  }
  const orta = ust + yMax + r + 14, H = orta + yMax + r + 34;
  const x0 = X(0), x1 = X(24);
  const tik: number[] = []; for (let p = Math.ceil(min / 24) * 24; p <= max; p += 24) tik.push(p);
  const adim = Math.max(1, Math.ceil(tik.length / Math.max(3, Math.floor(W / 110))));
  const tikler = tik.filter((p, i) => p === 0 || (i % adim === 0 && Math.abs(X(p) - x0) > 64)).map((p) => {
    const x = X(p);
    return { p, x, yazi: p === 0 ? 'termin' : p < 0 ? `${payGun(p)} geç` : `+${payGun(p)}`, yon: x < 50 ? 'start' as const : x > W - 50 ? 'end' as const : 'middle' as const };
  });
  const noktalar = yer.map(({ x, y, s: o }, i) => ({ id: o.s.id, urun: o.s.urun, p: o.p, C: o.s.C, x, y: orta + y, ton: payTonu(o.p), i }));
  // Etiket: seçili sipariş ve en geç üç sipariş, yalnız geniş gösterimde.
  const etiketli = new Set(kucuk || W < 520 ? [] : noktalar.filter((n, i) => n.id === secJob || (n.p < 0 && i < 3)).map((n) => n.id));
  return { W, H, r, ust, pad, orta, x0, x1, tikler, noktalar, etiketli };
}

export interface HatSatiri {
  id: string; y: number; ton: Ton; yol: string; ad: string; duraklar: { g: string; ad: string; x: number; r: number; bek: number }[]; son: string; i: number;
}
export interface HatDuzeni {
  W: number; H: number; sol: number; sag: number; ust: number; ara: number; sutunlar: { g: string; ad: string; x: number }[];
  satirlar: HatSatiri[]; yolSayisi: number; enSik: { yol: string; n: number } | null;
}
// Sipariş hatları (ksHat): sütunlar rota sırasındaki bölümler; aynı yoldan geçen siparişler yan yana toplanır.
export function hatDuzeni(v: OzetVerisi, olcu: number): HatDuzeni {
  const gr = v.gruplar;
  const fark = (s: OzetSiparisiK) => payi(s) ?? Infinity;
  const sip = [...v.sip].sort((a, b) => a.yol.join('>').localeCompare(b.yol.join('>')) || (fark(b) < fark(a) ? 1 : -1));
  const sol = 76, sag = 104, ust = 44, ara = 26, W = Math.max(sol + sag + gr.length * 52, olcu || 900);
  const cx = (g: string) => sol + (gr.indexOf(g) + 0.5) * (W - sol - sag) / gr.length;
  const H = ust + sip.length * ara + 20;
  const bekMax = Math.max(1, ...sip.flatMap((s) => s.adim.map((a) => a.bek)));
  const say: Record<string, number> = {}; for (const s of sip) { const k = s.yol.join('>'); say[k] = (say[k] ?? 0) + 1; }
  const enSik0 = Object.entries(say).sort((a, b) => b[1] - a[1])[0];
  const satirlar = sip.map((s, i) => {
    const y = ust + i * ara + ara / 2; const p = payi(s); const ton: Ton = s.gec ? 'hata' : p != null && p < 24 ? 'uyari' : 'tamam';
    const nok = s.yol.map(cx);
    const yol = nok.length ? `M${sol - 8},${y} L${nok.map((x) => `${x.toFixed(1)},${y}`).join(' L')} L${W - sag + 8},${y}` : '';
    // Durakta bekleme: o bölümdeki adımların beklemesi toplanır.
    const bek: Record<string, number> = {}; for (const a of s.adim) bek[a.g] = (bek[a.g] ?? 0) + a.bek;
    return {
      id: s.id, y, ton, yol, ad: s.yol.map(grupAdi).join(', '), i,
      duraklar: s.yol.map((g) => { const b = bek[g] ?? 0; return { g, ad: grupAdi(g), x: cx(g), r: 4 + Math.sqrt(b / bekMax) * 8, bek: b }; }),
      son: p == null ? '—' : p < 0 ? `+${saKisa(-p)} geç` : `${saKisa(p)} pay`,
    };
  });
  return {
    W, H, sol, sag, ust, ara, sutunlar: gr.map((g) => ({ g, ad: grupAdi(g), x: cx(g) })), satirlar,
    yolSayisi: Object.keys(say).length, enSik: enSik0 ? { yol: enSik0[0].split('>').map(grupAdi).join(' › '), n: enSik0[1] } : null,
  };
}
type OzetSiparisiK = OzetVerisi['sip'][number];

// Planı anlat (ksAdimlar): veriden çıkan gözlemler sırayla, her biri kendi gösterimiyle.
export type AnlatGorseli = 'pay' | 'bekle' | 'sure' | 'yuk' | null;
export interface AnlatAdimi { simge: Yorum['simge'] | 'check'; ton: Ton; baslik: string; m: Metin; gorsel: AnlatGorseli }
const ADIM_AD: Partial<Record<Yorum['simge'], string>> = {
  target: 'Ne bekletiyor', clock: 'Süre nereye gidiyor', grid: 'En yoğun gün', gauge: 'Doluluk', wrench: 'Ayarlar', alert: 'Geç siparişler', flag: 'Teslim',
};
const ADIM_GORSEL: Partial<Record<Yorum['simge'], AnlatGorseli>> = { target: 'bekle', clock: 'sure', grid: 'yuk', gauge: 'yuk' };
export const HAZIRLIK_YOK = 'Emir hazırlık verisi bu ekrana bağlı değil.';
// Gözlemler seçili dönemden (Soru 485/1 b; eski sayfa son Özet çiziminin önbelleğini gösteriyordu).
export function anlatAdimlari(c: PlanlamaCalismasi, v: OzetVerisi, tezGrup: (m: string) => string): AnlatAdimi[] {
  const n = v.sip.length, gec = v.sip.filter((s) => s.gec).length;
  const son = n ? Math.max(...v.sip.map((s) => s.C)) : null;
  const l: AnlatAdimi[] = [{
    simge: 'flag', ton: gec ? 'hata' : 'tamam', baslik: 'Büyük resim', gorsel: 'pay',
    m: ['Planda ', { b: String(n) }, ' sipariş var. ', { b: String(n - gec) }, `${sayiEki(n - gec, 'i')} zamanında, `, { b: String(gec) }, `${sayiEki(gec, 'i')} geç. Son iş `, { b: saatYaz(c.D, son) }, ' bitiyor.'],
  }];
  for (const y of yorumlar(c, v, tezGrup).slice(1)) l.push({ simge: y.simge, ton: y.ton, baslik: ADIM_AD[y.simge] ?? 'Gözlem', m: y.m, gorsel: ADIM_GORSEL[y.simge] ?? null });
  // Hazırlık maddeleri için veri kaynağı yok; eski sayfa durumları sipariş kimliğinden uyduruyordu.
  l.push({ simge: 'check', ton: 'bilgi', baslik: 'Hazırlık', m: [HAZIRLIK_YOK], gorsel: null });
  return l;
}
