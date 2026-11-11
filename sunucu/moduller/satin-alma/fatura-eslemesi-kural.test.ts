import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ILETILER, belgeGenelGiderOrani, eslemeListesiHatasi, eslemeSurumu } from './kurallar.ts';

describe('2642 b, 2646 a: fatura eşlemesinin oranı (saf kurallar)', () => {
  test('eşleme yoksa sipariş oranı; bayat eşleme sayılmaz (Veri 1)', () => {
    assert.deepEqual(belgeGenelGiderOrani({ belgeTutari: '180.00', kalanOrani: 0.444444, eslemeler: [] }), { oran: 0.444444, esleme: 'yok' });
    assert.deepEqual(belgeGenelGiderOrani({ belgeTutari: '180.00', kalanOrani: null, eslemeler: [{ tutar: '50.00', yol: null }] }), { oran: null, esleme: 'yok' });
  });

  test('kısmi eşleme: yalnız stok eşlenen ilk fatura kalanını sipariş oranıyla sayar (2646 a)', () => {
    // B 180, stok 100 eşlendi, kalan 80 x 0.5 = 40 -> 40 / 180.
    assert.deepEqual(belgeGenelGiderOrani({ belgeTutari: '180', kalanOrani: 0.5, eslemeler: [{ tutar: '100', yol: 'stok' }] }), { oran: 0.222222, esleme: 'kismi' });
    // Kalan varken sipariş oranı bilinmiyorsa null.
    assert.deepEqual(belgeGenelGiderOrani({ belgeTutari: '180', kalanOrani: null, eslemeler: [{ tutar: '100', yol: 'stok' }] }), { oran: null, esleme: 'kismi' });
  });

  test('tam eşleme: Maliyet örneği 80/180; E > B ve bilinmeyen yol null', () => {
    const tam = [{ tutar: '100', yol: 'stok' as const }, { tutar: '50', yol: 'genel_gider' as const }, { tutar: '30', yol: 'genel_gider' as const }];
    assert.deepEqual(belgeGenelGiderOrani({ belgeTutari: '180.00', kalanOrani: null, eslemeler: tam }), { oran: 0.444444, esleme: 'tam' });
    assert.deepEqual(belgeGenelGiderOrani({ belgeTutari: '170.00', kalanOrani: 0.5, eslemeler: tam }), { oran: null, esleme: 'tam' });
    assert.deepEqual(belgeGenelGiderOrani({ belgeTutari: '180.00', kalanOrani: 0.5, eslemeler: [{ tutar: '180', yol: 'bilinmiyor' }] }), { oran: null, esleme: 'tam' });
    // Kuruş toplamı: 0.1 + 0.2 tam 0.30 eder.
    assert.deepEqual(belgeGenelGiderOrani({ belgeTutari: '0.30', kalanOrani: 0, eslemeler: [{ tutar: '0.10', yol: 'genel_gider' }, { tutar: '0.20', yol: 'genel_gider' }] }), { oran: 1, esleme: 'tam' });
  });

  test('liste denetimi ve sürüm', () => {
    const satirlar = new Set([1, 2]);
    assert.equal(eslemeListesiHatasi([{ siparisSatiriId: 1, tutar: '10' }, { siparisSatiriId: 1, tutar: '5' }], satirlar, '100'), ILETILER.eslemeTekrar);
    assert.equal(eslemeListesiHatasi([{ siparisSatiriId: 3, tutar: '10' }], satirlar, '100'), ILETILER.eslemeBaskaSiparis);
    assert.equal(eslemeListesiHatasi([{ siparisSatiriId: 1, tutar: '0' }], satirlar, '100'), ILETILER.eslemeTutar);
    assert.equal(eslemeListesiHatasi([{ siparisSatiriId: 1, tutar: '1.234' }], satirlar, '100'), ILETILER.eslemeTutar);
    assert.equal(eslemeListesiHatasi([{ siparisSatiriId: 1, tutar: '60' }, { siparisSatiriId: 2, tutar: '40.01' }], satirlar, '100'), ILETILER.eslemeAsim);
    assert.equal(eslemeListesiHatasi([{ siparisSatiriId: 1, tutar: '60' }, { siparisSatiriId: 2, tutar: '40' }], satirlar, '100.00'), null);
    assert.equal(eslemeListesiHatasi([], satirlar, '100'), null);
    assert.equal(eslemeSurumu([]), 0);
    assert.equal(eslemeSurumu([{ kaldirilma: null }, { kaldirilma: '2026-11-09T20:00:00Z' }]), 3);
  });
});
