import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { DOSYA_SINIRI, IKILI, bagReddi, ekMime, kotaHatasi, seritTuru, turBul } from './kurallar.ts';

const metin = (s: string, uzunluk = 120): Buffer => Buffer.concat([Buffer.from(s, 'latin1'), Buffer.alloc(Math.max(0, uzunluk - s.length), 0x20)]);
const ikiliStl = (ucgen: number): Buffer => {
  const b = Buffer.alloc(84 + 50 * ucgen, 0);
  b.write('solid ama ikili', 0, 'latin1');
  b.writeUInt32LE(ucgen, 80);
  return b;
};
const iges = (): Buffer => metin(`${'Deneme parçası'.padEnd(72, ' ')}S      1\n`);

test('DSK-05 tür ilk baytlardan bulunur: on tür tanınır', () => {
  const durumlar: [Buffer, number, string][] = [
    [metin('%PDF-1.7\n'), 120, 'pdf'],
    [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), 10, 'png'],
    [Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]), 6, 'jpeg'],
    [Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]), 16, 'webp'],
    [metin('ISO-10303-21;\nHEADER;'), 120, 'step'],
    [ikiliStl(2), 84 + 100, 'stl'],
    [iges(), 120, 'iges'],
    [metin('solid deneme\nfacet normal 0 0 1'), 120, 'stl'],
    [Buffer.concat([Buffer.from('glTF'), Buffer.from([2, 0, 0, 0, 20, 0, 0, 0]), Buffer.alloc(8)]), 20, 'glb'],
    [Buffer.from('\uFEFF\n  {"asset": {"version": "2.0"}, "scenes": []}', 'utf8'), 50, 'gltf'],
    [Buffer.from('{\n "scenes": [],\n "asset" : { "version": "2.0" }\n}', 'utf8'), 40, 'gltf'],
    [metin('  0\nSECTION\n  2\nHEADER\n'), 120, 'dxf'],
    [metin('999\r\nyorum\r\n  0\r\nSECTION\r\n'), 120, 'dxf'],
    [Buffer.concat([Buffer.from('AutoCAD Binary DXF\r\n\x1a\x00', 'latin1'), Buffer.alloc(8)]), 30, 'dxf'],
  ];
  for (const [ilk, boyut, tur] of durumlar) assert.equal(turBul(ilk, boyut), tur, tur);
});

test('DSK-05 tanınmayan içerik türsüzdür: HTML, betik, boyutu tutmayan ikili STL, boş dosya', () => {
  assert.equal(turBul(metin('<!doctype html><script>alert(1)</script>'), 120), null);
  assert.equal(turBul(metin('#!/bin/sh\nrm -rf /'), 120), null);
  assert.equal(turBul(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 4), null);
  assert.equal(turBul(Buffer.from(randomBytes(4096).map((b) => b | 0x80)), 4096), null);
  const stl = ikiliStl(2);
  stl.write('ikili', 0, 'latin1');
  assert.equal(turBul(stl, stl.length + 1), null);
  assert.equal(turBul(Buffer.alloc(0), 0), null);
});

// İmzası benzeyen düz metin o tür sayılmaz; ADR 0030, 9 ile düz metindir (bağlayan modül türü kabul etmezse reddeder).
test('DSK-05 imzaya benzeyen düz metin o türden sayılmaz, metindir', () => {
  for (const s of ['PDF degil %PDF-1.7', '{"ad": "asset degil", "surum": 2}', '[{"asset": {}}]', '  0\nSECTIONX\n', 'gltf kucuk harf']) {
    assert.equal(turBul(metin(s), 120), 'txt', s);
  }
});

// Sentetik zip: girdiler sırayla, sonda merkez dizini. `bayrak3`: LibreOffice gibi boyut yerel başlıkta yok.
const zip = (girdiler: readonly [string, string][], bayrak3 = false): Buffer => {
  const yereller: Buffer[] = [];
  const merkez: Buffer[] = [];
  let konum = 0;
  for (const [ad, icerik] of girdiler) {
    const veri = deflateRawSync(Buffer.from(icerik, 'utf8'));
    const adB = Buffer.from(ad, 'utf8');
    const y = Buffer.alloc(30);
    y.writeUInt32LE(0x04034b50, 0); y.writeUInt16LE(20, 4); y.writeUInt16LE(bayrak3 ? 0x08 : 0, 6); y.writeUInt16LE(8, 8);
    y.writeUInt32LE(bayrak3 ? 0 : veri.length, 18); y.writeUInt32LE(bayrak3 ? 0 : icerik.length, 22); y.writeUInt16LE(adB.length, 26);
    const tanim = bayrak3 ? Buffer.alloc(16) : Buffer.alloc(0);
    if (bayrak3) { tanim.writeUInt32LE(0x08074b50, 0); tanim.writeUInt32LE(veri.length, 8); tanim.writeUInt32LE(icerik.length, 12); }
    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(8, 10); m.writeUInt32LE(veri.length, 20); m.writeUInt32LE(icerik.length, 24);
    m.writeUInt16LE(adB.length, 28); m.writeUInt32LE(konum, 42);
    yereller.push(y, adB, veri, tanim);
    merkez.push(m, adB);
    konum += y.length + adB.length + veri.length + tanim.length;
  }
  const dizin = Buffer.concat(merkez);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(girdiler.length, 8); son.writeUInt16LE(girdiler.length, 10);
  son.writeUInt32LE(dizin.length, 12); son.writeUInt32LE(konum, 16);
  return Buffer.concat([...yereller, dizin, son]);
};
const turler = (ana: string, ek = ''): string =>
  `<?xml version="1.0"?><Types><Override PartName="/ana.xml" ContentType="application/vnd.${ana}.main+xml"/>${ek}</Types>`;
const WORD = 'openxmlformats-officedocument.wordprocessingml.document';
const EXCEL = 'openxmlformats-officedocument.spreadsheetml.sheet';
const SUNU = 'openxmlformats-officedocument.presentationml.presentation';
const turBak = (b: Buffer, parca = 512 * 1024): string | null =>
  turBul(b.subarray(0, parca), b.length, b.length > parca ? b.subarray(Math.max(parca, b.length - 2 * parca)) : undefined);

test('DSK-06 ofis belgesi zip içindeki içerik türlerinden bulunur; içerik türleri başta ya da sonda (bayrak 3) olabilir', () => {
  assert.equal(turBak(zip([['[Content_Types].xml', turler(WORD)], ['word/document.xml', '<w/>']])), 'docx');
  assert.equal(turBak(zip([['xl/workbook.xml', '<x/>'], ['[Content_Types].xml', turler(EXCEL)]], true)), 'xlsx');
  assert.equal(turBak(zip([['ppt/presentation.xml', '<p/>'], ['[Content_Types].xml', turler(SUNU)]], true)), 'pptx');
});

test('DSK-06 çok parçalı zip: merkez dizini ve içerik türleri kuyruktadır; tek parçalıda ilk ve kuyruk aynı baytlardır', () => {
  // Sıkışmayan dolgu: zip gerçekten birden çok parçaya yayılır.
  const dolgu = (n: number): string => randomBytes(n).toString('base64');
  const buyuk = zip([['xl/worksheets/sheet1.xml', dolgu(8000)], ['[Content_Types].xml', turler(EXCEL)]], true);
  assert.ok(buyuk.length > 4 * 1024);
  assert.equal(turBak(buyuk, 1024), 'xlsx');
  const kucuk = zip([['[Content_Types].xml', turler(WORD)]]);
  assert.equal(turBul(kucuk, kucuk.length, kucuk), 'docx');
  // İçerik türleri ne ilk parçada ne kuyrukta: tanınmaz (tahmin edilmez).
  const ortada = zip([['a.xml', dolgu(4000)], ['[Content_Types].xml', turler(WORD)], ['b.xml', dolgu(8000)]]);
  assert.equal(turBak(ortada, 1024), null);
});

test('DSK-06 makrolu ofis belgesi, ana parçası belirsiz zip ve sıradan zip tanınmaz', () => {
  assert.equal(turBak(zip([['[Content_Types].xml', turler(WORD)], ['word/vbaProject.bin', 'makro']])), null);
  assert.equal(turBak(zip([['[Content_Types].xml', turler('ms-word.document.macroEnabled')]])), null);
  assert.equal(turBak(zip([['[Content_Types].xml', turler(EXCEL, '<Default Extension="bin" ContentType="application/vnd.ms-office.vbaProject"/>')]])), null);
  assert.equal(turBak(zip([['[Content_Types].xml', turler(WORD) + turler(EXCEL)]])), null);
  assert.equal(turBak(zip([['program.exe', 'MZ']])), null);
  assert.equal(turBak(zip([['[Content_Types].xml', turler(WORD)]]).subarray(0, 60)), null);
});

test('DSK-07 düz metin ve csv: denetim karakteri yok; Türkçe kod sayfası kabul; csv aynı ayırıcı aynı sayıda', () => {
  assert.equal(turBul(Buffer.from('Vardiya notu\r\nikinci satır\n', 'utf8'), 30), 'txt');
  assert.equal(turBul(Buffer.from([0x49, 0xfe, 0x69, 0x6b, 0x0a]), 5), 'txt');
  assert.equal(turBul(Buffer.from('Çığ şöğüş', 'utf8'), 16), 'txt');
  assert.equal(turBul(Buffer.from('\uFEFFkod;ad;adet\r\nA1;Mil;4\r\nA2;Burç;6\r\n', 'utf8'), 40), 'csv');
  assert.equal(turBul(Buffer.from('a,b\n1,2\n3,4', 'utf8'), 11), 'csv');
  assert.equal(turBul(Buffer.from('a\tb\n1\t2\n', 'utf8'), 10), 'csv');
  assert.equal(turBul(Buffer.from('a;b\n1;2;3\n', 'utf8'), 11), 'txt');
  assert.equal(turBul(Buffer.from('tek;satir\n', 'utf8'), 10), 'txt');
  assert.equal(turBul(Buffer.from('metin\x00ikili', 'latin1'), 12), null);
  assert.equal(turBul(Buffer.from('  <?xml version="1.0"?><a/>'), 27), null);
});

test('DSK-08 modül şeridi (Arkon) ve ek uçları yeni türleri eskisi gibi ikili sayar', () => {
  assert.equal(seritTuru(Buffer.from('G0 X0 Y0\nG1 X10\n')), IKILI);
  assert.equal(seritTuru(zip([['[Content_Types].xml', turler(WORD)]])), IKILI);
  assert.equal(seritTuru(Buffer.from('%PDF-1.7\n')), 'pdf');
  assert.equal(ekMime(zip([['[Content_Types].xml', turler(EXCEL)]])), 'application/octet-stream');
});

test('kota: kişi açık yükleme sayısı, kişi baytı, kişinin bağsız dosyaları ve depo baytı sırayla; sınırın tam üstü geçer', () => {
  const sinir = { ...DOSYA_SINIRI, kisiAcikYukleme: 2, kisiAcikBayt: 100, kisiBagsizBayt: 300, depoBayt: 1000 };
  const bos = { kisiAdet: 0, kisiBayt: 0, kisiBagsizBayt: 0, depoBayt: 0 };
  assert.equal(kotaHatasi({ kisiAdet: 1, kisiBayt: 50, kisiBagsizBayt: 250, depoBayt: 900, yeniBayt: 50 }, sinir), null);
  assert.equal(kotaHatasi({ ...bos, kisiAdet: 2, yeniBayt: 1 }, sinir), 'kotaYukleme');
  assert.equal(kotaHatasi({ ...bos, kisiBayt: 50, yeniBayt: 51 }, sinir), 'kotaBayt');
  assert.equal(kotaHatasi({ ...bos, kisiBagsizBayt: 250, yeniBayt: 51 }, sinir), 'kotaBagsiz');
  assert.equal(kotaHatasi({ ...bos, depoBayt: 950, yeniBayt: 51 }, sinir), 'kotaDepo');
});

test('bağ sınırı: modülün izin vermediği tür ve boyut reddedilir, sınırda geçer', () => {
  const sinir = { turler: ['pdf', 'png'] as const, azamiBayt: 100 };
  assert.equal(bagReddi({ tur: 'pdf', boyut: 100 }, sinir), null);
  assert.equal(bagReddi({ tur: 'step', boyut: 10 }, sinir), 'turIzinsiz');
  assert.equal(bagReddi({ tur: 'png', boyut: 101 }, sinir), 'dosyaBuyuk');
});

test('ek türü içerikten bulunur; HTML, SVG ve tanınmayan içerik indirilecek türdür', () => {
  assert.equal(ekMime(Buffer.from('%PDF-1.7\n')), 'application/pdf');
  assert.equal(ekMime(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0])), 'image/png');
  assert.equal(ekMime(Buffer.from('<!doctype html><script>alert(1)</script>')), 'application/octet-stream');
  assert.equal(ekMime(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>')), 'application/octet-stream');
  assert.equal(ekMime(Buffer.from('düz metin')), 'application/octet-stream');
});
