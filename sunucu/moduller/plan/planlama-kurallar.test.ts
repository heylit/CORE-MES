import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ayarCevir, calismaEkMesaisi, calismaFarki, calismaIsleri, calismaKuyruklari, planAni, taslaktanCalismaya } from './planlama-kurallar.ts';

// Planlama çalışmasının saf kuralları (658 b: Reçete ve Rota'dan taşındı; test kimlikleri aynı kaldı).
describe('planlama kuralları: plan ayarı', () => {
  test('RR-K20: plan ayarı prototipin settings adlarına çevrilir (kural, yön, tampon, dondurma, personel kısıtı, taslak emirler)', () => {
    assert.deepEqual(ayarCevir({ kural: 'fifo', yon: 'geri', tamponGun: 1.5, dondurmaGun: 3, personelKisiti: true, taslakEmirler: true }),
      { rule: 'fifo', dir: 'geri', buffer: 1.5, freezeDays: 3, peopleLimit: true, planDrafts: true });
  });
});


// 499 a, 503 a: çalışma planının plan modülüne yazılacak işleri, canlıyla farkı ve kuyrukları (sayfanın soKuyruklari ve paFark'ı). Uydurma.
describe('planlama kuralları: çalışma planı ve canlı plan', () => {
  const kimlik = { '1.10': 'E1|10', '1.20': 'E1|20', '2.10': 'E2|10', '3.10': 'E3|10', '4.10': 'E4|10' };
  const ops = [
    { id: '1.10', m: '5', S: 10, C: 11, bitti: false },
    { id: '1.20', m: '@7', S: 12, C: 30, bitti: false },
    { id: '2.10', m: '5', S: 8, C: 9, bitti: true },
    { id: '3.10', m: 'K2', S: 8, C: 9, bitti: false },
    { id: '4.10', m: '6', S: 8, C: 9, bitti: false },
    { id: '9.10', m: '5', S: 1, C: 2, bitti: false },
  ];
  test('RR-499-1: biten ve fason iş dokunulmaz; kişi, karşılıksız ve planlanacak olmayan iş yazılamaz', () => {
    const r = calismaIsleri(ops, kimlik, new Set(['E1|10', 'E3|10']));
    assert.deepEqual(r.yazilacak, [{ k: '1.10', anahtar: 'E1|10', makineId: 5, S: 10, C: 11 }]);
    assert.deepEqual(r.yazilamaz.sort(), ['9.10', 'E3|10', 'E4|10']);
    assert.deepEqual([...r.dokunulmaz].sort(), ['E1|20', 'E2|10']);
  });
  test('RR-499-2: fark türleri; saat kıyaslanmaz, tezgâhtaki sıra en az işle işaretlenir', () => {
    const an = (dk: number) => new Date(Date.UTC(2026, 9, 19, 8, dk)).toISOString();
    const is = (k: string, S: number, makineId = 5) => ({ k, anahtar: `${k.toUpperCase()}|10`, makineId, S, C: S + 1 });
    const isler = [is('a', 1), is('b', 2), is('c', 3), is('d', 4), is('e', 5), is('t', 1, 6), is('y', 1)];
    const canli = new Map([
      // canlıda sıra a, c, d, b, e: çalışmada b öne alınmış; yalnız b işaretlenir. Saatler çalışmadan çok farklı, sayılmaz.
      ['A|10', [{ makineId: 5, baslangic: an(0) }]], ['C|10', [{ makineId: 5, baslangic: an(10) }]], ['D|10', [{ makineId: 5, baslangic: an(20) }]],
      ['B|10', [{ makineId: 5, baslangic: an(30) }]], ['E|10', [{ makineId: 6, baslangic: an(0) }, { makineId: 5, baslangic: an(40) }]],
      ['T|10', [{ makineId: 5, baslangic: an(0) }, { makineId: null, baslangic: an(0) }]],
      ['F|10', [{ makineId: 5, baslangic: an(50) }]], ['G|10', [{ makineId: 5, baslangic: an(60) }]],
    ]);
    const f = calismaFarki(isler, new Set(['G|10']), canli, (x) => (x === 'F|10' ? 'f' : null));
    assert.deepEqual(f.isler, [
      { k: 't', anahtar: 'T|10', tur: 'tezgah' }, { k: 'y', anahtar: 'Y|10', tur: 'yeni' }, { k: 'b', anahtar: 'B|10', tur: 'sira' },
      { k: 'f', anahtar: 'F|10', tur: 'eksik' },
    ]);
    assert.deepEqual([f.tezgah, f.sira, f.yeni, f.eksik], [1, 1, 1, 1]);
    assert.deepEqual(calismaFarki([is('a', 1), is('b', 9)], new Set(), new Map([['A|10', [{ makineId: 5, baslangic: an(0) }]], ['B|10', [{ makineId: 5, baslangic: an(1) }]]]), () => null).isler, []);
  });
  test('RR-503-1: kuyruk tezgâh başına başlangıç sırasıyla; kuyruk başı şimdiden önce olmaz; önizleme çalışmanın saati', () => {
    const b = '2026-10-19';
    const simdi = Date.parse(planAni(b, 9));
    const q = calismaKuyruklari(b, [
      { k: 'x', anahtar: 'E-1|20', makineId: 5, S: 12, C: 13 }, { k: 'y', anahtar: 'E-1|10', makineId: 5, S: 8, C: 9 },
      { k: 'z', anahtar: 'E-2|10', makineId: 6, S: 10, C: 11 },
    ], simdi);
    assert.deepEqual(q.map((x) => [x.kaynak.id, x.baslangic, x.isler.map((i) => [i.emirNo, i.opNo])]), [
      [5, new Date(simdi).toISOString(), [['E-1', 10], ['E-1', 20]]], [6, planAni(b, 10), [['E-2', 10]]],
    ]);
    assert.deepEqual(q[0]!.isler[1], {
      emirNo: 'E-1', opNo: 20, dondurulmus: false, elle: true, elleKaynak: true, onizleme: { baslangic: planAni(b, 12), bitis: planAni(b, 13) },
    });
  });

  test('RR-507-2: ek vardiya sayı kimlikli tezgâh ve vardiyayla, gün takvim günü; elle girilmiş kimlik yazılamaz, tekrar bir kez', () => {
    const r = calismaEkMesaisi('2026-10-30', [
      { m: '5', gun: 2, vardiya: '3' }, { m: '5', gun: 2, vardiya: '3' }, { m: 'T1', gun: 0, vardiya: '3' }, { m: '5', gun: 0, vardiya: 'V3' },
    ]);
    assert.deepEqual(r, { satirlar: [{ makineId: 5, gun: '2026-11-01', vardiyaId: 3 }], yazilamaz: 2 });
  });

  test('RR-507-3: taslağın yeri çalışmanın ekseninde yazılır, ayar başlangıcı ve ilk parti aynı kayar; kilit taslağınki; biten ve olmayan işlem atlanır', () => {
    const b = '2026-10-19';
    const deger = {
      D: { meta: { baslangic: b } }, locks: { y: { m: '5', S: 1 }, z: { m: '5', S: 2 } },
      plan: { dataVer: 3, ops: { x: { S: 10, C: 12, m: '5', Su: 9, lot1: 11, pin: 1 }, y: { S: 20, C: 21, m: '5' }, z: { S: 1, C: 2, m: '5', done: 1 } } },
    };
    const r = taslaktanCalismaya(deger, [
      { k: 'x', anahtar: 'E|10', makineId: 6, baslangic: planAni(b, 14), bitis: planAni(b, 16), kilitli: true },
      { k: 'y', anahtar: 'E|20', makineId: 5, baslangic: planAni(b, 30), bitis: planAni(b, 31), kilitli: false },
      { k: 'z', anahtar: 'E|30', makineId: 5, baslangic: planAni(b, 3), bitis: planAni(b, 4), kilitli: true },
      { k: 'q', anahtar: 'E|40', makineId: 5, baslangic: planAni(b, 3), bitis: planAni(b, 4), kilitli: false },
    ])!;
    assert.deepEqual([r.yazilan, r.kilitli, r.atlanan], [2, 1, ['E|30', 'E|40']]);
    const d = r.deger as typeof deger & { plan: { ops: Record<string, Record<string, unknown>> } };
    assert.deepEqual(d.plan.ops.x, { S: 14, C: 16, m: '6', Su: 13, lot1: 15, pin: 1 });
    assert.deepEqual(d.plan.ops.y, { S: 30, C: 31, m: '5' });
    assert.deepEqual(d.locks, { x: { m: '6', S: 14 }, z: { m: '5', S: 2 } }, 'kilitsiz y açılır, biten z dokunulmaz');
    assert.equal(d.plan.dataVer, null);
    assert.equal(deger.plan.ops.x.S, 10, 'girdi değişmez');
    assert.equal(taslaktanCalismaya({ D: { meta: { baslangic: b } }, plan: null }, []), null, 'planı olmayan çalışma');
    assert.equal(taslaktanCalismaya({ D: {}, plan: { ops: {} } }, []), null, 'başlangıcı olmayan çalışma');
  });
});
