import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { fasonBeklemesi } from './kurallar.ts';

// 3257 a: fason siparişinde teslim tarihi varsa plan o tarihi kullanır; yoksa termin günü, geçmiş tahmini, en son 7 gün.
describe('uretim-emirleri fason siparişi teslim tarihi (3257 a)', () => {
  const GUN = 86_400_000;
  const simdi = Date.UTC(2099, 0, 10, 6);
  const adimlar = [
    { id: 11, sira: 1, fasonFirmaId: 5, terminGun: 3, durum: 'bekliyor' },
    { id: 12, sira: 2, fasonFirmaId: null, terminGun: null, durum: 'bekliyor' },
  ];
  const tahmin = () => 4;

  test('sipariş tarihi termin gününün ve tahminin önüne geçer', () => {
    assert.equal(fasonBeklemesi(adimlar, 2, tahmin, simdi, (x) => (x.id === 11 ? simdi + 10 * GUN : null)), 10);
  });
  test('tarih yoksa sıra sürer: termin günü, tahmin, 7 gün', () => {
    assert.equal(fasonBeklemesi(adimlar, 2, tahmin, simdi, () => null), 3);
    assert.equal(fasonBeklemesi([{ ...adimlar[0]!, terminGun: null }, adimlar[1]!], 2, tahmin, simdi, () => null), 4);
    assert.equal(fasonBeklemesi([{ ...adimlar[0]!, terminGun: null }, adimlar[1]!], 2, () => null, simdi, () => null), 7);
  });
  test('gönderilmiş adımda tarih mutlaktır: geçen gün ayrıca düşülmez; geçmiş tarih beklemez', () => {
    const giden = [{ ...adimlar[0]!, durum: 'calisiyor', baslama: new Date(simdi - 5 * GUN).toISOString() }, adimlar[1]!];
    assert.equal(fasonBeklemesi(giden, 2, tahmin, simdi, () => simdi + 2 * GUN), 2);
    assert.equal(fasonBeklemesi(giden, 2, tahmin, simdi, () => simdi - GUN), 0);
  });
  test('bitmiş adımın siparişi beklenmez; simdi verilmezse tarih kullanılmaz', () => {
    assert.equal(fasonBeklemesi([{ ...adimlar[0]!, durum: 'tamam' }, adimlar[1]!], 2, tahmin, simdi, () => simdi + 10 * GUN), 0);
    assert.equal(fasonBeklemesi(adimlar, 2, tahmin, undefined, () => simdi + 10 * GUN), 3);
  });
});
