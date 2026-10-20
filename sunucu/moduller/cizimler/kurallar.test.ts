import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BELGE_TURLERI } from '#paylasilan/sozlesme/cizimler.ts';
import {
  ILETILER, IZINLI_DOSYA_TURLERI, merkezBagReddi, onizlemeBoyutReddi, onizlemeKareReddi, onizlemeRevizyonReddi, revizyonHarfi, silmeReddi, yayinReddi,
} from './kurallar.ts';

test('CZ-04 revizyon harfi sıradan türer: A..Z, sonra AA, AB; sıfır ve eksi reddedilir', () => {
  assert.deepEqual([1, 2, 26, 27, 28, 52, 53, 702, 703].map(revizyonHarfi), ['A', 'B', 'Z', 'AA', 'AB', 'AZ', 'BA', 'ZZ', 'AAA']);
  assert.throws(() => revizyonHarfi(0));
  assert.throws(() => revizyonHarfi(-1));
  assert.throws(() => revizyonHarfi(1.5));
});

test('CZ-05 yayındaki revizyon yeniden yayınlanmaz; taslak ve eski yayınlanır', () => {
  assert.equal(yayinReddi('yayinda'), 'zatenYayinda');
  assert.equal(yayinReddi('taslak'), null);
  assert.equal(yayinReddi('eski'), null);
});

test('CZ-07 yalnız taslak silinir ve son revizyon silinmez', () => {
  assert.equal(silmeReddi('taslak', 2), null);
  assert.equal(silmeReddi('taslak', 1), 'sonRevizyon');
  assert.equal(silmeReddi('yayinda', 3), 'taslakDegil');
  assert.equal(silmeReddi('eski', 3), 'taslakDegil');
});

test('CZ-03 her belge türünün izinli dosya türü vardır; 3B model yalnız CAD ve glTF alır, resim ve sertifika model almaz', () => {
  for (const t of BELGE_TURLERI) assert.ok(IZINLI_DOSYA_TURLERI[t].length > 0, t);
  assert.deepEqual([...IZINLI_DOSYA_TURLERI['3b-model']].sort(), ['glb', 'gltf', 'iges', 'step', 'stl']);
  for (const t of ['teknik-resim', 'sertifika', 'rapor', 'kroki'] as const) {
    assert.equal(IZINLI_DOSYA_TURLERI[t].some((d) => ['step', 'stl', 'iges', 'glb', 'gltf'].includes(d)), false, t);
  }
});

test('CZ-14 merkezden istasyona yalnız 3B model bağlanır; malzemeye her tür; öbür modüle hiçbiri', () => {
  assert.equal(merkezBagReddi('istasyonlar', '3b-model'), null);
  assert.equal(merkezBagReddi('istasyonlar', 'teknik-resim'), ILETILER.istasyonaModelDisi);
  for (const t of BELGE_TURLERI) assert.equal(merkezBagReddi('malzemeler', t), null, t);
  assert.equal(merkezBagReddi('atolye', '3b-model'), ILETILER.malzemeDisi);
});

test('CZ-15 önizleme yalnız yayındaki STEP ya da IGES revizyon için yazılır', () => {
  assert.equal(onizlemeRevizyonReddi({ durum: 'yayinda', dosyaTuru: 'step' }), null);
  assert.equal(onizlemeRevizyonReddi({ durum: 'yayinda', dosyaTuru: 'iges' }), null);
  assert.equal(onizlemeRevizyonReddi({ durum: 'taslak', dosyaTuru: 'step' }), 'onizlemeTaslak');
  assert.equal(onizlemeRevizyonReddi({ durum: 'eski', dosyaTuru: 'iges' }), 'onizlemeTaslak');
  for (const t of ['stl', 'glb', 'gltf', 'pdf', 'png'] as const) assert.equal(onizlemeRevizyonReddi({ durum: 'yayinda', dosyaTuru: t }), 'onizlemeTuru', t);
});

test('CZ-15 kare sayısı 1..16 ve sırayla 0..n-1', () => {
  const kareler = (n: number) => Array.from({ length: n }, (_, kare) => ({ kare }));
  assert.equal(onizlemeKareReddi(kareler(1)), null);
  assert.equal(onizlemeKareReddi(kareler(16)), null);
  assert.equal(onizlemeKareReddi(kareler(0)), 'onizlemeKareSayisi');
  assert.equal(onizlemeKareReddi(kareler(17)), 'onizlemeKareSayisi');
  assert.equal(onizlemeKareReddi([{ kare: 1 }, { kare: 2 }]), 'onizlemeKareSirasi');
  assert.equal(onizlemeKareReddi([{ kare: 0 }, { kare: 2 }]), 'onizlemeKareSirasi');
  assert.equal(onizlemeKareReddi([{ kare: 1 }, { kare: 0 }]), 'onizlemeKareSirasi');
  assert.equal(onizlemeKareReddi([{ kare: 0 }, { kare: 0 }]), 'onizlemeKareSirasi');
});

test('CZ-15 kare başına 64 KiB, toplam 512 KiB ve yalnız PNG', () => {
  const KIB = 1024;
  const png = (boyut: number) => ({ tur: 'png' as const, boyut });
  assert.equal(onizlemeBoyutReddi([png(64 * KIB)]), null);
  assert.equal(onizlemeBoyutReddi([png(64 * KIB + 1)]), 'onizlemeKareBuyuk');
  assert.equal(onizlemeBoyutReddi(Array.from({ length: 8 }, () => png(64 * KIB))), null);
  assert.equal(onizlemeBoyutReddi([...Array.from({ length: 8 }, () => png(64 * KIB)), png(1)]), 'onizlemeToplamBuyuk');
  assert.equal(onizlemeBoyutReddi([png(10), { tur: 'jpeg', boyut: 10 }]), 'onizlemeKareTuru');});
