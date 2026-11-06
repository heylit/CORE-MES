import { KUTU, simgeCizimi, type KaroTuru, type PiktogramAdi, type Sekil } from '#paylasilan/etiket-piktogramlari.ts';
import type { Dikdortgen } from './kurallar.ts';

// EM-25 (kart 2168): piktogram yazıcı noktasına çevrilir. Her noktanın merkezi biçimlere sırayla sınanır; son tutan biçim noktanın
// rengini verir (oyuk biçim beyaz). İki dil de bit eşlem komutu değil kutu komutu basar: QR ile aynı yol, yazıcı modeline bağlı değil.

const icinde = (s: Sekil, x: number, y: number): boolean => {
  switch (s.t) {
    case 'dikdortgen': {
      if (x < s.x || y < s.y || x > s.x + s.g || y > s.y + s.h) return false;
      const r = Math.min(s.r ?? 0, s.g / 2, s.h / 2);
      if (r <= 0) return true;
      const kx = Math.min(Math.max(x, s.x + r), s.x + s.g - r);
      const ky = Math.min(Math.max(y, s.y + r), s.y + s.h - r);
      return (x - kx) ** 2 + (y - ky) ** 2 <= r * r;
    }
    case 'daire': return (x - s.x) ** 2 + (y - s.y) ** 2 <= s.r * s.r;
    case 'cokgen': {
      let ic = false;
      for (let i = 0, j = s.n.length - 1; i < s.n.length; j = i++) {
        const [xi, yi] = s.n[i] ?? [0, 0];
        const [xj, yj] = s.n[j] ?? [0, 0];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) ic = !ic;
      }
      return ic;
    }
    case 'cizgi': {
      const yari2 = (s.k / 2) ** 2;
      for (let i = 1; i < s.n.length; i++) {
        const [ax, ay] = s.n[i - 1] ?? [0, 0];
        const [bx, by] = s.n[i] ?? [0, 0];
        const dx = bx - ax, dy = by - ay;
        const boy2 = dx * dx + dy * dy;
        const t = boy2 === 0 ? 0 : Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / boy2));
        if ((x - ax - t * dx) ** 2 + (y - ay - t * dy) ** 2 <= yari2) return true;
      }
      return false;
    }
    case 'tarama':
      return x >= s.x && y >= s.y && x <= s.x + s.g && y <= s.y + s.h && (((x + y) % s.aralik) + s.aralik) % s.aralik < s.k;
  }
};

export function simgeNoktalari(ad: PiktogramAdi, karo: KaroTuru, nokta: number): boolean[][] {
  const sekiller = simgeCizimi(ad, karo);
  const n = Math.max(1, nokta);
  return Array.from({ length: n }, (_, sy) => Array.from({ length: n }, (_, sx) => {
    const x = ((sx + 0.5) * KUTU) / n, y = ((sy + 0.5) * KUTU) / n;
    let koyu = false;
    for (const s of sekiller) if (icinde(s, x, y)) koyu = s.oyuk !== true;
    return koyu;
  }));
}

// Koyu noktalar satır parçalarına, aynı parçası olan ardışık satırlar tek kutuya birleşir (komut sayısı azalır).
export function noktaDikdortgenleri(noktalar: boolean[][], x: number, y: number): Dikdortgen[] {
  const acik = new Map<string, Dikdortgen>();
  const sonuc: Dikdortgen[] = [];
  noktalar.forEach((satir, sy) => {
    const bu = new Set<string>();
    let bas = -1;
    for (let sx = 0; sx <= satir.length; sx++) {
      const koyu = satir[sx] === true;
      if (koyu && bas < 0) bas = sx;
      if (!koyu && bas >= 0) {
        const anahtar = `${bas}:${sx}`;
        const onceki = acik.get(anahtar);
        if (onceki) onceki.yukseklik += 1; else { const d = { x: x + bas, y: y + sy, genislik: sx - bas, yukseklik: 1 }; acik.set(anahtar, d); sonuc.push(d); }
        bu.add(anahtar);
        bas = -1;
      }
    }
    for (const a of [...acik.keys()]) if (!bu.has(a)) acik.delete(a);
  });
  return sonuc;
}
