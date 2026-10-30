import { FONT, MONO } from '../bicim.ts';
import type { Gorunum2b } from './Sahne.tsx';
import { sahneRengi } from './renkler.ts';

// 2B çizimlerin ortak parçaları: dünya kutusunu ekrana sığdıran çerçeve, ızgara, ölçü ve yazı. Dünya ekseni sağa ve yukarı artar.

export interface Kutu2 { x0: number; y0: number; x1: number; y1: number }
export interface Alan { x: number; y: number; w: number; h: number }

export function kutuBirlestir(a: Kutu2 | null, b: Kutu2 | null): Kutu2 | null {
  if (!a) return b;
  if (!b) return a;
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

export class Cerceve {
  readonly s: number;
  private readonly ox: number;
  private readonly oy: number;
  constructor(kutu: Kutu2, alan: Alan, g: Gorunum2b, pay = 0.14) {
    const kw = Math.max(1e-6, kutu.x1 - kutu.x0), kh = Math.max(1e-6, kutu.y1 - kutu.y0);
    this.s = Math.min(alan.w * (1 - 2 * pay) / kw, alan.h * (1 - 2 * pay) / kh) * g.k;
    this.ox = alan.x + alan.w / 2 + g.dx - (kutu.x0 + kw / 2) * this.s;
    this.oy = alan.y + alan.h / 2 + g.dy + (kutu.y0 + kh / 2) * this.s;
  }
  x(u: number): number { return this.ox + u * this.s; }
  y(v: number): number { return this.oy - v * this.s; }
}

export function zemin(x: CanvasRenderingContext2D, w: number, h: number): void {
  x.fillStyle = sahneRengi('arka');
  x.fillRect(0, 0, w, h);
}

// Ölçeğe göre 1-2-5 adımlı ızgara; her beşinci çizgi koyu.
export function izgara(x: CanvasRenderingContext2D, c: Cerceve, alan: Alan): void {
  const ham = 24 / c.s, us = Math.pow(10, Math.floor(Math.log10(ham))), adim = [1, 2, 5, 10].map((k) => k * us).find((v) => v >= ham) ?? 10 * us;
  const u0 = Math.floor((alan.x - c.x(0)) / c.s / adim) * adim, u1 = (alan.x + alan.w - c.x(0)) / c.s;
  const v0 = Math.floor((c.y(0) - alan.y - alan.h) / c.s / adim) * adim, v1 = (c.y(0) - alan.y) / c.s;
  x.save();
  x.beginPath(); x.rect(alan.x, alan.y, alan.w, alan.h); x.clip();
  x.lineWidth = 1;
  for (const [ilk, son, dikey] of [[u0, u1, true], [v0, v1, false]] as const) {
    for (let t = ilk; t <= son; t += adim) {
      const ana = Math.round(t / adim) % 5 === 0;
      x.strokeStyle = sahneRengi(ana ? 'izgara-1' : 'izgara-2');
      x.beginPath();
      if (dikey) { const px = Math.round(c.x(t)) + 0.5; x.moveTo(px, alan.y); x.lineTo(px, alan.y + alan.h); }
      else { const py = Math.round(c.y(t)) + 0.5; x.moveTo(alan.x, py); x.lineTo(alan.x + alan.w, py); }
      x.stroke();
    }
  }
  x.restore();
}

export function yazi(x: CanvasRenderingContext2D, metin: string, px: number, py: number, renk: string, hiza: CanvasTextAlign = 'center', boy = 12, kalin = true): void {
  x.font = `${kalin ? '700 ' : ''}${String(boy)}px ${MONO}`;
  x.textAlign = hiza; x.textBaseline = 'middle';
  const w = x.measureText(metin).width, sol = hiza === 'center' ? px - w / 2 : hiza === 'right' || hiza === 'end' ? px - w : px;
  x.fillStyle = sahneRengi('arka');
  x.globalAlpha = 0.75; x.fillRect(sol - 3, py - boy * 0.65, w + 6, boy * 1.3); x.globalAlpha = 1;
  x.fillStyle = renk;
  x.fillText(metin, px, py);
}

export function baslik(x: CanvasRenderingContext2D, metin: string, alan: Alan): void {
  x.font = `700 11px ${FONT}`;
  // Görünümün bilgi kutusu sol üsttedir; başlık sol altta, eksen işaretinin yanındadır.
  x.textAlign = 'left'; x.textBaseline = 'bottom';
  x.fillStyle = sahneRengi('yazi-ikincil');
  x.fillText(metin.toLocaleUpperCase('tr'), alan.x + 72, alan.y + alan.h - 12);
}

// Ölçü çizgisi: iki uç arasında, ok uçlu; yazı ortada.
export function olcu(x: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, metin: string, renk: string): void {
  x.strokeStyle = renk; x.fillStyle = renk; x.lineWidth = 1;
  x.beginPath(); x.moveTo(ax, ay); x.lineTo(bx, by); x.stroke();
  const a = Math.atan2(by - ay, bx - ax), u = 6;
  for (const [px, py, yon] of [[ax, ay, a], [bx, by, a + Math.PI]] as const) {
    x.beginPath(); x.moveTo(px, py);
    x.lineTo(px + u * Math.cos(yon + 0.4), py + u * Math.sin(yon + 0.4)); x.lineTo(px + u * Math.cos(yon - 0.4), py + u * Math.sin(yon - 0.4));
    x.closePath(); x.fill();
  }
  yazi(x, metin, (ax + bx) / 2, (ay + by) / 2, renk);
}

// Program sıfırı ya da eksen işareti: iki kısa ok ve eksen adları.
export function eksenler(x: CanvasRenderingContext2D, px: number, py: number, yatay: string, dikey: string): void {
  const L = 28;
  for (const [dx, dy, ad, renk] of [[L, 0, yatay, sahneRengi('hata')], [0, -L, dikey, sahneRengi('ok')]] as const) {
    x.strokeStyle = renk; x.lineWidth = 2;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + dx, py + dy); x.stroke();
    yazi(x, ad, px + dx * 1.3, py + dy * 1.3, renk, 'center', 11);
  }
}
