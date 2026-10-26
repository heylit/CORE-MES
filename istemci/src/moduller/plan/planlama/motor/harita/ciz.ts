import type { DonemOlcegi } from '../../gorunumler.ts';
import type { PlanVerisi } from '../../tipler.ts';
import { saatYaz, saatYazi, type PlanIslemi } from '../kurallar.ts';
import {
  dilimAdi, dilimNo, DURUM_ETIKETI, ekrana, KH, kilavuzNoktalari, kubik, KW, tezgahDurumu, yay, yoldakiParcalar,
  type Aralik, type GecikmeEtkisi, type Kamera, type Nokta, type Sahne,
} from './kurallar.ts';
import { rgba, type HaritaRenkleri, type Rgb } from './renk.ts';

// Haritanın çizimi (y-atolye atCiz, z-komuta kmKartCiz): teknik resim zemini, bölgeler, akış yayları, seçili siparişin yolculuğu, yoldaki
// parçalar, tezgâh kartları, yolculuk durakları ve kılavuz işaretleri. Önceki planla fark açıkken (ref) değişen yay, doluluk ve sıra çipi
// kesik sarı çizilir. Sürükleme bu teslimde çizilmez.
export type Kutu =
  | { tur: 'ist'; m: string; x: number; y: number; w: number; h: number }
  | { tur: 'cip'; id: string; job: string; m: string; x: number; y: number; w: number; h: number }
  | { tur: 'parca'; job: string; x: number; y: number; r: number };

export interface Cizim {
  W: number; H: number; kam: Kamera; R: HaritaRenkleri; s: Sahne; D: PlanVerisi; olcek: DonemOlcegi; r: Aralik; t: number;
  durus: { m: string; from: number; to: number }[];
  sj: string | null; adim: PlanIslemi | null; secTez: string | null; hover: Kutu | null; kilavuz: string | null;
  bekleme: Record<string, number> | null; etki: GecikmeEtkisi | null;
  // Saniye (animasyon), girişten beri geçen ms, plan değişince eski doluluktan geçişin oranı (0-1).
  zaman: number; giris: number; gecis: { dol: Sahne['dol']; u: number } | null;
  oynat: boolean; az: boolean; isRenk: (j: string) => Rgb;
  // Karşılaştırılan planın (son canlı) sahnesi; kapalıysa null.
  ref: { s: Sahne; ops: Record<string, PlanIslemi> } | null;
}

const kolay = (u: number) => 1 - Math.pow(1 - u, 3);
export function yuvarlak(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

export function ciz(g: CanvasRenderingContext2D, o: Cizim): { kutu: Kutu[]; yolda: number } {
  const { W, H, kam, R, s, t, sj } = o; const k = kam.k; const kutu: Kutu[] = [];
  const ek = (x: number, y: number) => ekrana(kam, W, H, x, y);
  const yayYol = (c: readonly Nokta[]) => { const e = c.map((q) => ek(q.x, q.y)) as [number, number][]; const [a, b, d, f] = e as [[number, number], [number, number], [number, number], [number, number]];
    g.beginPath(); g.moveTo(a[0], a[1]); g.bezierCurveTo(b[0], b[1], d[0], d[1], f[0], f[1]); };
  const hv = o.hover; const hvM = hv && hv.tur === 'ist' ? hv.m : null;
  const hvKom = new Set<string>(); if (hvM) { hvKom.add(hvM); for (const e of Object.values(s.kenar)) { if (e.a === hvM) hvKom.add(e.b); if (e.b === hvM) hvKom.add(e.a); } }
  const yol = sj && s.byJ[sj] ? s.byJ[sj] ?? null : null; const yolM = new Set(yol ? yol.map((r) => r.m) : []);
  const yazi = (txt: string, wx: number, wy: number, boy: number, renk: Rgb, kal: boolean, hiz: CanvasTextAlign = 'start') => {
    const px = boy * k; if (px < 6.5) return; g.font = `${kal ? 700 : 500} ${px}px ${R.mono}`; g.fillStyle = rgba(renk); g.textAlign = hiz; g.fillText(txt, wx, wy);
  };
  // teknik resim zemini
  const ad = 40 * k;
  if (ad > 9) { g.fillStyle = rgba(R.bp, 0.22); const [ox, oy] = ek(0, 0); for (let x = ((ox % ad) + ad) % ad; x < W; x += ad) for (let y = ((oy % ad) + ad) % ad; y < H; y += ad) g.fillRect(x, y, 1.2, 1.2); }
  // bölgeler: grup adı, tezgâh sayısı, imlecin dilimindeki ortalama doluluk
  const gT = dilimNo(o.r, t);
  for (const b of s.bolge) {
    const [x, y] = ek(b.x, b.y); const w = b.w * k, h = b.h * k;
    g.fillStyle = rgba(R.bp, 0.04); yuvarlak(g, x, y, w, h, 14 * k); g.fill(); g.strokeStyle = rgba(R.bp, 0.3); g.lineWidth = 1; g.setLineDash([5, 5]); g.stroke(); g.setLineDash([]);
    const v = b.ms.map((m) => s.dol[m]?.[gT]).filter((z): z is number => z != null); const ort = v.length ? v.reduce((a, c) => a + c, 0) / v.length : null;
    g.textBaseline = 'alphabetic'; const fs = Math.max(10, Math.min(15, 14 * k));
    g.font = `800 ${fs}px ${R.mono}`; g.fillStyle = rgba(R.ink); g.textAlign = 'start'; const ad2 = b.g.toLocaleUpperCase('tr-TR'); g.fillText(ad2, x + 12 * k, y + 14 + 14 * k);
    if (w > 120) {
      const aw = g.measureText(ad2).width; g.font = `500 ${fs * 0.78}px ${R.mono}`; g.fillStyle = rgba(ort != null && ort > 0.97 ? R.stop : R.muted);
      g.fillText(`${b.n} tezgâh${ort != null ? ` · ${dilimAdi(o.D, o.olcek, o.r, gT)} %${Math.round(ort * 100)}` : ''}`, x + 12 * k + aw + 8, y + 14 + 14 * k);
    }
  }
  // akış yayları
  const enCok = Math.max(1, ...Object.values(s.kenar).map((e) => e.n));
  for (const e of Object.values(s.kenar)) {
    const a = s.ist[e.a], b = s.ist[e.b]; if (!a || !b) continue; const c = yay(a, b);
    const secte = !!sj && e.j.has(sj); const ilgili = !!hvM && (e.a === hvM || e.b === hvM);
    g.globalAlpha = Math.max(0, Math.min(1, (o.giris - 500) / 600)) * (hvM && !ilgili ? 0.2 : 1);
    const fark = !!o.ref && o.ref.s.kenar[`${e.a}>${e.b}`]?.n !== e.n;
    const genis = Math.max(1, (1 + 4 * e.n / enCok) * Math.min(1.3, k * 1.5));
    yayYol(c); g.lineWidth = genis + (ilgili ? 1.5 : 0);
    g.strokeStyle = secte ? rgba(R.done) : ilgili ? rgba(e.a === hvM ? R.done : R.hold) : fark ? rgba(R.hazard) : rgba(R.bp, sj ? 0.1 : 0.26);
    if (fark && !secte) g.setLineDash([6, 4]);
    g.stroke(); g.setLineDash([]);
    if (!sj && !fark && !o.az) {
      g.setLineDash([2, 14]); g.lineDashOffset = -o.zaman * (o.oynat ? 40 : 14); g.lineWidth = Math.max(1.2, genis * 0.7); g.strokeStyle = rgba(ilgili ? R.ink : R.bp, 0.55);
      yayYol(c); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
    }
    if (ilgili && k > 0.3) {
      const m = kubik(c, 0.5); const [ox, oy] = ek(m.x, m.y); g.font = `700 ${Math.max(10, 11 * k)}px ${R.mono}`; const tx = `${e.n} iş`; const tw = g.measureText(tx).width + 10;
      g.fillStyle = rgba(e.a === hvM ? R.done : R.hold); yuvarlak(g, ox - tw / 2, oy - 9, tw, 18, 9); g.fill(); g.fillStyle = rgba(R.panel); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(tx, ox, oy + 0.5); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    }
    g.globalAlpha = 1;
  }
  // yolculuk: seçili siparişin adımları kart kenarından kart kenarına
  if (yol && yol.length > 1) {
    g.lineWidth = Math.max(3, 5 * k); g.strokeStyle = rgba(R.done, 0.9); g.shadowColor = rgba(R.done, 0.6); g.shadowBlur = 14; g.lineCap = 'round';
    for (let i = 1; i < yol.length; i++) { const a = s.ist[yol[i - 1]?.m ?? ''], b = s.ist[yol[i]?.m ?? '']; if (!a || !b || a === b) continue; yayYol(yay(a, b)); g.stroke(); }
    g.shadowBlur = 0; g.lineCap = 'butt';
  }
  // yoldaki parçalar
  let yolda = 0;
  for (const yp of yoldakiParcalar(s, t)) {
    const a = s.ist[yp.a], b = s.ist[yp.b]; if (!a || !b) continue;
    const l = s.byJ[yp.j] ?? []; const gec = (s.J[yp.j]?.T ?? 0) > 0.05; const soluk = (!!sj && sj !== yp.j) || (!!hvM && !l.some((r) => r.m === hvM));
    const q = kubik(yay(a, b), kolay(yp.u)); const [x, y] = ek(q.x, q.y); yolda++;
    const rr = Math.max(3.5, 5 * Math.min(1.3, k * 1.2)); g.globalAlpha = soluk ? 0.15 : 1;
    g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fillStyle = rgba(o.isRenk(yp.j)); g.fill();
    if (gec) { g.lineWidth = 2; g.strokeStyle = rgba(R.stop); } else { g.lineWidth = 1.2; g.strokeStyle = rgba(R.panel); }
    g.stroke(); g.globalAlpha = 1; kutu.push({ tur: 'parca', job: yp.j, x, y, r: rr + 5 });
  }
  // tezgâh kartları
  for (const a of Object.values(s.ist)) {
    const [sx, sy] = ek(a.x, a.y); const w = KW * k, h = KH * k; if (sx + w < -20 || sy + h < -20 || sx - w > W + 20 || sy - h > H + 20) continue;
    const st = tezgahDurumu(s, o.durus, a.m, t); const dol = (s.dol[a.m] ?? []).slice(); const eski = o.gecis?.dol[a.m];
    if (eski && o.gecis) for (let i = 0; i < 7; i++) { const x = dol[i], z = eski[i]; if (x != null && z != null) dol[i] = z + (x - z) * kolay(o.gecis.u); }
    const kmSoluk = !!o.etki && !sj && !o.etki.m[a.m];
    const soluk = (!!sj && !yolM.has(a.m)) || (!!hvM && !hvKom.has(a.m)) || (!!o.kilavuz && o.kilavuz !== a.m) || kmSoluk;
    const giru = Math.max(0, Math.min(1, (o.giris - a.gi * 70) / 380)); if (giru <= 0) continue;
    g.globalAlpha = (soluk ? 0.3 : 1) * giru;
    const ox = (wx: number) => sx + (wx - a.x) * k, oy = (wy: number) => sy + (wy - a.y) * k; const x0 = a.x - KW / 2, y0 = a.y - KH / 2;
    const fas = a.m.startsWith('@'); const dr = fas ? R.idle : st.dur === 'ariza' ? R.stop : st.dur === 'calisiyor' ? R.run : R.idle;
    const bugun = dol[gT];
    // darboğaz nabzı ve çalışan parıltısı
    if (bugun != null && bugun > 0.97 && !soluk) { const n = o.az ? 0.5 : (Math.sin(o.zaman * 3) + 1) / 2; g.shadowColor = rgba(R.stop, 0.5 + 0.4 * n); g.shadowBlur = (12 + 14 * n) * Math.min(1, k * 1.4); }
    else if (st.dur === 'calisiyor' && !soluk) { g.shadowColor = rgba(R.run, 0.45); g.shadowBlur = 16 * Math.min(1, k * 1.4); }
    else { g.shadowColor = rgba(R.ink, 0.18); g.shadowBlur = 8 * k; }
    g.fillStyle = rgba(R.panel); yuvarlak(g, ox(x0), oy(y0), w, h, 10 * k); g.fill(); g.shadowBlur = 0;
    const vurgu = o.secTez === a.m || (hv?.tur === 'ist' && hv.m === a.m);
    g.lineWidth = vurgu ? 2.5 : 1; g.strokeStyle = vurgu ? rgba(R.ink) : rgba(R.edge2, 0.9); g.stroke();
    // üst durum şeridi
    g.save(); yuvarlak(g, ox(x0), oy(y0), w, h, 10 * k); g.clip(); g.fillStyle = rgba(dr); g.fillRect(ox(x0), oy(y0), w, 5 * k); g.restore();
    g.textBaseline = 'alphabetic';
    const adi = fas ? a.m.slice(1) : a.m;
    if (k * 168 < 50) {
      // uzak görünüm: yalnız ad ve durum rengi
      g.fillStyle = rgba(dr, 0.25); yuvarlak(g, ox(x0), oy(y0), w, h, 10 * k); g.fill(); g.font = `800 ${Math.max(9, 26 * k)}px ${R.mono}`; g.fillStyle = rgba(R.ink);
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(adi, sx, sy); g.textAlign = 'start';
    } else {
      const orta = k < 0.72;
      // orta uzaklıkta ad büyür, küçük satırlar düşer; genel bakışta da tezgâh adı okunur
      if (orta) { g.font = `800 ${Math.min(26 * k, Math.max(11, 20 * k))}px ${R.mono}`; g.fillStyle = rgba(R.ink); g.textAlign = 'start'; g.fillText(adi, ox(x0 + 9), oy(y0 + 30)); }
      else yazi(adi, ox(x0 + 10), oy(y0 + 23), 15, R.ink, true);
      const et = fas ? 'FASON' : DURUM_ETIKETI[st.dur]; g.font = `700 ${8.5 * k}px ${R.mono}`; const ew = g.measureText(et).width + 10 * k;
      if (!orta && 8.5 * k >= 6.5) {
        g.fillStyle = rgba(dr, 0.16); yuvarlak(g, ox(x0 + KW - 10) - ew, oy(y0 + 12), ew, 15 * k, 7 * k); g.fill(); g.fillStyle = rgba(dr); g.textAlign = 'center';
        g.fillText(et, ox(x0 + KW - 10) - ew / 2, oy(y0 + 23)); g.textAlign = 'start';
      }
      // şu anki iş ve ilerleme
      if (st.cal) {
        const u = Math.max(0, Math.min(1, (t - st.cal.S) / Math.max(0.01, st.cal.C - st.cal.S)));
        if (!orta) yazi(st.cal.id, ox(x0 + 10), oy(y0 + 39), 10.5, R.ink, false);
        else { g.beginPath(); g.arc(ox(x0 + KW - 16), oy(y0 + 24), 5 * k + 2, 0, Math.PI * 2); g.fillStyle = rgba(o.isRenk(st.cal.job)); g.fill(); }
        if (!orta) yazi(`%${Math.round(u * 100)} · ${saatYaz(o.D, st.cal.C).slice(10)}`, ox(x0 + KW - 10), oy(y0 + 39), 9.5, R.muted, false, 'right');
        g.fillStyle = rgba(R.edge2, 0.5); const pk = orta ? 7 : 4; yuvarlak(g, ox(x0 + 10), oy(y0 + 44), (KW - 20) * k, pk * k, 2 * k); g.fill();
        g.fillStyle = rgba(o.isRenk(st.cal.job)); yuvarlak(g, ox(x0 + 10), oy(y0 + 44), Math.max(2, (KW - 20) * k * u), pk * k, 2 * k); g.fill();
      } else if (!orta) yazi(st.dur === 'ariza' ? 'arıza ya da bakımda' : fas ? 'dış tedarikçi' : 'iş yok', ox(x0 + 10), oy(y0 + 41), 10, R.muted, false);
      // yedi dilim doluluk çubukları
      const sl = (KW - 20) / 7;
      for (let i = 0; i < 7; i++) {
        const v = dol[i]; const bx = x0 + 10 + i * sl, by = y0 + 80, bh = 24;
        g.fillStyle = rgba(R.edge2, 0.28); g.fillRect(ox(bx), oy(by - bh), (sl - 3) * k, bh * k);
        if (v != null) { const hh = Math.max(1.5, Math.min(1, v) * bh); g.fillStyle = v > 0.97 ? rgba(R.stop) : v > 0.75 ? rgba(R.hazard) : rgba(R.run, 0.8); g.fillRect(ox(bx), oy(by - hh), (sl - 3) * k, hh * k); }
        const rf = o.ref?.s.dol[a.m]?.[i] ?? null;
        if (rf != null && v != null && Math.abs(v - rf) > 0.05) { g.strokeStyle = rgba(R.hazard); g.lineWidth = 1.5; g.setLineDash([3, 2]); g.strokeRect(ox(bx) - 1, oy(by - bh) - 1, (sl - 3) * k + 2, bh * k + 2); g.setLineDash([]); }
        if (i === gT) { g.fillStyle = rgba(R.done); g.fillRect(ox(bx), oy(by + 2), (sl - 3) * k, 2 * k); }
        yazi(dilimAdi(o.D, o.olcek, o.r, i), ox(bx + (sl - 3) / 2), oy(by + 11), 7.5, i === gT ? R.ink : R.muted, i === gT, 'center');
      }
      // sıra çipleri
      yazi('SIRA', ox(x0 + 10), oy(y0 + 106), 7.5, R.muted, true);
      st.sira.forEach((r, i) => {
        const cx0 = ox(x0 + 40 + i * 22), cy0 = oy(y0 + 97), cw = 19 * k, ch = 12 * k; const secili = !!sj && r.job === sj;
        g.fillStyle = rgba(o.isRenk(r.job)); yuvarlak(g, cx0, cy0, cw, ch, 3 * k); g.fill();
        const rr = o.ref?.ops[r.id]; const fark = !!o.ref && (!rr || !Number.isFinite(rr.S) || rr.m !== r.m || Math.abs(rr.S - r.S) > 0.25);
        g.lineWidth = secili ? 2 : 1; g.strokeStyle = secili ? rgba(R.done) : fark ? rgba(R.hazard) : rgba(R.ink, 0.3); if (fark && !secili) g.setLineDash([3, 2]); g.stroke(); g.setLineDash([]);
        kutu.push({ tur: 'cip', id: r.id, job: r.job, m: a.m, x: cx0 - 2, y: cy0 - 3, w: cw + 4, h: ch + 6 });
      });
      if (st.bekleyen > 5) yazi(`+${st.bekleyen - 5}`, ox(x0 + 40 + 5 * 22), oy(y0 + 106), 8.5, R.muted, true);
      if (!st.sira.length) yazi('boş', ox(x0 + 40), oy(y0 + 106), 8.5, R.muted, false);
    }
    rozet(g, o, a.m, ox(x0), oy(y0), w, h, k);
    g.globalAlpha = 1; g.textAlign = 'start';
    kutu.push({ tur: 'ist', m: a.m, x: ox(x0), y: oy(y0), w, h });
  }
  // yolculuk durakları
  if (yol && yol.length) {
    const goru: Record<string, number> = {};
    yol.forEach((r, i) => {
      const a = s.ist[r.m]; if (!a) return; const n = goru[r.m] = (goru[r.m] ?? 0) + 1; const [x, y] = ek(a.x - KW / 2, a.y - KH / 2);
      const rr = Math.max(9, 11 * k); const nx = x + (n - 1) * rr * 2.1, ny = y; g.beginPath(); g.arc(nx, ny, rr, 0, Math.PI * 2); g.fillStyle = rgba(R.done); g.fill();
      g.lineWidth = 2; g.strokeStyle = rgba(R.panel); g.stroke();
      g.fillStyle = rgba(R.panel); g.font = `800 ${rr}px ${R.mono}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), nx, ny + 0.5); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
    });
  }
  // kılavuz: örnek tezgâhta numaralı işaretler
  const ka = o.kilavuz ? s.ist[o.kilavuz] : undefined;
  if (ka) kilavuzNoktalari(ka).forEach(([[hx, hy], [wx, wy]], i) => {
    const [x, y] = ek(wx, wy); const [tx, ty] = ek(hx, hy);
    g.strokeStyle = rgba(R.done); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(tx, ty); g.stroke(); g.beginPath(); g.arc(tx, ty, 3, 0, Math.PI * 2); g.fillStyle = rgba(R.done); g.fill();
    const n = o.az ? 0 : (Math.sin(o.zaman * 4 + i) + 1) / 2;
    g.beginPath(); g.arc(x, y, 13 + 3 * n, 0, Math.PI * 2); g.fillStyle = rgba(R.done, 0.18); g.fill();
    g.beginPath(); g.arc(x, y, 10, 0, Math.PI * 2); g.fillStyle = rgba(R.done); g.fill(); g.lineWidth = 2; g.strokeStyle = rgba(R.panel); g.stroke();
    g.fillStyle = rgba(R.panel); g.font = `800 11px ${R.mono}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(i + 1), x, y + 0.5); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
  });
  return { kutu, yolda };
}

// Kartın altına yorum rozeti (kmKartCiz): seçili adım "şu an burada", seçili siparişte tezgâhta bekleme, gecikme kaynağında beklettiği süre.
function rozet(g: CanvasRenderingContext2D, o: Cizim, m: string, x: number, y: number, w: number, h: number, k: number): void {
  const { R } = o; let v: number | null = null, ad = '', renk = R.stop;
  if (o.adim && m === o.adim.m) { v = 1; ad = 'şu an burada'; renk = R.done; }
  else if (o.sj && o.bekleme) { v = o.bekleme[m] ?? null; ad = v ? `bekledi ${saatYazi(v)}` : ''; }
  else if (o.etki) {
    const e = o.etki.m[m];
    if (e && o.etki.en > 0) { v = e.v; ad = `+${saatYazi(v)} · ${e.j.size} sip.`; g.fillStyle = rgba(R.stop, 0.08 + 0.32 * (v / o.etki.en)); yuvarlak(g, x, y, w, h, 10 * k); g.fill(); }
  }
  if (!v || v < 0.25) return;
  g.font = `700 ${Math.max(10, 11 * Math.min(1.2, k * 1.4))}px ${R.mono}`; const tw = g.measureText(ad).width + 12; const th = Math.max(18, 20 * Math.min(1.2, k * 1.4));
  const bx = x + w - tw + 6, by = y + h - 6;
  g.shadowColor = rgba(renk, 0.4); g.shadowBlur = 8; g.fillStyle = rgba(renk); yuvarlak(g, bx, by, tw, th, th / 2); g.fill(); g.shadowBlur = 0;
  g.fillStyle = rgba(R.panel); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ad, bx + tw / 2, by + th / 2 + 0.5); g.textAlign = 'start'; g.textBaseline = 'alphabetic';
}

// İsabet (atBul): önce çip, sonra parça, sonra tezgâh.
export function bul(kutu: Kutu[], sx: number, sy: number): Kutu | null {
  for (let i = kutu.length - 1; i >= 0; i--) { const b = kutu[i]; if (b?.tur === 'cip' && sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return b; }
  for (let i = kutu.length - 1; i >= 0; i--) { const b = kutu[i]; if (b?.tur === 'parca' && Math.hypot(sx - b.x, sy - b.y) <= b.r) return b; }
  for (const b of kutu) if (b.tur === 'ist' && sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return b;
  return null;
}
