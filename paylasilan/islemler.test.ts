import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ISLEMLER, VERI_ISLEMLERI, islemMi, veriIslemiMi } from './islemler.ts';
import { SAYFALAR } from './sayfalar.ts';

const KLASOR = fileURLToPath(new URL('./islemler/', import.meta.url));

test('her işlem <modül>.<eylem> biçimindedir ve bir kez kayıtlıdır', () => {
  for (const islem of ISLEMLER) assert.match(islem, /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/);
  assert.equal(new Set(ISLEMLER).size, ISLEMLER.length);
});

test('modül dosyasındaki her işlem kayıtlıdır ve kendi modülünün adını taşır', async () => {
  const dosyalar = (await readdir(KLASOR)).filter((ad) => ad.endsWith('.ts')).sort();
  assert.equal(dosyalar.length > 0, true);
  const bulunan: string[] = [];
  for (const dosya of dosyalar) {
    const modul = dosya.replace(/\.ts$/, '');
    assert.notEqual(modul, 'sayfa', 'sayfa işlemleri sayfa listesinden gelir');
    const disari = (await import(pathToFileURL(`${KLASOR}${dosya}`).href)) as Record<string, readonly string[]>;
    const islemler = Object.values(disari).flat();
    assert.equal(islemler.length > 0, true, dosya);
    for (const islem of islemler) assert.equal(islem.startsWith(`${modul}.`), true, `${dosya}: ${islem}`);
    bulunan.push(...islemler);
  }
  assert.deepEqual(bulunan.sort(), [...VERI_ISLEMLERI].sort());
});

test('her sayfa kendi sayfa.<ad> işlemini bildirir; sayfa işlemi veri işlemi değildir', () => {
  for (const s of SAYFALAR) {
    assert.equal(s.islem, `sayfa.${s.yol.slice(1)}`);
    assert.equal(islemMi(s.islem), true);
    assert.equal(veriIslemiMi(s.islem), false);
  }
  assert.equal(veriIslemiMi('kisiler.oku'), true);
  assert.equal(islemMi('kisiler.oku'), true);
  assert.equal(islemMi('kisiler.yok'), false);
  assert.equal(islemMi('sayfa.yok'), false);
});
