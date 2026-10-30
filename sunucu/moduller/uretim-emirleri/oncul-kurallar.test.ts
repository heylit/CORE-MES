import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  DAL_GECERSIZ, ONCUL_GECERSIZ, adimEksikleri, adimOnculleri, baslatilabilirAdimlar, oncekiBitmediIhlali, onculGirdisiIhlali, siraDisiBaslatmaUyarisi,
} from './kurallar.ts';
import type { OnculluAdim, ParalelAdim } from './kurallar.ts';

const adim = (sira: number, ek: Partial<OnculluAdim> = {}): OnculluAdim => ({ id: sira * 10, sira, bagimlilik: 'bekleyen', ...ek });
const idler = (adimlar: readonly OnculluAdim[], a: OnculluAdim): { id: number; tur: string; devirAdedi: number | null }[] =>
  adimOnculleri(adimlar, a).map((o) => ({ id: o.adim.id, tur: o.tur, devirAdedi: o.devirAdedi }));

describe('1248 a: adimOnculleri (plan, terminal ve rota için tek kural)', () => {
  test('liste yoksa plan motorunun bagOf kuralı (982 a): bağımsızlar birikir, sonraki adım hepsini bekler; akışlı yalnız en yakına', () => {
    const a = [adim(1), adim(2, { bagimlilik: 'akisli', devirAdedi: 5 }), adim(3, { bagimlilik: 'bagimsiz' }), adim(4)];
    assert.deepEqual(idler(a, a[0]!), []);
    assert.deepEqual(idler(a, a[1]!), [{ id: 10, tur: 'akisli', devirAdedi: 5 }]);
    assert.deepEqual(idler(a, a[2]!), []);
    assert.deepEqual(idler(a, a[3]!), [{ id: 20, tur: 'bekleyen', devirAdedi: null }, { id: 30, tur: 'bekleyen', devirAdedi: null }]);
    const b = [adim(1), adim(2, { bagimlilik: 'bagimsiz' }), adim(3, { bagimlilik: 'akisli', devirAdedi: 2 })];
    assert.deepEqual(idler(b, b[2]!), [{ id: 10, tur: 'bekleyen', devirAdedi: null }, { id: 20, tur: 'akisli', devirAdedi: 2 }]);
  });

  test('ilk adım bağımsız olsa da bağımlı sayılır: zincir onda durur', () => {
    const a = [adim(1, { bagimlilik: 'bagimsiz' }), adim(2, { bagimlilik: 'bagimsiz' }), adim(3)];
    assert.deepEqual(idler(a, a[2]!).map((o) => o.id), [10, 20]);
  });

  test('listeli emir: dallar birbirini beklemez, birleştirme adımı bütün öncüllerini bekler', () => {
    // A: 1 -> 2; B: 3 -> 4; birleştirme 5 (2 bekleyen, 4 akışlı 10).
    const a = [
      adim(1, { onculler: [] }), adim(2, { onculler: [{ id: 10, tur: 'bekleyen', devirAdedi: null }] }),
      adim(3, { onculler: [] }), adim(4, { onculler: [{ id: 30, tur: 'bekleyen', devirAdedi: null }] }),
      adim(5, { onculler: [{ id: 20, tur: 'bekleyen', devirAdedi: null }, { id: 40, tur: 'akisli', devirAdedi: 10 }] }),
    ];
    assert.deepEqual(idler(a, a[2]!), [], 'dal başı bir önceki sırayı beklemez');
    assert.deepEqual(idler(a, a[3]!), [{ id: 30, tur: 'bekleyen', devirAdedi: null }]);
    assert.deepEqual(idler(a, a[4]!), [{ id: 20, tur: 'bekleyen', devirAdedi: null }, { id: 40, tur: 'akisli', devirAdedi: 10 }]);
  });

  test('listede olmayan ya da sırası büyük öncül atlanır; bekleyen öncülün devir adedi okunmaz', () => {
    const a = [adim(1, { onculler: [] }), adim(2, { onculler: [{ id: 30, tur: 'bekleyen', devirAdedi: null }, { id: 99, tur: 'bekleyen', devirAdedi: null }, { id: 10, tur: 'bekleyen', devirAdedi: 4 }] }), adim(3, { onculler: [] })];
    assert.deepEqual(idler(a, a[1]!), [{ id: 10, tur: 'bekleyen', devirAdedi: null }]);
  });

  test('eski ve listeli adım aynı emirde: listesi null olan adım eski kuraldadır', () => {
    const a = [adim(1, { onculler: [] }), adim(2, { onculler: [] }), adim(3)];
    assert.deepEqual(idler(a, a[2]!), [{ id: 20, tur: 'bekleyen', devirAdedi: null }]);
  });
});

describe('1248 a: terminal kuralları çok öncüllü adımda', () => {
  type A = ParalelAdim & { istasyonId: number | null; fasonFirmaId: number | null };
  const a = (sira: number, ek: Partial<A> = {}): A => ({
    id: sira * 10, sira, opNo: sira * 10, durum: 'bekliyor', bagimlilik: 'bekleyen', devirAdedi: null, istasyonId: sira, fasonFirmaId: null, onculler: [], ...ek,
  });
  // A dalı 1, B dalı 2; 3 ikisini birleştirir (1 bekleyen, 2 akışlı 5).
  const adimlar = (d1: A['durum'], d2: A['durum']): A[] => [a(1, { durum: d1 }), a(2, { durum: d2 }), a(3, {
    onculler: [{ id: 10, tur: 'bekleyen', devirAdedi: null }, { id: 20, tur: 'akisli', devirAdedi: 5 }],
  })];

  test('dal başları birbirini beklemeden başlatılabilir; birleştirme öncüller gelince', () => {
    assert.deepEqual(baslatilabilirAdimlar(adimlar('bekliyor', 'bekliyor'), () => 0), [10, 20]);
    assert.deepEqual(baslatilabilirAdimlar(adimlar('tamam', 'calisiyor'), (_x, o) => (o.id === 20 ? 5 : 0)), [30]);
    assert.deepEqual(baslatilabilirAdimlar(adimlar('tamam', 'calisiyor'), () => 4), []);
  });

  test('başlatma uyarısı her öncülü ayrı söyler', () => {
    const x = adimlar('calisiyor', 'calisiyor');
    assert.equal(siraDisiBaslatmaUyarisi(x, x[2]!, (o) => (o.id === 20 ? 2 : 0)),
      "OP 10 bitmeden OP 30 başlatıldı. OP 20'den devir adedi (5) gelmeden OP 30 başlatıldı; gelen 2.");
    assert.equal(siraDisiBaslatmaUyarisi(x, x[1]!, 0), null, 'dal başı uyarı vermez');
  });

  test('bitirme reddi bitmemiş öncülü söyler; eksik en az gelen öncülden', () => {
    const x = adimlar('tamam', 'calisiyor');
    assert.match(oncekiBitmediIhlali(x, x[2]!) ?? '', /OP 20 bitmeden OP 30 bitirilemez/);
    assert.equal(oncekiBitmediIhlali(adimlar('tamam', 'tamam'), x[2]!), null);
    const eksik = adimEksikleri(x.map((y, n) => ({ ...y, saglamAdet: n === 0 ? 8 : null, saglam: n === 1 ? 3 : 0, kararBekliyor: 0, hurda: 0, hataliEmirde: 0 })));
    assert.equal(eksik.get(30), 3);
    assert.equal(eksik.get(20), null);
  });
});

describe('1248 a: açılış girdisinde dal ve öncül', () => {
  const ie = (sira: number, ek: Record<string, unknown> = {}) => ({ sira, opNo: sira * 10, ...ek });
  test('geçerli liste ve listesiz girdi kabul', () => {
    assert.equal(onculGirdisiIhlali([ie(1), ie(2)]), null);
    assert.equal(onculGirdisiIhlali([
      ie(1, { dal: 'A', onculler: [] }), ie(2, { dal: 'B', onculler: [] }),
      ie(3, { onculler: [{ opNo: 10, tur: 'bekleyen', devirAdedi: null }, { opNo: 20, tur: 'akisli', devirAdedi: 5 }] }),
    ]), null);
  });
  test('ileri, olmayan, yinelenen ya da kendisi olan öncül reddedilir', () => {
    assert.equal(onculGirdisiIhlali([ie(1, { onculler: [{ opNo: 20, tur: 'bekleyen', devirAdedi: null }] }), ie(2)]), ONCUL_GECERSIZ);
    assert.equal(onculGirdisiIhlali([ie(1), ie(2, { onculler: [{ opNo: 99, tur: 'bekleyen', devirAdedi: null }] })]), ONCUL_GECERSIZ);
    assert.equal(onculGirdisiIhlali([ie(1), ie(2, { onculler: [{ opNo: 20, tur: 'bekleyen', devirAdedi: null }] })]), ONCUL_GECERSIZ);
    assert.equal(onculGirdisiIhlali([ie(1), ie(2, {
      onculler: [{ opNo: 10, tur: 'bekleyen', devirAdedi: null }, { opNo: 10, tur: 'bekleyen', devirAdedi: null }],
    })]), ONCUL_GECERSIZ);
  });
  test('akışlı öncülde devir adedi zorunlu ve artı; bekleyende boş', () => {
    assert.equal(onculGirdisiIhlali([ie(1), ie(2, { onculler: [{ opNo: 10, tur: 'akisli', devirAdedi: null }] })]), ONCUL_GECERSIZ);
    assert.equal(onculGirdisiIhlali([ie(1), ie(2, { onculler: [{ opNo: 10, tur: 'akisli', devirAdedi: 0 }] })]), ONCUL_GECERSIZ);
    assert.equal(onculGirdisiIhlali([ie(1), ie(2, { onculler: [{ opNo: 10, tur: 'bekleyen', devirAdedi: 3 }] })]), ONCUL_GECERSIZ);
  });
  test('dal etiketi boş ya da uzun olamaz, öncül listesi olmadan verilmez', () => {
    assert.equal(onculGirdisiIhlali([ie(1, { dal: ' ', onculler: [] })]), DAL_GECERSIZ);
    assert.equal(onculGirdisiIhlali([ie(1, { dal: 'x'.repeat(21), onculler: [] })]), DAL_GECERSIZ);
    assert.equal(onculGirdisiIhlali([ie(1, { dal: 'A' })]), DAL_GECERSIZ);
  });
});
