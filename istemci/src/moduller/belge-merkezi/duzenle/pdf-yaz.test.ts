import { PDFDocument, degrees } from 'pdf-lib';
import { describe, expect, test } from 'vitest';
import { PdfDuzenlemeHatasi, duzenlenmisPdf } from './pdf-yaz.ts';

// 1x1 saydam olmayan beyaz PNG (sentetik).
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

async function ornekPdf(sayfa = 2, donme = 0): Promise<Uint8Array> {
  const b = await PDFDocument.create();
  for (let i = 0; i < sayfa; i++) b.addPage([595, 842]).setRotation(degrees(donme));
  return b.save();
}
const kutular = (n: number, donme = 0) => Array.from({ length: n }, () => ({ kutu: [0, 0, 595, 842] as const, donme }));

describe('Düzenlenmiş PDF yazımı (2123)', () => {
  test('PY-01: dolgu, çizgi, logo ve yazı eklenir; sayfa sayısı ve ölçüsü korunur; kaynak dizi değişmez', async () => {
    const kaynak = await ornekPdf();
    const kopya = kaynak.slice();
    const cikti = await duzenlenmisPdf(kaynak, [
      [{ oge: { tur: 'dolgu', x: 10, y: 10, g: 100, y2: 40, renk: '#ffffff' } }, { oge: { tur: 'cizgi', x0: 0, y0: 0, x1: 50, y1: 50, renk: '#111111', kalin: 1 } }],
      [{ oge: { tur: 'logo', x: 10, y: 10, g: 60, y2: 20 }, png: PNG }, { oge: { tur: 'yazi', x: 5, y: 5, metin: 'Şğı', boy: 12, renk: '#000000' }, png: PNG, olcu: { g: 30, y2: 12 } }],
    ], kutular(2));
    expect(kaynak).toEqual(kopya);
    const okunan = await PDFDocument.load(cikti);
    expect(okunan.getPageCount()).toBe(2);
    expect(okunan.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(cikti.length).toBeGreaterThan(kaynak.length);
  });

  test('PY-02: dönmüş sayfa da yazılır ve dönmesi korunur', async () => {
    const cikti = await duzenlenmisPdf(await ornekPdf(1, 90), [[{ oge: { tur: 'logo', x: 10, y: 10, g: 60, y2: 20 }, png: PNG }]], kutular(1, 90));
    expect((await PDFDocument.load(cikti)).getPage(0).getRotation().angle).toBe(90);
  });

  test('PY-03: sayfa sayısı tutmazsa, öğe geçersizse ya da resim yoksa reddedilir', async () => {
    const kaynak = await ornekPdf();
    await expect(duzenlenmisPdf(kaynak, [[]], kutular(1))).rejects.toThrow(PdfDuzenlemeHatasi);
    await expect(duzenlenmisPdf(kaynak, [[{ oge: { tur: 'dolgu', x: 0, y: 0, g: 1, y2: 1, renk: '#ffffff' } }], []], kutular(2))).rejects.toThrow('Alan çok küçük');
    await expect(duzenlenmisPdf(kaynak, [[{ oge: { tur: 'logo', x: 0, y: 0, g: 40, y2: 20 } }], []], kutular(2))).rejects.toThrow('resim verisi yok');
  });

  test('PY-04: PDF olmayan veri reddedilir', async () => {
    await expect(duzenlenmisPdf(new TextEncoder().encode('pdf degil'), [], [])).rejects.toThrow('PDF okunamadı');
  });
});
