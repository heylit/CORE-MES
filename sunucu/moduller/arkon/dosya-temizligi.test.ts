import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DOSYA_DEPO_SINIRI, anilanOzetler, silinecekDosyalar } from '../../../arkon/web/src/data/dosya-temizligi.ts';

// Kart #731: tabletteki dosya deposu temizliği. Özetler uydurmadır.
describe('tablet dosya deposu temizliği', () => {
  it('sınır 2 GB', () => { assert.equal(DOSYA_DEPO_SINIRI, 2 * 1024 ** 3); });

  it('belgedeki dosya işaretlerini (kablo biçimi ya da tembel işaret) toplar; tipli diziye girmez', () => {
    const belge = { files: [{ bytes: { $blob: 'a', t: 'u8', n: 3 } }], derived: { k: { V: { p: { $blob: 'b' } }, ham: new Uint8Array(4) } }, not: null };
    assert.deepEqual([...anilanOzetler(belge)].sort(), ['a', 'b']);
    assert.equal(anilanOzetler(null).size, 0);
  });

  it('anılmayan dosya silinir; korunan anılmasa da kalır', () => {
    const d = [{ h: 'a', at: 1, n: 10 }, { h: 'b', at: 2, n: 10 }, { h: 'c', at: 3, n: 10 }];
    assert.deepEqual(silinecekDosyalar(d, new Set(['a']), new Set(['c'])), ['b']);
  });

  it('sınır aşılınca en uzun süredir açılmayan anılan dosya silinir; korunan hiç silinmez', () => {
    const d = [{ h: 'eski', at: 1, n: 50 }, { h: 'acik', at: 0, n: 50 }, { h: 'yeni', at: 9, n: 50 }];
    const anilan = new Set(['eski', 'acik', 'yeni']);
    assert.deepEqual(silinecekDosyalar(d, anilan, new Set(['acik']), 100), ['eski']);
    assert.deepEqual(silinecekDosyalar(d, anilan, new Set(['acik', 'eski', 'yeni']), 100), []);
    assert.deepEqual(silinecekDosyalar(d, anilan, new Set(), 150), []);
  });

  it('anılmayanlar silindikten sonra sınırın altındaysa anılan dosyaya dokunulmaz', () => {
    const d = [{ h: 'cop', at: 5, n: 100 }, { h: 'is', at: 1, n: 50 }];
    assert.deepEqual(silinecekDosyalar(d, new Set(['is']), new Set(), 100), ['cop']);
  });
});
