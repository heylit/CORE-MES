import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, StandardFonts, decodePDFRawStream, degrees } from 'pdf-lib';
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
    const { veri: cikti, silinen } = await duzenlenmisPdf(kaynak, [
      [{ oge: { tur: 'dolgu', x: 10, y: 10, g: 100, y2: 40, renk: '#ffffff' } }, { oge: { tur: 'cizgi', x0: 0, y0: 0, x1: 50, y1: 50, renk: '#111111', kalin: 1 } }],
      [{ oge: { tur: 'logo', x: 10, y: 10, g: 60, y2: 20 }, png: PNG }, { oge: { tur: 'yazi', x: 5, y: 5, metin: 'Şğı', boy: 12, renk: '#000000' }, png: PNG, olcu: { g: 30, y2: 12 } }],
    ], kutular(2));
    expect(kaynak).toEqual(kopya);
    expect(silinen).toBeNull();
    const okunan = await PDFDocument.load(cikti);
    expect(okunan.getPageCount()).toBe(2);
    expect(okunan.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
    expect(cikti.length).toBeGreaterThan(kaynak.length);
  });

  test('PY-02: dönmüş sayfa da yazılır ve dönmesi korunur', async () => {
    const { veri: cikti } = await duzenlenmisPdf(await ornekPdf(1, 90), [[{ oge: { tur: 'logo', x: 10, y: 10, g: 60, y2: 20 }, png: PNG }]], kutular(1, 90));
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

describe('Alttaki içeriğin PDF içinden silinmesi (2123b, karar 2123-5 c)', () => {
  const latin1 = (v: Uint8Array) => new TextDecoder('latin1').decode(v);
  const onalti = (s: string) => [...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();
  async function ornek(): Promise<Uint8Array> {
    const b = await PDFDocument.create();
    const f = await b.embedFont(StandardFonts.Helvetica);
    const logo = await b.embedPng(PNG);
    const s1 = b.addPage([595, 842]);
    s1.drawText('GIZLI FIRMA', { x: 50, y: 800, size: 14, font: f });
    s1.drawText('KALAN YAZI', { x: 50, y: 700, size: 14, font: f });
    s1.drawImage(logo, { x: 400, y: 790, width: 60, height: 30 });
    s1.drawLine({ start: { x: 40, y: 780 }, end: { x: 555, y: 780 }, thickness: 1 });
    b.addPage([595, 842]).drawText('GIZLI FIRMA', { x: 50, y: 800, size: 14, font: f });
    b.setTitle('Sentetik baslik');
    return b.save({ useObjectStreams: false });
  }
  const icerik = (b: PDFDocument, i: number): string => {
    const c = b.getPage(i).node.Contents();
    const akislar = c instanceof PDFArray ? Array.from({ length: c.size() }, (_, k) => c.lookup(k)) : [c];
    return akislar.map((a) => (a instanceof PDFRawStream ? latin1(decodePDFRawStream(a).decode()) : '')).join('\n');
  };
  const resimSayisi = (b: PDFDocument) => b.context.enumerateIndirectObjects()
    .filter(([, o]) => o instanceof PDFRawStream && o.dict.lookup(PDFName.of('Subtype')) === PDFName.of('Image')).length;
  // Görünüm noktası = PDF noktası (dönmesiz A4, y aşağı): yazı ve logo satırını kaplar, çizgiyi ve alttaki yazıyı kaplamaz.
  const ust = { tur: 'dolgu' as const, x: 30, y: 20, g: 470, y2: 40, renk: '#ffffff' };

  test('GS-01: alandaki yazı ve resim sayfa içeriğinden ve dosyadan çıkar; dışarıdaki yazı, çizgi ve öbür sayfa kalır', async () => {
    const kaynak = await ornek();
    const { veri, silinen } = await duzenlenmisPdf(kaynak, [[{ oge: ust }], []], kutular(2), { ayikla: true });
    expect(silinen).toEqual({ yazi: 1, resim: 1, cizim: 0, ortulenResim: 0, not: 0 });
    const b = await PDFDocument.load(veri);
    expect(icerik(b, 0)).not.toContain(onalti('GIZLI'));
    expect(icerik(b, 0)).toContain(onalti('KALAN YAZI'));
    expect(icerik(b, 0)).toMatch(/555 780 l/);
    expect(icerik(b, 1)).toContain(onalti('GIZLI FIRMA'));
    expect(resimSayisi(await PDFDocument.load(kaynak))).toBeGreaterThan(0);
    expect(resimSayisi(b)).toBe(0);
    expect(b.getTitle()).toBeUndefined();
    expect(latin1(veri)).not.toContain('Sentetik');
  });

  test('GS-02: seçim kapalıysa içerik yalnız örtülür; dolgu yoksa ayıklama yapılmaz', async () => {
    const kapali = await duzenlenmisPdf(await ornek(), [[{ oge: ust }], []], kutular(2));
    expect(kapali.silinen).toBeNull();
    expect(icerik(await PDFDocument.load(kapali.veri), 0)).toContain(onalti('GIZLI FIRMA'));
    const dolgusuz = await duzenlenmisPdf(await ornek(), [[], []], kutular(2), { ayikla: true });
    expect(dolgusuz.silinen).toBeNull();
  });

  test('GS-03: alana değen not silinir; paylaşılan kaynak sözlüğü öbür sayfada bozulmaz', async () => {
    const b = await PDFDocument.create();
    const f = await b.embedFont(StandardFonts.Helvetica);
    const s1 = b.addPage([595, 842]);
    const s2 = b.addPage([595, 842]);
    s1.drawText('GIZLI', { x: 50, y: 800, size: 14, font: f });
    s2.drawText('GIZLI', { x: 50, y: 800, size: 14, font: f });
    const ortak = b.context.register(s1.node.Resources()!);
    s1.node.set(PDFName.of('Resources'), ortak);
    s2.node.set(PDFName.of('Resources'), ortak);
    const not = b.context.obj({ Type: 'Annot', Subtype: 'Text', Rect: [50, 795, 70, 815], Contents: 'sentetik not' });
    s1.node.set(PDFName.of('Annots'), b.context.obj([b.context.register(not)]));
    const { veri, silinen } = await duzenlenmisPdf(await b.save(), [[{ oge: ust }], []], kutular(2), { ayikla: true });
    expect(silinen?.not).toBe(1);
    const o = await PDFDocument.load(veri);
    expect(o.getPage(0).node.Annots()?.size() ?? 0).toBe(0);
    expect(o.getPage(1).node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict)?.keys().length).toBe(1);
    expect(icerik(o, 1)).toContain(onalti('GIZLI'));
  });

  test('GS-04: dönmüş sayfa ayıklanınca dönmesi ve ölçüsü korunur', async () => {
    const { veri } = await duzenlenmisPdf(await ornekPdf(1, 90), [[{ oge: ust }]], kutular(1, 90), { ayikla: true });
    const s = (await PDFDocument.load(veri)).getPage(0);
    expect(s.getRotation().angle).toBe(90);
    expect(s.getSize()).toEqual({ width: 595, height: 842 });
  });

  test('GS-05: belge künyesi, XMP, yer imi ve sayfa izleri taşınmaz; katman ayarı taşınır ve sayfadaki başvuruyla aynı nesnedir', async () => {
    const b = await PDFDocument.load(await ornek());
    b.setAuthor('Sentetik yazar');
    b.setKeywords(['sentetikanahtar']);
    const xmp = b.context.flateStream('<x:xmpmeta>sentetikxmp</x:xmpmeta>', { Type: 'Metadata', Subtype: 'XML' });
    b.catalog.set(PDFName.of('Metadata'), b.context.register(xmp));
    b.catalog.set(PDFName.of('Outlines'), b.context.register(b.context.obj({ Type: 'Outlines', Title: 'sentetikyerimi' })));
    const katman = b.context.register(b.context.obj({ Type: 'OCG', Name: 'Katman1' }));
    b.catalog.set(PDFName.of('OCProperties'), b.context.obj({ OCGs: [katman], D: { OFF: [katman] } }));
    for (const s of b.getPages()) {
      s.node.set(PDFName.of('Thumb'), b.context.register(b.context.flateStream('sentetikkucukresim')));
      s.node.Resources()!.set(PDFName.of('Properties'), b.context.obj({ K1: katman }));
    }
    const { veri } = await duzenlenmisPdf(await b.save(), [[{ oge: ust }], []], kutular(2), { ayikla: true });
    const metin = latin1(veri);
    for (const iz of ['Sentetik yazar', 'sentetikanahtar', 'sentetikyerimi', 'Thumb', 'Outlines']) expect(metin).not.toContain(iz);
    const o = await PDFDocument.load(veri);
    expect(o.getAuthor()).toBeUndefined();
    expect(o.catalog.get(PDFName.of('Metadata'))).toBeUndefined();
    const ocgler = o.catalog.lookupMaybe(PDFName.of('OCProperties'), PDFDict)?.lookupMaybe(PDFName.of('OCGs'), PDFArray);
    expect(ocgler?.get(0)).toBe(o.getPage(1).node.Resources()?.lookupMaybe(PDFName.of('Properties'), PDFDict)?.get(PDFName.of('K1')));
  });
});
