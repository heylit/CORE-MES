import type { YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import { sayi } from './kurallar.ts';

// Fabrika planı: her bölüm (salon) fabrika metresinde sol üst köşesi ve o köşe çevresindeki dönüşüyle durur.
// Bölüm noktası (x sağa, z aşağı, sol üst köşeden) fabrika noktasına F + R(donus)·p ile gider; dönüş ekranda saat yönü
// artıdır (z aşağı), kroki hizalamasıyla aynı. Saf: ekran ve sunucu yok.

export interface BolumKonumu {
  x: number;
  z: number;
  donus: number;
}

export interface Nokta2 {
  x: number;
  z: number;
}

const RAD = Math.PI / 180;
// Taslak fabrika noktasını santimetreye yuvarlar; 90'ın katı olmayan dönüşte kenardaki öğe bölüme dönünce birkaç milimetre
// dışarı düşer (yuvarlama payı en çok 0,005·√2 m). Pay sunucunun çakışma payıyla (1 cm) aynıdır.
const PAY = 0.01;

export const SIFIR_KONUM: BolumKonumu = { x: 0, z: 0, donus: 0 };

export function konumOku(salon: YerlesimCevabi['salon']): BolumKonumu {
  return { x: sayi(salon.fabrika.x), z: sayi(salon.fabrika.z), donus: sayi(salon.fabrika.donus) };
}

export function fabrikayaCevir(k: BolumKonumu, p: Nokta2): Nokta2 {
  const c = Math.cos(k.donus * RAD);
  const s = Math.sin(k.donus * RAD);
  return { x: k.x + c * p.x - s * p.z, z: k.z + s * p.x + c * p.z };
}

export function bolumeCevir(k: BolumKonumu, p: Nokta2): Nokta2 {
  const c = Math.cos(k.donus * RAD);
  const s = Math.sin(k.donus * RAD);
  const dx = p.x - k.x;
  const dz = p.z - k.z;
  return { x: c * dx + s * dz, z: -s * dx + c * dz };
}

// Nokta bölümün içinde mi (kenar dahil).
export function bolumIcinde(k: BolumKonumu, g: number, d: number, p: Nokta2): boolean {
  const y = bolumeCevir(k, p);
  return y.x >= -PAY && y.x <= g + PAY && y.z >= -PAY && y.z <= d + PAY;
}

export function bolumKoseleri(k: BolumKonumu, g: number, d: number): Nokta2[] {
  return [{ x: 0, z: 0 }, { x: g, z: 0 }, { x: g, z: d }, { x: 0, z: d }].map((p) => fabrikayaCevir(k, p));
}

export interface Kutu {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

// Bölümlerin fabrika planındaki sınır kutusu; bölüm yoksa null.
export function fabrikaKutusu(bolumler: readonly { konum: BolumKonumu; g: number; d: number }[]): Kutu | null {
  if (bolumler.length === 0) return null;
  const k: Kutu = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const b of bolumler) {
    for (const p of bolumKoseleri(b.konum, b.g, b.d)) {
      k.x0 = Math.min(k.x0, p.x); k.x1 = Math.max(k.x1, p.x);
      k.z0 = Math.min(k.z0, p.z); k.z1 = Math.max(k.z1, p.z);
    }
  }
  return k;
}

export const yerlesimKutusu = (bolumler: readonly YerlesimCevabi[]): Kutu | null =>
  fabrikaKutusu(bolumler.map((y) => ({ konum: konumOku(y.salon), g: sayi(y.salon.genislik), d: sayi(y.salon.derinlik) })));

// Seçim anahtarının (istasyon:, makine:, raf:, alan:, giris:, bolum:) ait olduğu bölüm.
export function ogeninBolumu(bolumler: readonly YerlesimCevabi[], anahtar: string): YerlesimCevabi | undefined {
  const [tur, kimlikMetni] = anahtar.split(':');
  const kimlik = Number(kimlikMetni);
  return bolumler.find((y) => {
    if (tur === 'bolum' || tur === 'giris') return y.salon.id === kimlik;
    if (tur === 'istasyon') return y.istasyonYerleri.some((i) => i.istasyonId === kimlik);
    if (tur === 'makine') return y.makineYerleri.some((m) => m.makineId === kimlik);
    if (tur === 'raf') return y.raflar.some((r) => r.id === kimlik);
    if (tur === 'alan') return y.alanlar.some((a) => a.id === kimlik);
    return false;
  });
}
