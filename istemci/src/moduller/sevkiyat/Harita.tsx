// Çevrimdışı harita: sunucudaki veri paketinden kendi çizimimiz (Canvas 2D); karo sunucusu ya da internet gerekmez.
// İki katman: taban (arazi, yollar, trafik) yalnız görünüm, trafik ya da tema değişince; üst katman (rotalar, adlar,
// işaretler) plan değişince tabanın üstüne çizilir. Kaydırırken son görüntü taşınır, tam çizim el çekilince yapılır.
// Renk ve ölçüler tasarım değişkenlerinden okunur.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { Harita as HaritaVerisi } from '#paylasilan/sozlesme/sevkiyat.ts';

export type Konum = [boylam: number, enlem: number];
export interface HaritaKolu { sigdir(noktalar: Konum[]): void; yakinlastir(katsayi: number): void; ortala(boylam: number, enlem: number, olcek?: number): void }
// renk: araç renk sırası (1-6), 0 bekleyen iş; null tek rota rengi.
export interface HaritaCizgisi { renk: number | null; cizgi: Konum[][]; soluk?: boolean }
export interface HaritaIsareti {
  boylam: number; enlem: number; etiket: string; renk: number | null; sekil: 'yuvarlak' | 'kare';
  ok?: '↑' | '↓'; bos?: boolean; vurgu?: boolean; soluk?: boolean; anahtar?: string;
}
export interface HaritaNoktasi { id: number; ad: string; boylam: number; enlem: number }
export interface HaritaOzellikleri {
  harita: HaritaVerisi; trafik: readonly number[] | null;
  cizgiler: readonly HaritaCizgisi[]; isaretler: readonly HaritaIsareti[]; noktalar: readonly HaritaNoktasi[];
  fabrika: { boylam: number; enlem: number } | null; imlec?: { boylam: number; enlem: number; etiket?: string } | null;
  secimKipi?: boolean; onSec?: (boylam: number, enlem: number) => void; onNokta?: (id: number) => void; onIsaret?: (anahtar: string) => void;
  etiket: string;
}

const KM_ENLEM = 110.54;
const SADELESTIRME_KM = [0.35, 0.13, 0.05, 0.02, 0.006];
const duzeyi = (olcek: number) => (olcek < 3 ? 0 : olcek < 8 ? 1 : olcek < 20 ? 2 : olcek < 50 ? 3 : 4);
const HUCRE_KM = 8, ARA_SOKAK_HUCRE_KM = 4;
const hucreBoyu = (duzey: number, hucre: number) => (duzey >= 3 ? Math.min(hucre, 2) : duzey === 2 ? Math.min(hucre, 4) : hucre);
const hucreNo = (x: number, y: number, hucre: number) => Math.floor(x / hucre) * 1000 + Math.floor(y / hucre);
const EN_KUCUK_OLCEK = 0.8, EN_BUYUK_OLCEK = 80;

interface Parca { dizi: Float32Array; boy: number; hucre: number; ortaX: number; ortaY: number }
function parca(dizi: Float32Array, hucre: number): Parca {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < dizi.length; i += 2) { const x = dizi[i]!, y = dizi[i + 1]!; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return { dizi, boy: Math.max(x1 - x0, y1 - y0), hucre: hucreNo(dizi[0]!, dizi[1]!, hucre), ortaX: (x0 + x1) / 2, ortaY: (y0 + y1) / 2 };
}
function yolaEkle(yol: Path2D, p: Parca, esik: number, kapali: boolean) {
  const a = p.dizi, n = a.length; if (n < 4 || (esik && p.boy < esik * (kapali ? 2 : 0.6))) return;
  const esikKare = esik * esik; let sonX = a[0]!, sonY = a[1]!; yol.moveTo(sonX, sonY);
  for (let i = 2; i < n; i += 2) {
    const x = a[i]!, y = a[i + 1]!;
    if (i < n - 2 && (x - sonX) ** 2 + (y - sonY) ** 2 < esikKare) continue;
    yol.lineTo(x, y); sonX = x; sonY = y;
  }
  if (kapali) yol.closePath();
}

interface Palet {
  zemin: string; kentsel: string; sanayi: string; yesil: string; su: string; havalimani: string; araSokak: string; yol: string; kenar: string;
  yazi: string; hale: string; vurgu: string; nokta: string; trafik: [string, string, string, string]; araclar: string[]; rota: string; bekleyen: string;
  font: string; yaziKucuk: number; yaziOrta: number; birim: number;
}
function paletOku(oge: HTMLElement): Palet {
  const stil = getComputedStyle(oge), d = (ad: string) => stil.getPropertyValue(ad).trim();
  const px = (ad: string, yedek: number) => Number.parseFloat(d(ad)) || yedek;
  return {
    zemin: d('--bg2'), kentsel: d('--hi'), sanayi: d('--edge'), yesil: d('--run'), su: d('--done'), havalimani: d('--grid'),
    araSokak: d('--edge2'), yol: d('--faint'), kenar: d('--bg'), yazi: d('--muted'), hale: d('--bg2'), vurgu: d('--stop'), nokta: d('--hazard-ink'),
    trafik: [d('--run'), d('--hazard'), d('--hold'), d('--stop')],
    araclar: [1, 2, 3, 4, 5, 6].map((i) => d(`--arac-rengi-${i}`)), rota: d('--bp'), bekleyen: d('--idle'),
    font: d('--font-ana') || 'sans-serif', yaziKucuk: px('--yazi-xs', 12), yaziOrta: px('--yazi-s', 14), birim: px('--b-1', 4),
  };
}

export const Harita = forwardRef<HaritaKolu, HaritaOzellikleri>(function Harita(ozellik, kol) {
  const sarmal = useRef<HTMLDivElement>(null), tuval = useRef<HTMLCanvasElement>(null);
  const durum = useRef({
    merkezX: 0, merkezY: 0, olcek: 3, genislik: 0, yukseklik: 0, piksel: 1, kirli: true, tabanKirli: true,
    palet: null as Palet | null, sonGirdi: 0, goruntu: null as null | { x: number; y: number; olcek: number },
    taban: null as null | { x: number; y: number; olcek: number; genislik: number; yukseklik: number; piksel: number },
    sigdirma: null as null | { noktalar: Konum[]; zaman: number },
  });
  const guncel = useRef(ozellik); guncel.current = ozellik;
  const [bati, , , kuzey] = ozellik.harita.sinir;
  const kmBoylam = 111.32 * Math.cos((((ozellik.harita.sinir[1] + kuzey) / 2) * Math.PI) / 180);
  const X = (boylam: number) => (boylam - bati) * kmBoylam, Y = (enlem: number) => (kuzey - enlem) * KM_ENLEM;
  const geometri = useRef<null | {
    alanlar: Record<'kentsel' | 'sanayi' | 'yesil' | 'havalimani' | 'su', Parca[]>; demiryolu: Parca[]; araSokak: Parca[]; kenarlar: Parca[];
    kenarSinifi: readonly number[]; onbellek: Map<string, unknown>; trafikAnahtari: string;
  }>(null);

  // geometri bir kez hazırlanır (km koordinatı)
  useEffect(() => {
    const h = ozellik.harita, [hBati, hGuney] = h.sinir;
    const cevir = (halka: readonly number[]) => { const a = new Float32Array(halka.length); for (let i = 0; i < halka.length; i += 2) { a[i] = X(halka[i]! / h.olcek + hBati); a[i + 1] = Y(halka[i + 1]! / h.olcek + hGuney); } return a; };
    const alan = (liste: readonly (readonly (readonly number[])[])[]) => liste.flatMap((halkalar) => halkalar.map((r) => parca(cevir(r), HUCRE_KM)));
    const [yBati, yGuney] = h.yolSinir, kenarlar: Parca[] = [];
    for (let e = 0; e < h.kenarSinifi.length; e++) {
      const bas = h.geometriBaslangici[e]!, uzunluk = h.geometriUzunlugu[e]!, a = new Float32Array(uzunluk * 2);
      for (let j = 0; j < uzunluk; j++) { a[2 * j] = X(h.geometri[2 * (bas + j)]! / h.yolOlcek + yBati); a[2 * j + 1] = Y(h.geometri[2 * (bas + j) + 1]! / h.yolOlcek + yGuney); }
      kenarlar.push(parca(a, HUCRE_KM));
    }
    geometri.current = {
      alanlar: { kentsel: alan(h.kentsel), sanayi: alan(h.sanayi), yesil: alan(h.yesil), havalimani: alan(h.havalimani), su: alan(h.su) },
      demiryolu: h.demiryolu.map((l) => parca(cevir(l), HUCRE_KM)), araSokak: h.araSokaklar.map((l) => parca(cevir(l), ARA_SOKAK_HUCRE_KM)),
      kenarlar, kenarSinifi: h.kenarSinifi, onbellek: new Map(), trafikAnahtari: '',
    };
    durum.current.kirli = durum.current.tabanKirli = true;
  }, [ozellik.harita]);

  useEffect(() => {
    const g = geometri.current; if (!g) return;
    for (const k of [...g.onbellek.keys()]) if (k.startsWith('t|')) g.onbellek.delete(k);
    durum.current.kirli = durum.current.tabanKirli = true;
  }, [ozellik.trafik]);
  useEffect(() => { durum.current.kirli = true; }, [ozellik.cizgiler, ozellik.isaretler, ozellik.noktalar, ozellik.fabrika, ozellik.imlec]);

  const sigdir = (noktalar: Konum[]) => {
    const s = durum.current; if (!noktalar.length) return;
    s.sigdirma = { noktalar, zaman: performance.now() };
    if (!s.genislik) return;
    const pay = (s.palet?.birim ?? 4) * 12;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [boylam, enlem] of noktalar) { const x = X(boylam), y = Y(enlem); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    s.merkezX = (x0 + x1) / 2; s.merkezY = (y0 + y1) / 2;
    s.olcek = Math.min(60, Math.max(1.2, Math.min((s.genislik - 2 * pay) / Math.max(0.5, x1 - x0), (s.yukseklik - 2 * pay) / Math.max(0.5, y1 - y0))));
    s.kirli = true;
  };
  const sigdirKolu = useRef(sigdir); sigdirKolu.current = sigdir;
  useImperativeHandle(kol, () => ({
    sigdir,
    yakinlastir: (k) => { const s = durum.current; s.olcek = Math.min(EN_BUYUK_OLCEK, Math.max(EN_KUCUK_OLCEK, s.olcek * k)); s.kirli = true; },
    ortala: (boylam, enlem, olcek) => { const s = durum.current; s.merkezX = X(boylam); s.merkezY = Y(enlem); if (olcek) s.olcek = olcek; s.kirli = true; },
  }));

  useEffect(() => {
    const c = tuval.current!, oge = sarmal.current!, s = durum.current;
    // Tarayıcı dışı ortamda (test) çizim yapılmaz.
    if (typeof Path2D === 'undefined' || typeof ResizeObserver === 'undefined' || !c.getContext('2d')) return;
    const taban = document.createElement('canvas'), ust = document.createElement('canvas');
    const boyutla = () => {
      const r = oge.getBoundingClientRect(), piksel = Math.min(1.5, window.devicePixelRatio || 1);
      if (r.width === s.genislik && r.height === s.yukseklik && piksel === s.piksel && s.palet) return;
      s.genislik = r.width; s.yukseklik = r.height; s.piksel = piksel; c.width = Math.round(r.width * piksel); c.height = Math.round(r.height * piksel);
      s.palet = paletOku(oge); s.goruntu = null; s.kirli = s.tabanKirli = true;
      if (s.genislik && s.sigdirma && s.sonGirdi < s.sigdirma.zaman) sigdirKolu.current(s.sigdirma.noktalar);
    };
    const gozlem = new ResizeObserver(boyutla); gozlem.observe(oge); boyutla();
    const [b0, g0, d0, k0] = guncel.current.harita.sinir; s.merkezX = X((b0 + d0) / 2); s.merkezY = Y((g0 + k0) / 2);
    s.olcek = Math.min(s.genislik / ((d0 - b0) * kmBoylam), s.yukseklik / ((k0 - g0) * KM_ENLEM)) * 1.35 || 8;
    const temaGozlemi = new MutationObserver(() => { s.palet = paletOku(oge); s.kirli = s.tabanKirli = true; });
    temaGozlemi.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const PAY = () => (s.palet?.birim ?? 4) * 25; // kaydırırken boşluk görünmesin

    type Geometri = NonNullable<typeof geometri.current>;
    const alanYollari = (g: Geometri, ad: keyof Geometri['alanlar'], duzey: number) => {
      const anahtar = `a|${ad}|${duzey}`; let m = g.onbellek.get(anahtar) as Map<number, { yol: Path2D; boy: number }> | undefined;
      if (!m) {
        m = new Map();
        for (const p of g.alanlar[ad]) { const no = hucreNo(p.ortaX, p.ortaY, HUCRE_KM); let q = m.get(no); if (!q) m.set(no, (q = { yol: new Path2D(), boy: 0 })); q.boy = Math.max(q.boy, p.boy); yolaEkle(q.yol, p, SADELESTIRME_KM[duzey]!, true); }
        g.onbellek.set(anahtar, m);
      }
      return m;
    };
    const cizgiYollari = (g: Geometri, ad: 'araSokak' | 'demiryolu', duzey: number, hucre: number) => {
      const anahtar = `c|${ad}|${duzey}`; let m = g.onbellek.get(anahtar) as Map<number, Path2D> | undefined;
      if (!m) { m = new Map(); for (const p of g[ad]) { const no = hucreNo(p.dizi[0]!, p.dizi[1]!, hucre); let yol = m.get(no); if (!yol) m.set(no, (yol = new Path2D())); yolaEkle(yol, p, SADELESTIRME_KM[duzey]!, false); } g.onbellek.set(anahtar, m); }
      return m;
    };
    const trafikYollari = (g: Geometri, duzey: number, hucre: number) => {
      const anahtar = `t|${duzey}`; let m = g.onbellek.get(anahtar) as Map<number, (Path2D | null)[][]> | undefined;
      if (!m) {
        m = new Map(); const seviye = guncel.current.trafik;
        g.kenarlar.forEach((p, e) => {
          const no = hucreNo(p.dizi[0]!, p.dizi[1]!, hucre); let dizi = m!.get(no); if (!dizi) m!.set(no, (dizi = [0, 1, 2, 3, 4].map(() => [null, null, null, null])));
          const sinif = Math.min(4, g.kenarSinifi[e]!), kova = seviye ? seviye[e] ?? 0 : 0; let yol = dizi[sinif]![kova]; if (!yol) dizi[sinif]![kova] = yol = new Path2D();
          yolaEkle(yol, p, SADELESTIRME_KM[duzey]!, false);
        });
        g.onbellek.set(anahtar, m);
      }
      return m;
    };
    const boyutlandir = (t: HTMLCanvasElement) => { const pay = PAY(), w = Math.round((s.genislik + 2 * pay) * s.piksel), h = Math.round((s.yukseklik + 2 * pay) * s.piksel); if (t.width !== w || t.height !== h) { t.width = w; t.height = h; } return [w, h] as const; };

    const tabanCiz = () => {
      const g = geometri.current, P = s.palet; if (!g || !P) return;
      const pay = PAY(), [w, h] = boyutlandir(taban), ctx = taban.getContext('2d')!, k = s.olcek, duzey = duzeyi(k);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = P.zemin; ctx.fillRect(0, 0, w, h);
      ctx.setTransform(k * s.piksel, 0, 0, k * s.piksel, (pay + s.genislik / 2 - s.merkezX * k) * s.piksel, (pay + s.yukseklik / 2 - s.merkezY * k) * s.piksel);
      const x0 = s.merkezX - (s.genislik / 2 + pay) / k, x1 = s.merkezX + (s.genislik / 2 + pay) / k, y0 = s.merkezY - (s.yukseklik / 2 + pay) / k, y1 = s.merkezY + (s.yukseklik / 2 + pay) / k;
      // Yeşil alan ve su durum renklerinden soluk tonla boyanır.
      for (const [ad, renk, saydamlik] of [['kentsel', P.kentsel, 1], ['sanayi', P.sanayi, 1], ['yesil', P.yesil, 0.12], ['havalimani', P.havalimani, 1], ['su', P.su, 0.22]] as const) {
        ctx.fillStyle = renk; ctx.globalAlpha = saydamlik;
        for (const [no, q] of alanYollari(g, ad, duzey)) {
          const gx = Math.floor(no / 1000 + 0.0005), gy = no - gx * 1000;
          if ((gx + 1) * HUCRE_KM + q.boy < x0 || gx * HUCRE_KM - q.boy > x1 || (gy + 1) * HUCRE_KM + q.boy < y0 || gy * HUCRE_KM - q.boy > y1) continue;
          ctx.fill(q.yol);
        }
      }
      ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.lineJoin = 'bevel';
      const px = (v: number) => (v * P.birim) / 4 / k;
      const gorunen = (hucre: number, m: Map<number, unknown>) => { const out: number[] = []; for (let gx = Math.floor(x0 / hucre) - 1; gx <= Math.floor(x1 / hucre); gx++) for (let gy = Math.floor(y0 / hucre) - 1; gy <= Math.floor(y1 / hucre); gy++) if (m.has(gx * 1000 + gy)) out.push(gx * 1000 + gy); return out; };
      if (k > 28) { const hucre = hucreBoyu(duzey, ARA_SOKAK_HUCRE_KM), m = cizgiYollari(g, 'araSokak', duzey, hucre); ctx.strokeStyle = P.araSokak; ctx.lineWidth = px(k > 45 ? 1.6 : 0.9); for (const no of gorunen(hucre, m)) ctx.stroke(m.get(no)!); }
      { const hucre = hucreBoyu(duzey, HUCRE_KM), m = cizgiYollari(g, 'demiryolu', duzey, hucre); ctx.setLineDash([px(4), px(3)]); ctx.strokeStyle = P.araSokak; ctx.lineWidth = px(1); for (const no of gorunen(hucre, m)) ctx.stroke(m.get(no)!); ctx.setLineDash([]); }
      const hucre = hucreBoyu(duzey, HUCRE_KM), m = trafikYollari(g, duzey, hucre), gorulen = gorunen(hucre, m);
      const kalinlik = [3.2, 2.6, 2.1, 1.5, 1.1].map((x) => x * Math.min(2.2, Math.max(0.75, Math.sqrt(k / 6))));
      const renkler = guncel.current.trafik ? P.trafik : [P.yol, P.yol, P.yol, P.yol];
      for (let sinif = 4; sinif >= 0; sinif--) {
        if (sinif >= 3 && k < 4) continue;
        if (k >= 6 && (sinif <= 2 || k >= 14)) { ctx.strokeStyle = P.kenar; ctx.lineWidth = px(kalinlik[sinif]! + 1.4); for (const no of gorulen) for (const q of m.get(no)![sinif]!) if (q) ctx.stroke(q); }
        ctx.lineWidth = px(kalinlik[sinif]!);
        for (let kova = 0; kova < 4; kova++) { ctx.strokeStyle = renkler[kova]!; for (const no of gorulen) { const q = m.get(no)![sinif]![kova]; if (q) ctx.stroke(q); } }
      }
      s.taban = { x: s.merkezX, y: s.merkezY, olcek: s.olcek, genislik: s.genislik, yukseklik: s.yukseklik, piksel: s.piksel };
    };

    const ustCiz = () => {
      const B = s.taban, P = s.palet; if (!B || !P) return;
      const pay = PAY(); boyutlandir(ust);
      const ctx = ust.getContext('2d')!, k = B.olcek, o = guncel.current, birim = P.birim;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(taban, 0, 0);
      ctx.setTransform(k * B.piksel, 0, 0, k * B.piksel, (pay + B.genislik / 2 - B.x * k) * B.piksel, (pay + B.yukseklik / 2 - B.y * k) * B.piksel);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const px = (v: number) => (v * birim) / 4 / k;
      const renkOf = (r: number | null) => (r === null ? P.rota : r === 0 ? P.bekleyen : P.araclar[(r - 1) % P.araclar.length]!);
      for (const c2 of [...o.cizgiler].sort((a, b) => Number(!a.soluk) - Number(!b.soluk))) {
        const yol = new Path2D(); for (const l of c2.cizgi) l.forEach(([boylam, enlem], i) => (i ? yol.lineTo(X(boylam), Y(enlem)) : yol.moveTo(X(boylam), Y(enlem))));
        ctx.globalAlpha = c2.soluk ? 0.3 : 1;
        ctx.strokeStyle = P.hale; ctx.lineWidth = px(c2.soluk ? 6 : 9); ctx.stroke(yol); ctx.strokeStyle = renkOf(c2.renk); ctx.lineWidth = px(c2.soluk ? 3.5 : 5); ctx.stroke(yol);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(B.piksel, 0, 0, B.piksel, pay * B.piksel, pay * B.piksel);
      const sx = (boylam: number) => B.genislik / 2 + (X(boylam) - B.x) * k, sy = (enlem: number) => B.yukseklik / 2 + (Y(enlem) - B.y) * k;
      const dolu: [number, number, number, number][] = [], bos = (x: number, y: number, w: number, h: number) => { if (dolu.some((r) => x < r[2] && x + w > r[0] && y < r[3] && y + h > r[1])) return false; dolu.push([x, y, x + w, y + h]); return true; };
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const yazi = (agirlik: number, boy: number) => `${agirlik} ${boy}px ${P.font}`;
      const kayma = new Map<string, number>(), isaretler = [...o.isaretler].sort((a, b) => Number(!a.soluk) - Number(!b.soluk)).map((i) => {
        const anahtar = i.boylam.toFixed(4) + ',' + i.enlem.toFixed(4), sira = kayma.get(anahtar) ?? 0; kayma.set(anahtar, sira + 1);
        return { ...i, x: sx(i.boylam) + sira * birim * 5.5, y: sy(i.enlem) };
      });
      for (const m of isaretler) dolu.push([m.x - birim * 4, m.y - birim * 7.5, m.x + birim * 4, m.y + birim]);
      const { olcek: q, sinir: [hb, hg] } = o.harita, sinifSiniri = k < 2.5 ? ['city', 'town'] : k < 6 ? ['city', 'town', 'suburb'] : null;
      for (const [ad, xq, yq, sinif] of o.harita.yerler) {
        if (sinifSiniri && !sinifSiniri.includes(sinif)) continue;
        const x = sx(xq / q + hb), y = sy(yq / q + hg); if (x < -pay || y < -pay || x > B.genislik + pay || y > B.yukseklik + pay) continue;
        const buyuk = sinif === 'city' || sinif === 'town';
        ctx.font = yazi(buyuk ? 700 : 500, buyuk ? P.yaziOrta : P.yaziKucuk);
        const w = ctx.measureText(ad).width + 6; if (!bos(x - w / 2, y - 8, w, 16)) continue;
        ctx.strokeStyle = P.hale; ctx.lineWidth = 3.2; ctx.lineJoin = 'round'; ctx.strokeText(ad, x, y); ctx.fillStyle = P.yazi; ctx.fillText(ad, x, y);
      }
      for (const n of o.noktalar) {
        if (isaretler.some((i) => i.boylam === n.boylam && i.enlem === n.enlem)) continue;
        const x = sx(n.boylam), y = sy(n.enlem); if (x < -pay || y < -pay || x > B.genislik + pay || y > B.yukseklik + pay) continue;
        ctx.fillStyle = P.hale; ctx.beginPath(); ctx.arc(x, y, birim * 1.5, 0, 7); ctx.fill(); ctx.strokeStyle = P.nokta; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, birim * 1.1, 0, 7); ctx.stroke();
        if (k > 2.5) { ctx.font = yazi(500, P.yaziKucuk); ctx.textAlign = 'left'; ctx.strokeStyle = P.hale; ctx.lineWidth = 3; ctx.strokeText(n.ad, x + birim * 2.2, y); ctx.fillStyle = P.yazi; ctx.fillText(n.ad, x + birim * 2.2, y); ctx.textAlign = 'center'; }
      }
      if (o.imlec) {
        const x = sx(o.imlec.boylam), y = sy(o.imlec.enlem), r = birim * 2.5;
        ctx.strokeStyle = P.hale; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.stroke();
        ctx.strokeStyle = P.vurgu; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, r, 0, 7);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { ctx.moveTo(x + dx * r * 0.5, y + dy * r * 0.5); ctx.lineTo(x + dx * r * 1.6, y + dy * r * 1.6); }
        ctx.stroke();
        if (o.imlec.etiket) { ctx.font = yazi(600, P.yaziKucuk); ctx.textAlign = 'left'; ctx.strokeStyle = P.hale; ctx.lineWidth = 3.2; ctx.strokeText(o.imlec.etiket, x + r * 1.8, y); ctx.fillStyle = P.yazi; ctx.fillText(o.imlec.etiket, x + r * 1.8, y); ctx.textAlign = 'center'; }
      }
      if (o.fabrika) {
        const x = sx(o.fabrika.boylam), y = sy(o.fabrika.enlem), r = birim * 2.25;
        ctx.fillStyle = P.yazi; ctx.fillRect(x - r, y - r, 2 * r, 2 * r); ctx.fillStyle = P.hale; ctx.font = yazi(700, P.yaziKucuk); ctx.fillText('F', x, y + 0.5);
      }
      const r = birim * 2.75;
      for (const m of isaretler) {
        const renk = renkOf(m.renk);
        ctx.globalAlpha = m.soluk ? 0.45 : 1; ctx.fillStyle = renk; ctx.beginPath();
        if (m.sekil === 'kare') { ctx.roundRect(m.x - r, m.y - r * 2.6, 2 * r, 2 * r, birim); ctx.moveTo(m.x + r * 0.45, m.y - r * 0.7); ctx.lineTo(m.x, m.y); ctx.lineTo(m.x - r * 0.45, m.y - r * 0.7); ctx.closePath(); }
        else { ctx.moveTo(m.x, m.y); ctx.arc(m.x, m.y - r * 1.55, r, Math.PI * 0.72, Math.PI * 2.28); ctx.closePath(); }
        if (m.bos) { ctx.fillStyle = P.hale; ctx.fill(); ctx.strokeStyle = renk; ctx.lineWidth = 2.2; ctx.setLineDash([3, 2]); ctx.stroke(); ctx.setLineDash([]); }
        else { ctx.fill(); ctx.strokeStyle = P.hale; ctx.lineWidth = 1.5; ctx.stroke(); }
        if (m.vurgu) { ctx.strokeStyle = P.vurgu; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(m.x, m.y - r * 1.55, r * 1.45, 0, 7); ctx.stroke(); }
        ctx.fillStyle = m.bos ? renk : P.hale; ctx.font = yazi(700, m.etiket.length > 2 ? P.yaziKucuk - 2 : P.yaziKucuk); ctx.fillText(m.etiket, m.x, m.y - r * 1.6);
        if (m.ok) { const ox = m.x + r * 0.9, oy = m.y - r * 2.6; ctx.fillStyle = P.hale; ctx.beginPath(); ctx.arc(ox, oy, r * 0.6, 0, 7); ctx.fill(); ctx.strokeStyle = renk; ctx.lineWidth = 1.4; ctx.stroke(); ctx.fillStyle = renk; ctx.font = yazi(700, P.yaziKucuk - 2); ctx.fillText(m.ok, ox, oy + 0.5); }
        ctx.globalAlpha = 1;
      }
      s.goruntu = { x: B.x, y: B.y, olcek: B.olcek };
    };

    const aktar = () => {
      const ctx = c.getContext('2d')!, g = s.goruntu!, f = s.olcek / g.olcek, pay = PAY();
      const ox = s.genislik / 2 + (g.x - s.merkezX) * s.olcek - (pay + s.genislik / 2) * f, oy = s.yukseklik / 2 + (g.y - s.merkezY) * s.olcek - (pay + s.yukseklik / 2) * f;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = s.palet!.zemin; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(ust, ox * s.piksel, oy * s.piksel, ust.width * f, ust.height * f);
    };
    let kare = 0;
    const ciz = () => {
      kare = requestAnimationFrame(ciz);
      if (!s.kirli || !s.genislik || !geometri.current) return;
      if (s.goruntu && performance.now() - s.sonGirdi < 170) { aktar(); return; }
      const B = s.taban, kaydi = !B || B.x !== s.merkezX || B.y !== s.merkezY || B.olcek !== s.olcek || B.genislik !== s.genislik || B.yukseklik !== s.yukseklik || B.piksel !== s.piksel;
      if (kaydi || s.tabanKirli) { s.tabanKirli = false; tabanCiz(); }
      s.kirli = false; ustCiz(); aktar();
    };
    kare = requestAnimationFrame(ciz);

    // etkileşim: sürükle, tekerlek, iki parmak, klavye
    const isaretciler = new Map<number, [number, number]>(); let hareket = 0, kistirma = 0;
    const dokun = () => { s.sonGirdi = performance.now(); s.kirli = true; };
    const konumu = (x: number, y: number): Konum => { const r = c.getBoundingClientRect(); const mx = s.merkezX + (x - r.left - s.genislik / 2) / s.olcek, my = s.merkezY + (y - r.top - s.yukseklik / 2) / s.olcek; return [mx / kmBoylam + bati, kuzey - my / KM_ENLEM]; };
    const noktadaYakinlas = (f: number, x: number, y: number) => { const r = c.getBoundingClientRect(); const ox = x - r.left - s.genislik / 2, oy = y - r.top - s.yukseklik / 2; const yeni = Math.min(EN_BUYUK_OLCEK, Math.max(EN_KUCUK_OLCEK, s.olcek * f)); s.merkezX += ox / s.olcek - ox / yeni; s.merkezY += oy / s.olcek - oy / yeni; s.olcek = yeni; dokun(); };
    const bas = (e: PointerEvent) => { c.setPointerCapture(e.pointerId); isaretciler.set(e.pointerId, [e.clientX, e.clientY]); hareket = 0; if (isaretciler.size === 2) { const [a, b] = [...isaretciler.values()]; kistirma = Math.hypot(a![0] - b![0], a![1] - b![1]); } };
    const sur = (e: PointerEvent) => {
      const onceki = isaretciler.get(e.pointerId); if (!onceki) return;
      if (isaretciler.size === 1) { s.merkezX -= (e.clientX - onceki[0]) / s.olcek; s.merkezY -= (e.clientY - onceki[1]) / s.olcek; hareket += Math.abs(e.clientX - onceki[0]) + Math.abs(e.clientY - onceki[1]); dokun(); }
      isaretciler.set(e.pointerId, [e.clientX, e.clientY]);
      if (isaretciler.size === 2) { const [a, b] = [...isaretciler.values()]; const d = Math.hypot(a![0] - b![0], a![1] - b![1]); if (kistirma) noktadaYakinlas(d / kistirma, (a![0] + b![0]) / 2, (a![1] + b![1]) / 2); kistirma = d; hareket = 99; }
    };
    const birak = (e: PointerEvent) => {
      const vardi = isaretciler.has(e.pointerId); isaretciler.delete(e.pointerId); if (isaretciler.size < 2) kistirma = 0;
      if (!vardi || hareket > 6 || isaretciler.size) return;
      const o = guncel.current, [boylam, enlem] = konumu(e.clientX, e.clientY), r = c.getBoundingClientRect(), birim = s.palet?.birim ?? 4;
      if (o.secimKipi && o.onSec) { o.onSec(boylam, enlem); return; }
      const ekranda = (b: number, en: number): [number, number] => [s.genislik / 2 + (X(b) - s.merkezX) * s.olcek, s.yukseklik / 2 + (Y(en) - s.merkezY) * s.olcek];
      if (o.onIsaret) {
        const kayma = new Map<string, number>(); let enIyi: string | null = null, enYakin = birim * 4;
        for (const i of [...o.isaretler].sort((a, b) => Number(!a.soluk) - Number(!b.soluk))) {
          const anahtar = i.boylam.toFixed(4) + ',' + i.enlem.toFixed(4), sira = kayma.get(anahtar) ?? 0; kayma.set(anahtar, sira + 1);
          const [ix, iy] = ekranda(i.boylam, i.enlem), d = Math.hypot(ix + sira * birim * 5.5 - (e.clientX - r.left), iy - birim * 4.25 - (e.clientY - r.top));
          if (d < enYakin && i.anahtar) { enYakin = d; enIyi = i.anahtar; }
        }
        if (enIyi) { o.onIsaret(enIyi); return; }
      }
      const nokta = o.noktalar.find((n) => { const [nx, ny] = ekranda(n.boylam, n.enlem); return Math.hypot(nx - (e.clientX - r.left), ny - (e.clientY - r.top)) < birim * 3; });
      if (nokta && o.onNokta) o.onNokta(nokta.id);
    };
    const tekerlek = (e: WheelEvent) => { e.preventDefault(); noktadaYakinlas(Math.exp(-e.deltaY * 0.0016), e.clientX, e.clientY); };
    const ciftTik = (e: MouseEvent) => noktadaYakinlas(2, e.clientX, e.clientY);
    const tus = (e: KeyboardEvent) => {
      const adim = 60 / s.olcek;
      if (e.key === 'ArrowLeft') s.merkezX -= adim; else if (e.key === 'ArrowRight') s.merkezX += adim; else if (e.key === 'ArrowUp') s.merkezY -= adim; else if (e.key === 'ArrowDown') s.merkezY += adim;
      else if (e.key === '+' || e.key === '=') s.olcek = Math.min(EN_BUYUK_OLCEK, s.olcek * 1.4); else if (e.key === '-') s.olcek = Math.max(EN_KUCUK_OLCEK, s.olcek / 1.4); else return;
      e.preventDefault(); s.kirli = true;
    };
    c.addEventListener('pointerdown', bas); c.addEventListener('pointermove', sur); c.addEventListener('pointerup', birak); c.addEventListener('pointercancel', birak);
    c.addEventListener('wheel', tekerlek, { passive: false }); c.addEventListener('dblclick', ciftTik); c.addEventListener('keydown', tus);
    return () => {
      cancelAnimationFrame(kare); gozlem.disconnect(); temaGozlemi.disconnect();
      c.removeEventListener('pointerdown', bas); c.removeEventListener('pointermove', sur); c.removeEventListener('pointerup', birak); c.removeEventListener('pointercancel', birak);
      c.removeEventListener('wheel', tekerlek); c.removeEventListener('dblclick', ciftTik); c.removeEventListener('keydown', tus);
    };
  }, []);

  return (
    <div ref={sarmal} className="tc-sevkiyat-harita" data-secim={ozellik.secimKipi || undefined}>
      <canvas ref={tuval} tabIndex={0} aria-label={ozellik.etiket} />
    </div>
  );
});
