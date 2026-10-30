import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { dalDenetle, dalliMi, oncullerCikar } from './rota-dal-kurali.ts';
import type { DalAdimi } from './rota-dal-kurali.ts';

describe('çok dallı rota (1248 a)', () => {
  const d = (opNo: number, dal: string | null, birlesen: string[] = [], p: Partial<DalAdimi> = {}): DalAdimi => ({
    opNo, bagimlilik: 'bekleyen', devirAdedi: null, dal, birlesen, ...p,
  });
  const oplar = (x: ReturnType<typeof oncullerCikar>) => x.map((l) => l?.map((o) => o.opNo) ?? null);

  test('tek hatlı rota öncül türetmez: her adım null, bugünkü kural sürer', () => {
    const r = [d(10, null), d(20, null, [], { bagimlilik: 'bagimsiz' })];
    assert.equal(dalliMi(r), false);
    assert.deepEqual(oncullerCikar(r), [null, null]);
  });

  test('hedef örnek: dallar ayrı başlar, birleştirme adımı birleşen dalların son adımını ve kendi hattını bekler', () => {
    // A: 10-20; B: 30-40; C: 60; 50 ana hatta B ve C'yi, 70 A'yı birleştirir; 80 son kontrol.
    const r = [d(10, 'A'), d(20, 'A'), d(30, 'B'), d(40, 'B'), d(60, 'C'), d(50, null, ['B', 'C']), d(70, null, ['A']), d(80, null)];
    assert.deepEqual(oplar(oncullerCikar(r)), [[], [10], [], [30], [], [40, 60], [50, 20], [70]]);
    assert.equal(dalDenetle(r), null);
  });

  test('dal ana hattan ayrılırsa ilk adımı ayrılma noktasını bekler; bağımsız adım yalnız birleşen dalları bekler', () => {
    const r = [d(10, null), d(20, 'A'), d(30, 'B'), d(40, null, ['A', 'B'], { bagimlilik: 'bagimsiz' })];
    const o = oncullerCikar(r);
    assert.deepEqual(oplar(o), [[], [10], [10], [20, 30]]);
    assert.deepEqual(o[3]?.map((x) => x.tur), ['bekleyen', 'bekleyen']);
  });

  test('tür adımın bağımlılığıdır: akışlı adımın bütün öncülleri akışlı ve devir adedini taşır', () => {
    const o = oncullerCikar([d(10, 'A'), d(20, 'B'), d(30, null, ['A', 'B'], { bagimlilik: 'akisli', devirAdedi: 4 })]);
    assert.deepEqual(o[2], [{ opNo: 10, tur: 'akisli', devirAdedi: 4 }, { opNo: 20, tur: 'akisli', devirAdedi: 4 }]);
  });

  test('denetim: önceden başlamayan, kendi dalı, iki kez birleşen, birleştikten sonra adımı olan ve açıkta kalan dal reddedilir', () => {
    assert.match(dalDenetle([d(10, null, ['A'])])?.ileti ?? '', /A dalının bu adımdan önce adımı yok/);
    assert.match(dalDenetle([d(10, 'A'), d(20, 'A', ['A'])])?.ileti ?? '', /kendi dalını/);
    assert.match(dalDenetle([d(10, 'A'), d(20, 'B'), d(30, null, ['A', 'B']), d(40, null, ['A'])])?.ileti ?? '', /zaten birleşti/);
    assert.match(dalDenetle([d(10, 'A'), d(20, 'B', ['A']), d(30, 'A')])?.ileti ?? '', /sonrasına bu dalda adım eklenemez/);
    assert.match(dalDenetle([d(10, 'A'), d(20, 'B'), d(30, 'B', ['A']), d(40, null)])?.ileti ?? '', /B dalı hiçbir adımda birleşmiyor/);
    assert.match(dalDenetle([d(10, 'A'), d(20, null, ['A', 'A'])])?.ileti ?? '', /iki kez seçilemez/);
    // Son adımın dalı birleşmek zorunda değildir: rota o dalda biter.
    assert.equal(dalDenetle([d(10, 'A'), d(20, 'B', ['A'])]), null);
  });
});
