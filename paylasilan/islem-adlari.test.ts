import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ISLEMLER } from './islemler.ts';
import { grupAdi, islemAdi, islemGrubu } from './islem-adlari.ts';

test('her kayitli islemin okunur adi ve adli bir grubu var', () => {
  for (const islem of ISLEMLER) {
    assert.notEqual(islemAdi(islem), islem, islem);
    assert.notEqual(grupAdi(islemGrubu(islem)), islemGrubu(islem), islem);
  }
});

test('sayfayi gorme islemi modulunun grubunda durur; kayitsiz islem kodunu gosterir', () => {
  assert.equal(islemGrubu('sayfa.stok'), 'stok');
  assert.equal(islemGrubu('sayfa.personel'), 'kisiler');
  assert.equal(islemAdi('sayfa.stok'), 'Stok Merkezi sayfasını görme');
  assert.equal(islemAdi('yok.boyle'), 'yok.boyle');
});
