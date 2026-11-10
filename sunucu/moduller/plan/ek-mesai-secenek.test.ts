import assert from 'node:assert/strict';
import vm from 'node:vm';
import { describe, test } from 'node:test';
import { degerlendirmeKodu } from './degerlendirme.ts';

// 2759 (2745 a ilkesi, yapı 5): plan seçeneklerinde bedeli bilinmeyen ek mesai bedava sayılıp seçilmez. Seçim kuralı motorun kendi
// kodunda ölçülür; adayları ve plan kurmayı sağlayan işlevler sabit değerle yer değiştirir. Veriler uydurmadır.
interface Aday { m: string; gun: number; vardiya: string; tl: number | null; dGec: number; dDiger: number }
interface Cevap {
  bedeliBilinmeyenEkMesai: boolean;
  secenekler: { denge: number; ekMesai: { makineId: string; tl: number | null }[]; ekMesaiTl: number | null; netKar: number | null }[];
}
function secenekler(adaylar: Aday[], sira?: number): Cevap {
  const b = vm.createContext({}); b['self'] = b;
  vm.runInContext(degerlendirmeKodu(), b);
  b['adaylar'] = adaylar;
  vm.runInContext(`
    S = { w: {}, dataVer: 1, ekMesai: [] };
    ymMesaiAdaylari = () => adaylar;
    stOf = () => ({ tlAmac: {}, ekMesai: [] });
    dengeKilit = (st) => st;
    pdCalistir = (l) => l.map((x) => ({ ...x, k: { ozet: { n: 1 } } }));
    pdOzet = () => ({ late: 0, gecSa: 0, net: 10000, eksik: 0 });
  `, b);
  return vm.runInContext(`pdSecenekler(${sira === undefined ? 'null' : String(sira)})`, b) as Cevap;
}
// Gecikme kazancı 2.500 TL; denge 50'de çarpan 1: bedeli 2.000 TL olan aday kâr eder, bedeli bilinmeyen eskiden 0 sayılırdı.
const bilinen: Aday = { m: 'T1', gun: 5, vardiya: 'V1', tl: 2000, dGec: 2500, dDiger: 0 };
const bedelsiz: Aday = { m: 'T2', gun: 5, vardiya: 'V1', tl: null, dGec: 2500, dDiger: 0 };
const pahali: Aday = { m: 'T3', gun: 5, vardiya: 'V1', tl: 3000, dGec: 2500, dDiger: 0 };
const denge50 = (c: Cevap) => c.secenekler.find((x) => x.denge === 50)!;

describe('2759: bedeli bilinmeyen ek mesai seçilmez', () => {
  test('PS-01 tek aday bedeli bilinmiyor: hiçbir denge konumunda seçilmez, işaret true', () => {
    const c = secenekler([bedelsiz]);
    assert.equal(c.bedeliBilinmeyenEkMesai, true);
    assert.ok(c.secenekler.length > 0);
    for (const s of c.secenekler) assert.deepEqual(s.ekMesai, [], `denge ${String(s.denge)}`);
  });
  test('PS-02 bedeli bilinen aday: kârlılık eşiği aynı (2.000 seçilir, 3.000 denge 50\'de seçilmez), işaret false', () => {
    const c = secenekler([bilinen, pahali]);
    assert.equal(c.bedeliBilinmeyenEkMesai, false);
    const s = denge50(c);
    assert.deepEqual(s.ekMesai.map((e) => e.makineId), ['T1']);
    assert.equal(s.ekMesaiTl, 2000);
    assert.equal(s.netKar, 10000 - 2000);
  });
  test('PS-04 karışık liste (Maliyet, Test): bilinen seçilir, bedelsiz seçilmez; toplam ve net kâr bilinir, işaret true', () => {
    const c = secenekler([bedelsiz, bilinen]);
    assert.equal(c.bedeliBilinmeyenEkMesai, true);
    for (const s of c.secenekler) assert.ok(!s.ekMesai.some((e) => e.makineId === 'T2'), `denge ${String(s.denge)}`);
    const s = denge50(c);
    assert.deepEqual(s.ekMesai.map((e) => e.makineId), ['T1']);
    assert.equal(s.ekMesaiTl, 2000);
    assert.equal(s.netKar, 8000);
  });
  test('PS-05 sıra ile tek konum kurulduğunda da işaret aynı (iş parçacıkları birleşirken kaybolmaz)', () => {
    for (const i of [0, 1, 2, 3]) {
      const c = secenekler([bedelsiz, bilinen], i);
      assert.equal(c.bedeliBilinmeyenEkMesai, true, `sıra ${String(i)}`);
      for (const s of c.secenekler) assert.ok(!s.ekMesai.some((e) => e.makineId === 'T2'));
    }
    assert.equal(secenekler([], 0).bedeliBilinmeyenEkMesai, false);
  });
});
