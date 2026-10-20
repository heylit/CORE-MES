import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import { tarOku, type TarGirdisi } from './tar-oku.ts';
import { tarYaz } from './tar-yaz.ts';

test('yazılan arşiv okuyucudan aynı girdilerle döner; 100 baytı aşan ve Türkçe yol pax ile taşınır', () => {
  const uzun = `.npm-onbellek/_cacache/content-v2/sha512/ab/cd/${'e'.repeat(124)}`;
  const girdiler: TarGirdisi[] = [
    { yol: 'kurulum', tur: 'klasor', veri: Buffer.alloc(0) },
    { yol: 'kurulum/güncelleme.md', tur: 'dosya', veri: Buffer.from('şçğ') },
    { yol: uzun, tur: 'dosya', veri: Buffer.alloc(1300, 7) },
    { yol: 'bos.txt', tur: 'dosya', veri: Buffer.alloc(0) },
  ];
  const okunan = tarOku(gzipSync(tarYaz(girdiler, new Date('2026-10-16T00:00:00Z'))));
  assert.deepEqual(okunan, girdiler);
});

test('güvensiz yol yazılmaz', () => {
  assert.throws(() => tarYaz([{ yol: '../dis', tur: 'dosya', veri: Buffer.alloc(1) }], new Date()), /güvensiz yol/);
});
