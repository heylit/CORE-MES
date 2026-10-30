import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DOSYA_SINIRI, bagReddi, ekMime, kotaHatasi, turBul } from './kurallar.ts';

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

test('DSK-05 tanınmayan içerik türsüzdür: HTML, betik, adı PDF olan düz metin, boyutu tutmayan ikili STL', () => {
  assert.equal(turBul(metin('<!doctype html><script>alert(1)</script>'), 120), null);
  assert.equal(turBul(metin('#!/bin/sh\nrm -rf /'), 120), null);
  assert.equal(turBul(metin('PDF degil %PDF-1.7'), 120), null);
  assert.equal(turBul(Buffer.from([0x89, 0x50, 0x4e, 0x47]), 4), null);
  const stl = ikiliStl(2);
  stl.write('ikili', 0, 'latin1');
  assert.equal(turBul(stl, stl.length + 1), null);
  assert.equal(turBul(Buffer.alloc(0), 0), null);
  assert.equal(turBul(metin('{"ad": "asset degil", "surum": 2}'), 120), null);
  assert.equal(turBul(metin('[{"asset": {}}]'), 120), null);
  assert.equal(turBul(metin('  0\nSECTIONX\n'), 120), null);
  assert.equal(turBul(metin('gltf kucuk harf'), 120), null);
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
