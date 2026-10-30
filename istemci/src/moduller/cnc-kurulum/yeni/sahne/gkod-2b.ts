import { gsimHazirla } from '../hesap/gkod.ts';
import { haritaAgi, haritaYukle, type HaritaAgi, type Rgb, type TalasRenkleri } from '../gkod/geometri.ts';
import { gPosAt } from '../gkod/oynatma.ts';
import { bilgi, GS } from '../gkod/simulasyon.ts';
import { TAKIM_RENKLERI } from '../gkod/takim.ts';
import type { YukseklikHaritasi } from '../gkod/talas.ts';
import type { Program } from '../gkod/tipler.ts';
import { baslik, Cerceve, eksenler, izgara, kutuBirlestir, yazi, zemin, type Alan, type Kutu2 } from './cizim-2b.ts';
import type { Cizici2b, Gorunum2b } from './Sahne.tsx';
import { sahneRengi, sahneRengi3 } from './renkler.ts';

// G-Kod Sim.'in 2B çizimi: takım yolunun izdüşümü (geçilen kısım koyu, kalan soluk), hızlı hareket kesikli, takım dairesi ve üst
// görünüşte talaş haritası. Geçilen yol oynatma ilerledikçe biriktirilir (geri sarınca baştan kurulur): her karede bütün program
// yeniden gezilmez. Torna programında yatay eksen Z, dikey eksen X'tir.

type Izdusum = 'top' | 'front' | 'side';
const BASLIK: Record<Izdusum, string> = { top: 'Üst görünüş', front: 'Ön görünüş', side: 'Yan görünüş' };

function takimCss(sira: number): string {
  let deger = '';
  try { deger = getComputedStyle(document.documentElement).getPropertyValue(TAKIM_RENKLERI[sira % TAKIM_RENKLERI.length]!).trim(); } catch { /* tarayıcı dışı */ }
  return deger || sahneRengi('yazi-ikincil');
}

function talasRenkleri(): TalasRenkleri {
  const r = (ad: string): Rgb => { const c = sahneRengi3(ad); return [c.r, c.g, c.b]; };
  return { ust: r('ham'), derin: r('mavi'), orta: r('acik-mavi'), tamam: r('ok'), fazla: r('uyari'), dalma: r('m-yakut'), disari: r('cam-hizli'), mor: r('mor') };
}

// Talaş haritası renkleri doğrusaldır (3B ağ rengi); tuvale sRGB yazılır.
const srgb = (v: number): number => Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055));

interface Birikim { izdusum: Izdusum; kadar: number; kesme: Map<string, Path2D>; hizli: Path2D }
interface Resim { hm: YukseklikHaritasi; ag: HaritaAgi; tuval: HTMLCanvasElement; iz: string }

export class Gkod2b implements Cizici2b {
  gorus: string = 'iso';
  private prog: Program | null = null;
  private progNo = 0;
  private golge: { izdusum: Izdusum; kesme: Map<string, Path2D>; hizli: Path2D } | null = null;
  private birikim: Birikim | null = null;
  private resim: Resim | null = null;
  private renkler: TalasRenkleri | null = null;

  private izdusum(): Izdusum { return this.gorus === 'front' || this.gorus === 'side' ? this.gorus : 'top'; }

  imza(): string {
    const gs = gsimHazirla(), hm = GS.hm;
    if (GS.prog !== this.prog) { this.prog = GS.prog; this.progNo++; this.golge = null; this.birikim = null; }
    return [this.progNo, GS.idx, GS.frac.toFixed(3), hm ? hm.done : -1, hm ? 1 : 0, gs.removal, gs.showRapid, gs.compare, gs.lathe, this.gorus].join('|');
  }

  // Dünya ekseni: izdüşümün yatay ve dikey bileşeni.
  private eksen(iz: Izdusum, lathe: boolean): [number, number, string, string] {
    if (lathe) return [2, 0, 'Z', 'X'];
    if (iz === 'front') return [0, 2, 'X', 'Z'];
    if (iz === 'side') return [1, 2, 'Y', 'Z'];
    return [0, 1, 'X', 'Y'];
  }

  private hareketEkle(p: Program, k: number, a: number, b: number, kesme: Map<string, Path2D>, hizli: Path2D): void {
    const mv = p.moves[k]!, pts = mv.pts ?? mv.b;
    let yol: Path2D;
    if (mv.t) {
      const renk = takimCss(bilgi(mv.T).col);
      yol = kesme.get(renk) ?? new Path2D();
      kesme.set(renk, yol);
    } else yol = hizli;
    yol.moveTo(mv.a[a]!, mv.a[b]!);
    for (let j = 0; j < pts.length; j += 3) yol.lineTo(pts[j + a]!, pts[j + b]!);
  }

  private golgeKur(p: Program, iz: Izdusum, a: number, b: number): NonNullable<Gkod2b['golge']> {
    if (this.golge?.izdusum === iz) return this.golge;
    const kesme = new Map<string, Path2D>(), hizli = new Path2D();
    for (let k = 0; k < p.moves.length; k++) this.hareketEkle(p, k, a, b, kesme, hizli);
    return (this.golge = { izdusum: iz, kesme, hizli });
  }

  private biriktir(p: Program, iz: Izdusum, a: number, b: number, bitti: number): Birikim {
    let B = this.birikim;
    if (!B || B.izdusum !== iz || B.kadar > bitti) B = this.birikim = { izdusum: iz, kadar: 0, kesme: new Map(), hizli: new Path2D() };
    for (; B.kadar < bitti; B.kadar++) this.hareketEkle(p, B.kadar, a, b, B.kesme, B.hizli);
    return B;
  }

  private haritaResmi(hm: YukseklikHaritasi, karsilastir: boolean): HTMLCanvasElement | null {
    let R = this.resim;
    if (!R || R.hm !== hm) {
      const tuval = document.createElement('canvas'); tuval.width = hm.NX; tuval.height = hm.NY;
      R = this.resim = { hm, ag: haritaAgi(hm), tuval, iz: '' };
    }
    const iz = `${String(hm.done)}|${String(GS.idx)}|${GS.frac.toFixed(3)}|${String(karsilastir)}`;
    if (iz !== R.iz) {
      R.iz = iz;
      this.renkler ??= talasRenkleri();
      haritaYukle(hm, R.ag, karsilastir, this.renkler);
      const x = R.tuval.getContext('2d');
      if (!x) return null;
      const img = x.createImageData(hm.NX, hm.NY), d = img.data, c = R.ag.renk;
      for (let v = 0; v < hm.NX * hm.NY; v++) {
        d[v * 4] = srgb(c[v * 3]!); d[v * 4 + 1] = srgb(c[v * 3 + 1]!); d[v * 4 + 2] = srgb(c[v * 3 + 2]!); d[v * 4 + 3] = 255;
      }
      x.putImageData(img, 0, 0);
    }
    return R.tuval;
  }

  ciz(x: CanvasRenderingContext2D, w: number, h: number, g: Gorunum2b): void {
    zemin(x, w, h);
    const p = GS.prog, alan: Alan = { x: 0, y: 0, w, h };
    if (!p || !p.moves.length) return;
    const gs = gsimHazirla(), lathe = !!gs.lathe || p.lathe, iz = lathe ? 'top' : this.izdusum();
    const [a, b, ya, da] = this.eksen(iz, lathe), sb = GS.sb, B = p.bounds;
    let kutu: Kutu2 | null = B.length >= 6 ? { x0: B[a]!, y0: B[b]!, x1: B[a + 3]!, y1: B[b + 3]! } : null;
    if (sb) {
      const s0 = [sb.x0, sb.y0, sb.z0], s1 = [sb.x1, sb.y1, sb.z1];
      kutu = kutuBirlestir(kutu, { x0: s0[a]!, y0: s0[b]!, x1: s1[a]!, y1: s1[b]! });
    }
    kutu ??= { x0: -50, y0: -50, x1: 50, y1: 50 };
    const cr = new Cerceve(kutu, alan, g);
    izgara(x, cr, alan);
    const dunya = (): void => { x.setTransform(x.getTransform().multiply(new DOMMatrix([cr.s, 0, 0, -cr.s, cr.x(0), cr.y(0)]))); };

    if (sb && !lathe) {
      const s0 = [sb.x0, sb.y0, sb.z0], s1 = [sb.x1, sb.y1, sb.z1];
      const hm = GS.hm, resim = iz === 'top' && gs.removal && hm ? this.haritaResmi(hm, !!gs.compare) : null;
      x.save(); dunya();
      if (resim) { x.imageSmoothingEnabled = true; x.drawImage(resim, s0[a]!, s0[b]!, s1[a]! - s0[a]!, s1[b]! - s0[b]!); }
      else { x.fillStyle = sahneRengi('ham'); x.globalAlpha = 0.25; x.fillRect(s0[a]!, s0[b]!, s1[a]! - s0[a]!, s1[b]! - s0[b]!); x.globalAlpha = 1; }
      x.restore();
      x.strokeStyle = sahneRengi('vurgu'); x.lineWidth = 1.5; x.setLineDash([6, 4]);
      x.strokeRect(cr.x(s0[a]!), cr.y(s1[b]!), (s1[a]! - s0[a]!) * cr.s, (s1[b]! - s0[b]!) * cr.s);
      x.setLineDash([]);
    }

    const bitti = GS.frac >= 0.999 ? GS.idx + 1 : GS.idx;
    const golge = this.golgeKur(p, iz, a, b), dolu = this.biriktir(p, iz, a, b, bitti);
    x.save(); dunya();
    const cizgi = (yol: Path2D, renk: string, kalinlik: number, saydam: number, kesik: boolean): void => {
      x.strokeStyle = renk; x.globalAlpha = saydam; x.lineWidth = kalinlik / cr.s;
      x.setLineDash(kesik ? [5 / cr.s, 4 / cr.s] : []);
      x.stroke(yol);
    };
    const vurgu = sahneRengi('vurgu');
    if (gs.showRapid) cizgi(golge.hizli, vurgu, 1, 0.18, true);
    for (const [renk, yol] of golge.kesme) cizgi(yol, renk, 1.2, 0.25, false);
    if (gs.showRapid) cizgi(dolu.hizli, vurgu, 1, 0.7, true);
    for (const [renk, yol] of dolu.kesme) cizgi(yol, renk, 2, 1, false);
    x.restore();

    // Takım: çapında daire, merkezinde nokta ve adı.
    const mv = p.moves[Math.min(GS.idx, p.moves.length - 1)]!, pp = gPosAt(p, GS.idx, GS.frac), ti = bilgi(mv.T), renk = takimCss(ti.col);
    const tx = cr.x(pp[a]!), ty = cr.y(pp[b]!), r = Math.max(3, (ti.d / 2) * cr.s);
    x.fillStyle = renk; x.globalAlpha = 0.25;
    x.beginPath(); x.arc(tx, ty, r, 0, Math.PI * 2); x.fill();
    x.globalAlpha = 1; x.strokeStyle = renk; x.lineWidth = 2; x.stroke();
    x.beginPath(); x.arc(tx, ty, 2.5, 0, Math.PI * 2); x.fill();
    yazi(x, `T${String(mv.T)} · ${ti.name}`, tx + r + 8, ty - r - 8, renk, 'left');

    eksenler(x, cr.x(0), cr.y(0), ya, da);
    baslik(x, lathe ? 'Torna · XZ düzlemi' : BASLIK[iz], alan);
  }
}
