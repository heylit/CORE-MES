import type { Texture } from 'three';
import { CanvasTexture } from 'three';
import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { sayi } from '../kurallar.ts';
import { alanKutusu, istasyonKutusu, makineKutusu, rafKutusu, sahneNesneleri } from './geometri.ts';
import type { Dikdortgen } from './geometri.ts';
import { dokuyaCevir, tohumlu, tuval } from './nesneler.ts';
import type { Palet } from './renkler.ts';

const ZEMIN_ISARETLI: ReadonlySet<string> = new Set(['bolge', 'karantina', 'sevkiyat', 'kabul', 'uretim_cikisi', 'depo_zemini', 'fason']);

// Zemin dokusu: beton, derzler ve boyalı işaretler (yürüyüş yolu, bölge, oda, makine ve raf sınırı) tek tuvalde.
// Tuvalin sol üstü salonun (0, 0) köşesidir; x sağa, z aşağı (kayıt koordinatı).

const bosDoku = (): Texture => new CanvasTexture(document.createElement('canvas'));

const tozKarolari = new Map<boolean, HTMLCanvasElement | null>();
function tozKarosu(kaba: boolean): HTMLCanvasElement | null {
  if (tozKarolari.has(kaba)) return tozKarolari.get(kaba) ?? null;
  const K = 256;
  const t = tuval(K, K);
  if (t) {
    const [, g] = t;
    const r = tohumlu(29);
    const toz = Math.round((K * K) / (kaba ? 260 : 100));
    for (let i = 0; i < toz; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(55,55,50,${0.05 + r() * 0.09})` : `rgba(255,255,255,${0.04 + r() * 0.08})`;
      g.fillRect(r() * K, r() * K, 1 + r() * 2, 1 + r() * 2);
    }
  }
  tozKarolari.set(kaba, t ? t[0] : null);
  return t ? t[0] : null;
}

// Zemin dokusunu değiştiren alanlar (kimlik ve sürüm değil): aynıysa doku yeniden çizilmez.
export function zeminImzasi(y: YerlesimCevabi): string {
  return JSON.stringify([
    y.salon.genislik, y.salon.derinlik, y.salon.hucreBoyu,
    y.alanlar.map((a) => [a.tur, a.ad, a.x, a.z, a.donus, a.genislik, a.derinlik, a.kapi]),
    y.istasyonYerleri.map((i) => [i.tip, i.x, i.z, i.donus, i.genislik, i.derinlik]),
    y.makineYerleri.map((m) => [m.istasyon?.tip ?? null, m.x, m.z, m.donus, m.genislik, m.derinlik]),
    y.raflar.map((r) => [r.x, r.z, r.donus, r.genislik, r.derinlik]),
  ]);
}

export const izgaraImzasi = (y: YerlesimCevabi): string =>
  JSON.stringify([y.salon.genislik, y.salon.derinlik, y.salon.hucreBoyu, y.salon.sutunlar, y.salon.satirlar]);

export function zeminDokusu(p: Palet, y: YerlesimCevabi, kaba: boolean): Texture {
  const G = sayi(y.salon.genislik);
  const D = sayi(y.salon.derinlik);
  const hucre = sayi(y.salon.hucreBoyu);
  const PX = Math.min(kaba ? 40 : 56, 4096 / Math.max(G, D));
  const t = tuval(G * PX, D * PX);
  if (!t) return bosDoku();
  const [c, g] = t;
  const W = c.width;
  const H = c.height;
  const r = tohumlu(11);

  // Beton: açık ve koyu geniş lekeler, ince toz.
  g.fillStyle = p.metin.zemin;
  g.fillRect(0, 0, W, H);
  const leke = Math.round((G * D) / 4.8);
  for (let i = 0; i < leke; i++) {
    const x = r() * W;
    const z = r() * H;
    const yc = ((30 + r() * 210) * PX) / 56;
    const koyu = r() < 0.55;
    const a = 0.025 + r() * 0.05;
    const gr = g.createRadialGradient(x, z, 0, x, z, yc);
    gr.addColorStop(0, koyu ? p.metin.leke : 'rgba(255,255,250,1)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalAlpha = a;
    g.fillStyle = gr;
    g.fillRect(x - yc, z - yc, 2 * yc, 2 * yc);
  }
  g.globalAlpha = 1;
  // İnce toz: tek karo (256 px, yaklaşık 4,5 m) yinelenir. Tuvale tek tek nokta basmak büyük salonda 40 binden fazla
  // çizim ediyordu (ölçüldü: yeniden kurulumun yarısı).
  const karo = tozKarosu(kaba);
  const desen = karo ? g.createPattern(karo, 'repeat') : null;
  if (desen) {
    g.fillStyle = desen;
    g.fillRect(0, 0, W, H);
  }
  // Derzler: hücre çizgisinde.
  g.globalAlpha = 0.38;
  g.strokeStyle = p.metin.derz;
  g.lineWidth = 2;
  for (let x = hucre; x < G - 1e-6; x += hucre) { g.beginPath(); g.moveTo(x * PX, 0); g.lineTo(x * PX, H); g.stroke(); }
  for (let z = hucre; z < D - 1e-6; z += hucre) { g.beginPath(); g.moveTo(0, z * PX); g.lineTo(W, z * PX); g.stroke(); }
  g.globalAlpha = 1;

  // Öğenin yerel ekseninde (metre) çizer.
  const yerel = (k: Dikdortgen, f: () => void) => {
    g.save();
    g.translate(k.x * PX, k.z * PX);
    g.rotate((k.donus * Math.PI) / 180);
    g.scale(PX, PX);
    f();
    g.restore();
  };
  const ok = (x: number, z: number, aci: number) => {
    g.save();
    g.translate(x, z);
    g.rotate(aci);
    g.beginPath();
    g.moveTo(-0.9, -0.12);
    g.lineTo(0.2, -0.12);
    g.lineTo(0.2, -0.35);
    g.lineTo(0.8, 0);
    g.lineTo(0.2, 0.35);
    g.lineTo(0.2, 0.12);
    g.lineTo(-0.9, 0.12);
    g.closePath();
    g.fill();
    g.restore();
  };
  const sari = p.metin.cizgi;

  // Bölgeler ve stok alanları: renkli dolgu, taramalı kenar bandı ve ad.
  for (const a of y.alanlar) {
    if (!ZEMIN_ISARETLI.has(a.tur)) continue;
    const k = alanKutusu(a);
    const renk = a.tur === 'karantina' ? p.metin.bolgeKirmizi : a.tur === 'sevkiyat' ? p.metin.bolgeYesil : sari;
    yerel(k, () => {
      const w = k.genislik;
      const d = k.derinlik;
      g.globalAlpha = 0.13;
      g.fillStyle = renk;
      g.fillRect(-w / 2, -d / 2, w, d);
      g.globalAlpha = 1;
      g.save();
      g.beginPath();
      g.rect(-w / 2, -d / 2, w, d);
      g.rect(-w / 2 + 0.14, -d / 2 + 0.14, w - 0.28, d - 0.28);
      g.clip('evenodd');
      g.fillStyle = renk;
      g.fillRect(-w / 2, -d / 2, w, d);
      g.fillStyle = p.metin.tarama;
      for (let s = -w - d; s < w + d; s += 0.5) {
        g.beginPath();
        g.moveTo(-w / 2 + s, -d / 2);
        g.lineTo(-w / 2 + s + 0.25, -d / 2);
        g.lineTo(-w / 2 + s + 0.25 - d, d / 2);
        g.lineTo(-w / 2 + s - d, d / 2);
        g.fill();
      }
      g.restore();
      g.fillStyle = renk;
      g.font = '600 0.42px sans-serif';
      g.fillText(a.ad.toLocaleUpperCase('tr'), -w / 2 + 0.3, -d / 2 + 0.7, Math.max(0.5, w - 0.6));
    });
  }

  // Yürüyüş yolları: gölgeli dolgu, sari kenar çizgisi, lastik izi ve yön okları.
  for (const a of y.alanlar) {
    if (a.tur !== 'yuruyus_yolu') continue;
    const k = alanKutusu(a);
    const eksenli = Math.abs((((k.donus % 180) + 180) % 180)) < 0.01;
    const duvarda = (kenar: 'on' | 'arka' | 'sol' | 'sag') => {
      if (!eksenli) return false;
      if (kenar === 'arka') return k.z - k.derinlik / 2 <= 0.05;
      if (kenar === 'on') return k.z + k.derinlik / 2 >= D - 0.05;
      if (kenar === 'sol') return k.x - k.genislik / 2 <= 0.05;
      return k.x + k.genislik / 2 >= G - 0.05;
    };
    yerel(k, () => {
      const w = k.genislik;
      const d = k.derinlik;
      const t_ = 0.12;
      g.fillStyle = 'rgba(84,98,92,.2)';
      g.fillRect(-w / 2, -d / 2, w, d);
      g.fillStyle = sari;
      if (!duvarda('arka')) g.fillRect(-w / 2, -d / 2 - t_ / 2, w, t_);
      if (!duvarda('on')) g.fillRect(-w / 2, d / 2 - t_ / 2, w, t_);
      if (!duvarda('sol')) g.fillRect(-w / 2 - t_ / 2, -d / 2, t_, d);
      if (!duvarda('sag')) g.fillRect(w / 2 - t_ / 2, -d / 2, t_, d);
      const yatay = w >= d;
      const uzun = Math.max(w, d);
      const en = Math.min(w, d);
      if (uzun < 8) return;
      for (let i = 0; i < (en >= 2.5 ? 14 : 5); i++) {
        g.strokeStyle = `rgba(25,25,25,${0.025 + r() * 0.04})`;
        g.lineWidth = (5 + r() * 9) / PX;
        const o = (r() - 0.5) * en * 0.6;
        g.beginPath();
        if (yatay) {
          g.moveTo(-w / 2 + 0.5, o);
          g.bezierCurveTo(-w / 6, o + (r() - 0.5) * 0.8, w / 6, o + (r() - 0.5) * 0.8, w / 2 - 0.5, o + (r() - 0.5) * 0.5);
        } else {
          g.moveTo(o, -d / 2 + 0.5);
          g.bezierCurveTo(o + (r() - 0.5) * 0.5, -d / 6, o + (r() - 0.5) * 0.5, d / 6, o, d / 2 - 0.5);
        }
        g.stroke();
      }
      if (en < 2.5) return;
      g.fillStyle = p.metin.ok;
      g.globalAlpha = 0.85;
      const n = Math.floor(uzun / 9);
      for (let i = 0; i < n; i++) {
        const s = -uzun / 2 + ((i + 0.5) * uzun) / n;
        if (yatay) { ok(s, -en / 4, 0); ok(s + 1.5, en / 4, Math.PI); } else { ok(en / 4, s, Math.PI / 2); ok(-en / 4, s + 1.5, -Math.PI / 2); }
      }
      g.globalAlpha = 1;
    });
  }

  // Odalar: açık dolgu, ad; kapının önünde yaya geçidi.
  for (const a of y.alanlar) {
    if (a.tur !== 'oda' && a.tur !== 'cam_oda') continue;
    const k = alanKutusu(a);
    yerel(k, () => {
      const w = k.genislik;
      const d = k.derinlik;
      g.fillStyle = a.tur === 'cam_oda' ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.05)';
      g.fillRect(-w / 2, -d / 2, w, d);
      g.globalAlpha = 0.55;
      g.fillStyle = p.metin.odaYazi;
      g.font = '600 0.5px sans-serif';
      g.fillText(a.ad.toLocaleUpperCase('tr'), -w / 2 + 0.35, -d / 2 + 0.8, Math.max(0.5, w - 0.7));
      g.globalAlpha = 1;
      if (!a.kapi) return;
      const kg = sayi(a.kapi.genislik);
      const ofset = sayi(a.kapi.ofset);
      const kenar = a.kapi.kenar;
      // Kapı merkezi ve dış normal (geometri.ts odaKenarlari ile aynı ölçü).
      const yatay = kenar === 'arka' || kenar === 'on';
      const boy = yatay ? w : d;
      const yon = kenar === 'on' || kenar === 'sol' ? -1 : 1;
      const orta = boy / 2 + yon * ofset;
      let cx = 0;
      let cz = 0;
      let nx = 0;
      let nz = 0;
      if (kenar === 'arka') { cx = -w / 2 + orta; cz = -d / 2; nz = -1; }
      if (kenar === 'on') { cx = w / 2 - orta; cz = d / 2; nz = 1; }
      if (kenar === 'sag') { cx = w / 2; cz = -d / 2 + orta; nx = 1; }
      if (kenar === 'sol') { cx = -w / 2; cz = d / 2 - orta; nx = -1; }
      g.save();
      g.translate(cx, cz);
      g.rotate(Math.atan2(nz, nx));
      g.fillStyle = 'rgba(244,244,238,.9)';
      for (let i = 0; i < 3; i++) g.fillRect(0.25 + i * 0.44, -kg / 2, 0.22, kg);
      g.restore();
    });
  }

  // Talaşlı imalat istasyonunun önünde yağ lekesi.
  for (const i of sahneNesneleri(y)) {
    if (i.tip !== 'talasli') continue;
    const k = i.kutu;
    yerel(k, () => {
      for (let j = 0; j < 3; j++) {
        const s = (r() - 0.5) * Math.min(2.4, k.genislik * 0.7);
        const f = k.derinlik / 2 - 0.2 + r() * 0.5;
        const yc = (18 + r() * 40) / PX;
        const gr = g.createRadialGradient(s, f, 0, s, f, yc);
        gr.addColorStop(0, p.metin.yag);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.22;
        g.fillStyle = gr;
        g.fillRect(s - yc, f - yc, 2 * yc, 2 * yc);
        g.globalAlpha = 1;
      }
    });
  }

  // Makine ve raf sınırı: sari çizgi; rafta kesik.
  g.strokeStyle = sari;
  for (const k of [...y.istasyonYerleri.map(istasyonKutusu), ...y.makineYerleri.map(makineKutusu)]) {
    yerel(k, () => {
      g.lineWidth = 0.09;
      g.strokeRect(-k.genislik / 2, -k.derinlik / 2, k.genislik, k.derinlik);
    });
  }
  for (const rf of y.raflar) {
    const k = rafKutusu(rf);
    yerel(k, () => {
      g.lineWidth = 0.07;
      g.setLineDash([0.3, 0.2]);
      g.strokeRect(-k.genislik / 2 - 0.15, -k.derinlik / 2 - 0.15, k.genislik + 0.3, k.derinlik + 0.3);
      g.setLineDash([]);
    });
  }
  return dokuyaCevir(c);
}

// Hücre ızgarası: kesik beyaz çizgi ve her hücrenin adı (ARKON konum adresiyle aynı: sütun harfi + satır numarası).
export function izgaraDokusu(y: YerlesimCevabi, kaba: boolean): Texture {
  const G = sayi(y.salon.genislik);
  const D = sayi(y.salon.derinlik);
  const h = sayi(y.salon.hucreBoyu);
  const PX = Math.min(kaba ? 40 : 50, 4096 / Math.max(G, D));
  const t = tuval(G * PX, D * PX);
  if (!t) return bosDoku();
  const [c, g] = t;
  g.strokeStyle = 'rgba(255,255,255,.4)';
  g.lineWidth = 1.5;
  g.setLineDash([10, 10]);
  for (let x = h; x < G - 1e-6; x += h) { g.beginPath(); g.moveTo(x * PX, 0); g.lineTo(x * PX, c.height); g.stroke(); }
  for (let z = h; z < D - 1e-6; z += h) { g.beginPath(); g.moveTo(0, z * PX); g.lineTo(c.width, z * PX); g.stroke(); }
  g.setLineDash([]);
  const boyut = Math.max(10, Math.min(15, h * PX * 0.09));
  g.font = `600 ${boyut}px monospace`;
  y.salon.sutunlar.forEach((s, i) => {
    y.salon.satirlar.forEach((st, j) => {
      const ad = `${s}${st}`;
      const x = i * h * PX + 8;
      const z = j * h * PX + 8;
      const gen = g.measureText(ad).width + 10;
      g.fillStyle = 'rgba(24,34,44,.5)';
      g.fillRect(x, z, gen, boyut + 6);
      g.fillStyle = 'rgba(255,255,255,1)';
      g.fillText(ad, x + 5, z + boyut);
    });
  });
  return dokuyaCevir(c);
}
