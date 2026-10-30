import { Vector3 } from 'three';
import { fmtN } from '../bicim.ts';
import { S, parcaSurumu } from '../parca-durumu.ts';
import { baslik, Cerceve, eksenler, izgara, olcu, zemin, type Alan, type Kutu2 } from './cizim-2b.ts';
import type { Cizici2b, Gorunum2b } from './Sahne.tsx';
import { sahneRengi } from './renkler.ts';

// Ham Malzeme'nin 2B çizimi: parçanın izdüşümü (üçgenler tek yöne çevrilip tek seferde doldurulur, iç kenar çizilmez) ve hammadde
// dış çizgisi, ölçüleriyle. İzometrik seçiliyken Ön ve Üst görünüş yan yana çizilir. İzdüşüm parça değişince bir kez kurulur.

type Izdusum = 'top' | 'front' | 'side';
const EKSEN: Record<Izdusum, [number, number]> = { top: [0, 1], front: [0, 2], side: [1, 2] };
const AD = ['X', 'Y', 'Z'];
const BASLIK: Record<Izdusum, string> = { top: 'Üst görünüş', front: 'Ön görünüş', side: 'Yan görünüş' };

export class Ham2b implements Cizici2b {
  gorus: string = 'iso';
  private surum = -1;
  private nokta: Float32Array | null = null;
  private yollar = new Map<Izdusum, Path2D>();

  imza(): string { return `${String(parcaSurumu())}|${this.gorus}`; }

  private hazirla(): void {
    const s = parcaSurumu();
    if (s === this.surum) return;
    this.surum = s; this.yollar.clear(); this.nokta = null;
    if (!S.P || !S.I) return;
    const n = new Float32Array(S.P.length), v = new Vector3();
    for (let i = 0; i < S.P.length; i += 3) {
      v.set(S.P[i]!, S.P[i + 1]!, S.P[i + 2]!).applyQuaternion(S.q);
      n[i] = v.x; n[i + 1] = v.y; n[i + 2] = v.z;
    }
    this.nokta = n;
  }

  // Ön ve arka yüzün izdüşümü ters dolaşır; hepsi aynı yöne çevrilince sıfırdan farklı kuralla dolgu boşluksuz siluet verir.
  private yol(iz: Izdusum): Path2D | null {
    const P = this.nokta, I = S.I;
    if (!P || !I) return null;
    const v = this.yollar.get(iz);
    if (v) return v;
    const [a, b] = EKSEN[iz], p = new Path2D();
    for (let t = 0; t < I.length; t += 3) {
      const i0 = I[t]! * 3, i1 = I[t + 1]! * 3, i2 = I[t + 2]! * 3;
      const x0 = P[i0 + a]!, y0 = P[i0 + b]!, x1 = P[i1 + a]!, y1 = P[i1 + b]!, x2 = P[i2 + a]!, y2 = P[i2 + b]!;
      const alan = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
      if (Math.abs(alan) < 1e-9) continue;
      p.moveTo(x0, y0);
      if (alan > 0) { p.lineTo(x1, y1); p.lineTo(x2, y2); } else { p.lineTo(x2, y2); p.lineTo(x1, y1); }
      p.closePath();
    }
    this.yollar.set(iz, p);
    return p;
  }

  ciz(x: CanvasRenderingContext2D, w: number, h: number, g: Gorunum2b): void {
    this.hazirla();
    zemin(x, w, h);
    const r = S.res;
    if (!r) return;
    if (this.gorus === 'top' || this.gorus === 'front' || this.gorus === 'side') { this.panel(x, this.gorus, { x: 0, y: 0, w, h }, g); return; }
    const yan = w >= h;
    const a1: Alan = yan ? { x: 0, y: 0, w: w / 2, h } : { x: 0, y: 0, w, h: h / 2 };
    const a2: Alan = yan ? { x: w / 2, y: 0, w: w / 2, h } : { x: 0, y: h / 2, w, h: h / 2 };
    this.panel(x, 'front', a1, g); this.panel(x, 'top', a2, g);
    x.strokeStyle = sahneRengi('izgara-1'); x.lineWidth = 1;
    x.beginPath();
    if (yan) { x.moveTo(w / 2 + 0.5, 0); x.lineTo(w / 2 + 0.5, h); } else { x.moveTo(0, h / 2 + 0.5); x.lineTo(w, h / 2 + 0.5); }
    x.stroke();
  }

  private panel(x: CanvasRenderingContext2D, iz: Izdusum, alan: Alan, g: Gorunum2b): void {
    const r = S.res!, [a, b] = EKSEN[iz], c = r.ctr, SS = r.S ?? r.dim;
    const bar = r.type === 'bar' && r.D != null && r.L != null, ai = r.ai ?? 0;
    // Hammaddenin bu izdüşümdeki yarı boyları; çubuk ekseni düzleme dikse daire çizilir.
    const yari = (k: number): number => (bar ? (k === ai ? r.L! / 2 : r.D! / 2) : SS[k]! / 2);
    const daire = bar && a !== ai && b !== ai;
    const kutu: Kutu2 = { x0: c[a]! - yari(a), x1: c[a]! + yari(a), y0: c[b]! - yari(b), y1: c[b]! + yari(b) };
    const cr = new Cerceve(kutu, alan, g);
    x.save();
    x.beginPath(); x.rect(alan.x, alan.y, alan.w, alan.h); x.clip();
    izgara(x, cr, alan);
    const yol = this.yol(iz);
    if (yol) {
      x.save();
      x.setTransform(x.getTransform().multiply(new DOMMatrix([cr.s, 0, 0, -cr.s, cr.x(0), cr.y(0)])));
      x.fillStyle = sahneRengi('cam-parca');
      x.fill(yol);
      x.restore();
    } else {
      x.fillStyle = sahneRengi('cam-parca'); x.globalAlpha = 0.6;
      x.fillRect(cr.x(c[a]! - r.dim[a]! / 2), cr.y(c[b]! + r.dim[b]! / 2), r.dim[a]! * cr.s, r.dim[b]! * cr.s);
      x.globalAlpha = 1;
    }
    const vurgu = sahneRengi('vurgu');
    x.strokeStyle = vurgu; x.lineWidth = 1.5; x.setLineDash([6, 4]);
    x.beginPath();
    if (daire) {
      x.arc(cr.x(c[a]!), cr.y(c[b]!), (r.D! / 2) * cr.s, 0, Math.PI * 2);
      if (r.ID && r.ID > 0) { x.moveTo(cr.x(c[a]!) + (r.ID / 2) * cr.s, cr.y(c[b]!)); x.arc(cr.x(c[a]!), cr.y(c[b]!), (r.ID / 2) * cr.s, 0, Math.PI * 2); }
    } else x.rect(cr.x(kutu.x0), cr.y(kutu.y1), (kutu.x1 - kutu.x0) * cr.s, (kutu.y1 - kutu.y0) * cr.s);
    x.stroke(); x.setLineDash([]);
    const metin = (k: number): string => {
      const d = 2 * yari(k);
      return bar ? (k === ai ? 'L ' : 'Ø ') + fmtN(d, d % 1 ? 1 : 0) : AD[k]! + ' ' + fmtN(d, d % 1 ? 1 : 0);
    };
    const alt = cr.y(kutu.y0) + 22, sag = cr.x(kutu.x1) + 22;
    olcu(x, cr.x(kutu.x0), alt, cr.x(kutu.x1), alt, metin(a), vurgu);
    if (!daire) olcu(x, sag, cr.y(kutu.y1), sag, cr.y(kutu.y0), metin(b), vurgu);
    eksenler(x, alan.x + 24, alan.y + alan.h - 24, AD[a]!, AD[b]!);
    baslik(x, BASLIK[iz], alan);
    x.restore();
  }
}
