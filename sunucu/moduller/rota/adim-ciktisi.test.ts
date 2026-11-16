import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { akisiCikar, ciktiDenetle, type CiktiKarti } from './kurallar.ts';

// 3320 a: ara adımın çıktı kartı (Test ön bakışı T1, T2).
describe('rota: ara adımın çıktı kartı (3320 a)', () => {
  const URUN = 1;
  const YM = 2;
  const kartlar = (ek: Record<number, Partial<CiktiKarti>> = {}) => new Map<number, CiktiKarti>([
    [YM, { tur: 'yarimamul', aktif: true, ad: 'ORN-YM-0101', rotali: false, ...ek[YM] }],
    [3, { tur: 'mamul', aktif: true, ad: 'ORN-MM-0031', rotali: false, ...ek[3] }],
    [4, { tur: 'hammadde', aktif: true, ad: 'ORN-HM-0001', rotali: false, ...ek[4] }],
  ]);
  const adim = (ciktiMalzemeId: number | null, bilesenler: number[] = []) => ({ ciktiMalzemeId, bilesenler: bilesenler.map((malzemeId) => ({ malzemeId })) });
  const denetle = (adimlar: ReturnType<typeof adim>[], k = kartlar(), yeni = true) => ciktiDenetle(adimlar, { urunId: URUN, kartlar: k, yeniSecim: () => yeni });

  test('T1 kabul: ara adımda aktif YM ya da MM kartı; statülü (null) adım denetlenmez', () => {
    assert.equal(denetle([adim(YM, [4]), adim(null), adim(null)]), null);
    assert.equal(denetle([adim(3), adim(null)]), null);
    assert.equal(denetle([adim(null), adim(null)]), null);
  });

  test('T1 ret: her kural kendi iletisi ve adımın alanıyla', () => {
    const ret = (a: ReturnType<typeof adim>[], k = kartlar(), yeni = true) => denetle(a, k, yeni);
    assert.deepEqual(ret([adim(null), adim(YM)])?.alan, 'adimlar.1.ciktiMalzemeId', 'son adımda çıktı (V1)');
    assert.match(ret([adim(null), adim(YM)])?.ileti ?? '', /Son adım/);
    assert.match(ret([adim(URUN), adim(null)])?.ileti ?? '', /kendi ürünü/);
    assert.match(ret([adim(99), adim(null)])?.ileti ?? '', /bulunamadı/);
    assert.match(ret([adim(4), adim(null)])?.ileti ?? '', /yalnız yarı mamul ya da mamul/, 'hammadde çıktı olmaz (V4)');
    assert.match(ret([adim(YM), adim(null)], kartlar({ [YM]: { aktif: false } }))?.ileti ?? '', /kullanımda değil/);
    assert.match(ret([adim(YM), adim(null)], kartlar({ [YM]: { rotali: true } }))?.ileti ?? '', /kendi rotası var/);
    assert.match(ret([adim(YM), adim(null, [YM])])?.ileti ?? '', /bu rotada giren/);
    assert.deepEqual(ret([adim(YM), adim(YM), adim(null)])?.alan, 'adimlar.1.ciktiMalzemeId', 'aynı kart iki adımın çıktısı olmaz');
  });

  test('T1: var olan seçimde pasif kart taslakta kalır; yeni seçimde reddedilir', () => {
    const pasif = kartlar({ [YM]: { aktif: false } });
    assert.equal(denetle([adim(YM), adim(null)], pasif, false), null);
    assert.notEqual(denetle([adim(YM), adim(null)], pasif, true), null);
  });

  test('akış: çıktısı seçilen ara adım kart çıkarır; son adımda seçim sayılmaz, ürün çıkar', () => {
    const akis = akisiCikar([
      { opNo: 10, bagimlilik: 'bekleyen', ciktiMalzemeId: YM }, { opNo: 20, bagimlilik: 'bekleyen', ciktiMalzemeId: null }, { opNo: 30, bagimlilik: 'bekleyen', ciktiMalzemeId: 3 },
    ]);
    assert.deepEqual(akis.map((a) => a.cikti), [{ tur: 'kart', malzemeId: YM }, { tur: 'ara-hal', opNo: 20 }, { tur: 'urun' }]);
  });
});
