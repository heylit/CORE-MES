import { MODEL_PARCA_BAYT } from '#paylasilan/atolye-sabitleri.ts';
import type { ModelBirimi, ModelKaynakBicimi } from '#paylasilan/sozlesme/atolye.ts';

// Model dosyasının yolculuğu: özet, parçalama ve base64. Saf yardımcılar; three'ye ve ağa bağlı değildir.

export const BIRIM_CARPANI: Record<ModelBirimi, number> = { mm: 0.001, cm: 0.01, m: 1 };

const UZANTILAR: Record<string, ModelKaynakBicimi> = { step: 'step', stp: 'step', stl: 'stl', glb: 'glb', gltf: 'gltf' };

export function dosyaBicimi(ad: string): ModelKaynakBicimi | null {
  const uzanti = ad.toLowerCase().split('.').pop() ?? '';
  return UZANTILAR[uzanti] ?? null;
}

// CAD (STEP, STL) çoğunlukla milimetre ve Z yukarıdır; GLB/GLTF tanım gereği metre ve Y yukarıdır.
export function varsayilanAyar(bicim: ModelKaynakBicimi): { birim: ModelBirimi; yukari: 'y' | 'z' } {
  return bicim === 'glb' || bicim === 'gltf' ? { birim: 'm', yukari: 'y' } : { birim: 'mm', yukari: 'z' };
}

export const dosyaAdindanAd = (ad: string): string => (ad.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || 'Model').slice(0, 120);

export function parcala(veri: Uint8Array): Uint8Array[] {
  const sonuc: Uint8Array[] = [];
  for (let i = 0; i < veri.length; i += MODEL_PARCA_BAYT) sonuc.push(veri.subarray(i, Math.min(veri.length, i + MODEL_PARCA_BAYT)));
  return sonuc;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Yaz(veri: Uint8Array): string {
  let s = '';
  let i = 0;
  for (; i + 2 < veri.length; i += 3) {
    const n = ((veri[i] ?? 0) << 16) | ((veri[i + 1] ?? 0) << 8) | (veri[i + 2] ?? 0);
    s += (B64[(n >> 18) & 63] ?? '') + (B64[(n >> 12) & 63] ?? '') + (B64[(n >> 6) & 63] ?? '') + (B64[n & 63] ?? '');
  }
  const kalan = veri.length - i;
  if (kalan === 1) {
    const n = (veri[i] ?? 0) << 16;
    s += `${B64[(n >> 18) & 63] ?? ''}${B64[(n >> 12) & 63] ?? ''}==`;
  } else if (kalan === 2) {
    const n = ((veri[i] ?? 0) << 16) | ((veri[i + 1] ?? 0) << 8);
    s += `${B64[(n >> 18) & 63] ?? ''}${B64[(n >> 12) & 63] ?? ''}${B64[(n >> 6) & 63] ?? ''}=`;
  }
  return s;
}

const B64_DEGER = new Map([...B64].map((h, i) => [h, i]));

export function base64Oku(metin: string): Uint8Array {
  const temiz = metin.replace(/=+$/, '');
  const sonuc = new Uint8Array(Math.floor((temiz.length * 3) / 4));
  let j = 0;
  for (let i = 0; i < temiz.length; i += 4) {
    const a = B64_DEGER.get(temiz[i] ?? '') ?? 0;
    const b = B64_DEGER.get(temiz[i + 1] ?? '') ?? 0;
    const c = B64_DEGER.get(temiz[i + 2] ?? '') ?? 0;
    const d = B64_DEGER.get(temiz[i + 3] ?? '') ?? 0;
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (j < sonuc.length) sonuc[j++] = (n >> 16) & 255;
    if (j < sonuc.length) sonuc[j++] = (n >> 8) & 255;
    if (j < sonuc.length) sonuc[j++] = n & 255;
  }
  return sonuc;
}

// SHA-256: tarayıcının kriptosu yalnız güvenli bağlamda (https ya da localhost) vardır; kurum içi http'de bu
// yazılım sürümü kullanılır. Sonuç küçük harf onaltılık.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

export function sha256Yazilim(veri: Uint8Array): string {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const bitBoyu = veri.length * 8;
  const dolguBoyu = (((veri.length + 9 + 63) >> 6) << 6);
  const m = new Uint8Array(dolguBoyu);
  m.set(veri);
  m[veri.length] = 0x80;
  const g = new DataView(m.buffer);
  g.setUint32(dolguBoyu - 8, Math.floor(bitBoyu / 4294967296));
  g.setUint32(dolguBoyu - 4, bitBoyu >>> 0);
  const w = new Uint32Array(64);
  const sag = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < dolguBoyu; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = g.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] ?? 0;
      const b = w[i - 2] ?? 0;
      const s0 = sag(a, 7) ^ sag(a, 18) ^ (a >>> 3);
      const s1 = sag(b, 17) ^ sag(b, 19) ^ (b >>> 10);
      w[i] = ((w[i - 16] ?? 0) + s0 + (w[i - 7] ?? 0) + s1) >>> 0;
    }
    let [a, b, c, d, e, f, gg, hh] = [h[0] ?? 0, h[1] ?? 0, h[2] ?? 0, h[3] ?? 0, h[4] ?? 0, h[5] ?? 0, h[6] ?? 0, h[7] ?? 0];
    for (let i = 0; i < 64; i++) {
      const S1 = sag(e, 6) ^ sag(e, 11) ^ sag(e, 25);
      const ch = (e & f) ^ (~e & gg);
      const t1 = (hh + S1 + ch + (K[i] ?? 0) + (w[i] ?? 0)) >>> 0;
      const S0 = sag(a, 2) ^ sag(a, 13) ^ sag(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = gg; gg = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    h[0] = ((h[0] ?? 0) + a) >>> 0; h[1] = ((h[1] ?? 0) + b) >>> 0; h[2] = ((h[2] ?? 0) + c) >>> 0; h[3] = ((h[3] ?? 0) + d) >>> 0;
    h[4] = ((h[4] ?? 0) + e) >>> 0; h[5] = ((h[5] ?? 0) + f) >>> 0; h[6] = ((h[6] ?? 0) + gg) >>> 0; h[7] = ((h[7] ?? 0) + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, '0')).join('');
}

export async function sha256(veri: Uint8Array): Promise<string> {
  const k = typeof crypto !== 'undefined' ? crypto.subtle : undefined;
  if (k) {
    const kopya = new Uint8Array(veri);
    const d = new Uint8Array(await k.digest('SHA-256', kopya.buffer));
    return [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  return sha256Yazilim(veri);
}

export const mbMetni = (bayt: number): string => `${(bayt / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
