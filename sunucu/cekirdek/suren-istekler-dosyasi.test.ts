import assert from 'node:assert/strict';
import path from 'node:path';
import { afterEach, describe, test } from 'node:test';
import { istekBasladi, izlemeyiSifirla } from './istek-izleme.ts';
import { SUREN_ISTEKLER_DOSYASI, surenIstekDosyaIcerigi, surenIstekYaziciKur } from './suren-istekler-dosyasi.ts';

afterEach(() => { izlemeyiSifirla(); });

describe('süren istekler dosyası', () => {
  test('içerik başlangıç anı taşır, süre değil', () => {
    const d = surenIstekDosyaIcerigi([{ yontem: 'GET', adres: '/a', kisiId: 2, sureMs: 1000 }], Date.parse('2026-11-24T12:00:10Z'));
    assert.deepEqual(d.istekler, [{ yontem: 'GET', adres: '/a', kisiId: 2, baslangic: '2026-11-24T12:00:09.000Z' }]);
  });

  test('yalnız liste değişince yazılır; yazma hatası sunucuyu düşürmez', async () => {
    const yazilan: { yol: string; icerik: string }[] = [];
    let an = 1_000_000;
    const y = surenIstekYaziciKur('d', { simdi: () => an, yaz: (yol, icerik) => { yazilan.push({ yol, icerik }); return Promise.resolve(); } });
    assert.equal(await y.tur(), true);
    assert.equal(yazilan[0]?.yol, path.join('d', SUREN_ISTEKLER_DOSYASI));
    an += 5000;
    assert.equal(await y.tur(), false);
    istekBasladi('POST', '/b', () => 4, an);
    an += 5000;
    assert.equal(await y.tur(), true);
    an += 5000;
    assert.equal(await y.tur(), false);
    assert.equal(yazilan.length, 2);

    const hatalar: unknown[] = [];
    const k = surenIstekYaziciKur('d', { simdi: () => an, yaz: () => Promise.reject(new Error('disk dolu')), hataBildir: (h) => { hatalar.push(h); } });
    assert.equal(await k.tur(), false);
    assert.equal(hatalar.length, 1);
  });
});
