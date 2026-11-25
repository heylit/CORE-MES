import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cikisKilidi, sevkKalanKontrolu, sevkOnKontrol, sevkZamaniGecerli } from './satis-irsaliye-kurallari.ts';
import type { SevkBelgesi, SevkSatiri } from './satis-irsaliye-kurallari.ts';

const satir = (ek: Partial<SevkSatiri> = {}): SevkSatiri => ({ sira: 1, stokKodu: 'ORN-MAM-1', miktar: '10', birim: 'ADET', ambarNo: 2, siparisSatiriLogoRef: 100, lotlu: false, stoktaki: '25', ...ek });
const belge = (ek: Partial<SevkBelgesi> = {}): SevkBelgesi => ({ no: 'SV-ORN-1', tarih: '2026-11-25', tur: 'toptan', cariKodu: 'ORN-CARI', satirlar: [satir()], ...ek });

describe('satış irsaliyesi ön kontrol', () => {
  test('tam belge gönderilebilir', () => {
    const k = sevkOnKontrol(belge());
    assert.equal(k.gonderilebilir, true);
    assert.equal(k.kismi, false);
  });
  test('toptan satışta siparişsiz satır gitmez, belge kısmi olur; konsinyede siparişsiz gider', () => {
    const b = belge({ satirlar: [satir(), satir({ sira: 2, siparisSatiriLogoRef: null })] });
    const k = sevkOnKontrol(b);
    assert.deepEqual(k.atlanan, [{ sira: 2, neden: 'siparis-bagi-yok' }]);
    assert.equal(k.kismi, true);
    assert.equal(sevkOnKontrol({ ...b, tur: 'konsinye' }).atlanan.length, 0);
  });
  test('stok yetersiz, okunamayan stok, lotlu ve sıfır miktar atlanır', () => {
    const k = sevkOnKontrol(belge({ satirlar: [satir({ miktar: '30' }), satir({ sira: 2, stoktaki: null }), satir({ sira: 3, lotlu: true }), satir({ sira: 4, miktar: '0' })] }));
    assert.deepEqual(k.atlanan.map((a) => a.neden), ['stok-yetersiz', 'stok-yetersiz', 'lotlu', 'miktar-gecersiz']);
    assert.deepEqual(k.engeller, ['gidecek-satir-yok']);
  });
  test('cari yok, uzun fiş no ve farklı ambar engeldir', () => {
    const k = sevkOnKontrol(belge({ cariKodu: ' ', no: 'X'.repeat(17), satirlar: [satir(), satir({ sira: 2, ambarNo: 3 })] }));
    assert.deepEqual(k.engeller, ['cari-kodu', 'fis-no', 'ambar-farkli']);
  });
  test('aynı stok kodu ve ambardaki satırlar toplamıyla stoğa karşılaştırılır (Risk S1)', () => {
    const k = sevkOnKontrol(belge({ satirlar: [satir({ miktar: '6', stoktaki: '10' }), satir({ sira: 2, miktar: '6', stoktaki: '10' }), satir({ sira: 3, miktar: '4', stoktaki: '10' })] }));
    assert.deepEqual(k.gidecek.map((s) => s.sira), [1, 3]);
    assert.deepEqual(k.atlanan, [{ sira: 2, neden: 'stok-yetersiz' }]);
    const baska = sevkOnKontrol(belge({ satirlar: [satir({ miktar: '6', stoktaki: '10' }), satir({ sira: 2, miktar: '6', stoktaki: '10', stokKodu: 'ORN-MAM-2' })] }));
    assert.equal(baska.atlanan.length, 0);
  });
  test('aynı Logo sipariş satırına bağlı satırlar toplamıyla kalana karşılaştırılır (Risk S1)', () => {
    const g = [satir({ miktar: '6' }), satir({ sira: 2, miktar: '6' }), satir({ sira: 3, miktar: '4' })];
    assert.deepEqual(sevkKalanKontrolu(g, new Map([[100, '10']])), [{ sira: 2, neden: 'kalan-yetersiz' }]);
  });
  test('kalan yeniden okunur: aşan ve okunamayan satır gitmez, siparişsiz satır etkilenmez', () => {
    const g = [satir({ miktar: '10' }), satir({ sira: 2, siparisSatiriLogoRef: 101 }), satir({ sira: 3, siparisSatiriLogoRef: 102 }), satir({ sira: 4, siparisSatiriLogoRef: null })];
    assert.deepEqual(sevkKalanKontrolu(g, new Map([[100, '10'], [101, '9.5']])), [{ sira: 2, neden: 'kalan-yetersiz' }, { sira: 3, neden: 'kalan-yetersiz' }]);
  });
});

describe('araç çıkış kilidi ve sevk zamanı', () => {
  test('durum yoksa kapalı; hata ve bekleyen ayrı; izinli kodda açık', () => {
    assert.deepEqual(cikisKilidi(null), { izin: false, neden: 'durum-yok' });
    assert.deepEqual(cikisKilidi(5), { izin: false, neden: 'hata' });
    assert.deepEqual(cikisKilidi(1), { izin: false, neden: 'bekliyor' });
    assert.deepEqual(cikisKilidi(10), { izin: true });
    assert.deepEqual(cikisKilidi(6), { izin: false, neden: 'bekliyor' }, 'varsayılan tutucu: GİB işlendi alıcı teyidi değil');
    assert.deepEqual(cikisKilidi(8), { izin: false, neden: 'bekliyor' });
    assert.deepEqual(cikisKilidi(4, new Set([4])), { izin: true });
  });
  test('geriye tarihli fiili sevk geçersizdir', () => {
    assert.equal(sevkZamaniGecerli(new Date('2026-11-25T10:00:00Z'), new Date('2026-11-25T09:59:00Z')), false);
    assert.equal(sevkZamaniGecerli(new Date('2026-11-25T10:00:00Z'), new Date('2026-11-25T10:00:00Z')), true);
  });
});
