import assert from 'node:assert/strict';
import { test } from 'node:test';
import { acikModulDosyalari, kapaliModulYoluMu, modulKapaliMi } from './kapali-moduller.ts';

test('kapalı modülün yolu kendi adıyla başlayan yoldur; ad öneki taşıyan başka yol kapalı sayılmaz', () => {
  assert.equal(modulKapaliMi('mesaj'), true);
  assert.equal(modulKapaliMi('stok'), false);
  assert.equal(kapaliModulYoluMu('/mesaj'), true);
  assert.equal(kapaliModulYoluMu('/portal/yeni'), true);
  assert.equal(kapaliModulYoluMu('/mesajlar'), false);
  assert.equal(kapaliModulYoluMu('/stok'), false);
});

test('toplayıcı listesinden yalnız kapalı modülün dosyası çıkar', () => {
  const dosyalar = { '../../moduller/stok/rotalar.tsx': 1, '../../moduller/mesaj/rotalar.tsx': 2, '../../moduller/portal/rehber.ts': 3, '../../moduller/mesaj-arsiv/rehber.ts': 4 };
  assert.deepEqual(Object.keys(acikModulDosyalari(dosyalar)), ['../../moduller/stok/rotalar.tsx', '../../moduller/mesaj-arsiv/rehber.ts']);
});
