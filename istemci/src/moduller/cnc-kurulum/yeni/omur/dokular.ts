import { CanvasTexture, SRGBColorSpace } from 'three';
import { allMachines, byId, draw, fmtDay, fmtN, maxAniso, pad2, rr, ST_TXT, STK_TXT, thumb, upTR } from './cekirdek.ts';
import { SIMGELER, type SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { durumRengi, saydam, type OmurPaleti } from './renk.ts';
import type { CarkSatiri } from './takip.ts';
import type { CarkKarti } from './tipler.ts';
import { rnCaps } from './yenileme.ts';

// Çark kartının yüzü ve satır etiketi tuvale çizilir (prototipin lwTex / lwLabelTex'i). Yazılar ve yerleşim aynıdır; renkler ve
// yazı ailesi tasarım değişkenlerinden gelir (T1).

const TAU = Math.PI * 2;

function doku(cv: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

// Tuvalde ortak simge (T4): 24'lük kutudaki çizgi yolu ölçeklenir.
function simgeCiz(x: CanvasRenderingContext2D, ad: SimgeAdi, px: number, py: number, boyut: number, renk: string): void {
  x.save();
  x.translate(px, py); x.scale(boyut / 24, boyut / 24);
  x.strokeStyle = renk; x.lineWidth = 2; x.lineCap = 'round'; x.lineJoin = 'round';
  x.stroke(new Path2D(SIMGELER[ad]));
  x.restore();
}

function cchip(x: CanvasRenderingContext2D, p: OmurPaleti, txt: string, col: string, px: number, py: number): number {
  x.font = '700 19px ' + p.yazi1;
  const w = x.measureText(txt).width + 22;
  x.fillStyle = saydam(col, 0.2); rr(x, px, py, w, 32, 16); x.fill();
  x.fillStyle = col; x.fillText(txt, px + 11, py + 23);
  return w;
}

export function lwTex(c: CarkKarti, p: OmurPaleti): CanvasTexture {
  const W = 512, H = 350, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const x = cv.getContext('2d');
  if (!x) return doku(cv);
  const st = c.depot ? c.stock.st : c.st, col = durumRengi(p, st);
  x.fillStyle = p.zemin; rr(x, 0, 0, W, H, 22); x.fill();
  x.strokeStyle = col; x.lineWidth = 5; rr(x, 2.5, 2.5, W - 5, H - 5, 20); x.stroke();
  x.fillStyle = p.arka; rr(x, 16, 16, 158, 158, 14); x.fill();
  const th = thumb(c.t);
  if (th) x.drawImage(th, 16, 16, 158, 158);
  x.textBaseline = 'alphabetic';
  if (c.depot) {
    x.fillStyle = p.soluk; x.font = '700 18px ' + p.yazi1; x.fillText(upTR(c.shelf).slice(0, 24), 190, 42);
    x.fillStyle = col; x.font = '800 64px ' + p.yazi1;
    const av = c.stock.avail == null ? '—' : String(c.stock.avail);
    x.fillText(av, 190, 120);
    const aw = x.measureText(av).width;
    x.fillStyle = p.yazi; x.font = '600 24px ' + p.yazi1; x.fillText('depoda', 200 + aw, 118);
    x.fillStyle = p.soluk; x.font = '500 21px ' + p.yazi1; x.fillText('toplam ' + c.stock.qty + ' · tezgâhta ' + c.stock.used + ' · min ' + c.stock.min, 190, 156);
    x.fillStyle = p.yazi; x.font = '700 30px ' + p.yazi1; draw(x, c.t.name, 18, 222, 476, 1, 34);
    x.fillStyle = p.soluk; x.font = '500 20px ' + p.yazi2; draw(x, c.t.code || '', 18, 254, 476, 1, 24);
    const by = c.u ? c.u.by : {};
    const used = Object.keys(by).filter((k) => by[k]!.mag + by[k]!.man).map((k) => {
      const mm = byId(allMachines(), k);
      return (mm ? mm.name : k) + ' ×' + (by[k]!.mag + by[k]!.man);
    });
    x.fillStyle = p.yazi; x.font = '500 20px ' + p.yazi1; draw(x, used.length ? 'Tezgâhta: ' + used.join(', ') : 'Hiçbir tezgâhta takılı değil', 18, 290, 476, 1, 24);
    cchip(x, p, STK_TXT[c.stock.st] ?? '', col, 18, 308);
    return doku(cv);
  }
  x.fillStyle = p.vurgu; x.font = '800 34px ' + p.yazi2; x.fillText('T' + pad2(c.p + 1), 190, 50);
  cchip(x, p, ST_TXT[c.st], col, 190, 66);
  const cx = 430, cy = 98, R0 = 60;
  x.lineWidth = 14; x.strokeStyle = p.cizgi; x.beginPath(); x.arc(cx, cy, R0, 0, TAU); x.stroke();
  if (c.pct != null) {
    x.strokeStyle = col; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy, R0, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.005, c.pct)); x.stroke();
    x.lineCap = 'butt';
  }
  x.fillStyle = p.yazi; x.textAlign = 'center'; x.font = '800 36px ' + p.yazi1; x.fillText(c.pct != null ? '%' + Math.round(c.pct * 100) : '—', cx, cy + 10);
  x.font = '600 15px ' + p.yazi1; x.fillStyle = p.soluk; x.fillText('ömür', cx, cy + 32); x.textAlign = 'left';
  x.fillStyle = p.yazi; x.font = '600 21px ' + p.yazi1;
  x.fillText(c.st === 'na' ? 'Takip yok' : c.st === 'over' ? 'Değiştirilmeli' : '≈ ' + fmtN(c.parts) + ' parça kaldı', 190, 140);
  x.fillStyle = p.soluk; x.font = '500 18px ' + p.yazi1;
  if (c.days != null && c.st !== 'over' && c.st !== 'na') x.fillText(fmtDay(c.days), 190, 166);
  x.fillStyle = p.yazi; x.font = '700 30px ' + p.yazi1; draw(x, c.t.name, 18, 222, 476, 1, 34);
  x.fillStyle = p.soluk; x.font = '500 20px ' + p.yazi2; draw(x, c.t.code || '', 18, 254, 476, 1, 24);
  x.fillStyle = p.cizgi; rr(x, 18, 270, 476, 12, 6); x.fill();
  if (c.pct != null) { x.fillStyle = col; rr(x, 18, 270, Math.max(12, 476 * c.pct), 12, 6); x.fill(); }
  const sp = c.spare, spTxt = sp == null ? 'Stok girilmedi' : sp > 0 ? 'Yedek: ' + sp : 'Yedek yok';
  const spw = cchip(x, p, spTxt, sp == null ? p.na : sp > 0 ? p.ok : p.over, 18, 300);
  const rc = rnCaps(c.t), rtx = rc.index ? 'Kenar ' + (c.w.ed || 1) + '/' + rc.index : rc.regrind && c.w.rg ? 'Bileme ' + c.w.rg + '/' + rc.regrind : '';
  if (rtx) cchip(x, p, rtx, p.mavi, 26 + spw, 300);
  if (c.st !== 'na' && c.TR != null) {
    x.fillStyle = p.soluk; x.font = '500 18px ' + p.yazi1; x.textAlign = 'right';
    x.fillText(fmtN(c.w.used, 0) + ' / ' + fmtN(c.TR, 0) + ' dk kesti', 494, 326); x.textAlign = 'left';
  }
  return doku(cv);
}

// Satır etiketi ve etiketin tuvaldeki doluluk oranı (sahnede ölçek için).
export function lwLabelTex(d: CarkSatiri, p: OmurPaleti, kotu: number): { doku: CanvasTexture; oran: number } {
  const cv = document.createElement('canvas');
  cv.width = 1024; cv.height = 64;
  const x = cv.getContext('2d');
  if (!x) return { doku: doku(cv), oran: 1 };
  const title = upTR(d.title) + '  ·  ' + d.cards.length + (d.depot ? ' KALEM' : ' TAKIM');
  x.font = '700 32px ' + p.yazi1; x.textBaseline = 'middle';
  const ara = 24, sim = 30, w1 = x.measureText(title).width, w2 = kotu ? ara + sim + 6 + x.measureText(String(kotu)).width : 0, sx = 512 - (w1 + w2) / 2;
  x.fillStyle = d.depot ? p.warn : p.yazi; x.fillText(title, sx, 34);
  if (kotu) {
    simgeCiz(x, 'alert', sx + w1 + ara, 34 - sim / 2, sim, p.crit);
    x.fillStyle = p.crit; x.fillText(String(kotu), sx + w1 + ara + sim + 6, 34);
  }
  return { doku: doku(cv), oran: (w1 + w2) / 1024 };
}
