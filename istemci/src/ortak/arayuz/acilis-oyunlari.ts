import type { OynanacakAcilis } from '../veri/gorunum.ts';

// Açılış gösterisinin çizimleri: kurum logosu (yoksa TMI yazısı) tuvalde bir imalat işlemiyle ortaya çıkar.
// Her oyun kare başına çağrılan bir çizicidir; geçen süreyi alır, sürüyorsa true döner. Renkler tasarım değişkenlerindendir.

type Ctx = CanvasRenderingContext2D;
type Nokta = [number, number, number];

export interface Renkler {
  hazard: string; muted: string; edge: string; ink: string; run: string;
  uc: string; yanik: string; isin: string; kor: string; kivilcim: string; kivilcim2: string; sicak: string;
  celik1: string; celik2: string; celik3: string; erimis1: string; erimis2: string; erimis3: string; yakut: string;
}

const DEGISKENLER: Readonly<Record<keyof Renkler, string>> = {
  hazard: '--hazard', muted: '--muted', edge: '--edge', ink: '--ink', run: '--run',
  uc: '--acilis-uc', yanik: '--acilis-yanik', isin: '--acilis-isin', kor: '--acilis-kor', kivilcim: '--acilis-kivilcim',
  kivilcim2: '--acilis-kivilcim-2', sicak: '--acilis-sicak', celik1: '--acilis-celik-1', celik2: '--acilis-celik-2',
  celik3: '--acilis-celik-3', erimis1: '--acilis-erimis-1', erimis2: '--acilis-erimis-2', erimis3: '--acilis-erimis-3',
  yakut: '--acilis-yakut',
};

export function renkleriOku(kok: Element): Renkler {
  const stil = getComputedStyle(kok);
  return Object.fromEntries(
    Object.entries(DEGISKENLER).map(([ad, degisken]) => [ad, stil.getPropertyValue(degisken).trim() || 'gray']),
  ) as unknown as Renkler;
}

export interface Logo {
  x: Ctx; w: number; h: number; lx: number; ly: number; lw: number; lh: number;
  px: Uint8ClampedArray;
  dolu: (xx: number, yy: number) => boolean;
  // Zemin rengi atılmış logo ve onun tek renk maskesi.
  yalniz: HTMLCanvasElement; maske: HTMLCanvasElement;
  // Kenar noktaları, merkez çevresinde açıya göre sıralı.
  kontur: Nokta[];
  renk: Renkler;
}

const tuval = (w: number, h: number): [HTMLCanvasElement, Ctx] => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  const g = c.getContext('2d', { willReadFrequently: true });
  if (g === null) throw new Error('Tuval açılamadı');
  return [c, g];
};

export function tmiResmi(renk: Renkler): string {
  const [c, g] = tuval(640, 220);
  g.fillStyle = renk.hazard; g.font = '900 170px Archivo, Arial Black, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.fillText('TMI', 320, 115);
  return c.toDataURL();
}

export const resimYukle = (src: string): Promise<HTMLImageElement> => new Promise((ok, hata) => {
  const i = new Image();
  i.onload = () => { ok(i); };
  i.onerror = () => { hata(new Error('Logo okunamadı')); };
  i.src = src;
});

// Logo alana sığdırılır (oran korunur). Saydam piksel ya da sol üst köşenin rengine yakın piksel zemindir.
export function logoHazirla(x: Ctx, w: number, h: number, img: HTMLImageElement, renk: Renkler, oran = 0.62): Logo {
  const iw = img.naturalWidth || 320, ih = img.naturalHeight || 140;
  // Logo biraz yukarıda durur: altında uygulamanın adına (CORE) yer kalır.
  const k0 = Math.min((w * oran) / iw, (h * 0.46) / ih);
  const lw = Math.max(1, Math.round(iw * k0)), lh = Math.max(1, Math.round(ih * k0));
  const lx = Math.round((w - lw) / 2), ly = Math.round((h - lh) / 2 - h * 0.06);
  const [, ex] = tuval(lw, lh);
  ex.drawImage(img, 0, 0, lw, lh);
  const px = ex.getImageData(0, 0, lw, lh).data;
  const zr = px[0] ?? 0, zg = px[1] ?? 0, zb = px[2] ?? 0, za = px[3] ?? 0;
  const dolu = (xx: number, yy: number): boolean => {
    const i = (yy * lw + xx) * 4, a = px[i + 3] ?? 0;
    if (a < 100) return false;
    if (za < 100) return true;
    return Math.abs((px[i] ?? 0) - zr) + Math.abs((px[i + 1] ?? 0) - zg) + Math.abs((px[i + 2] ?? 0) - zb) > 70;
  };
  const [yalniz, yx] = tuval(lw, lh);
  const [maske, mx] = tuval(lw, lh);
  const yd = yx.createImageData(lw, lh), md = mx.createImageData(lw, lh);
  for (let yy = 0; yy < lh; yy++) for (let xx = 0; xx < lw; xx++) if (dolu(xx, yy)) {
    const i = (yy * lw + xx) * 4;
    yd.data[i] = px[i] ?? 0; yd.data[i + 1] = px[i + 1] ?? 0; yd.data[i + 2] = px[i + 2] ?? 0; yd.data[i + 3] = 255; md.data[i + 3] = 255;
  }
  yx.putImageData(yd, 0, 0); mx.putImageData(md, 0, 0);
  const kontur: Nokta[] = [];
  for (let yy = 1; yy < lh - 1; yy += 2) for (let xx = 1; xx < lw - 1; xx += 2) {
    if (dolu(xx, yy) && (!dolu(xx - 2, yy) || !dolu(xx + 2, yy) || !dolu(xx, yy - 2) || !dolu(xx, yy + 2))) {
      kontur.push([xx, yy, Math.atan2(yy - lh / 2, xx - lw / 2)]);
    }
  }
  kontur.sort((a, b) => a[2] - b[2]);
  return { x, w, h, lx, ly, lw, lh, px, dolu, yalniz, maske, kontur, renk };
}

function izgara(L: Logo): void {
  const { x, w, h } = L;
  x.clearRect(0, 0, w, h); x.strokeStyle = L.renk.edge; x.lineWidth = 1;
  for (let gx = 0; gx < w; gx += 24) { x.beginPath(); x.moveTo(gx, 0); x.lineTo(gx, h); x.stroke(); }
  for (let gy = 0; gy < h; gy += 24) { x.beginPath(); x.moveTo(0, gy); x.lineTo(w, gy); x.stroke(); }
}

// Parlatma: logonun üstünden çapraz bir ışık bandı geçer (yalnız logo piksellerinde).
function parlat(L: Logo, f: number): void {
  const [c, g] = tuval(L.lw, L.lh);
  g.drawImage(L.maske, 0, 0); g.globalCompositeOperation = 'source-in';
  const bx = -L.lw * 0.4 + f * L.lw * 1.8, gr = g.createLinearGradient(bx, 0, bx + L.lw * 0.35, L.lh);
  gr.addColorStop(0, 'transparent'); gr.addColorStop(0.5, L.renk.uc); gr.addColorStop(1, 'transparent');
  g.globalAlpha = 0.75; g.fillStyle = gr; g.fillRect(0, 0, L.lw, L.lh);
  L.x.drawImage(c, L.lx, L.ly);
}

const yumusak = (t: number): number => 1 - Math.pow(1 - t, 3);
const oran = (g: number, toplam: number): number => Math.round((Math.min(g, toplam) / toplam) * 100);

interface Parcacik { x: number; y: number; vx: number; vy: number; o: number }
interface Bulut { x: number; y: number; r: number; o: number }

function parcaciklar(x: Ctx, liste: Parcacik[], yercekimi: number, sonme: number, renk: (p: Parcacik) => string): void {
  for (const p of liste) {
    p.x += p.vx; p.y += p.vy; p.vy += yercekimi; p.o -= sonme;
    x.globalAlpha = Math.max(0, p.o); x.fillStyle = renk(p); x.fillRect(p.x, p.y, 2, 2);
  }
  x.globalAlpha = 1;
  for (let i = liste.length - 1; i >= 0; i--) if ((liste[i]?.o ?? 0) <= 0) liste.splice(i, 1);
}

function bulutlar(x: Ctx, liste: Bulut[], yuksel: number, buyu: number, sonme: number, renk: string): void {
  for (const p of liste) {
    p.y -= yuksel; p.r += buyu; p.o -= sonme;
    x.globalAlpha = Math.max(0, p.o); x.fillStyle = renk; x.beginPath(); x.arc(p.x, p.y, p.r, 0, Math.PI * 2); x.fill();
  }
  x.globalAlpha = 1;
  for (let i = liste.length - 1; i >= 0; i--) if ((liste[i]?.o ?? 0) <= 0) liste.splice(i, 1);
}

function takimUcu(x: Ctx, renk: Renkler, ux: number, uy: number, r: number): void {
  x.fillStyle = renk.uc; x.shadowColor = renk.hazard; x.shadowBlur = 24;
  x.beginPath(); x.arc(ux, uy, r, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
}

export type Cizici = (gecen: number) => boolean;
type Yazici = (metin: string) => void;

// Tezgah kalkışı: logo satır satır kaba talaşla açılır, sonra kontur ince takımla geçilir.
function tezgah(L: Logo, yaz: Yazici): Cizici {
  const { x, lx, ly, lw, lh, renk } = L;
  const adim = Math.max(3, Math.round(lh / 60));
  const kesitler: { y: number; a: number; b: number }[] = [];
  let ters = false;
  for (let y = 0; y < lh; y += adim) {
    const satir: [number, number][] = [];
    let bas = -1;
    for (let xx = 0; xx <= lw; xx++) {
      const ic = xx < lw && L.dolu(xx, y);
      if (ic && bas < 0) bas = xx; else if (!ic && bas >= 0) { satir.push([bas, xx]); bas = -1; }
    }
    if (satir.length === 0) continue;
    (ters ? satir.reverse().map(([a, b]): [number, number] => [b, a]) : satir).forEach(([a, b]) => kesitler.push({ y, a, b }));
    ters = !ters;
  }
  const toplam = kesitler.reduce((t, s) => t + Math.abs(s.b - s.a), 0);
  const [ortaya, ox] = tuval(lw, lh);
  const talas: Parcacik[] = [];
  let islenen = 0, yapilan = 0;
  const T1 = 1050, T2 = 420;
  const kes = (y: number, a: number, b: number) => { ox.drawImage(L.yalniz, a, y, Math.max(1, b - a), adim, a, y, Math.max(1, b - a), adim); };
  return (g) => {
    izgara(L);
    x.setLineDash([6, 6]); x.strokeStyle = renk.muted; x.strokeRect(lx - 10, ly - 10, lw + 20, lh + 20); x.setLineDash([]);
    let uc: [number, number] = [lx, ly];
    if (g < T1 && kesitler.length > 0) {
      const hedef = (g / T1) * toplam;
      for (let s = kesitler[yapilan]; s && islenen + Math.abs(s.b - s.a) <= hedef; s = kesitler[yapilan]) {
        kes(s.y, Math.min(s.a, s.b), Math.max(s.a, s.b)); islenen += Math.abs(s.b - s.a); yapilan++;
      }
      const s = kesitler[yapilan];
      let ux = 0, uy = 0;
      if (s) {
        const f = (hedef - islenen) / Math.max(1, Math.abs(s.b - s.a));
        ux = s.a + (s.b - s.a) * f; uy = s.y;
        kes(s.y, Math.min(s.a, ux), Math.max(s.a, ux));
      }
      uc = [lx + ux, ly + uy + adim / 2];
      yaz(`T02 Ø6 KABA · G01 X${((ux / lw) * 120).toFixed(1)} Y${((-uy / lh) * 50).toFixed(1)} F2400 S6000 M03 · ${oran(g, T1 + T2)}%`);
      for (let i = 0; i < 4; i++) {
        const an = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, v = 2 + Math.random() * 3.5;
        talas.push({ x: uc[0], y: uc[1], vx: Math.cos(an) * v, vy: Math.sin(an) * v, o: 1 });
      }
      x.drawImage(ortaya, lx, ly);
    } else {
      x.drawImage(L.yalniz, lx, ly);
      const f = Math.min(1, (g - T1) / T2), n = Math.floor(f * L.kontur.length);
      x.fillStyle = renk.hazard; x.shadowColor = renk.hazard; x.shadowBlur = 10;
      for (let i = 0; i < n; i++) { const p = L.kontur[i]; if (p) x.fillRect(lx + p[0] - 0.75, ly + p[1] - 0.75, 1.5, 1.5); }
      x.shadowBlur = 0;
      const p = L.kontur[Math.max(0, n - 1)];
      if (p) {
        uc = [lx + p[0], ly + p[1]];
        yaz(`T05 Ø1 FİNİŞ KONTUR · G02 X${((p[0] / lw) * 120).toFixed(1)} Y${((-p[1] / lh) * 50).toFixed(1)} F800 S12000 · ${oran(g, T1 + T2)}%`);
      }
    }
    parcaciklar(x, talas, 0.25, 0.045, () => renk.hazard);
    takimUcu(x, renk, uc[0], uc[1], g < T1 ? 6 : 3.5);
    if (g >= T1 + T2) { yaz('M30 · PROGRAM SONU'); return false; }
    return true;
  };
}

// Talaş montajı: talaşlar dört yandan girdap gibi gelip logoyu kurar, sonra yüzey parlatılır.
function talas(L: Logo, yaz: Yazici): Cizici {
  const { x, w, h, lx, ly, lw, lh, px } = L;
  const adim = Math.max(2, Math.round(Math.sqrt((lw * lh) / 2600)));
  const parca: { sx: number; sy: number; tx: number; ty: number; r: string; gec: number; don: number; b: number }[] = [];
  for (let yy = 0; yy < lh; yy += adim) for (let xx = 0; xx < lw; xx += adim) if (L.dolu(xx, yy)) {
    const i = (yy * lw + xx) * 4, kenar = Math.floor(Math.random() * 4);
    const sx = kenar === 0 ? -20 : kenar === 1 ? w + 20 : Math.random() * w;
    const sy = kenar === 2 ? -20 : kenar === 3 ? h + 20 : Math.random() * h;
    parca.push({
      sx, sy, tx: lx + xx, ty: ly + yy, r: `rgb(${String(px[i] ?? 0)},${String(px[i + 1] ?? 0)},${String(px[i + 2] ?? 0)})`,
      gec: Math.random() * 380, don: (Math.random() - 0.5) * 12, b: adim + 1,
    });
  }
  const T = 1150, P = 520;
  return (g) => {
    izgara(L);
    if (g < T) {
      for (const p of parca) {
        const k = Math.max(0, Math.min(1, (g - p.gec) / (T - 380))), e = yumusak(k);
        const dx = p.tx - p.sx, dy = p.ty - p.sy, uz = Math.hypot(dx, dy) || 1, kv = Math.sin(e * Math.PI) * 60;
        const xx = p.sx + dx * e - (dy / uz) * kv * (1 - e), yy = p.sy + dy * e + (dx / uz) * kv * (1 - e);
        x.save(); x.translate(xx, yy); x.rotate(p.don * (1 - e)); x.fillStyle = p.r; x.globalAlpha = 0.35 + 0.65 * k;
        x.fillRect(-p.b / 2, -p.b / 4 - (1 - e) * 1.5, p.b, p.b / 2 + (1 - e) * 3); x.restore();
      }
      x.globalAlpha = 1;
      yaz(`TALAŞ TOPLAMA · ${String(parca.length)} PARÇA · ${oran(g, T + P)}%`);
      return true;
    }
    x.drawImage(L.yalniz, lx, ly); parlat(L, Math.min(1, (g - T) / P));
    yaz('PARLATMA · YÜZEY Ra 0,4');
    return g < T + P;
  };
}

// Lazer kesim: ışın konturu keser, logo kızgın halden soğur, dış sac düşer.
function lazer(L: Logo, yaz: Yazici): Cizici {
  const { x, h, lx, ly, lw, lh, kontur, renk } = L;
  const pay = 26, sx0 = lx - pay, sy0 = ly - pay, sw = lw + pay * 2, sh = lh + pay * 2;
  const [sac, sg] = tuval(sw, sh);
  const gr = sg.createLinearGradient(0, 0, sw, sh);
  gr.addColorStop(0, renk.celik1); gr.addColorStop(0.5, renk.celik2); gr.addColorStop(1, renk.celik3);
  sg.fillStyle = gr; sg.fillRect(0, 0, sw, sh);
  sg.fillStyle = renk.uc;
  for (let i = 0; i < sh; i += 2) { sg.globalAlpha = Math.random() * 0.08; sg.fillRect(0, i, sw, 1); }
  sg.globalAlpha = 1;
  const [disSac, dg] = tuval(sw, sh);
  dg.drawImage(sac, 0, 0); dg.globalCompositeOperation = 'destination-out'; dg.drawImage(L.maske, pay, pay);
  const [icSac, ig] = tuval(lw, lh);
  ig.drawImage(L.maske, 0, 0); ig.globalCompositeOperation = 'source-in'; ig.drawImage(sac, -pay, -pay);
  const kivil: Parcacik[] = [], duman: Bulut[] = [];
  const T1 = 1050, T2 = 650;
  return (g) => {
    izgara(L);
    if (g < T1) {
      x.drawImage(sac, sx0, sy0);
      const n = Math.floor(Math.min(1, g / T1) * kontur.length);
      x.fillStyle = renk.yanik; x.globalAlpha = 0.85;
      for (let i = 0; i < n; i++) { const p = kontur[i]; if (p) x.fillRect(lx + p[0] - 1, ly + p[1] - 1, 2.2, 2.2); }
      x.fillStyle = renk.kor;
      for (let i = Math.max(0, n - 60); i < n; i++) {
        const p = kontur[i]; if (!p) continue;
        x.globalAlpha = (i - n + 60) / 60; x.fillRect(lx + p[0] - 1.2, ly + p[1] - 1.2, 2.6, 2.6);
      }
      x.globalAlpha = 1;
      const p = kontur[Math.max(0, n - 1)] ?? [0, 0, 0], ux = lx + p[0], uy = ly + p[1];
      x.strokeStyle = renk.isin; x.lineWidth = 2; x.shadowColor = renk.kor; x.shadowBlur = 20;
      x.beginPath(); x.moveTo(ux, 0); x.lineTo(ux, uy); x.stroke();
      x.fillStyle = renk.uc; x.beginPath(); x.arc(ux, uy, 4, 0, Math.PI * 2); x.fill(); x.shadowBlur = 0;
      for (let i = 0; i < 7; i++) kivil.push({ x: ux, y: uy, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 3, o: 1 });
      if (Math.random() < 0.5) duman.push({ x: ux, y: uy, r: 4, o: 0.35 });
      yaz(`LAZER 4 kW · N2 · KESİM HIZI 18 m/dk · ${oran(g, T1 + T2)}%`);
    } else {
      const f = Math.min(1, (g - T1) / T2), e = f * f;
      x.drawImage(icSac, lx, ly);
      x.globalAlpha = Math.min(1, f * 1.6); x.drawImage(L.yalniz, lx, ly);
      x.globalAlpha = Math.max(0, 0.8 - f); x.globalCompositeOperation = 'source-atop';
      x.fillStyle = renk.sicak; x.fillRect(lx, ly, lw, lh); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
      x.save(); x.translate(sx0 + sw / 2, sy0 + sh / 2 + e * h * 0.9); x.rotate(e * 0.25); x.globalAlpha = 1 - f * 0.6;
      x.drawImage(disSac, -sw / 2, -sh / 2); x.restore(); x.globalAlpha = 1;
      yaz('KESİM TAMAM · PARÇA ÇIKARILDI');
    }
    parcaciklar(x, kivil, 0.35, 0.03, (p) => (p.o > 0.6 ? renk.kivilcim : renk.kivilcim2));
    bulutlar(x, duman, 0.7, 0.5, 0.008, renk.muted);
    return g < T1 + T2;
  };
}

// Ölçüm: CMM probu noktaları dokunarak ölçer, ölçü okları çizilir, KABUL damgası basılır.
function cmm(L: Logo, yaz: Yazici): Cizici {
  const { x, lx, ly, lw, lh, kontur, renk } = L;
  const sec = (f: (a: Nokta, b: Nokta) => boolean): Nokta | undefined => kontur.reduce<Nokta | undefined>((a, b) => (a === undefined || f(b, a) ? b : a), undefined);
  const noktalar: Nokta[] = [];
  for (const n of [sec((a, b) => a[0] < b[0]), sec((a, b) => a[1] < b[1]), sec((a, b) => a[0] > b[0]), sec((a, b) => a[1] > b[1])]) if (n) noktalar.push(n);
  for (let i = 1; i <= 4 && kontur.length > 0; i++) { const n = kontur[Math.floor(kontur.length * (i / 5 + 0.07)) % kontur.length]; if (n) noktalar.push(n); }
  const mm = 120 / lw, T = 1500, S = 450, adimSure = T / Math.max(1, noktalar.length);
  const ok = (x1: number, y1: number, x2: number, y2: number, metin: string, f: number) => {
    x.strokeStyle = renk.ink; x.fillStyle = renk.ink; x.lineWidth = 1; x.globalAlpha = Math.max(0, f);
    const xs = x1 + (x2 - x1) * f, ys = y1 + (y2 - y1) * f;
    x.beginPath(); x.moveTo(x1, y1); x.lineTo(xs, ys); x.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    for (const [px2, py2, an] of [[x1, y1, a + Math.PI], [xs, ys, a]] as const) {
      x.beginPath(); x.moveTo(px2, py2);
      x.lineTo(px2 - Math.cos(an - 0.35) * 8, py2 - Math.sin(an - 0.35) * 8);
      x.lineTo(px2 - Math.cos(an + 0.35) * 8, py2 - Math.sin(an + 0.35) * 8); x.fill();
    }
    if (f >= 1) {
      x.font = '600 12px JetBrains Mono, monospace'; x.textAlign = 'center';
      x.fillText(metin, (x1 + x2) / 2 + (y1 === y2 ? 0 : 52), (y1 + y2) / 2 + (y1 === y2 ? -8 : 4));
    }
    x.globalAlpha = 1;
  };
  return (g) => {
    izgara(L);
    x.globalAlpha = g < T ? 0.18 : Math.min(1, 0.18 + (g - T) / S); x.drawImage(L.yalniz, lx, ly); x.globalAlpha = 1;
    const tamam = Math.min(noktalar.length, Math.floor(g / adimSure));
    for (const p of noktalar.slice(0, tamam)) {
      x.strokeStyle = renk.run; x.lineWidth = 2;
      x.beginPath(); x.arc(lx + p[0], ly + p[1], 5, 0, Math.PI * 2); x.stroke();
      x.beginPath(); x.moveTo(lx + p[0] - 9, ly + p[1]); x.lineTo(lx + p[0] + 9, ly + p[1]);
      x.moveTo(lx + p[0], ly + p[1] - 9); x.lineTo(lx + p[0], ly + p[1] + 9); x.stroke();
    }
    if (g < T && noktalar.length > 0) {
      const i = Math.min(noktalar.length - 1, tamam), onceki = noktalar[Math.max(0, i - 1)], hedef = noktalar[i];
      if (onceki && hedef) {
        const f = yumusak(Math.min(1, (g - i * adimSure) / (adimSure * 0.7)));
        const ax = lx + (i > 0 ? onceki[0] : lw / 2), ay = ly + (i > 0 ? onceki[1] : -40), bx = lx + hedef[0], by = ly + hedef[1];
        const px2 = ax + (bx - ax) * f, py2 = ay + (by - ay) * f;
        x.strokeStyle = renk.muted; x.lineWidth = 3; x.beginPath(); x.moveTo(px2, py2 - 70); x.lineTo(px2, py2 - 6); x.stroke();
        x.fillStyle = renk.yakut; x.beginPath(); x.arc(px2, py2, 6, 0, Math.PI * 2); x.fill();
        if (f > 0.95) {
          const r = ((g % adimSure) / adimSure) * 30;
          x.strokeStyle = renk.hazard; x.globalAlpha = 1 - r / 30; x.lineWidth = 2; x.beginPath(); x.arc(bx, by, r, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1;
        }
        yaz(`CMM · NOKTA ${String(i + 1)}/${String(noktalar.length)} · X ${(hedef[0] * mm).toFixed(3)} Y ${((lh - hedef[1]) * mm).toFixed(3)} Z 0.000`);
      }
    }
    if (tamam >= 4) ok(lx, ly + lh + 26, lx + lw, ly + lh + 26, `${(lw * mm).toFixed(2)} ±0,02`, Math.min(1, (g - 4 * adimSure) / 260));
    if (tamam >= 5) ok(lx + lw + 26, ly, lx + lw + 26, ly + lh, `${(lh * mm).toFixed(2)} ±0,02`, Math.min(1, (g - 5 * adimSure) / 260));
    if (g >= T) {
      const f = Math.min(1, (g - T) / 260), sk = 1 + (1 - yumusak(f)) * 0.8;
      x.save(); x.translate(lx + lw - 40, ly - 34); x.rotate(-0.12); x.scale(sk, sk); x.globalAlpha = f;
      x.strokeStyle = renk.run; x.fillStyle = renk.run; x.lineWidth = 3; x.strokeRect(-70, -20, 140, 40);
      x.font = '800 20px Archivo, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('KABUL', 0, 1); x.restore(); x.globalAlpha = 1;
      yaz(`ÖLÇÜM TAMAM · ${String(noktalar.length)}/${String(noktalar.length)} NOKTA TOLERANS İÇİNDE`);
    }
    return g < T + S + 250;
  };
}

// Döküm: erimiş metal kalıbı doldurur, soğurken logo kendi rengine döner.
function dokum(L: Logo, yaz: Yazici): Cizici {
  const { x, lx, ly, lw, lh, renk } = L;
  const [gecici, g2] = tuval(lw, lh);
  const buhar: Bulut[] = [];
  const T1 = 1150, T2 = 600;
  return (g) => {
    izgara(L);
    x.globalAlpha = 0.55; x.filter = 'brightness(0.15)'; x.drawImage(L.maske, lx, ly); x.filter = 'none'; x.globalAlpha = 1;
    const f = Math.min(1, g / T1), seviye = lh * (1 - yumusak(f)) - 6;
    g2.globalCompositeOperation = 'source-over'; g2.clearRect(0, 0, lw, lh);
    const gr = g2.createLinearGradient(0, seviye, 0, lh);
    gr.addColorStop(0, renk.erimis1); gr.addColorStop(0.15, renk.erimis2); gr.addColorStop(1, renk.erimis3);
    g2.fillStyle = gr; g2.beginPath(); g2.moveTo(0, lh);
    for (let xx = 0; xx <= lw; xx += 6) g2.lineTo(xx, seviye + Math.sin(xx / 22 + g / 90) * 4 * (1 - f * 0.6));
    g2.lineTo(lw, lh); g2.closePath(); g2.fill();
    g2.globalCompositeOperation = 'destination-in'; g2.drawImage(L.maske, 0, 0);
    if (g < T1) {
      x.shadowColor = renk.sicak; x.shadowBlur = 22; x.drawImage(gecici, lx, ly); x.shadowBlur = 0;
      const ax = lx + lw * 0.5 + Math.sin(g / 120) * 2;
      x.strokeStyle = renk.erimis2; x.lineWidth = 6; x.shadowColor = renk.sicak; x.shadowBlur = 18;
      x.beginPath(); x.moveTo(ax, 0); x.lineTo(ax, ly + Math.max(0, seviye)); x.stroke(); x.shadowBlur = 0;
      yaz(`DÖKÜM · 1530 °C · DOLUM ${String(Math.round(f * 100))}%`);
    } else {
      const s = Math.min(1, (g - T1) / T2);
      x.drawImage(L.yalniz, lx, ly);
      x.globalAlpha = 1 - s; x.drawImage(gecici, lx, ly); x.globalAlpha = 1;
      if (Math.random() < 0.7) buhar.push({ x: lx + Math.random() * lw, y: ly + Math.random() * lh * 0.5, r: 3, o: 0.4 });
      if (s > 0.6) parlat(L, (s - 0.6) / 0.4);
      yaz(`SOĞUMA · ${String(Math.round(1530 - s * 1505))} °C`);
    }
    bulutlar(x, buhar, 1.2, 0.6, 0.01, renk.muted);
    return g < T1 + T2;
  };
}

// 3B ekstrüzyon: logo yandan derinlikle döner, öne gelince parlatılır.
function ucBoyut(L: Logo, yaz: Yazici): Cizici {
  const { x, w, h, lw, lh } = L;
  const T = 1300, P = 450, katman = 22;
  return (g) => {
    izgara(L);
    const e = yumusak(Math.min(1, g / T));
    const aci = (1 - e) * 1.15, derin = (1 - e) * 46, egim = (1 - e) * 0.35, sx = Math.max(0.08, Math.cos(aci));
    x.save(); x.translate(w / 2, h / 2); x.transform(sx, egim * 0.3, 0, 1, 0, 0);
    for (let k = katman; k >= 0; k--) {
      const o = (k / katman) * derin;
      x.filter = k > 0 ? `brightness(${String(0.35 + 0.4 * (1 - k / katman))})` : 'none';
      x.drawImage(L.yalniz, -lw / 2 + o * 0.9, -lh / 2 + o * 0.45);
    }
    x.filter = 'none'; x.restore();
    if (g >= T) parlat(L, Math.min(1, (g - T) / P));
    yaz(g < T ? `EKSTRÜZYON · DERİNLİK ${derin.toFixed(1)} mm · AÇI ${String(Math.round(aci * 57.3))}°` : 'YÜZEY İŞLEME · PARLATMA');
    return g < T + P;
  };
}

// sure: oyunun kendi uzunluğu (ms, oyundaki aşama sürelerinin toplamı); istenen süreye bu oranla gerilir.
const OYUNLAR: Readonly<Record<OynanacakAcilis, { kur: (L: Logo, yaz: Yazici) => Cizici; sure: number; oran?: number }>> = {
  tezgah: { kur: tezgah, sure: 1470 },
  talas: { kur: talas, sure: 1670 },
  lazer: { kur: lazer, sure: 1700 },
  cmm: { kur: cmm, sure: 2200, oran: 0.5 },
  dokum: { kur: dokum, sure: 1750 },
  '3b': { kur: ucBoyut, sure: 1750, oran: 0.55 },
};

export const UYGULAMA_ADI = 'CORE';

const sinirla = (t: number): number => Math.min(1, Math.max(0, t));

// Uygulamanın adı logonun altına lazerle kazınır: önce harflerin konturu soldan sağa ışınla çizilir, sonra harfler dolar
// ve altında ince bir çizgi açılır. İlerleme oyunun kendi süresine oranlıdır (0..1); her oyunda aynı anda biter.
export function adKazi(L: Logo, ilerleme: number, yazi: string): void {
  const { x, w, h, renk } = L;
  const boy = Math.max(18, Math.min(h * 0.085, w * 0.11, 76));
  const aralik = boy * 0.32;
  const taban = Math.min(L.ly + L.lh + boy * 1.45, h - boy * 1.2);
  x.save();
  x.font = `900 ${String(boy)}px ${yazi}`; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  const harfler = [...UYGULAMA_ADI].map((c) => ({ c, g: x.measureText(c).width }));
  const toplam = harfler.reduce((t, hf) => t + hf.g, 0) + aralik * (harfler.length - 1);
  const sol = (w - toplam) / 2, ust = taban - boy * 0.78;
  const harfleriCiz = (ciz: (c: string, hx: number) => void) => {
    let hx = sol;
    for (const hf of harfler) { ciz(hf.c, hx); hx += hf.g + aralik; }
  };
  const kontur = sinirla((ilerleme - 0.3) / 0.45), dolgu = sinirla((ilerleme - 0.68) / 0.25), cizgi = sinirla((ilerleme - 0.8) / 0.2);
  if (kontur > 0) {
    x.save();
    x.beginPath(); x.rect(sol - aralik, ust - boy * 0.2, (toplam + aralik * 2) * kontur, boy * 1.4); x.clip();
    x.strokeStyle = renk.hazard; x.lineWidth = Math.max(1, boy / 40);
    harfleriCiz((c, hx) => { x.strokeText(c, hx, taban); });
    x.restore();
    if (kontur < 1) {
      const isik = sol - aralik + (toplam + aralik * 2) * kontur, iy = ust + boy * (0.5 + 0.45 * Math.sin(ilerleme * 90));
      x.fillStyle = renk.kivilcim; x.shadowColor = renk.hazard; x.shadowBlur = 14;
      x.beginPath(); x.arc(isik, iy, Math.max(2, boy / 22), 0, Math.PI * 2); x.fill();
      x.shadowBlur = 0;
    }
  }
  if (dolgu > 0) {
    x.globalAlpha = dolgu; x.fillStyle = renk.ink;
    harfleriCiz((c, hx) => { x.fillText(c, hx, taban); });
    x.globalAlpha = 1;
  }
  if (cizgi > 0) {
    const yari = (toplam / 2) * yumusak(cizgi);
    x.fillStyle = renk.hazard; x.fillRect(w / 2 - yari, taban + boy * 0.22, yari * 2, Math.max(1, boy / 28));
  }
  x.restore();
}

// İstenen süre (ms) verilmezse oyun kendi süresiyle oynar; verilirse saat o oranda hızlanır ya da yavaşlar.
export function zamanOrani(tur: OynanacakAcilis, hedefSure: number | null): number {
  return hedefSure === null || hedefSure <= 0 ? 1 : OYUNLAR[tur].sure / hedefSure;
}

// Tuvali kutunun boyuna kurar, oyunu oynatır; bitince ya da durdurulunca bir kez bitti çağrılır. Dönen işlev durdurur.
export function acilisOynat(
  tur: OynanacakAcilis, tuvalOgesi: HTMLCanvasElement, img: HTMLImageElement, renk: Renkler, yaz: Yazici, bitti: () => void,
  hedefSure: number | null = null,
): () => void {
  const x = tuvalOgesi.getContext('2d');
  if (x === null) { bitti(); return () => undefined; }
  const w = tuvalOgesi.clientWidth || 800, h = tuvalOgesi.clientHeight || 600, d = window.devicePixelRatio || 1;
  tuvalOgesi.width = w * d; tuvalOgesi.height = h * d; x.setTransform(d, 0, 0, d, 0, 0);
  const oyun = OYUNLAR[tur];
  const L = logoHazirla(x, w, h, img, renk, oyun.oran);
  const ciz = oyun.kur(L, yaz);
  const yazi = getComputedStyle(tuvalOgesi).fontFamily || 'Archivo, sans-serif';
  let is = 0, sondu = false;
  const son = () => { if (!sondu) { sondu = true; cancelAnimationFrame(is); bitti(); } };
  const bas = performance.now(), oran = zamanOrani(tur, hedefSure);
  const kare = (t: number) => {
    if (sondu) return;
    const g = (t - bas) * oran, surer = ciz(g);
    adKazi(L, g / oyun.sure, yazi);
    if (surer) is = requestAnimationFrame(kare); else son();
  };
  is = requestAnimationFrame(kare);
  return son;
}
