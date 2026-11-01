import {
  AdditiveBlending, BoxGeometry, CanvasTexture, CylinderGeometry, DoubleSide, ExtrudeGeometry, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, PlaneGeometry, PointLight, RepeatWrapping, SRGBColorSpace, Shape, SphereGeometry, Sprite, SpriteMaterial,
} from 'three';
import type { BufferGeometry, Color, Material, Object3D, Texture } from 'three';
import type { GecisTuru } from '#paylasilan/sozlesme/atolye.ts';
import type { Palet } from './renkler.ts';
import { makineCinsi } from '../kurallar.ts';

// Sahne nesneleri ölçülerinden üretilir; gerçek makine modeli ya da çizim yoktur. Ölçü metredir, y yukarıdır,
// istasyonun ön yüzü (operatör tarafı) yerel +z yönüdür.

// ---------- malzemeler ----------

export interface Malzemeler {
  zemin: MeshStandardMaterial;
  beton: MeshStandardMaterial;
  duvar: MeshStandardMaterial;
  panel: MeshStandardMaterial;
  pencere: MeshStandardMaterial;
  boya: MeshStandardMaterial;
  boyaOrta: MeshStandardMaterial;
  koyu: MeshStandardMaterial;
  siyah: MeshStandardMaterial;
  celik: MeshStandardMaterial;
  celikKoyu: MeshStandardMaterial;
  alu: MeshStandardMaterial;
  krom: MeshStandardMaterial;
  galv: MeshStandardMaterial;
  vurgu: MeshStandardMaterial;
  mavi: MeshStandardMaterial;
  sari: MeshStandardMaterial;
  turuncu: MeshStandardMaterial;
  kirmizi: MeshStandardMaterial;
  kolon: MeshStandardMaterial;
  raf: MeshStandardMaterial;
  rafKiris: MeshStandardMaterial;
  ahsap: MeshStandardMaterial;
  ahsapUst: MeshStandardMaterial;
  kaucuk: MeshStandardMaterial;
  ic: MeshStandardMaterial;
  kutu: MeshStandardMaterial;
  kutuGri: MeshStandardMaterial;
  karton: MeshStandardMaterial;
  granit: MeshStandardMaterial;
  cam: MeshStandardMaterial;
  camLazer: MeshStandardMaterial;
  camOda: MeshStandardMaterial;
  lamba: MeshBasicMaterial;
  icIsik: MeshBasicMaterial;
}

const std = (renk: Color, puruz: number, metal: number, ek: Partial<MeshStandardMaterial> = {}) =>
  Object.assign(new MeshStandardMaterial({ color: renk.clone(), roughness: puruz, metalness: metal }), ek);

export function malzemeleriKur(p: Palet, zeminDokusu: Texture, granitDokusu: Texture): Malzemeler {
  const cam = (renk: Color, saydam: number, ortam: number, iki = false) =>
    std(renk, 0.04, 0.1, { transparent: true, opacity: saydam, depthWrite: false, envMapIntensity: ortam, side: iki ? DoubleSide : undefined });
  const zemin = std(p.zemin, 0.58, 0, { map: zeminDokusu });
  // Rengi doku taşır; malzeme rengi çarpan olduğundan beyazdır.
  zemin.color.setRGB(1, 1, 1);
  const granit = std(p.granit, 0.35, 0, { map: granitDokusu });
  granit.color.setRGB(1, 1, 1);
  return {
    zemin,
    beton: std(p.beton, 0.9, 0),
    duvar: std(p.duvar, 0.65, 0.15),
    panel: std(p.panel, 0.6, 0.3),
    pencere: std(p.pencere, 0.08, 0.1, { emissive: p.pencereIsik.clone(), emissiveIntensity: 0.75 }),
    boya: std(p.boya, 0.4, 0.05),
    boyaOrta: std(p.boyaOrta, 0.45, 0.1),
    koyu: std(p.koyu, 0.55, 0.15),
    siyah: std(p.siyah, 0.6, 0),
    celik: std(p.celik, 0.26, 0.92),
    celikKoyu: std(p.celikKoyu, 0.35, 0.85),
    alu: std(p.alu, 0.3, 0.85),
    krom: std(p.krom, 0.12, 1),
    galv: std(p.galv, 0.45, 0.65),
    vurgu: std(p.vurgu, 0.4, 0.15),
    mavi: std(p.mavi, 0.42, 0.12),
    sari: std(p.sari, 0.45, 0.05),
    turuncu: std(p.turuncu, 0.5, 0.05),
    kirmizi: std(p.kirmizi, 0.42, 0.05),
    kolon: std(p.kolon, 0.55, 0.4),
    raf: std(p.raf, 0.5, 0.35),
    rafKiris: std(p.rafKiris, 0.45, 0.25),
    ahsap: std(p.ahsap, 0.8, 0),
    ahsapUst: std(p.ahsapUst, 0.62, 0),
    kaucuk: std(p.kaucuk, 0.85, 0),
    ic: std(p.ic, 0.55, 0.2),
    kutu: std(p.kutu, 0.75, 0, { envMapIntensity: 0.5 }),
    kutuGri: std(p.kutuGri, 0.75, 0, { envMapIntensity: 0.5 }),
    karton: std(p.karton, 0.88, 0),
    granit,
    cam: cam(p.cam, 0.16, 2.2),
    camLazer: cam(p.camLazer, 0.42, 1.6),
    camOda: cam(p.camOda, 0.1, 2.5, true),
    lamba: new MeshBasicMaterial({ color: p.lamba.clone().multiplyScalar(3.2) }),
    icIsik: new MeshBasicMaterial({ color: p.lamba.clone().multiplyScalar(2.4) }),
  };
}

// ---------- geometri önbelleği ----------

// Aynı ölçüdeki kutu yüzlerce kez çizilir, bir kez üretilir. Önbellekteki geometri ortaktır: nesne temizlenirken
// atılmaz, sahne kapanınca hepsi birden atılır.
const onbellek = new Map<string, BufferGeometry>();
const onbellekKumesi = new Set<BufferGeometry>();
export const onbellekteMi = (geo: BufferGeometry): boolean => onbellekKumesi.has(geo);
export function onbellegiBosalt(): void {
  for (const geo of onbellek.values()) geo.dispose();
  onbellek.clear();
  onbellekKumesi.clear();
}
function sakla(k: string, uret: () => BufferGeometry): BufferGeometry {
  let geo = onbellek.get(k);
  if (!geo) {
    geo = uret();
    onbellek.set(k, geo);
    onbellekKumesi.add(geo);
  }
  return geo;
}
const anahtar = (...n: number[]) => n.map((x) => x.toFixed(3)).join('|');
export const kutu = (g: number, y: number, d: number): BufferGeometry => sakla(`k${anahtar(g, y, d)}`, () => new BoxGeometry(g, y, d));
export const silindir = (ust: number, alt: number, y: number, parca = 24): BufferGeometry =>
  sakla(`s${anahtar(ust, alt, y, parca)}`, () => new CylinderGeometry(ust, alt, y, parca));

// Köşesi yuvarlatılmış kutu: sac gövdeler sert kutu gibi görünmesin.
export function yuvarlakKutu(g: number, y: number, d: number, r = 0.05): BufferGeometry {
  return sakla(`y${anahtar(g, y, d, r)}`, () => {
    const pay = Math.min(r * 0.6, g / 4, y / 4, d / 4);
    const W = g - 2 * pay;
    const H = y - 2 * pay;
    const rc = Math.max(0.001, Math.min(r, W / 2 - 0.001, H / 2 - 0.001));
    const x0 = -W / 2;
    const y0 = -H / 2;
    const s = new Shape();
    s.moveTo(x0 + rc, y0);
    s.lineTo(x0 + W - rc, y0);
    s.quadraticCurveTo(x0 + W, y0, x0 + W, y0 + rc);
    s.lineTo(x0 + W, y0 + H - rc);
    s.quadraticCurveTo(x0 + W, y0 + H, x0 + W - rc, y0 + H);
    s.lineTo(x0 + rc, y0 + H);
    s.quadraticCurveTo(x0, y0 + H, x0, y0 + H - rc);
    s.lineTo(x0, y0 + rc);
    s.quadraticCurveTo(x0, y0, x0 + rc, y0);
    const derin = Math.max(0.001, d - 2 * pay);
    const geo = new ExtrudeGeometry(s, { depth: derin, bevelEnabled: true, bevelThickness: pay, bevelSize: pay, bevelSegments: 2, curveSegments: 3 });
    geo.translate(0, 0, -derin / 2);
    return geo;
  });
}

export function ekle(ust: Object3D, geo: BufferGeometry, mat: Material, x = 0, y = 0, z = 0, golge = true): Mesh {
  const m = new Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = golge;
  m.receiveShadow = true;
  ust.add(m);
  return m;
}

// ---------- tuval dokuları ----------

export function tuval(g: number, y: number): [HTMLCanvasElement, CanvasRenderingContext2D] | null {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(g));
  c.height = Math.max(1, Math.round(y));
  const ctx = c.getContext('2d');
  return ctx ? [c, ctx] : null;
}

export function tohumlu(tohum: number): () => number {
  let s = tohum >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const bosDoku = (): Texture => new CanvasTexture(document.createElement('canvas'));

export function dokuyaCevir(c: HTMLCanvasElement, renkli = true, yinele = false): CanvasTexture {
  const d = new CanvasTexture(c);
  if (renkli) d.colorSpace = SRGBColorSpace;
  d.anisotropy = 8;
  if (yinele) {
    d.wrapS = RepeatWrapping;
    d.wrapT = RepeatWrapping;
  }
  return d;
}

// Granit ölçüm tablası: koyu zemin üstünde açık ve koyu benekler.
export function granitDokusu(p: Palet): Texture {
  const t = tuval(256, 256);
  if (!t) return bosDoku();
  const [c, g] = t;
  const r = tohumlu(3);
  g.fillStyle = p.metin.granit;
  g.fillRect(0, 0, 256, 256);
  const benekler = [p.metin.granitAcik, p.metin.siyah, p.metin.koyu];
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = benekler[Math.floor(r() * benekler.length)] ?? p.metin.granitAcik;
    g.globalAlpha = 0.4 + r() * 0.6;
    g.beginPath();
    g.arc(r() * 256, r() * 256, 0.4 + r() * 1.6, 0, 7);
    g.fill();
  }
  g.globalAlpha = 1;
  return dokuyaCevir(c, true, true);
}

// Yumuşak koyu leke: makinenin zemine "oturmasını" sağlayan temas gölgesi.
export function temasDokusu(): Texture {
  const t = tuval(128, 128);
  if (!t) return bosDoku();
  const [c, g] = t;
  const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,.55)');
  gr.addColorStop(0.6, 'rgba(0,0,0,.28)');
  gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return dokuyaCevir(c, false);
}

export function haleDokusu(): Texture {
  const t = tuval(128, 128);
  if (!t) return bosDoku();
  const [c, g] = t;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return dokuyaCevir(c, false);
}

// Zemindeki durum izi: istasyonun çevresinde hafif bir parıltı ve ayak izinin kenarından IZ_PAYI dışarıda düz bir
// çerçeve (zemine boyanmış şerit gibi). Renk ve saydamlık malzemeden gelir; doku yalnız biçimi taşır. Çerçeve,
// gölgesiz hafif görünümde de makinenin durumunu uzaktan okutur. Ölçü metre; g ve d izin toplam ölçüsüdür.
export const IZ_PAYI = 0.25;
export function durumIziDokusu(g_: number, d_: number, kenar: number): Texture {
  const PX = 48;
  const t = tuval(g_ * PX, d_ * PX);
  if (!t) return bosDoku();
  const [c, g] = t;
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.scale(c.width / 2, c.height / 2);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
  gr.addColorStop(0, 'rgba(255,255,255,.25)');
  gr.addColorStop(0.25, 'rgba(255,255,255,.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(-1, -1, 2, 2);
  g.restore();
  const ic = (kenar - IZ_PAYI) * PX;
  const w = 0.09 * PX;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = w;
  g.beginPath();
  g.roundRect(ic, ic, c.width - 2 * ic, c.height - 2 * ic, 0.18 * PX);
  g.stroke();
  return dokuyaCevir(c, false);
}

// Durum izinin saydamlığı: çerçeve tam görünür olmasın diye 0,8; duran makinede andonla birlikte yanıp söner
// (yanıp 0..1), bekleyende sönük.
export function durumIziSaydamligi(durum: string, yanip: number): number {
  if (durum === 'durdu') return 0.4 + yanip * 0.55;
  if (durum === 'sirada') return 0.45;
  return 0.8;
}

// Seçim çerçevesi: kesik çizgili, köşesi yuvarlak.
export function cerceveDokusu(g_: number, d_: number): Texture {
  const PX = 64;
  const t = tuval(g_ * PX, d_ * PX);
  if (!t) return bosDoku();
  const [c, g] = t;
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 6;
  g.setLineDash([18, 10]);
  g.beginPath();
  g.roundRect(4, 4, c.width - 8, c.height - 8, 20);
  g.stroke();
  return dokuyaCevir(c, false);
}

// Rota şeridi: ilerleme yönünü gösteren oklar; doku kaydırılarak akar.
export function okDokusu(): Texture {
  const t = tuval(64, 32);
  if (!t) return bosDoku();
  const [c, g] = t;
  g.fillStyle = 'rgba(255,255,255,.35)';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath();
  g.moveTo(14, 4);
  g.lineTo(34, 16);
  g.lineTo(14, 28);
  g.lineTo(24, 28);
  g.lineTo(44, 16);
  g.lineTo(24, 4);
  g.closePath();
  g.fill();
  const d = dokuyaCevir(c, true, true);
  d.wrapT = RepeatWrapping;
  return d;
}

// Duvar sacı: dikey panel nervürleri, alt kaide ve (varsa) seksiyonel kapı.
// Duvardaki açıklık: düzlemin yatay ekseninde [bas, son] metre ve türü.
export interface DuvarAcikligi {
  bas: number;
  son: number;
  tur: GecisTuru;
}

// Kepenk: gri çıtalı panjur, üstünde kutu; kapı ve yangın kapısı: insan boyu kanat, kasa ve kol; açık geçiş: dokuda
// delik (malzeme alfa sınamasıyla keser), kenarında sarı-siyah uyarı bandı.
export const ACIK_KAPI_YUKSEKLIGI = 4.6;
export const KANAT_YUKSEKLIGI = 2.2;

export function duvarDokusu(p: Palet, boy: number, yukseklik: number, acikliklar: readonly DuvarAcikligi[], kaba: boolean): Texture {
  const PX = Math.min(kaba ? 20 : 32, 4096 / Math.max(1, boy));
  const W = boy * PX;
  const H = yukseklik * PX;
  const t = tuval(W, H);
  if (!t) return bosDoku();
  const [c, g] = t;
  const Y = (y: number) => H - y * PX;
  g.fillStyle = p.metin.duvar;
  g.fillRect(0, 0, W, H);
  for (let x = 0; x < boy; x += 1) {
    const gr = g.createLinearGradient(x * PX, 0, (x + 1) * PX, 0);
    gr.addColorStop(0, 'rgba(0,0,0,.07)');
    gr.addColorStop(0.12, 'rgba(255,255,255,.08)');
    gr.addColorStop(0.5, 'rgba(0,0,0,0)');
    gr.addColorStop(0.9, 'rgba(0,0,0,.04)');
    g.fillStyle = gr;
    g.fillRect(x * PX, 0, PX, H);
  }
  g.fillStyle = p.metin.supurgelik;
  g.fillRect(0, Y(1.3), W, 1.3 * PX);
  g.strokeStyle = 'rgba(40,40,40,.4)';
  g.lineWidth = 2;
  for (let x = 0; x <= boy; x += 4) { g.beginPath(); g.moveTo(x * PX, Y(1.3)); g.lineTo(x * PX, H); g.stroke(); }
  g.fillStyle = 'rgba(0,0,0,.15)';
  g.fillRect(0, Y(1.3) - 3, W, 3);
  const ust = Math.min(ACIK_KAPI_YUKSEKLIGI, yukseklik - 0.8);
  for (const a of acikliklar) {
    const x0 = Math.max(0, a.bas) * PX;
    const x1 = Math.min(boy, a.son) * PX;
    if (x1 - x0 < 2) continue;
    if (a.tur === 'acik') {
      g.clearRect(x0, Y(ust), x1 - x0, ust * PX);
      // Lento altında ve iki yanda uyarı bandı.
      const bant = 0.18 * PX;
      for (const [bx, by, bw, bh] of [[x0 - bant, Y(ust), bant, ust * PX], [x1, Y(ust), bant, ust * PX], [x0 - bant, Y(ust) - bant, x1 - x0 + 2 * bant, bant]] as const) {
        g.fillStyle = p.metin.sari;
        g.fillRect(bx, by, bw, bh);
        g.fillStyle = p.metin.siyah;
        const adim = 0.3 * PX;
        for (let k = 0; k < Math.max(bw, bh); k += adim * 2) {
          if (bw > bh) g.fillRect(bx + k, by, Math.min(adim, bw - k), bh);
          else g.fillRect(bx, by + k, bw, Math.min(adim, bh - k));
        }
      }
      continue;
    }
    if (a.tur === 'kepenk') {
      g.fillStyle = p.metin.kapi;
      g.fillRect(x0, Y(ust), x1 - x0, ust * PX);
      g.strokeStyle = 'rgba(0,0,0,.22)';
      for (let y = 0.5; y < ust; y += 0.5) { g.beginPath(); g.moveTo(x0, Y(y)); g.lineTo(x1, Y(y)); g.stroke(); }
      // Kepenk kutusu ve kılavuz rayları.
      g.fillStyle = p.metin.koyu;
      g.fillRect(x0 - 8, Y(ust) - 0.35 * PX, x1 - x0 + 16, 0.35 * PX);
      g.fillStyle = p.metin.cizgi;
      g.fillRect(x0 - 8, Y(ust), 8, ust * PX);
      g.fillRect(x1, Y(ust), 8, ust * PX);
      continue;
    }
    // Kapı ve yangın kapısı: kasa, kanat (genişse çift kanat), kol; yangın kapısında panik bar.
    const kh = Math.min(KANAT_YUKSEKLIGI, yukseklik - 0.5);
    const yangin = a.tur === 'yangin_kapisi';
    g.fillStyle = p.metin.cizgi;
    g.fillRect(x0 - 6, Y(kh) - 6, x1 - x0 + 12, kh * PX + 6);
    g.fillStyle = yangin ? p.metin.kirmizi : p.metin.mavi;
    g.fillRect(x0, Y(kh), x1 - x0, kh * PX);
    const cift = a.son - a.bas > 1.4;
    g.strokeStyle = 'rgba(0,0,0,.35)';
    if (cift) { g.beginPath(); g.moveTo((x0 + x1) / 2, Y(kh)); g.lineTo((x0 + x1) / 2, H); g.stroke(); }
    g.fillStyle = p.metin.krom;
    if (yangin) g.fillRect(x0 + 0.1 * PX, Y(1.05), x1 - x0 - 0.2 * PX, 0.06 * PX);
    else {
      const kol = cift ? [(x0 + x1) / 2 - 0.15 * PX, (x0 + x1) / 2 + 0.07 * PX] : [x1 - 0.2 * PX];
      for (const kx of kol) g.fillRect(kx, Y(1.05), 0.08 * PX, 0.04 * PX);
    }
    if (yangin) {
      // Kapı üstünde kırmızı yangın kapısı levhası.
      g.fillStyle = p.metin.kirmizi;
      g.fillRect((x0 + x1) / 2 - 0.3 * PX, Y(kh) - 0.4 * PX, 0.6 * PX, 0.22 * PX);
      g.fillStyle = p.metin.lamba;
      g.fillRect((x0 + x1) / 2 - 0.22 * PX, Y(kh) - 0.32 * PX, 0.44 * PX, 0.06 * PX);
    }
  }
  return dokuyaCevir(c);
}

// Zemine yatay serilen ince düzlem (iz, hale, seçim çerçevesi).
export function zeminIzi(ust: Object3D, g: number, d: number, malzeme: Material, y = 0.006, sira = 1): Mesh {
  const m = new Mesh(new PlaneGeometry(g, d), malzeme);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = sira;
  m.receiveShadow = false;
  ust.add(m);
  return m;
}

// Zemin izi zeminden birkaç milimetre yukarıdadır; uzaktan bakınca derinlik çözünürlüğü (100 m'de ~3 mm) bu farkı
// ayıramaz ve iz kamera oynarken yanıp söner. Çokgen kaydırma izi derinlikte kameraya doğru iter.
export const izMalzemesi = (doku: Texture | null, renk: Color, saydamlik: number) =>
  new MeshBasicMaterial({
    map: doku, color: renk.clone(), transparent: true, opacity: saydamlik, depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4,
  });

// ---------- ekran (makine paneli) ----------

export interface Ekran {
  tuval: HTMLCanvasElement;
  doku: CanvasTexture;
  imza: string;
}

export function ekran(ust: Object3D, g: number, y: number, x: number, yy: number, z: number, ry = 0): Ekran | null {
  const t = tuval(256, Math.round((256 * y) / g));
  if (!t) return null;
  const [c] = t;
  const doku = dokuyaCevir(c);
  doku.anisotropy = 4;
  const m = ekle(ust, new PlaneGeometry(g, y), new MeshBasicMaterial({ map: doku, toneMapped: false }), x, yy, z, false);
  m.rotation.y = ry;
  return { tuval: c, doku, imza: '' };
}

// Operatör kumanda paneli: ekran, tuş takımı ve acil durdurma. Taşıyıcı: `duvarX` verilirse makine yan duvarından
// yatay kol ve dikey boru, `zemin` ise yerden ayak; ikisi de yoksa panel bir yüzeye yaslıdır.
export function kumanda(
  ust: Object3D, m: Malzemeler, x: number, y: number, z: number, ry = 0, tasiyici: { duvarX?: number; zemin?: boolean } = {},
): Ekran | null {
  if (tasiyici.duvarX !== undefined) {
    const ky = y + 0.62;
    ekle(ust, silindir(0.025, 0.025, ky - (y + 0.37) + 0.03, 10), m.celikKoyu, x, (ky + y + 0.37) / 2, z);
    const boy = Math.abs(x - tasiyici.duvarX) + 0.03;
    ekle(ust, kutu(boy, 0.06, 0.06), m.celikKoyu, (x + tasiyici.duvarX) / 2, ky, z);
  }
  if (tasiyici.zemin) {
    ekle(ust, silindir(0.035, 0.035, y - 0.37 + 0.02, 12), m.celikKoyu, x, (y - 0.37) / 2, z);
    ekle(ust, kutu(0.36, 0.02, 0.36), m.celikKoyu, x, 0.01, z);
  }
  const grup = new Group();
  grup.position.set(x, y, z);
  grup.rotation.y = ry;
  ust.add(grup);
  ekle(grup, yuvarlakKutu(0.5, 0.74, 0.1, 0.03), m.koyu);
  const e = ekran(grup, 0.38, 0.28, 0, 0.14, 0.052);
  ekle(grup, kutu(0.4, 0.16, 0.02), m.kutuGri, 0, -0.17, 0.05);
  ekle(grup, silindir(0.03, 0.03, 0.03, 16), m.kirmizi, 0.16, -0.3, 0.06).rotation.x = Math.PI / 2;
  return e;
}

// ---------- andon ışık kulesi ----------

export interface AndonDilimi {
  mat: MeshStandardMaterial;
  hale: Sprite;
}
export interface Andon {
  calisiyor: AndonDilimi;
  durakli: AndonDilimi;
  durdu: AndonDilimi;
  ust: number;
}

export function andon(ust: Object3D, p: Palet, m: Malzemeler, hale: Texture, x: number, y: number, z: number): Andon {
  const grup = new Group();
  grup.position.set(x, y, z);
  ust.add(grup);
  ekle(grup, silindir(0.018, 0.018, 0.5, 10), m.celikKoyu, 0, 0.25, 0);
  ekle(grup, silindir(0.045, 0.045, 0.05, 20), m.siyah, 0, 0.52, 0);
  const dilim = (acik: Color, sonuk: Color, yy: number): AndonDilimi => {
    const mat = new MeshStandardMaterial({ color: sonuk.clone(), roughness: 0.2, metalness: 0, emissive: acik.clone(), emissiveIntensity: 0 });
    ekle(grup, silindir(0.043, 0.043, 0.072, 20), mat, 0, yy, 0, false);
    const s = new Sprite(new SpriteMaterial({ map: hale, color: acik.clone(), transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending, toneMapped: false }));
    s.scale.set(0.55, 0.55, 1);
    s.position.y = yy;
    grup.add(s);
    return { mat, hale: s };
  };
  const a = {
    calisiyor: dilim(p.andonYesil, p.andonYesilSonuk, 0.585),
    durakli: dilim(p.andonSari, p.andonSariSonuk, 0.66),
    durdu: dilim(p.andonKirmizi, p.andonKirmiziSonuk, 0.735),
  };
  ekle(grup, silindir(0.03, 0.045, 0.03, 20), m.siyah, 0, 0.787, 0);
  return { ...a, ust: y + 0.8 };
}

// Zemine oturan andon kolonu: gerçek modelin üstünde andon yeri bilinmez (köşesi boş olabilir); hücre
// kenarında ayaklı kolon kullanılır. Taban plakası, boru, üstte andon.
export function andonKolonu(ust: Object3D, p: Palet, m: Malzemeler, hale: Texture, x: number, z: number, yukseklik: number): Andon {
  const grup = new Group();
  grup.position.set(x, 0, z);
  ust.add(grup);
  ekle(grup, kutu(0.26, 0.02, 0.26), m.siyah, 0, 0.01, 0);
  ekle(grup, silindir(0.025, 0.025, yukseklik, 10), m.celikKoyu, 0, yukseklik / 2 + 0.02, 0);
  return andon(grup, p, m, hale, 0, yukseklik + 0.02 - 0.03, 0);
}

// ---------- istasyon gövdeleri ----------

export interface Animasyon {
  kafa?: Object3D;
  kafaY?: number;
  besik?: Object3D;
  ayna?: Object3D;
  kopru?: Object3D;
  araba?: Object3D;
  mil?: Object3D;
  portal?: Object3D;
  lazerKafa?: Object3D;
  kivilcim?: PointLight;
  kivilcimHale?: Sprite;
  fan?: Object3D;
  kapilar?: { nesne: Object3D; kapali: number; acik: number }[];
}

export interface IstasyonGovdesi {
  grup: Group;
  // Birleştirilmeyecek (hareketli) alt nesneler.
  hareketli: Set<Object3D>;
  anim: Animasyon;
  ust: number;
  andonYeri: [number, number, number];
  ekran: Ekran | null;
}

const sinir = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

function kapiKanadi(ust: Object3D, m: Malzemeler, g: number, y: number, x: number, yy: number, z: number): Group {
  const grup = new Group();
  grup.position.set(x, yy, z);
  ust.add(grup);
  ekle(grup, kutu(g, 0.09, 0.05), m.boya, 0, y / 2 - 0.045, 0);
  ekle(grup, kutu(g, 0.09, 0.05), m.boya, 0, -y / 2 + 0.045, 0);
  ekle(grup, kutu(0.08, y, 0.05), m.boya, -g / 2 + 0.04, 0, 0);
  ekle(grup, kutu(0.08, y, 0.05), m.boya, g / 2 - 0.04, 0, 0);
  ekle(grup, kutu(g - 0.14, y - 0.16, 0.012), m.cam, 0, 0, 0, false);
  ekle(grup, silindir(0.012, 0.012, 0.36, 8), m.krom, g / 2 - 0.1, 0, 0.036);
  return grup;
}

// İçi boş sac kabin, önde çalışma açıklığı; ön yüz +z.
function kabin(ust: Object3D, m: Malzemeler, g: number, y: number, d: number, ag: number, ay: number, ax: number, aOrta: number) {
  const t = 0.07;
  const y0 = 0.18;
  ekle(ust, kutu(g + 0.06, y0, d + 0.04), m.koyu, 0, y0 / 2, 0);
  ekle(ust, yuvarlakKutu(g, y, t, 0.03), m.boya, 0, y0 + y / 2, -d / 2 + t / 2);
  ekle(ust, yuvarlakKutu(t, y, d, 0.03), m.boya, -g / 2 + t / 2, y0 + y / 2, 0);
  ekle(ust, yuvarlakKutu(t, y, d, 0.03), m.boya, g / 2 - t / 2, y0 + y / 2, 0);
  ekle(ust, yuvarlakKutu(g, t, d, 0.03), m.boya, 0, y0 + y - t / 2, 0);
  const fz = d / 2 - t / 2;
  const alt = aOrta - ay / 2;
  const ustK = aOrta + ay / 2;
  ekle(ust, yuvarlakKutu(g, alt - y0, t, 0.03), m.koyu, 0, (alt + y0) / 2, fz);
  ekle(ust, yuvarlakKutu(g, y0 + y - ustK, t, 0.03), m.boya, 0, (ustK + y0 + y) / 2, fz);
  const sg = ax - ag / 2 + g / 2;
  const sa = g / 2 - (ax + ag / 2);
  if (sg > 0.01) ekle(ust, kutu(sg, ay, t), m.boya, -g / 2 + sg / 2, aOrta, fz);
  if (sa > 0.01) ekle(ust, kutu(sa, ay, t), m.boya, g / 2 - sa / 2, aOrta, fz);
  ekle(ust, kutu(g - 2 * t, alt - y0, d - 2 * t), m.ic, 0, (alt + y0) / 2, 0);
  ekle(ust, kutu(ag * 0.7, 0.02, 0.12), m.icIsik, ax, y0 + y - t - 0.02, d / 2 - 0.35, false);
  ekle(ust, kutu(g * 0.985, 0.07, 0.012), m.vurgu, 0, y0 + y - 0.16, d / 2 + 0.004, false);
  return { alt, ust: y0 + y };
}

// İşleme merkezi (dik, 5 eksen) ya da CNC torna: ad "torna" içeriyorsa torna, "5 eksen" içeriyorsa beşiksi tabla.
function islemeMerkezi(m: Malzemeler, g: number, d: number, bes: boolean, h: IstasyonGovdesi): void {
  const grup = h.grup;
  const w = sinir(g - 0.9, 1.6, bes ? 3.2 : 2.8);
  const dd = sinir(d - 0.9, 1.5, 2.6);
  const yk = bes ? 2.55 : 2.3;
  const ag = w * (bes ? 0.59 : 0.56);
  const ay = 1.2;
  const ax = -0.15 * (w / 2.4);
  const ao = 1.3;
  const e = kabin(grup, m, w, yk, dd, ag, ay, ax, ao);
  if (!bes) {
    ekle(grup, kutu(Math.min(1.05, ag * 0.8), 0.1, 0.5), m.celik, ax, e.alt + 0.05, 0.05);
    ekle(grup, kutu(0.2, 0.09, 0.14), m.koyu, ax, e.alt + 0.145, 0.05);
  } else {
    ekle(grup, kutu(0.14, 0.45, 0.5), m.celikKoyu, ax - 0.45, e.alt + 0.225, 0);
    ekle(grup, kutu(0.14, 0.45, 0.5), m.celikKoyu, ax + 0.45, e.alt + 0.225, 0);
    const besik = new Group();
    besik.position.set(ax, e.alt + 0.36, 0);
    grup.add(besik);
    ekle(besik, kutu(0.76, 0.08, 0.44), m.celik);
    ekle(besik, silindir(0.2, 0.2, 0.05, 32), m.celik, 0, 0.065, 0);
    h.anim.besik = besik;
    h.hareketli.add(besik);
  }
  // Kolon (iç arka) ve ona yaslı iş mili kafası.
  ekle(grup, kutu(0.5, 1.3, 0.4), m.boyaOrta, ax, e.alt + 0.65, -dd / 2 + 0.35);
  const kafa = new Group();
  kafa.position.set(ax, ao + 0.22, -dd / 2 + 0.55 + 0.19);
  grup.add(kafa);
  ekle(kafa, kutu(0.32, 0.42, 0.42), m.koyu, 0, 0, 0.02);
  ekle(kafa, silindir(0.065, 0.065, 0.14, 20), m.celik, 0, -0.27, 0.08);
  ekle(kafa, silindir(0.012, 0.012, 0.1, 8), m.krom, 0, -0.39, 0.08);
  h.anim.kafa = kafa;
  h.anim.kafaY = kafa.position.y;
  h.hareketli.add(kafa);
  const kg = ag / 2 + 0.08;
  const ky = ay + 0.12;
  const k1 = kapiKanadi(grup, m, kg, ky, ax - ag / 4, ao, dd / 2 + 0.035);
  const k2 = kapiKanadi(grup, m, kg, ky, ax + ag / 4, ao, dd / 2 + 0.07);
  h.anim.kapilar = [
    { nesne: k1, kapali: ax - ag / 4, acik: ax - ag / 4 - ag / 2 + 0.05 },
    { nesne: k2, kapali: ax + ag / 4, acik: ax + ag / 4 + ag / 2 - 0.05 },
  ];
  h.hareketli.add(k1).add(k2);
  ekle(grup, yuvarlakKutu(0.62, 0.36, 0.62, 0.05), m.boya, ax, e.ust + 0.18, -dd / 2 + 0.45);
  if (bes) ekle(grup, yuvarlakKutu(w * 0.9, 0.14, dd * 0.7, 0.05), m.vurgu, 0, e.ust + 0.07, 0);
  h.ekran = kumanda(grup, m, w / 2 + 0.2, 1.5, dd / 2 - 0.3, -0.3, { duvarX: w / 2 });
  // Talaş konveyörü (sol, yerde), soğutma sıvısı tankı (arka), talaş arabası (ön sol).
  ekle(grup, kutu(0.36, 0.42, dd * 0.83), m.koyu, -w / 2 - 0.21, 0.21, -0.1);
  ekle(grup, yuvarlakKutu(0.5, 0.45, 0.55, 0.04), m.kutu, -w / 2 - 0.2, 0.225, Math.min(1.45, d / 2 - 0.3));
  ekle(grup, yuvarlakKutu(0.7, 0.32, 0.45, 0.04), m.koyu, w / 4, 0.16, -dd / 2 - 0.28);
  h.ust = e.ust;
  h.andonYeri = [w / 2 - 0.2, e.ust, -dd / 2 + 0.25];
}

function torna(m: Malzemeler, g: number, d: number, h: IstasyonGovdesi): void {
  const grup = h.grup;
  const w = sinir(g - 0.7, 2.2, 4.2);
  const dd = sinir(d - 0.6, 1.4, 2.2);
  const yk = 1.95;
  const ag = w * 0.52;
  const ay = 1.0;
  const ax = -0.25;
  const ao = 1.2;
  const e = kabin(grup, m, w, yk, dd, ag, ay, ax, ao);
  // Fener mili gövdesi (sol), ayna ona bağlı; eğik kızak gövdesi iç tabandan yükselir, taret kızağın üstünde.
  const xh = ax - ag * 0.3;
  ekle(grup, kutu(0.55, 0.7, 0.9), m.boyaOrta, xh - 0.275, e.alt + 0.35, -0.15);
  const ayna = new Group();
  ayna.position.set(xh + 0.06, ao - 0.15, -0.05);
  grup.add(ayna);
  ekle(ayna, silindir(0.17, 0.17, 0.12, 28), m.celik).rotation.z = Math.PI / 2;
  for (let i = 0; i < 3; i++) ekle(ayna, kutu(0.06, 0.07, 0.05), m.celikKoyu, 0.07, Math.cos(i * 2.094) * 0.11, Math.sin(i * 2.094) * 0.11);
  ekle(ayna, silindir(0.04, 0.04, 0.26, 16), m.celik, 0.2, 0, 0).rotation.z = Math.PI / 2;
  h.anim.ayna = ayna;
  h.hareketli.add(ayna);
  const kizakBoy = ax + ag * 0.45 - xh;
  const kizakUst = ao - 0.3;
  ekle(grup, kutu(kizakBoy, kizakUst - e.alt, 0.5), m.koyu, xh + kizakBoy / 2, (kizakUst + e.alt) / 2, -0.3);
  ekle(grup, kutu(kizakBoy, 0.04, 0.5), m.celikKoyu, xh + kizakBoy / 2, kizakUst + 0.02, -0.3);
  ekle(grup, kutu(0.3, 0.12, 0.3), m.celikKoyu, ax + ag * 0.25, kizakUst + 0.1, -0.3);
  ekle(grup, silindir(0.17, 0.17, 0.14, 8), m.koyu, ax + ag * 0.25, kizakUst + 0.33, -0.3).rotation.z = Math.PI / 2;
  const k = kapiKanadi(grup, m, ag * 0.6, ay + 0.12, ax + ag * 0.2, ao, dd / 2 + 0.035);
  h.anim.kapilar = [{ nesne: k, kapali: ax + ag * 0.2, acik: ax + ag * 0.2 + ag * 0.5 }];
  h.hareketli.add(k);
  h.ekran = kumanda(grup, m, w / 2 - 0.3, 1.55, dd / 2 + 0.06, 0);
  ekle(grup, kutu(0.3, 0.42, dd * 0.6), m.koyu, w / 2 + 0.15, 0.21, -dd * 0.1);
  ekle(grup, yuvarlakKutu(0.45, 0.42, 0.5, 0.04), m.kutu, w / 2 + 0.12, 0.21, Math.min(0.95, d / 2 - 0.3));
  h.ust = e.ust;
  h.andonYeri = [w / 2 - 0.2, e.ust, -dd / 2 + 0.25];
}

// Fiber lazer kesim (markalama): kapalı kabin, portal ve kesim kafası, dışarıda mekik tabla, yanında soğutucu.
function lazer(p: Palet, m: Malzemeler, hale: Texture, g: number, d: number, h: IstasyonGovdesi): void {
  const grup = h.grup;
  const L = sinir(g - 2.9, 2.4, 8);
  const dd = sinir(d - 0.4, 1.6, 2.5);
  const yk = 1.95;
  const x0 = -(g / 2) + 0.85 + L / 2;
  ekle(grup, kutu(L, 0.55, dd), m.koyu, x0, 0.275, 0);
  ekle(grup, yuvarlakKutu(L, 0.07, dd, 0.02), m.boya, x0, yk, 0);
  ekle(grup, yuvarlakKutu(L, yk - 0.55, 0.06, 0.03), m.boya, x0, 0.55 + (yk - 0.55) / 2, -dd / 2 + 0.03);
  ekle(grup, yuvarlakKutu(0.07, yk - 0.55, dd, 0.03), m.boya, x0 - L / 2 + 0.035, 0.55 + (yk - 0.55) / 2, 0);
  ekle(grup, yuvarlakKutu(0.07, yk - 0.55, dd, 0.03), m.boya, x0 + L / 2 - 0.035, 0.55 + (yk - 0.55) / 2, 0);
  ekle(grup, yuvarlakKutu(L, 0.45, 0.07, 0.03), m.boya, x0, 0.775, dd / 2 - 0.035);
  for (let i = 0; i < 4; i++) {
    const px = x0 - L / 2 + i * (L / 3);
    ekle(grup, kutu(0.1, yk - 1.0, 0.07), m.boya, px + (i === 0 ? 0.05 : i === 3 ? -0.05 : 0), 1.0 + (yk - 1.0) / 2, dd / 2 - 0.035);
  }
  for (let i = 0; i < 3; i++) ekle(grup, kutu(L / 3 - 0.1, yk - 1.05, 0.02), m.camLazer, x0 - L / 2 + (i + 0.5) * (L / 3), 1.0 + (yk - 1.05) / 2, dd / 2 - 0.03, false);
  ekle(grup, kutu(L * 0.985, 0.09, 0.012), m.vurgu, x0, yk - 0.12, dd / 2 + 0.004, false);
  // Kesim tablası (ızgara) gövdeye oturur; portal iki yan raya biner.
  ekle(grup, kutu(L - 0.3, 0.38, dd - 0.3), m.koyu, x0, 0.74, 0);
  ekle(grup, kutu(L - 0.3, 0.02, dd - 0.3), m.celikKoyu, x0, 0.94, 0);
  for (const sz of [-1, 1]) ekle(grup, kutu(L - 0.14, 0.08, 0.08), m.celikKoyu, x0, 1.25, sz * (dd / 2 - 0.1));
  const portal = new Group();
  portal.position.set(x0, 1.42, 0);
  grup.add(portal);
  ekle(portal, kutu(0.22, 0.26, dd - 0.12), m.turuncu);
  const kafa = new Group();
  portal.add(kafa);
  ekle(kafa, kutu(0.16, 0.3, 0.16), m.koyu, 0.16, -0.05, 0);
  ekle(kafa, silindir(0.03, 0.015, 0.18, 12), m.krom, 0.16, -0.28, 0);
  const isik = new PointLight(p.kivilcim.clone(), 0, 3, 2);
  isik.position.set(0.16, -0.45, 0);
  kafa.add(isik);
  const kh = new Sprite(new SpriteMaterial({ map: hale, color: p.kivilcimHale.clone(), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
  kh.scale.set(0.35, 0.35, 1);
  kh.position.set(0.16, -0.46, 0);
  kafa.add(kh);
  Object.assign(h.anim, { portal, lazerKafa: kafa, kivilcim: isik, kivilcimHale: kh });
  h.hareketli.add(portal);
  // Mekik tabla (dışarıda).
  const sx = x0 + L / 2 + 1.0;
  ekle(grup, kutu(1.9, 0.8, dd - 0.1), m.koyu, sx, 0.4, 0);
  ekle(grup, kutu(1.95, 0.04, dd), m.celikKoyu, sx, 0.82, 0);
  ekle(grup, kutu(1.7, 0.012, Math.min(1.5, dd - 0.2)), m.celik, sx, 0.846, 0);
  // Elektrik dolabı, kumanda, soğutucu.
  ekle(grup, yuvarlakKutu(0.7, 1.9, 0.6, 0.04), m.koyu, x0 - L / 2 - 0.45, 0.95, dd / 2 - 0.55);
  h.ekran = kumanda(grup, m, x0 - L / 2 - 0.2, 1.4, dd / 2 - 0.13, 0.35, { zemin: true });
  ekle(grup, yuvarlakKutu(0.8, 1.1, 0.7, 0.04), m.boya, x0 - L / 2 - 0.45, 0.55, -dd / 2 + 0.45);
  h.ust = yk;
  h.andonYeri = [x0 - L / 2 + 0.25, yk, -dd / 2 + 0.3];
}

// Montaj tezgâhı: ahşap tabla, delikli pano, göz kutuları, talimat ekranı.
function tezgah(m: Malzemeler, g: number, d: number, h: IstasyonGovdesi): void {
  const grup = h.grup;
  const w = sinir(g * 0.9, 1.2, 3.2);
  const dd = sinir(d * 0.75, 0.7, 1.2);
  ekle(grup, kutu(w, 0.05, dd), m.ahsapUst, 0, 0.9, 0);
  for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) ekle(grup, kutu(0.05, 0.88, 0.05), m.koyu, a * (w / 2 - 0.05), 0.44, b * (dd / 2 - 0.05));
  ekle(grup, kutu(w - 0.1, 0.03, dd - 0.1), m.koyu, 0, 0.16, 0);
  ekle(grup, yuvarlakKutu(0.5, 0.7, dd * 0.85, 0.03), m.boyaOrta, -w / 2 + 0.35, 0.5, 0);
  ekle(grup, kutu(w, 1.0, 0.03), m.boyaOrta, 0, 1.43, -dd / 2 + 0.01);
  for (const x of [-w / 2 + 0.02, w / 2 - 0.02]) ekle(grup, kutu(0.05, 1.2, 0.05), m.koyu, x, 1.5, -dd / 2 + 0.03);
  ekle(grup, kutu(w, 0.03, 0.32), m.koyu, 0, 2.0, -dd / 2 + 0.17);
  const kutuSayi = Math.max(2, Math.floor((w - 0.3) / 0.42));
  for (let i = 0; i < kutuSayi; i++) ekle(grup, yuvarlakKutu(0.3, 0.16, 0.28, 0.02), i % 3 === 1 ? m.sari : m.kutu, -((kutuSayi - 1) * 0.42) / 2 + i * 0.42, 2.1, -dd / 2 + 0.17);
  for (let i = 0; i < 5; i++) ekle(grup, kutu(0.03, 0.18 + i * 0.03, 0.02), m.koyu, -w / 2 + 0.4 + i * 0.12, 1.35, -dd / 2 + 0.04);
  ekle(grup, silindir(0.02, 0.02, 0.4, 8), m.celikKoyu, w / 2 - 0.35, 1.12, -dd / 2 + 0.15);
  const ekranGrubu = new Group();
  ekranGrubu.position.set(w / 2 - 0.35, 1.45, -dd / 2 + 0.2);
  ekranGrubu.rotation.x = -0.1;
  grup.add(ekranGrubu);
  ekle(ekranGrubu, yuvarlakKutu(0.58, 0.38, 0.04, 0.02), m.siyah);
  h.ekran = ekran(ekranGrubu, 0.54, 0.34, 0, 0, 0.022);
  h.ust = 2.2;
  h.andonYeri = [-w / 2 + 0.02, 2.1, -dd / 2 + 0.03];
}

// Koordinat ölçüm makinesi: granit tabla, hareketli köprü, araba ve prob; yanında ölçüm masası.
function cmm(m: Malzemeler, g: number, d: number, h: IstasyonGovdesi): void {
  const grup = h.grup;
  const tg = sinir(g - 1.4, 1.2, 3);
  const td = sinir(d * 0.72, 0.9, 1.6);
  const x0 = -g / 2 + 0.1 + tg / 2;
  ekle(grup, kutu(tg * 0.85, 0.55, td * 0.83), m.koyu, x0, 0.275, 0);
  ekle(grup, yuvarlakKutu(tg, 0.26, td, 0.02), m.granit, x0, 0.68, 0);
  const kopru = new Group();
  kopru.position.x = x0;
  grup.add(kopru);
  ekle(kopru, kutu(0.12, 1.05, 0.16), m.alu, -tg * 0.44, 1.33, 0);
  ekle(kopru, kutu(0.12, 1.05, 0.16), m.alu, tg * 0.44, 1.33, 0);
  ekle(kopru, yuvarlakKutu(tg * 0.98, 0.17, 0.22, 0.02), m.alu, 0, 1.93, 0);
  const araba = new Group();
  araba.position.set(0.1, 1.93, 0);
  kopru.add(araba);
  ekle(araba, kutu(0.24, 0.28, 0.3), m.boya, 0, 0, 0.05);
  const mil = new Group();
  araba.add(mil);
  ekle(mil, kutu(0.08, 0.9, 0.08), m.celik, 0, -0.45, 0.05);
  ekle(mil, silindir(0.004, 0.004, 0.05, 6), m.krom, 0, -0.93, 0.05);
  ekle(mil, new SphereGeometry(0.009, 12, 8), m.kirmizi, 0, -0.96, 0.05);
  Object.assign(h.anim, { kopru, araba, mil });
  h.hareketli.add(kopru);
  const mx = x0 + tg / 2 + 0.55;
  ekle(grup, kutu(0.9, 0.04, 0.6), m.ahsapUst, mx, 0.75, 0.2);
  ekle(grup, kutu(0.04, 0.73, 0.5), m.koyu, mx + 0.4, 0.37, 0.2);
  ekle(grup, kutu(0.04, 0.73, 0.5), m.koyu, mx - 0.4, 0.37, 0.2);
  const eg = new Group();
  ekle(grup, silindir(0.02, 0.02, 0.14, 10), m.celikKoyu, mx, 0.83, 0.05);
  eg.position.set(mx, 1.05, 0.05);
  grup.add(eg);
  ekle(eg, yuvarlakKutu(0.55, 0.34, 0.04, 0.02), m.siyah);
  h.ekran = ekran(eg, 0.51, 0.3, 0, 0, 0.022);
  h.ust = 2.05;
  h.andonYeri = [x0 - tg * 0.44, 2.015, 0];
}

// Boya kabini: kapalı kabin, ön cam kapılar, üstte aspiratör ve kanal.
function boyaKabini(m: Malzemeler, g: number, d: number, h: IstasyonGovdesi): void {
  const grup = h.grup;
  const w = sinir(g - 0.2, 1.8, 8);
  const dd = sinir(d - 0.2, 1.8, 8);
  const yk = 2.7;
  ekle(grup, kutu(w + 0.06, 0.12, dd + 0.06), m.koyu, 0, 0.06, 0);
  ekle(grup, yuvarlakKutu(w, yk, 0.07, 0.03), m.boya, 0, 0.12 + yk / 2, -dd / 2 + 0.035);
  ekle(grup, yuvarlakKutu(0.07, yk, dd, 0.03), m.boya, -w / 2 + 0.035, 0.12 + yk / 2, 0);
  ekle(grup, yuvarlakKutu(0.07, yk, dd, 0.03), m.boya, w / 2 - 0.035, 0.12 + yk / 2, 0);
  ekle(grup, yuvarlakKutu(w, 0.08, dd, 0.03), m.boya, 0, 0.12 + yk, 0);
  ekle(grup, kutu(w - 0.14, 0.02, dd - 0.14), m.icIsik, 0, 0.1 + yk, 0, false);
  ekle(grup, kutu(w - 0.14, 0.02, dd - 0.14), m.ic, 0, 0.13, 0);
  for (const sx of [-1, 1]) ekle(grup, kutu(w / 2 - 0.06, yk - 0.2, 0.03), m.cam, sx * (w / 4), 0.12 + yk / 2, dd / 2 - 0.02, false);
  ekle(grup, kutu(0.06, yk - 0.1, 0.06), m.boya, 0, 0.12 + yk / 2, dd / 2 - 0.02);
  ekle(grup, kutu(w * 0.985, 0.07, 0.012), m.vurgu, 0, yk - 0.05, dd / 2 + 0.004, false);
  // Aspiratör ve kanal.
  ekle(grup, yuvarlakKutu(0.9, 0.5, 0.9, 0.05), m.boyaOrta, w / 4, yk + 0.4, -dd / 4);
  const fan = new Group();
  fan.position.set(w / 4, yk + 0.66, -dd / 4);
  grup.add(fan);
  for (let i = 0; i < 4; i++) ekle(fan, kutu(0.6, 0.02, 0.1), m.celikKoyu, 0, 0, 0).rotation.y = (i * Math.PI) / 4;
  h.anim.fan = fan;
  h.hareketli.add(fan);
  ekle(grup, silindir(0.2, 0.2, 1.2, 20), m.celik, w / 4, yk + 1.25, -dd / 4);
  h.ekran = kumanda(grup, m, w / 2 - 0.45, 1.4, dd / 2 + 0.045, 0);
  h.ust = yk + 0.2;
  h.andonYeri = [-w / 2 + 0.15, yk + 0.16, dd / 2 - 0.15];
}

// Depo istasyonu: raflı alan ve sayım masası.
function depo(m: Malzemeler, g: number, d: number, h: IstasyonGovdesi): void {
  const grup = h.grup;
  const w = g * 0.95;
  const dd = d * 0.55;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) ekle(grup, kutu(0.06, 2.0, 0.06), m.raf, sx * (w / 2 - 0.03), 1.0, -d / 2 + dd / 2 + sz * (dd / 2 - 0.03));
  for (let k = 0; k < 4; k++) ekle(grup, kutu(w, 0.03, dd), m.galv, 0, 0.1 + k * 0.6, -d / 2 + dd / 2);
  ekle(grup, kutu(Math.min(1.6, w * 0.6), 0.05, 0.7), m.ahsapUst, 0, 0.9, d / 2 - 0.45);
  for (const sx of [-1, 1]) ekle(grup, kutu(0.05, 0.88, 0.6), m.koyu, sx * (Math.min(1.6, w * 0.6) / 2 - 0.05), 0.44, d / 2 - 0.45);
  const eg = new Group();
  ekle(grup, silindir(0.02, 0.02, 0.15, 10), m.celikKoyu, 0, 1.0, d / 2 - 0.65);
  eg.position.set(0, 1.2, d / 2 - 0.65);
  grup.add(eg);
  ekle(eg, yuvarlakKutu(0.5, 0.32, 0.04, 0.02), m.siyah);
  h.ekran = ekran(eg, 0.46, 0.28, 0, 0, 0.022);
  h.ust = 2.1;
  h.andonYeri = [w / 2 - 0.03, 2.0, -d / 2 + 0.03];
}

export function istasyonGovdesi(tip: string, ad: string, g: number, d: number, p: Palet, m: Malzemeler, hale: Texture): IstasyonGovdesi {
  const h: IstasyonGovdesi = { grup: new Group(), hareketli: new Set(), anim: {}, ust: 2, andonYeri: [0, 2, 0], ekran: null };
  const cins = makineCinsi(tip, ad);
  if (cins === 'cmm') cmm(m, g, d, h);
  else if (cins === 'montaj') tezgah(m, g, d, h);
  else if (cins === 'boya') boyaKabini(m, g, d, h);
  else if (cins === 'lazer') lazer(p, m, hale, g, d, h);
  else if (cins === 'depo') depo(m, g, d, h);
  else if (cins === 'torna') torna(m, g, d, h);
  else islemeMerkezi(m, g, d, cins === 'bes_eksen', h);
  return h;
}

// ---------- raflar ----------

export interface RafOlcusu {
  tur: string;
  bolme: number;
  kat: number;
  goz: number;
  bolmeGenisligi: number;
  derinlik: number;
  yukseklik: number;
  // Kullanıcının ölçtüğü net değerler (alttan üste kat yükseklikleri, göz net eni ve derinliği); yoksa çizim payları.
  katlar?: readonly number[] | null;
  gozGenisligi?: number | null;
  gozDerinligi?: number | null;
}

// Net kat yüksekliği, taşıyıcının (zemin, kiriş, raf tablası, kol) üst yüzünden bir üstteki taşıyıcının altına
// kadardır. Taşıyıcı kalınlıkları ölçülmez; çizimdeki kalınlıklar kullanılır.
const TASIYICI: Record<string, { ilk: number; kalinlik: number }> = {
  palet: { ilk: 0, kalinlik: 0.12 },
  kucuk_parca: { ilk: 0.1125, kalinlik: 0.025 },
  konsol: { ilk: 0.44, kalinlik: 0.08 },
  zemin: { ilk: 0.08, kalinlik: 0 },
};

export interface NetKat { taban: number; net: number }

export function netKatlar(r: RafOlcusu): NetKat[] | null {
  const k = r.katlar;
  if (!k || k.length !== r.kat) return null;
  const t = TASIYICI[r.tur] ?? { ilk: 0, kalinlik: 0.12 };
  const l: NetKat[] = [];
  let taban = t.ilk;
  for (const net of k) {
    l.push({ taban, net });
    taban += net + t.kalinlik;
  }
  return l;
}

const netKat = (r: RafOlcusu, kat: number): NetKat | null => netKatlar(r)?.[kat - 1] ?? null;
const netG = (r: RafOlcusu): number | null => r.gozGenisligi ?? null;
const netD = (r: RafOlcusu): number | null => r.gozDerinligi ?? null;

// Raf yerel eksende: boyu x (bölmeler soldan sağa), derinliği z, ön yüz +z.
export function rafGovdesi(r: RafOlcusu, m: Malzemeler): Group {
  const grup = new Group();
  const boy = r.bolme * r.bolmeGenisligi;
  const sol = -boy / 2;
  const net = netKatlar(r);
  if (r.tur === 'zemin') {
    // Sac stok alanı: göz başına iki ahşap takoz; levha yoksa boş durur.
    for (let b = 0; b < r.bolme; b++) {
      const x = sol + (b + 0.5) * r.bolmeGenisligi;
      for (const s of [-1, 1]) ekle(grup, kutu(r.bolmeGenisligi * 0.85, 0.08, 0.1), m.ahsap, x, 0.04, s * r.derinlik * 0.3);
    }
    return grup;
  }
  if (r.tur === 'konsol') {
    // Konsol raf: arkada kolonlar (ayaklı), öne uzanan kollar kolonun ön yüzüne bağlı, uçta tutucu; kolonlar
    // arkada yatay ve çapraz bağlarla birbirine bağlı.
    const ust = Math.max(2, r.bolme + 1);
    const H = Math.max(r.yukseklik, (net?.at(-1)?.taban ?? 0) + 0.2);
    const D = r.derinlik;
    const kz = -D / 2 + 0.1;
    const xler = Array.from({ length: ust }, (_, i) => sol + 0.08 + ((boy - 0.16) * i) / (ust - 1));
    for (const x of xler) {
      ekle(grup, kutu(0.16, H, 0.2), m.raf, x, H / 2, kz);
      ekle(grup, kutu(0.16, 0.12, D), m.raf, x, 0.06, 0);
      for (let k = 0; k < r.kat; k++) {
        const y = net ? (net[k]?.taban ?? 0) - 0.04 : 0.4 + (k * (H - 0.7)) / Math.max(1, r.kat - 1);
        const kolBoy = D - 0.22;
        const orta = -D / 2 + 0.2 + kolBoy / 2;
        ekle(grup, kutu(0.1, 0.08, kolBoy), m.raf, x, y, orta);
        ekle(grup, kutu(0.1, 0.1, 0.03), m.raf, x, y + 0.09, D / 2 - 0.035);
      }
    }
    for (let i = 0; i < xler.length - 1; i++) {
      const a_ = (xler[i] ?? 0) + 0.08;
      const b_ = (xler[i + 1] ?? 0) - 0.08;
      const ara = b_ - a_;
      for (const y of [0.3, H - 0.3]) ekle(grup, kutu(ara + 0.02, 0.06, 0.06), m.raf, (a_ + b_) / 2, y, kz);
      const dy = H - 0.6;
      const capraz = ekle(grup, kutu(Math.hypot(ara, dy), 0.05, 0.04), m.raf, (a_ + b_) / 2, H / 2, kz);
      capraz.rotation.z = Math.atan2(dy, ara) * (i % 2 ? -1 : 1);
    }
    return grup;
  }
  if (r.tur === 'kucuk_parca') {
    const adim = (r.yukseklik - 0.22) / r.kat;
    const tablalar = net
      ? [...net.map((k) => k.taban - 0.0125), (net.at(-1)?.taban ?? 0) + (net.at(-1)?.net ?? 0) + 0.0125]
      : Array.from({ length: r.kat + 1 }, (_, k) => 0.1 + k * adim);
    const H = Math.max(r.yukseklik, (tablalar.at(-1) ?? 0) + 0.05);
    for (let b = 0; b <= r.bolme; b++) {
      const x = sol + b * r.bolmeGenisligi;
      for (const dz of [-r.derinlik / 2 + 0.02, r.derinlik / 2 - 0.02]) ekle(grup, kutu(0.04, H, 0.04), m.raf, x, H / 2, dz);
    }
    for (const y of tablalar) ekle(grup, kutu(boy + 0.04, 0.025, r.derinlik), m.galv, 0, y, 0);
    return grup;
  }
  // Palet rafı: ön ve arka dikmeler yan çerçevede yatay ve çapraz bağlarla birleşir; turuncu kirişler dikmeden dikmeye.
  // Net ölçüde kirişler kalınlık payıyla yükseklik sınırını az aşabilir; dikme en üst kirişi taşır.
  const H = Math.max(r.yukseklik, (net?.at(-1)?.taban ?? 0) + 0.1);
  const D = r.derinlik;
  const dz = D / 2 - 0.04;
  const panel = Math.max(1, Math.round((H - 0.25) / 0.9));
  const ph = (H - 0.25) / panel;
  for (let b = 0; b <= r.bolme; b++) {
    const x = Math.min(boy / 2 - 0.04, Math.max(-boy / 2 + 0.04, sol + b * r.bolmeGenisligi));
    for (const z of [-dz, dz]) {
      ekle(grup, kutu(0.08, H, 0.08), m.raf, x, H / 2, z);
      ekle(grup, kutu(0.14, 0.012, 0.14), m.celikKoyu, x, 0.006, z);
    }
    for (const y of [0.15, H - 0.1]) ekle(grup, kutu(0.03, 0.03, D - 0.08), m.raf, x, y, 0);
    const ic = D - 0.12;
    for (let k = 0; k < panel; k++) {
      const c = ekle(grup, kutu(0.03, 0.03, Math.hypot(ic, ph)), m.raf, x, 0.15 + (k + 0.5) * ph, 0);
      c.rotation.x = (k % 2 ? 1 : -1) * Math.atan2(ph, ic);
    }
  }
  const katAdim = r.kat > 1 ? (H - 0.75) / (r.kat - 1) : 0;
  for (let b = 0; b < r.bolme; b++) {
    const x = sol + (b + 0.5) * r.bolmeGenisligi;
    for (let k = 1; k < r.kat; k++) {
      const y = net ? (net[k]?.taban ?? 0) - 0.06 : k * katAdim;
      for (const z of [-dz, dz]) ekle(grup, kutu(r.bolmeGenisligi - 0.06, 0.12, 0.06), m.rafKiris, x, y, z);
    }
  }
  return grup;
}

// ---------- raf yükü (stok) ----------

// Gözdeki yükün biçimi: koli (karton kutu), kasa (ahşap sandık), sac (levha yığını), çubuk (çubuk, profil, boru demeti),
// parça (küçük parça kutusu). Biçim ve doluluk stok verisinden gelir; raf türü yükün nasıl durduğunu belirler.
// model: parçanın kendi 3B modeli dizilir (çizim motorda; burada yalnız taşıyıcı, örn. palet, ve dizilecek bölge).
export type YukBicimi = 'koli' | 'kasa' | 'sac' | 'cubuk' | 'parca' | 'model';

export interface GozYuku {
  // 1'den başlar (göz adresiyle aynı).
  bolme: number;
  kat: number;
  goz: number;
  bicim: YukBicimi;
  // 0..1
  doluluk: number;
}

// Aynı göz her kurulumda aynı görünür (rastgele değil): küçük kayma ve dönüş adresten türetilir.
const sapma = (a: number, b: number, c: number): number => (((a * 73856093) ^ (b * 19349663) ^ (c * 83492791)) >>> 0) % 1000 / 1000;

function paletYuku(ust: Group, m: Malzemeler, y: GozYuku, x: number, taban: number, pw: number, pd: number, azami: number): void {
  const p = palet(m, pw, pd);
  p.position.set(x, taban, 0);
  ust.add(p);
  const yb = taban + 0.14;
  const d = Math.min(1, Math.max(0.05, y.doluluk));
  const k = sapma(y.bolme, y.kat, y.goz);
  if (y.bicim === 'model') return;
  if (y.bicim === 'sac') {
    ekle(ust, kutu(pw - 0.06, 0.02 + d * 0.32, pd - 0.08), m.galv, x, yb + (0.02 + d * 0.32) / 2, 0);
    return;
  }
  if (y.bicim === 'kasa') {
    const h = Math.max(0.25, d * azami);
    ekle(ust, kutu(pw - 0.04, h, pd - 0.04), m.ahsap, x, yb + h / 2, 0);
    for (const dy of [0.12, h - 0.12]) ekle(ust, kutu(pw - 0.02, 0.05, pd - 0.02), m.ahsapUst, x, yb + dy, 0);
    return;
  }
  if (y.bicim === 'cubuk') {
    const adet = Math.max(3, Math.round(d * 16));
    const sira = 8;
    const r = 0.03;
    for (let i = 0; i < adet; i++) {
      const sx = i % sira;
      const sy = Math.floor(i / sira);
      const c = ekle(ust, silindir(r, r, pw - 0.02, 6), m.celik, x, yb + r + sy * r * 1.8, -pd / 2 + 0.12 + sx * ((pd - 0.24) / (sira - 1)));
      c.rotation.z = Math.PI / 2;
    }
    return;
  }
  // Koli: üç sıra, iki dizi; katman sayısı dolulukla, üst katman eksik olabilir.
  const kh = 0.3;
  const katman = Math.max(1, Math.floor((azami - 0.02) / kh));
  const toplam = Math.max(1, Math.round(d * katman * 6));
  const kx = (pw - 0.04) / 3;
  const kz = (pd - 0.06) / 2;
  for (let i = 0; i < toplam; i++) {
    const l = Math.floor(i / 6);
    const j = i % 6;
    const cx = x - pw / 2 + 0.02 + kx * ((j % 3) + 0.5);
    const cz = -pd / 2 + 0.03 + kz * (Math.floor(j / 3) + 0.5);
    const kol = ekle(ust, kutu(kx - 0.015, kh - 0.01, kz - 0.015), m.karton, cx, yb + l * kh + (kh - 0.01) / 2, cz);
    kol.rotation.y = (k - 0.5) * 0.04;
  }
}

// Raf yerel ekseninde (rafGovdesi ile aynı) gözlerdeki yükler: palet rafında palet ve üstündeki yük, küçük parça rafında
// plastik kutu, konsolda kollara binen demet, sac alanında takozların üstünde levha yığını.
export function rafYukleri(r: RafOlcusu, yukler: readonly GozYuku[], m: Malzemeler): Group {
  const grup = new Group();
  const boy = r.bolme * r.bolmeGenisligi;
  const sol = -boy / 2;
  const icinde = (y: GozYuku) => y.doluluk > 0 && y.bolme >= 1 && y.bolme <= r.bolme && y.kat >= 1 && y.kat <= r.kat && y.goz >= 1 && y.goz <= r.goz;
  for (const y of yukler.filter(icinde)) {
    const d = Math.min(1, y.doluluk);
    // Modelli yükte yalnız palet rafının paleti çizilir; model kopyaları motorda bölgeye dizilir.
    if (y.bicim === 'model' && r.tur !== 'palet') continue;
    if (r.tur === 'zemin') {
      const x = sol + (y.bolme - 0.5) * r.bolmeGenisligi;
      const h = 0.02 + d * 0.4;
      ekle(grup, kutu(r.bolmeGenisligi * 0.88, h, r.derinlik * 0.8), m.galv, x, 0.08 + h / 2, 0);
      continue;
    }
    if (r.tur === 'konsol') {
      const ust = Math.max(2, r.bolme + 1);
      const xler = Array.from({ length: ust }, (_, i) => sol + 0.08 + ((boy - 0.16) * i) / (ust - 1));
      const a = xler[y.bolme - 1] ?? 0;
      const b = xler[y.bolme] ?? 0;
      const kolY = netKat(r, y.kat)?.taban ?? 0.4 + ((y.kat - 1) * (r.yukseklik - 0.7)) / Math.max(1, r.kat - 1) + 0.04;
      // Kol, kolonun önünden uca: göz sayısı kadar şeride bölünür.
      const z0 = -r.derinlik / 2 + 0.24;
      const z1 = r.derinlik / 2 - 0.08;
      const serit = (z1 - z0) / r.goz;
      const zs = z0 + serit * (y.goz - 1);
      const adet = Math.max(2, Math.round(d * Math.floor((serit - 0.02) / 0.065) * 3));
      const sira = Math.max(1, Math.floor((serit - 0.02) / 0.065));
      for (let i = 0; i < adet; i++) {
        const sz = i % sira;
        const sy = Math.floor(i / sira);
        ekle(grup, kutu(b - a, 0.05, 0.05), y.bicim === 'sac' ? m.galv : m.celik, (a + b) / 2, kolY + 0.025 + sy * 0.05, zs + 0.035 + sz * 0.065);
      }
      continue;
    }
    const sw = r.bolmeGenisligi / r.goz;
    const x = sol + (y.bolme - 1) * r.bolmeGenisligi + (y.goz - 0.5) * sw;
    if (r.tur === 'kucuk_parca') {
      const nk = netKat(r, y.kat);
      const adim = nk ? nk.net : (r.yukseklik - 0.22) / r.kat;
      const taban = nk ? nk.taban : 0.1 + (y.kat - 1) * adim + 0.0125;
      const w = Math.min(sw - 0.05, netG(r) ?? Infinity);
      const dd = Math.min(r.derinlik - 0.08, netD(r) ?? Infinity);
      const h = Math.min(0.22, adim * 0.6);
      // Önü alçak plastik kutu (dört duvar ve taban) ve içindeki parçalar.
      ekle(grup, kutu(w, 0.012, dd), m.kutu, x, taban + 0.006, 0);
      ekle(grup, kutu(w, h, 0.012), m.kutu, x, taban + h / 2, -dd / 2 + 0.006);
      ekle(grup, kutu(w, h * 0.55, 0.012), m.kutu, x, taban + (h * 0.55) / 2, dd / 2 - 0.006);
      for (const s of [-1, 1]) ekle(grup, kutu(0.012, h, dd), m.kutu, x + s * (w / 2 - 0.006), taban + h / 2, 0);
      const ih = Math.max(0.01, d * h * 0.8);
      ekle(grup, kutu(w - 0.03, ih, dd - 0.03), y.bicim === 'parca' ? m.galv : m.kutuGri, x, taban + 0.012 + ih / 2, 0);
      continue;
    }
    // Palet rafı.
    const p = paletYeri(r, y.kat, sw);
    paletYuku(grup, m, y, x, p.taban, p.pw, p.pd, p.azami);
  }
  return grup;
}

// Modelli yükün dizileceği bölge (raf yerel ekseni; y tabanın yüksekliği): rafYukleri ile aynı ölçüler.
export interface ModelBolgesi { x: number; y: number; z: number; g: number; h: number; d: number }

export function modelBolgesi(r: RafOlcusu, y: Pick<GozYuku, 'bolme' | 'kat' | 'goz'>): ModelBolgesi | null {
  if (y.bolme < 1 || y.bolme > r.bolme || y.kat < 1 || y.kat > r.kat || y.goz < 1 || y.goz > r.goz) return null;
  const boy = r.bolme * r.bolmeGenisligi;
  const sol = -boy / 2;
  if (r.tur === 'zemin') {
    const x = sol + (y.bolme - 0.5) * r.bolmeGenisligi;
    return { x, y: 0.08, z: 0, g: netG(r) ?? r.bolmeGenisligi * 0.88, h: netKat(r, y.kat)?.net ?? 0.6, d: netD(r) ?? r.derinlik * 0.8 };
  }
  if (r.tur === 'konsol') {
    const ust = Math.max(2, r.bolme + 1);
    const xler = Array.from({ length: ust }, (_, i) => sol + 0.08 + ((boy - 0.16) * i) / (ust - 1));
    const a = xler[y.bolme - 1] ?? 0;
    const b = xler[y.bolme] ?? 0;
    const aralik = (r.yukseklik - 0.7) / Math.max(1, r.kat - 1);
    const nk = netKat(r, y.kat);
    const kolY = nk?.taban ?? 0.4 + ((y.kat - 1) * (r.yukseklik - 0.7)) / Math.max(1, r.kat - 1) + 0.04;
    const z0 = -r.derinlik / 2 + 0.24;
    const serit = (r.derinlik / 2 - 0.08 - z0) / r.goz;
    return {
      x: (a + b) / 2, y: kolY, z: z0 + serit * (y.goz - 0.5),
      g: netG(r) ?? b - a, h: nk?.net ?? Math.max(0.2, Math.min(0.6, aralik - 0.2)), d: netD(r) ?? serit - 0.02,
    };
  }
  const sw = r.bolmeGenisligi / r.goz;
  const x = sol + (y.bolme - 1) * r.bolmeGenisligi + (y.goz - 0.5) * sw;
  if (r.tur === 'kucuk_parca') {
    const adim = (r.yukseklik - 0.22) / r.kat;
    const nk = netKat(r, y.kat);
    return {
      x, y: nk?.taban ?? 0.1 + (y.kat - 1) * adim + 0.0125, z: 0,
      g: netG(r) ?? sw - 0.05, h: nk?.net ?? adim * 0.7, d: netD(r) ?? r.derinlik - 0.08,
    };
  }
  const p = paletYeri(r, y.kat, sw);
  // Net ölçü verilmişse bölge göz boşluğunun tamamıdır (paletin üstünden bir üst kirişin altına).
  const nk = netKat(r, y.kat);
  return {
    x, y: p.taban + 0.14, z: 0,
    g: netG(r) ?? p.pw - 0.04, h: nk ? Math.max(0.01, nk.net - 0.14) : p.azami, d: netD(r) ?? p.pd - 0.04,
  };
}

// Palet rafında gözdeki paletin tabanı, eni, derinliği ve üstündeki yükün çizim için en çok yüksekliği.
function paletYeri(r: RafOlcusu, kat: number, sw: number): { taban: number; pw: number; pd: number; azami: number } {
  const pw = Math.min(1.2, sw - 0.12, netG(r) ?? Infinity);
  // Palet ön ve arka kirişe biner; derinliği net ölçüyle kısılmaz (net derinlik yalnız yükün bölgesidir).
  const pd = Math.min(1.2, r.derinlik + 0.1);
  const nk = netKat(r, kat);
  if (nk) return { taban: nk.taban, pw, pd, azami: Math.max(0.3, nk.net - 0.14 - 0.1) };
  const katAdim = r.kat > 1 ? (r.yukseklik - 0.75) / (r.kat - 1) : 0;
  const taban = kat === 1 ? 0 : (kat - 1) * katAdim + 0.06;
  // Üst katta yük dikmenin en çok 30 cm üstüne çıkar.
  const azami = Math.min((r.kat > 1 ? katAdim : 1.5) - 0.12 - 0.3, r.yukseklik + 0.3 - taban - 0.14);
  return { taban, pw, pd, azami: Math.max(0.3, azami) };
}

// Gözün ön yüzdeki dikdörtgeni (raf yerel ekseni; x merkez, y alt kenar, g en, h boy): bölmeye karşıdan bakışta
// seçim kutusu, vurgu çerçevesi ve etiket bundan. Konsol ve sac alanında gözler derinliktedir; önden bakışta bölme
// eni göz sayısına bölünür (2B cepheyle aynı düzen).
export interface GozCephesi { x: number; y: number; g: number; h: number }

export function gozCephesi(r: RafOlcusu, y: Pick<GozYuku, 'bolme' | 'kat' | 'goz'>): GozCephesi | null {
  if (y.bolme < 1 || y.bolme > r.bolme || y.kat < 1 || y.kat > r.kat || y.goz < 1 || y.goz > r.goz) return null;
  const boy = r.bolme * r.bolmeGenisligi;
  const sol = -boy / 2;
  const H = r.yukseklik;
  const nk = netKat(r, y.kat);
  if (r.tur === 'zemin' || r.tur === 'konsol') {
    let a = sol + (y.bolme - 1) * r.bolmeGenisligi;
    let b = a + r.bolmeGenisligi;
    if (r.tur === 'konsol') {
      const ust = Math.max(2, r.bolme + 1);
      const xler = Array.from({ length: ust }, (_, i) => sol + 0.08 + ((boy - 0.16) * i) / (ust - 1));
      a = (xler[y.bolme - 1] ?? a) + 0.08;
      b = (xler[y.bolme] ?? b) - 0.08;
    }
    const w = (b - a) / r.goz;
    const x = a + (y.goz - 0.5) * w;
    if (r.tur === 'zemin') return { x, y: 0, g: w, h: nk ? 0.08 + nk.net : 0.6 };
    if (nk) return { x, y: nk.taban - 0.09, g: w, h: nk.net + 0.09 };
    const aralik = r.kat > 1 ? (H - 0.7) / (r.kat - 1) : H - 0.4;
    const kolY = 0.4 + ((y.kat - 1) * (H - 0.7)) / Math.max(1, r.kat - 1);
    // En üst kolun üstünde rafın tepesine kadar.
    const alt = kolY - 0.05;
    return { x, y: alt, g: w, h: y.kat < r.kat ? aralik : Math.max(0.3, H - alt) };
  }
  const sw = r.bolmeGenisligi / r.goz;
  const x = sol + (y.bolme - 1) * r.bolmeGenisligi + (y.goz - 0.5) * sw;
  if (r.tur === 'kucuk_parca') {
    if (nk) return { x, y: nk.taban - 0.0125, g: sw, h: nk.net + 0.025 };
    const adim = (H - 0.22) / r.kat;
    return { x, y: 0.1 + (y.kat - 1) * adim, g: sw, h: adim };
  }
  if (nk) return { x, y: nk.taban, g: sw, h: Math.max(0.05, nk.net) };
  const katAdim = r.kat > 1 ? (H - 0.75) / (r.kat - 1) : 0;
  const alt = y.kat === 1 ? 0 : (y.kat - 1) * katAdim + 0.06;
  const ust = y.kat < r.kat ? y.kat * katAdim - 0.06 : H;
  return { x, y: alt, g: sw, h: Math.max(0.3, ust - alt) };
}

export function palet(m: Malzemeler, g: number, d: number): Group {
  const grup = new Group();
  ekle(grup, kutu(g, 0.022, d), m.ahsap, 0, 0.129, 0);
  for (const sz of [-1, 0, 1]) ekle(grup, kutu(g, 0.1, 0.1), m.ahsap, 0, 0.05, sz * (d / 2 - 0.05));
  for (let i = 0; i < 5; i++) ekle(grup, kutu(0.1, 0.02, d), m.ahsap, -g / 2 + 0.05 + (i * (g - 0.1)) / 4, 0.11, 0);
  return grup;
}

// Duvar parçası: cam bölmede alüminyum dikme ve cam, dolu duvarda panel ve beton kaide.
export function duvarParcasi(m: Malzemeler, boy: number, cam: boolean, yukseklik: number): Group {
  const grup = new Group();
  if (cam) {
    const n = Math.max(1, Math.round(boy / 1.25));
    for (let i = 0; i <= n; i++) ekle(grup, kutu(0.06, yukseklik, 0.06), m.alu, -boy / 2 + (boy * i) / n, yukseklik / 2, 0);
    for (const y of [0.03, yukseklik - 0.04]) ekle(grup, kutu(boy, 0.06, 0.07), m.alu, 0, y, 0);
    ekle(grup, kutu(boy, yukseklik - 0.1, 0.012), m.camOda, 0, yukseklik / 2, 0, false);
    return grup;
  }
  ekle(grup, kutu(boy, yukseklik, 0.2), m.panel, 0, yukseklik / 2, 0);
  ekle(grup, kutu(boy + 0.02, 0.22, 0.24), m.beton, 0, 0.11, 0);
  return grup;
}

// Kapı üstündeki lento (dolu duvarda) ya da üst kayıt (camda).
export function kapiUstu(m: Malzemeler, genislik: number, cam: boolean, yukseklik: number): Group {
  const grup = new Group();
  if (cam) ekle(grup, kutu(genislik, 0.08, 0.07), m.alu, 0, yukseklik - 0.04, 0);
  else ekle(grup, kutu(genislik, yukseklik - 2.2, 0.2), m.panel, 0, (yukseklik + 2.2) / 2, 0);
  return grup;
}

// Çelik I profil kolon. Flanşlar duvara paraleldir; yan duvardaki kolon 90° döner.
export function kolon(ust: Object3D, m: Malzemeler, boy: number, x: number, y: number, z: number, yanlamasina = false): void {
  const grup = new Group();
  const H = 0.34;
  const W = 0.3;
  const tf = 0.024;
  const tw = 0.014;
  ekle(grup, kutu(W, boy, tf), m.kolon, 0, 0, H / 2 - tf / 2);
  ekle(grup, kutu(W, boy, tf), m.kolon, 0, 0, -H / 2 + tf / 2);
  ekle(grup, kutu(tw, boy, H - 2 * tf), m.kolon, 0, 0, 0);
  ekle(grup, kutu(0.4, 0.02, 0.44), m.celikKoyu, 0, -boy / 2 + 0.01, 0);
  grup.position.set(x, y, z);
  if (yanlamasina) grup.rotation.y = Math.PI / 2;
  ust.add(grup);
}
