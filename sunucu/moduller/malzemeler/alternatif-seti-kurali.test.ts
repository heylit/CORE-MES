import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { alternatifOnceligi, setHatasi, setUyumu, type OncelikGirdisi, type SetKarti, type SetNiteligiSatiri } from './alternatif/kurallar.ts';

// 3572 a: alternatif setinin saf eşleme kuralı ve K4 önceliği (ORN- örnek veri).
const kart = (ek: Partial<SetKarti> = {}): SetKarti => ({ form: 'cubuk', kalite: '6082', durum: 'T6', yuzey: 'Ham', standartlar: [], olcu: { d: 42, l: 3000 }, ...ek });
const liste = (nitelik: SetNiteligiSatiri['nitelik'], degerler: string[]): SetNiteligiSatiri => ({ nitelik, degerler, alt: null, ust: null });
const olcu = (nitelik: SetNiteligiSatiri['nitelik'], alt: number | null, ust: number | null): SetNiteligiSatiri => ({ nitelik, degerler: null, alt, ust });

describe('Alternatif seti kuralı (3572-1)', () => {
  test('alanda veya, alanlar arasında ve; boş uç sınırsız; ölçüsü olmayan kart uymaz', () => {
    const set = [liste('form', ['cubuk', 'boru']), liste('kalite', ['6082', '6061']), olcu('d', 40, 46)];
    assert.deepEqual(setUyumu(set, kart()), { uyar: true, neden: 'd 42 · kalite 6082' });
    assert.equal(setUyumu(set, kart({ kalite: '6060' })).uyar, false);
    assert.equal(setUyumu(set, kart({ olcu: { d: 46.0000001 } })).uyar, true);
    assert.deepEqual(setUyumu(set, kart({ olcu: { d: 47 } })), { uyar: false, neden: 'd 47' });
    assert.deepEqual(setUyumu([olcu('d', null, 50)], kart({ olcu: { a: 20 } })), { uyar: false, neden: 'd yok' });
    assert.equal(setUyumu([olcu('l', 2500, null)], kart()).uyar, true);
  });

  test('standart: kartın standartlarından biri yeter; kartta standart yoksa uymaz', () => {
    const set = [liste('standart', ['EN 755-2'])];
    assert.equal(setUyumu(set, kart({ standartlar: ['EN 573-3', 'EN 755-2'] })).uyar, true);
    assert.deepEqual(setUyumu(set, kart()), { uyar: false, neden: 'standart yok' });
  });

  test('doğrulama: boş set, yinelenen alan, listesiz değer, ters aralık', () => {
    assert.equal(setHatasi([])?.alan, 'nitelikler');
    assert.equal(setHatasi([olcu('d', 1, 2), olcu('d', 3, 4)])?.alan, 'nitelikler');
    assert.equal(setHatasi([{ nitelik: 'kalite', degerler: null, alt: 1, ust: null }])?.alan, 'kalite');
    assert.equal(setHatasi([liste('durum', ['T6', 'T6'])])?.alan, 'durum');
    assert.equal(setHatasi([olcu('d', null, null)])?.alan, 'd');
    assert.equal(setHatasi([olcu('d', 5, 4)])?.alan, 'd');
    assert.equal(setHatasi([liste('form', ['cubuk']), olcu('d', 4, 4)]), null);
  });

  test('K4: Önerilmesin > tekil > set > kural; eşdeğer en önde ve susturulamaz; iptal kart gelmez', () => {
    const k = (no: number) => ({ no, kod: `ORN-HM-${String(no)}`, ad: null });
    const g: OncelikGirdisi = {
      kullanimYeri: 'uretim',
      esdeger: [k(1)],
      secili: [
        { ...k(2), iptal: false, onerilmez: false, tur: 'tam', sira: 1, kullanimYerleri: ['talep'] },
        { ...k(3), iptal: false, onerilmez: true, tur: null, sira: null, kullanimYerleri: null },
        { ...k(6), iptal: true, onerilmez: false, tur: 'ust', sira: 2, kullanimYerleri: ['uretim'] },
        { ...k(1), iptal: false, onerilmez: true, tur: null, sira: null, kullanimYerleri: null },
      ],
      setler: [{ id: 9, ad: 'Set 1', tur: 'ust', sira: 0, kullanimYerleri: ['uretim'], uyanlar: [{ ...k(2), neden: 'd 42' }, { ...k(3), neden: 'd 43' }, { ...k(4), neden: 'd 44' }] }],
      kuraldan: [{ ...k(3), sonuc: 'ayni', nedenler: [] }, { ...k(4), sonuc: 'ayni', nedenler: [] }, { ...k(5), sonuc: 'sartli', nedenler: ['Kalite 6060 şartlı muadil'] }],
    };
    assert.deepEqual(alternatifOnceligi(g).map((x) => [x.no, x.tur, x.sonuc, x.setId]), [
      [1, 'esdeger', 'ayni', null], [4, 'set', 'icinde', 9], [5, 'alternatif', 'sartli', null],
    ]);
    assert.deepEqual(alternatifOnceligi({ ...g, kullanimYeri: 'talep' }).map((x) => [x.no, x.tur]), [[1, 'esdeger'], [2, 'secili'], [5, 'alternatif']]);
  });
});
