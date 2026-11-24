import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { cikisOnerisi, iadeAdediEngeli, iadeEngeli, iadeHedefTuru, teslimAlmaEngeli, type OneriSatiri } from './kurallar.ts';

// 3613 Takımhane: kişi konumu ve iade durumu kuralları (Risk K1, K3).
describe('takım kuralları (saf)', () => {
  const satir = (konumTur: string, bakiyeId: number): OneriSatiri => ({ bakiyeId, konumId: bakiyeId, konumKod: `K${String(bakiyeId)}`, konumTur, partiId: null, partiEtiketi: null, miktar: '4', ilkGiris: '2026-11-01T00:00:00Z' });

  test('K1: kişide ve istasyonda duran takım çıkış önerisine girmez; yalnız raf gözü önerilir', () => {
    const o = cikisOnerisi([satir('kisi', 1), satir('istasyon', 2), satir('raf_gozu', 3)], '2');
    assert.deepEqual(o.oneriler.map((x) => x.konumId), [3]);
    assert.equal(cikisOnerisi([satir('kisi', 1)], '1').veriYetersiz, true);
  });

  test('K3: kişiye giden teslimi yalnız o kişi alır; gönderen hiçbir durumda alamaz', () => {
    assert.equal(teslimAlmaEngeli(false, { tur: 'kisi', benimMi: true }), null);
    assert.match(teslimAlmaEngeli(false, { tur: 'kisi', benimMi: false }) ?? '', /başka bir kişiye/);
    assert.match(teslimAlmaEngeli(true, { tur: 'kisi', benimMi: true }) ?? '', /Kendi gönderdiğiniz/);
  });

  test('iade durumu hedef konum türünü belirler', () => {
    assert.equal(iadeHedefTuru('saglam'), 'raf_gozu');
    assert.equal(iadeHedefTuru('asinmis'), 'ara_alan');
    assert.equal(iadeHedefTuru('kirik'), 'hurda');
  });

  test('kırık iade nedensiz olmaz, adet pozitif ve eldekinden fazla olmaz', () => {
    assert.notEqual(iadeEngeli('kirik', null), null);
    assert.notEqual(iadeEngeli('kirik', '  '), null);
    assert.equal(iadeEngeli('kirik', 'Mandren çarpması'), null);
    assert.equal(iadeEngeli('saglam', null), null);
    assert.notEqual(iadeAdediEngeli(0, 5), null);
    assert.notEqual(iadeAdediEngeli(6, 5), null);
    assert.equal(iadeAdediEngeli(5, 5), null);
  });
});
