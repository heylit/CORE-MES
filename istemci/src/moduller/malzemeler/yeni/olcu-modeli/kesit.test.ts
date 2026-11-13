import { describe, expect, it } from 'vitest';
import { kesitBoyu, kesitCizimi } from './kesit.ts';

// 3215 c: ölçülü kesit verisi. Ölçüler uydurmadır.
const metinler = (c: ReturnType<typeof kesitCizimi>) => c?.yazilar.map((y) => y.metin) ?? [];

describe('3215 ölçülü kesit', () => {
  it('yuvarlak çubuk: çap ve boy ölçüsü, kırık boy görünüşü', () => {
    const c = kesitCizimi('cubuk', { d: 50, l: 1000 });
    expect(metinler(c)).toEqual(expect.arrayContaining(['Ø50', 'L 1000', 'Kesit A-A', 'Boy görünüşü (kırık)']));
    expect(c?.ozet).toBe('Ø50 × 1000');
    expect(c?.yollar.filter((y) => y.tur === 'kirik')).toHaveLength(2);
  });

  it('boru delikli çizilir; ondalık ölçü virgülle yazılır', () => {
    const c = kesitCizimi('boru', { D: 48.3, t: 3.2, l: 6000 });
    expect(c?.yollar[0]).toMatchObject({ tur: 'govde', delikli: true });
    expect(metinler(c)).toEqual(expect.arrayContaining(['Ø48,3', 't3,2', 'L 6000']));
  });

  it('kutu profil ve köşebent et kalınlığını yazar', () => {
    expect(metinler(kesitCizimi('kutu', { a: 60, b: 40, t: 3, l: 6000 }))).toEqual(expect.arrayContaining(['60', '40', 't3']));
    expect(metinler(kesitCizimi('kosebent', { a: 50, b: 40, t: 5, l: 6000 }))).toEqual(expect.arrayContaining(['50', '40', 't5']));
  });

  it('ince sac çizgi kalınlığında kalmaz; yazı gerçek kalınlığı taşır', () => {
    const c = kesitCizimi('levha', { t: 1, w: 1250, l: 2500 });
    expect(c?.yollar[0]?.d).toContain('v3');
    expect(metinler(c)).toEqual(expect.arrayContaining(['1250', '1', 'L 2500']));
  });

  it('disk yan görünüşte kalınlığı, tel uzunluğu metre olarak yazar', () => {
    expect(metinler(kesitCizimi('disk', { d: 160, t: 25 }))).toEqual(expect.arrayContaining(['Ø160', 't 25', 'Yan görünüş']));
    expect(metinler(kesitCizimi('tel', { d: 2, L: 500 }))).toEqual(expect.arrayContaining(['Ø2', '500 m']));
  });

  it('ölçüyle kesiti olmayan biçim ve eksik ölçüde çizim yok (sıfır uydurulmaz)', () => {
    expect(kesitCizimi('granul', { kg: 25 })).toBeNull();
    expect(kesitCizimi('cubuk', {})).toBeNull();
    expect(kesitBoyu('altigen', { s: 19 })).toBeCloseTo(21.94, 2);
  });
});
