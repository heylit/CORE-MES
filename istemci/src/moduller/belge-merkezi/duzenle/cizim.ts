import type { Oge } from './duzenleme.ts';

// Düzenleyicinin tarayıcı tarafı çizimleri (kart 2123): önizleme katmanı, yazı ve logonun PNG'ye çevrilmesi.

export const YAZI_YAZI_TIPI = 'sans-serif';
// Yazının satır yüksekliği yazı boyunun bu katıdır; önizleme ile PDF'e giden resim aynı ölçüyü kullanır.
export const YAZI_SATIR = 1.25;
// Yazı ve logo PDF'e sayfa noktasının bu katı çözünürlükte gömülür (yaklaşık 288 dpi).
export const RESIM_KATI = 4;

export function yaziOlcusu(o: Extract<Oge, { tur: 'yazi' }>): { g: number; y2: number } {
  const t = document.createElement('canvas').getContext('2d');
  if (!t) return { g: o.metin.length * o.boy * 0.6, y2: o.boy * YAZI_SATIR };
  t.font = `${String(o.boy)}px ${YAZI_YAZI_TIPI}`;
  return { g: Math.max(1, t.measureText(o.metin).width), y2: o.boy * YAZI_SATIR };
}

const pngYap = (t: HTMLCanvasElement): Promise<Uint8Array> => new Promise((coz, red) => {
  t.toBlob((b) => {
    if (!b) { red(new Error('Resim üretilemedi.')); return; }
    b.arrayBuffer().then((a) => { coz(new Uint8Array(a)); }, red);
  }, 'image/png');
});

export async function yaziPng(o: Extract<Oge, { tur: 'yazi' }>): Promise<{ png: Uint8Array; olcu: { g: number; y2: number } }> {
  const olcu = yaziOlcusu(o);
  const t = document.createElement('canvas');
  t.width = Math.ceil(olcu.g * RESIM_KATI);
  t.height = Math.ceil(olcu.y2 * RESIM_KATI);
  const c = t.getContext('2d');
  if (!c) throw new Error('Yazı çizilemedi.');
  c.scale(RESIM_KATI, RESIM_KATI);
  yaziCiz(c, { ...o, x: 0, y: 0 });
  return { png: await pngYap(t), olcu };
}

// Kurum logosu PNG, JPEG ya da WebP gelir; pdf-lib WebP gömemediği için her biçim PNG'ye çevrilir.
export async function logoPng(resim: HTMLImageElement): Promise<Uint8Array> {
  const t = document.createElement('canvas');
  t.width = resim.naturalWidth;
  t.height = resim.naturalHeight;
  const c = t.getContext('2d');
  if (!c) throw new Error('Logo hazırlanamadı.');
  c.drawImage(resim, 0, 0);
  return pngYap(t);
}

export function resimYukle(adres: string): Promise<HTMLImageElement> {
  return new Promise((coz, red) => {
    const r = new Image();
    r.onload = () => { coz(r); };
    r.onerror = () => { red(new Error('Logo açılamadı.')); };
    r.src = adres;
  });
}

function yaziCiz(c: CanvasRenderingContext2D, o: Extract<Oge, { tur: 'yazi' }>): void {
  c.fillStyle = o.renk;
  c.font = `${String(o.boy)}px ${YAZI_YAZI_TIPI}`;
  c.textBaseline = 'middle';
  c.fillText(o.metin, o.x, o.y + (o.boy * YAZI_SATIR) / 2);
}

// Öğenin seçim çerçevesi için kutusu (görünüm noktası).
export function ogeKutusu(o: Oge): { x: number; y: number; g: number; y2: number } {
  if (o.tur === 'cizgi') {
    const pay = Math.max(4, o.kalin);
    return { x: Math.min(o.x0, o.x1) - pay, y: Math.min(o.y0, o.y1) - pay, g: Math.abs(o.x1 - o.x0) + 2 * pay, y2: Math.abs(o.y1 - o.y0) + 2 * pay };
  }
  if (o.tur === 'yazi') return { x: o.x, y: o.y, ...yaziOlcusu(o) };
  return o;
}

export const ogeIcindeMi = (o: Oge, x: number, y: number): boolean => {
  const k = ogeKutusu(o);
  return x >= k.x && x <= k.x + k.g && y >= k.y && y <= k.y + k.y2;
};

// Önizleme katmanı: öğeler sayfa noktasında çizilir; `olcek` tuval pikselinin sayfa noktasına oranıdır.
export function katmanCiz(
  c: CanvasRenderingContext2D, olcek: number, ogeler: readonly Oge[], secili: number | null, logo: HTMLImageElement | null,
  taslak: { x0: number; y0: number; x1: number; y1: number; cizgi: boolean } | null, vurgu: string,
): void {
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, c.canvas.width, c.canvas.height);
  c.setTransform(olcek, 0, 0, olcek, 0, 0);
  for (const o of ogeler) {
    if (o.tur === 'dolgu') { c.fillStyle = o.renk; c.fillRect(o.x, o.y, o.g, o.y2); }
    else if (o.tur === 'cizgi') {
      c.strokeStyle = o.renk; c.lineWidth = o.kalin; c.setLineDash([]);
      c.beginPath(); c.moveTo(o.x0, o.y0); c.lineTo(o.x1, o.y1); c.stroke();
    } else if (o.tur === 'logo') { if (logo) c.drawImage(logo, o.x, o.y, o.g, o.y2); }
    else yaziCiz(c, o);
  }
  c.strokeStyle = vurgu;
  c.lineWidth = 1.5 / olcek;
  c.setLineDash([6 / olcek, 4 / olcek]);
  const sec = secili === null ? undefined : ogeler[secili];
  if (sec) { const k = ogeKutusu(sec); c.strokeRect(k.x - 2, k.y - 2, k.g + 4, k.y2 + 4); }
  if (taslak) {
    c.beginPath();
    if (taslak.cizgi) { c.moveTo(taslak.x0, taslak.y0); c.lineTo(taslak.x1, taslak.y1); }
    else c.rect(Math.min(taslak.x0, taslak.x1), Math.min(taslak.y0, taslak.y1), Math.abs(taslak.x1 - taslak.x0), Math.abs(taslak.y1 - taslak.y0));
    c.stroke();
  }
  c.setLineDash([]);
}

// Öğeyi (dx, dy) kadar kaydırır.
export function kaydir(o: Oge, dx: number, dy: number): Oge {
  if (o.tur === 'cizgi') return { ...o, x0: o.x0 + dx, y0: o.y0 + dy, x1: o.x1 + dx, y1: o.y1 + dy };
  return { ...o, x: o.x + dx, y: o.y + dy };
}
