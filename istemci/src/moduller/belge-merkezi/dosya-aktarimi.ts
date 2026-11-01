import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { DosyaParcasiGovdesi, EksiklerGovdesi } from '#paylasilan/sozlesme/dosya.ts';
import { api, ApiHatasi, OTURUM_BITTI } from '../../ortak/veri/api.ts';

// Dosyanın yolculuğu: özet, parçalı yükleme (`dosya` modülü, ADR 0009) ve indirme. Özet ve base64 atölyedeki model
// yüklemesiyle aynıdır; ortak parçaya taşınması çekirdek isteğidir (CEKIRDEK-ISTEKLERI.md).

// Sunucunun parça boyu (`paylasilan/sozlesme/dosya.ts` DOSYA_PARCASI); sözleşme zod taşıdığı için burada sayı olarak durur.
export const PARCA_BAYT = 512 * 1024;
export const AZAMI_BAYT = 200 * 1024 * 1024;

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

// SHA-256: tarayıcının kriptosu yalnız güvenli bağlamda (https ya da localhost) vardır; kurum içi http'de bu yazılım
// sürümü kullanılır. Sonuç küçük harf onaltılık.
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
    const d = new Uint8Array(await k.digest('SHA-256', new Uint8Array(veri).buffer));
    return [...d].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  return sha256Yazilim(veri);
}

// Dosya gönderilmeden bu cihazda reddedildi; ileti olduğu gibi gösterilir.
export class DosyaHatasi extends Error {}

export const parcaSayisi = (bayt: number): number => Math.max(1, Math.ceil(bayt / PARCA_BAYT));

// Dosyayı yükler ve özetini döner. Kişinin daha önce tamamladığı içerik yeniden gönderilmez (`/dosyalar/eksikler`).
// Bağlama ayrı komuttur: özet belge ya da revizyon komutuyla gider.
export async function dosyaYukle(veri: Uint8Array, ilerleme: (oran: number) => void): Promise<string> {
  if (veri.length === 0) throw new DosyaHatasi('Dosya boş.');
  if (veri.length > AZAMI_BAYT) throw new DosyaHatasi('Dosya 200 MB sınırını aşıyor.');
  const ozet = await sha256(veri);
  const eksik: EksiklerGovdesi = { ozetler: [ozet] };
  const { eksikler } = await api.post<{ eksikler: string[] }>('/dosyalar/eksikler', eksik);
  if (eksikler.length === 0) { ilerleme(1); return ozet; }
  const toplam = parcaSayisi(veri.length);
  for (let sira = 0; sira < toplam; sira++) {
    const parca: DosyaParcasiGovdesi = { sira, toplam, veri: base64Yaz(veri.subarray(sira * PARCA_BAYT, (sira + 1) * PARCA_BAYT)) };
    await api.post<{ tamam: boolean }>(`/dosyalar/${ozet}/parca`, parca);
    ilerleme((sira + 1) / toplam);
  }
  return ozet;
}

// İkili cevap `api` ile okunmaz (JSON bekler); aynı köken, çerezli oturum ve aynı hata biçimi burada kurulur. `api`'ye ikili
// okuma eklenmesi çekirdek isteğidir.
export async function ikiliOku(yol: string, sinyal?: AbortSignal): Promise<Uint8Array> {
  const cevap = await fetch(`/api${yol}`, { credentials: 'include', ...(sinyal ? { signal: sinyal } : {}) });
  if (!cevap.ok) {
    if (cevap.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
    let govde: unknown = null;
    try { govde = await cevap.json(); } catch { /* gövdesiz ya da vekil sayfası */ }
    const hataMi = govde !== null && typeof govde === 'object' && 'kod' in govde && 'mesaj' in govde && typeof govde.mesaj === 'string';
    throw new ApiHatasi(cevap.status, hataMi ? govde as HataGovdesi : null);
  }
  return new Uint8Array(await cevap.arrayBuffer());
}

export function kaydet(veri: Uint8Array, ad: string, tur: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([new Uint8Array(veri)], { type: tur }));
  a.download = ad;
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); }, 1000);
}
