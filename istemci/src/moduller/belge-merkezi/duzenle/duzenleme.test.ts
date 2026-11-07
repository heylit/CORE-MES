import { describe, expect, test } from 'vitest';
import type { Oge, SayfaKutusu } from './duzenleme.ts';
import {
  degistir, degisiklikVarMi, duzenlemeNotu, silinenOzeti, gecmisBaslat, geriAl, gorunumNoktasi, gorunumOlcusu, ileriAl, NOT_EN_UZUN, ogeReddi,
  pdfKutusu, pdfNoktasi, renkBilesenleri, resimYerlesimi, EN_AZ_YAKINLIK, EN_COK_YAKINLIK, sonrakiYakinlik, yakinlikSinirla,
} from './duzenleme.ts';
import { EN_COK_ALAN, EN_COK_KENAR, tuvalYogunlugu } from '../goruntu/tuval-siniri.ts';

const A4: SayfaKutusu = { kutu: [0, 0, 595, 842], donme: 0 };
const KAYIK: SayfaKutusu = { kutu: [10, 20, 605, 862], donme: 0 };

// pdf-lib drawImage dönmesi: dayanak (x, y) çevresinde saat yönünün tersine.
function resimKoseleri(y: ReturnType<typeof resimYerlesimi>): [number, number][] {
  const r = (y.donme * Math.PI) / 180, cs = Math.round(Math.cos(r)), sn = Math.round(Math.sin(r));
  return [[0, 0], [y.en, 0], [y.en, y.boy], [0, y.boy]].map(([u, v]) => [y.x + u! * cs - v! * sn, y.y + u! * sn + v! * cs]);
}
const sirala = (l: [number, number][]) => l.map(([a, b]) => `${a.toFixed(3)},${b.toFixed(3)}`).sort();

describe('PDF düzenleme koordinatları (2123)', () => {
  test('DZ-01: dönmesiz sayfada görünümün sol üstü PDF sol üstüdür, y aşağı iner', () => {
    expect(pdfNoktasi(A4, 0, 0)).toEqual([0, 842]);
    expect(pdfNoktasi(A4, 100, 42)).toEqual([100, 800]);
    expect(pdfNoktasi(KAYIK, 0, 0)).toEqual([10, 862]);
  });

  test.each([0, 90, 180, 270, -90, 450])('DZ-02: dönme %i için görünüm ve PDF noktası birbirinin tersidir', (donme) => {
    const s: SayfaKutusu = { kutu: [10, 20, 605, 862], donme };
    for (const [vx, vy] of [[0, 0], [33, 71], [400, 12]] as const) {
      const [px, py] = pdfNoktasi(s, vx, vy);
      const [gx, gy] = gorunumNoktasi(s, px, py);
      expect(gx).toBeCloseTo(vx);
      expect(gy).toBeCloseTo(vy);
    }
  });

  test('DZ-03: 90 dönmede görünüm eni sayfanın boyudur', () => {
    expect(gorunumOlcusu({ kutu: [0, 0, 595, 842], donme: 90 })).toEqual({ en: 842, boy: 595 });
    expect(gorunumOlcusu(A4)).toEqual({ en: 595, boy: 842 });
  });

  test.each([0, 90, 180, 270])('DZ-04: dönme %i için kutu ve resim görünümdeki alanı kaplar', (donme) => {
    const s: SayfaKutusu = { kutu: [10, 20, 605, 862], donme };
    const k = { x: 50, y: 60, g: 120, y2: 40 };
    const beklenen = [[k.x, k.y], [k.x + k.g, k.y], [k.x + k.g, k.y + k.y2], [k.x, k.y + k.y2]].map(([x, y]) => pdfNoktasi(s, x!, y!));
    const p = pdfKutusu(s, k);
    expect(sirala([[p.x, p.y], [p.x + p.en, p.y], [p.x + p.en, p.y + p.boy], [p.x, p.y + p.boy]])).toEqual(sirala(beklenen));
    expect(sirala(resimKoseleri(resimYerlesimi(s, k)))).toEqual(sirala(beklenen));
  });

  test('DZ-05: renk bileşenleri; bozuk renk reddedilir', () => {
    expect(renkBilesenleri('#ff8000')).toEqual([1, 128 / 255, 0]);
    expect(() => renkBilesenleri('red')).toThrow();
  });

  test('DZ-06: ölçüsüz alan, kısa çizgi, boş ya da uzun yazı ve bozuk renk reddedilir; geçerli öğe geçer', () => {
    const iyi: Oge[] = [
      { tur: 'dolgu', x: 0, y: 0, g: 10, y2: 10, renk: '#ffffff' },
      { tur: 'cizgi', x0: 0, y0: 0, x1: 10, y1: 0, renk: '#111111', kalin: 1 },
      { tur: 'logo', x: 0, y: 0, g: 40, y2: 20 },
      { tur: 'yazi', x: 0, y: 0, metin: 'Çğış', boy: 12, renk: '#000000' },
    ];
    for (const o of iyi) expect(ogeReddi(o)).toBeNull();
    expect(ogeReddi({ tur: 'dolgu', x: 0, y: 0, g: 2, y2: 10, renk: '#ffffff' })).not.toBeNull();
    expect(ogeReddi({ tur: 'cizgi', x0: 0, y0: 0, x1: 1, y1: 1, renk: '#111111', kalin: 1 })).not.toBeNull();
    expect(ogeReddi({ tur: 'yazi', x: 0, y: 0, metin: '  ', boy: 12, renk: '#000000' })).not.toBeNull();
    expect(ogeReddi({ tur: 'yazi', x: 0, y: 0, metin: 'a'.repeat(201), boy: 12, renk: '#000000' })).not.toBeNull();
    expect(ogeReddi({ tur: 'dolgu', x: 0, y: 0, g: 10, y2: 10, renk: 'beyaz' })).not.toBeNull();
  });

  test('DZ-07: geri al ve ileri al sayfa listelerini geri getirir; yeni değişiklik ileriyi siler', () => {
    const o: Oge = { tur: 'dolgu', x: 0, y: 0, g: 10, y2: 10, renk: '#ffffff' };
    let g = gecmisBaslat(2);
    expect(degisiklikVarMi(g)).toBe(false);
    g = degistir(g, 1, [o]);
    expect(degisiklikVarMi(g)).toBe(true);
    g = geriAl(g);
    expect(g.simdi).toEqual([[], []]);
    g = ileriAl(g);
    expect(g.simdi[1]).toEqual([o]);
    g = geriAl(g);
    g = degistir(g, 0, [o]);
    expect(g.ileri).toEqual([]);
    expect(ileriAl(g)).toBe(g);
  });

  test('DZ-08: düzenleme notu kaynağı ve gerekçeyi taşır, sınırı aşmaz', () => {
    expect(duzenlemeNotu('Parça çizimi', 'B', ' antet değişti ')).toBe('Düzenlendi: Parça çizimi Rev B. Gerekçe: antet değişti');
    expect(duzenlemeNotu('x', 'A', 'g'.repeat(400)).length).toBe(NOT_EN_UZUN);
  });

  test('DZ-09: silinen özeti sıfır olmayanları sayar, örtülen resmi ayrıca söyler; nota gerekçeden önce girer', () => {
    const sifir = { yazi: 0, resim: 0, cizim: 0, ortulenResim: 0, not: 0 };
    expect(silinenOzeti(sifir)).toBe("PDF'ten silinen nesne yok.");
    expect(silinenOzeti({ ...sifir, yazi: 2, resim: 1, ortulenResim: 1 }))
      .toBe("PDF'ten silinen: 2 yazı, 1 resim. Alanın dışına taşan 1 resim yalnız örtüldü.");
    expect(duzenlemeNotu('x', 'A', 'g', { ...sifir, cizim: 3 })).toBe("Düzenlendi: x Rev A. PDF'ten silinen: 3 çizim. Gerekçe: g");
  });
});

describe('PDF düzenleyici yakınlığı ve tuval sınırı (2221)', () => {
  test('YK-01: adımlar %25 ile %800 arasında ilerler; aradaki değerden en yakın adıma geçilir', () => {
    expect(sonrakiYakinlik(1, 1)).toBe(1.5);
    expect(sonrakiYakinlik(1, -1)).toBe(0.75);
    expect(sonrakiYakinlik(1.2, 1)).toBe(1.5);
    expect(sonrakiYakinlik(1.2, -1)).toBe(1);
    expect(sonrakiYakinlik(EN_COK_YAKINLIK, 1)).toBe(EN_COK_YAKINLIK);
    expect(sonrakiYakinlik(EN_AZ_YAKINLIK, -1)).toBe(EN_AZ_YAKINLIK);
    expect(yakinlikSinirla(20)).toBe(EN_COK_YAKINLIK);
    expect(yakinlikSinirla(0.01)).toBe(EN_AZ_YAKINLIK);
  });

  test('YK-02: A1 paftada 7 nokta yazı en büyük yakınlıkta okunur boya (en az 12 piksel) çıkar', () => {
    const sutun = 700, a1En = 2384;
    expect(7 * (sutun / a1En) * EN_COK_YAKINLIK).toBeGreaterThanOrEqual(12);
  });

  test('YK-03: tuval yoğunluğu alan ve kenar sınırını aşmaz; küçük sayfada istenen yoğunluk korunur', () => {
    expect(tuvalYogunlugu(595, 842, 2)).toBe(2);
    const a1 = tuvalYogunlugu(2384, 1684, 9.4);
    expect(2384 * a1 * 1684 * a1).toBeLessThanOrEqual(EN_COK_ALAN + 1);
    const serit = tuvalYogunlugu(20000, 100, 2);
    expect(20000 * serit).toBeLessThanOrEqual(EN_COK_KENAR + 1e-6);
  });
});
