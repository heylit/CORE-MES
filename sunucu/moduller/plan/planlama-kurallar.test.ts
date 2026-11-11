import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ayarCevir, calismaEkMesaisi, calismaElleBolmeleri, calismaFarki, calismaIsleri, calismaKilitleri, calismaKuyruklari, planAni, taslaktanCalismaya } from './planlama-kurallar.ts';

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
    { id: '5.10', m: 'kisi-4', S: 9, C: 10, bitti: false },
    { id: '9.10', m: '5', S: 1, C: 2, bitti: false },
  ];
  test('RR-499-1, B-2500-2: biten ve fason iş dokunulmaz; kişi tezgâhı (kisi-<id>) yazılır; tanınmayan kaynak, karşılıksız ve planlanacak olmayan iş yazılamaz', () => {
    const r = calismaIsleri(ops, { ...kimlik, '5.10': 'E5|10' }, new Set(['E1|10', 'E3|10', 'E5|10']));
    assert.deepEqual(r.yazilacak, [
      { k: '1.10', anahtar: 'E1|10', kaynak: { tur: 'makine', id: 5 }, S: 10, C: 11 }, { k: '5.10', anahtar: 'E5|10', kaynak: { tur: 'kisi', id: 4 }, S: 9, C: 10 },
    ]);
    assert.deepEqual(r.yazilamaz.sort(), ['9.10', 'E3|10', 'E4|10']);
    assert.deepEqual([...r.dokunulmaz].sort(), ['E1|20', 'E2|10']);
  });
  test('RR-499-2: fark türleri; saat kıyaslanmaz, tezgâhtaki sıra en az işle işaretlenir', () => {
    const an = (dk: number) => new Date(Date.UTC(2026, 9, 19, 8, dk)).toISOString();
    const is = (k: string, S: number, makineId = 5) => ({ k, anahtar: `${k.toUpperCase()}|10`, kaynak: { tur: 'makine' as const, id: makineId }, S, C: S + 1 });
    const m = (id: number) => ({ tur: 'makine' as const, id });
    const isler = [is('a', 1), is('b', 2), is('c', 3), is('d', 4), is('e', 5), is('t', 1, 6), is('y', 1)];
    const canli = new Map([
      // canlıda sıra a, c, d, b, e: çalışmada b öne alınmış; yalnız b işaretlenir. Saatler çalışmadan çok farklı, sayılmaz.
      ['A|10', [{ kaynak: m(5), baslangic: an(0) }]], ['C|10', [{ kaynak: m(5), baslangic: an(10) }]], ['D|10', [{ kaynak: m(5), baslangic: an(20) }]],
      ['B|10', [{ kaynak: m(5), baslangic: an(30) }]], ['E|10', [{ kaynak: m(6), baslangic: an(0) }, { kaynak: m(5), baslangic: an(40) }]],
      ['T|10', [{ kaynak: m(5), baslangic: an(0) }, { kaynak: { tur: 'kisi' as const, id: 5 }, baslangic: an(0) }]],
      ['F|10', [{ kaynak: m(5), baslangic: an(50) }]], ['G|10', [{ kaynak: m(5), baslangic: an(60) }]],
    ]);
    const f = calismaFarki(isler, new Set(['G|10']), canli, (x) => (x === 'F|10' ? 'f' : null));
    assert.deepEqual(f.isler, [
      { k: 't', anahtar: 'T|10', tur: 'tezgah' }, { k: 'y', anahtar: 'Y|10', tur: 'yeni' }, { k: 'b', anahtar: 'B|10', tur: 'sira' },
      { k: 'f', anahtar: 'F|10', tur: 'eksik' },
    ]);
    assert.deepEqual([f.tezgah, f.sira, f.yeni, f.eksik], [1, 1, 1, 1]);
    assert.deepEqual(calismaFarki([is('a', 1), is('b', 9)], new Set(), new Map([['A|10', [{ kaynak: m(5), baslangic: an(0) }]], ['B|10', [{ kaynak: m(5), baslangic: an(1) }]]]), () => null).isler, []);
  });
  test('RR-503-1, B-2500-1/-2: kuyruk kaynak başına başlangıç sırasıyla; kuyruk başı şimdiden önce olmaz; önizleme çalışmanın saati; kilitli iş sabit', () => {
    const b = '2026-10-19';
    const simdi = Date.parse(planAni(b, 9));
    const { kuyruklar: q, sabitler } = calismaKuyruklari(b, [
      { k: 'x', anahtar: 'E-1|20', kaynak: { tur: 'makine', id: 5 }, S: 12, C: 13 }, { k: 'y', anahtar: 'E-1|10', kaynak: { tur: 'makine', id: 5 }, S: 8, C: 9 },
      { k: 'z', anahtar: 'E-2|10', kaynak: { tur: 'makine', id: 6 }, S: 10, C: 11 }, { k: 'p', anahtar: 'E-2|20', kaynak: { tur: 'kisi', id: 5 }, S: 11, C: 12 },
    ], simdi, new Set(['x', 'yok']));
    assert.deepEqual(q.map((x) => [x.kaynak, x.baslangic, x.isler.map((i) => [i.emirNo, i.opNo])]), [
      [{ tur: 'makine', id: 5 }, new Date(simdi).toISOString(), [['E-1', 10], ['E-1', 20]]], [{ tur: 'makine', id: 6 }, planAni(b, 10), [['E-2', 10]]],
      [{ tur: 'kisi', id: 5 }, planAni(b, 11), [['E-2', 20]]],
    ]);
    assert.deepEqual([...sabitler], ['E-1|20'], 'aynı kimlikli makine ve kişi ayrı kuyruk; kilit çalışmadaki işin');
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
      plan: { dataVer: 3, ops: { x: { S: 10, C: 12, m: '5', Su: 10.5, lot1: 11, pin: 1 }, y: { S: 20, C: 21, m: '5' }, z: { S: 1, C: 2, m: '5', done: 1 } } },
    };
    const r = taslaktanCalismaya(deger, [
      { k: 'x', anahtar: 'E|10', kaynak: { tur: 'makine', id: 6 }, baslangic: planAni(b, 14), bitis: planAni(b, 16), kilitli: true },
      { k: 'y', anahtar: 'E|20', kaynak: { tur: 'makine', id: 5 }, baslangic: planAni(b, 30), bitis: planAni(b, 31), kilitli: false },
      { k: 'z', anahtar: 'E|30', kaynak: { tur: 'makine', id: 5 }, baslangic: planAni(b, 3), bitis: planAni(b, 4), kilitli: true },
      { k: 'q', anahtar: 'E|40', kaynak: { tur: 'makine', id: 5 }, baslangic: planAni(b, 3), bitis: planAni(b, 4), kilitli: false },
    ])!;
    assert.deepEqual([r.yazilan, r.kilitli, r.atlanan], [2, 1, ['E|30', 'E|40']]);
    const d = r.deger as typeof deger & { plan: { ops: Record<string, Record<string, unknown>> } };
    assert.deepEqual(d.plan.ops.x, { S: 14, C: 16, m: '6', Su: 14.5, lot1: 15, pin: 1 });
    assert.deepEqual(d.plan.ops.y, { S: 30, C: 31, m: '5' });
    assert.deepEqual(d.locks, { x: { m: '6', S: 14 }, z: { m: '5', S: 2 } }, 'kilitsiz y açılır, biten z dokunulmaz');
    assert.equal(d.plan.dataVer, null);
    assert.equal(deger.plan.ops.x.S, 10, 'girdi değişmez');
    assert.equal(taslaktanCalismaya({ D: { meta: { baslangic: b } }, plan: null }, []), null, 'planı olmayan çalışma');
    assert.equal(taslaktanCalismaya({ D: {}, plan: { ops: {} } }, []), null, 'başlangıcı olmayan çalışma');
  });

  test('B-2483-3: ayar bitişi (Su) işlemle kayar, ayar süresi korunur; işlemin dışına taşmaz', () => {
    const b = '2026-10-19';
    const ops = (Su: number, lot1: number) => ({ D: { meta: { baslangic: b } }, plan: { ops: { x: { S: 10, C: 20, m: '5', Su, lot1 } } } });
    const yaz = (deger: unknown, bas: number, bit: number) =>
      (taslaktanCalismaya(deger, [{ k: 'x', anahtar: 'E|10', kaynak: { tur: 'makine', id: 5 }, baslangic: planAni(b, bas), bitis: planAni(b, bit), kilitli: false }])!
        .deger as { plan: { ops: { x: { Su: number; lot1: number } } } }).plan.ops.x;
    assert.deepEqual(yaz(ops(12, 14), 30, 40), { S: 30, C: 40, m: '5', Su: 32, lot1: 34 }, 'iki saatlik ayar iki saat kalır');
    assert.deepEqual(yaz(ops(12, 19), 30, 34), { S: 30, C: 34, m: '5', Su: 32, lot1: 34 }, 'kısalan işte ilk parti bitişi aşmaz');
    assert.deepEqual(yaz(ops(18, 19), 30, 31), { S: 30, C: 31, m: '5', Su: 31, lot1: 31 }, 'ayar bitişi işlemin bitişini aşmaz');
  });

  test('B-2500-1/-2: kaydın kalıcı kilitleri okunur, motorun geçici kilidi sayılmaz; kişi kaynağındaki taslak yeri kisi-<id> yazılır', () => {
    assert.deepEqual([...calismaKilitleri({ locks: { a: { m: '5', S: 1 }, b: { m: '5', S: 2, gecici: 1 }, c: null } })], ['a']);
    assert.deepEqual([...calismaKilitleri(null)], []);
    const b = '2026-10-19';
    const r = taslaktanCalismaya({ D: { meta: { baslangic: b } }, plan: { ops: { x: { S: 1, C: 2, m: 'kisi-4' } } } },
      [{ k: 'x', anahtar: 'E|10', kaynak: { tur: 'kisi', id: 4 }, baslangic: planAni(b, 5), bitis: planAni(b, 6), kilitli: true }])!;
    assert.deepEqual((r.deger as { plan: { ops: { x: unknown } }; locks: unknown }).plan.ops.x, { S: 5, C: 6, m: 'kisi-4' });
    assert.deepEqual((r.deger as { locks: unknown }).locks, { x: { m: 'kisi-4', S: 5 } });
  });
});

// 2524 b: çalışmanın elle bölmesi (S.elleBol) plan taslağına parça olarak yazılır, taslaktaki elle bölme çalışmaya geri döner. Veriler uydurmadır.
describe('planlama kuralları: elle bölme (2524 b)', () => {
  const b = '2026-11-09';
  const kimlik = { '1.10': 'E1|10', '2.10': 'E2|10' };
  const op = (id: string, m: string, S: number) => ({ id, m, S, C: S + 2, bitti: false });

  const adet = new Map([['E1|10', 10], ['E2|10', 10]]);
  test('elle bölünen işin payları parça olarak yazılır; motorun kendi bölmesi de parça olarak, adedi eşit bölünerek ve motorBolmesi ile (B-2482-13)', () => {
    const elle = calismaElleBolmeleri({ elleBol: { '1.10': [{ adet: 6, m: '5' }, { adet: 4, m: '6' }], kotu: [{ adet: 0, m: '5' }, { adet: 1, m: '6' }], tek: [{ adet: 10, m: '5' }] } });
    assert.deepEqual([...elle.keys()], ['1.10', 'tek'], 'adedi geçersiz kayıt atlanır');
    const ops = [op('1.10', '5', 1), op('1.10~2', '6', 1), op('2.10', '5', 4), op('2.10~2', '6', 4), op('2.10~3', '7', 4)];
    const r = calismaIsleri(ops, kimlik, new Set(['E1|10', 'E2|10']), elle, adet);
    assert.deepEqual(r.yazilacak.map((i) => [i.k, i.kaynak.id, i.parca ?? null]), [
      ['1.10', 5, { no: 1, adet: 6 }], ['1.10', 6, { no: 2, adet: 4 }],
      ['2.10', 5, { no: 1, adet: 4, motorBolmesi: true }], ['2.10', 6, { no: 2, adet: 3, motorBolmesi: true }], ['2.10', 7, { no: 3, adet: 3, motorBolmesi: true }],
    ]);
    assert.deepEqual([r.yazilamaz, r.uyarilar], [[], []]);
    const { kuyruklar, sabitler } = calismaKuyruklari(b, r.yazilacak, 0, new Set(['1.10']));
    const m6 = kuyruklar.find((q) => q.kaynak.id === 6)!;
    assert.deepEqual(m6.isler.map((x) => [x.emirNo, x.opNo, x.parca]), [['E1', 10, { no: 2, adet: 4 }], ['E2', 10, { no: 2, adet: 3, motorBolmesi: true }]]);
    assert.equal(sabitler.has('E1|10'), false, 'elle bölünen işin payı sabitlenmez');
  });

  // B-2482-14 ve Test T-2524-2-1: pay adedi motorun uyguladığından; toplam hiçbir zaman adım adedini aşmaz, taslak yazımı düşmez.
  test('elle 6 + 4, adım adedi 9: paylar orana göre ve uyarıyla, toplam 9 (B-2482-14)', () => {
    const elle = calismaElleBolmeleri({ elleBol: { '1.10': [{ adet: 6, m: '5' }, { adet: 4, m: '6' }] } });
    const r = calismaIsleri([op('1.10', '5', 1), op('1.10~2', '6', 1)], kimlik, new Set(['E1|10']), elle, new Map([['E1|10', 9]]));
    const parcalar = r.yazilacak.map((i) => i.parca!);
    assert.equal(parcalar.reduce((t, p) => t + p.adet, 0), 9);
    assert.deepEqual(parcalar.map((p) => p.adet), [6, 3], 'motorun kuralı: taban 5 + 3, kalan 1 ilk paya');
    assert.deepEqual(r.uyarilar, ['E1 OP 10: adım adedi 9, elle bölmenin toplamı 10; paylar orana göre 6 + 3 yapıldı.']);
  });

  test('(a) motor elle bölmeyi uygulamayıp işi bütün bıraktı: iş parçasız yazılır, uyarı; tek parça gitmez', () => {
    const elle = calismaElleBolmeleri({ elleBol: { '1.10': [{ adet: 6, m: '5' }, { adet: 4, m: '6' }] } });
    const r = calismaIsleri([op('1.10', '5', 1)], kimlik, new Set(['E1|10']), elle, adet);
    assert.deepEqual(r.yazilacak.map((i) => [i.kaynak.id, i.parca ?? null]), [[5, null]]);
    assert.deepEqual(r.uyarilar, ['E1 OP 10: motor elle bölmeyi uygulamadı; iş bütün yazıldı.']);
  });

  test('(b) motor elle bölmeyi yok sayıp kendi bölmesini kurdu: motorun tezgâhları motorun adetleriyle, elle adetler yazılmaz', () => {
    const elle = calismaElleBolmeleri({ elleBol: { '1.10': [{ adet: 6, m: '5' }, { adet: 4, m: '6' }] } });
    const r = calismaIsleri([op('1.10', '7', 1), op('1.10~2', '8', 1)], kimlik, new Set(['E1|10']), elle, adet);
    assert.deepEqual(r.yazilacak.map((i) => [i.kaynak.id, i.parca]), [[7, { no: 1, adet: 5, motorBolmesi: true }], [8, { no: 2, adet: 5, motorBolmesi: true }]]);
    assert.deepEqual(r.uyarilar, ['E1 OP 10: motor elle bölmeyi uygulamadı; kendi bölmesi (2 pay) yazıldı.']);
  });

  test('(c) elle 15 + 5, adım adedi 10: toplam 10 yazılır (fazla adet taslağa girmez, yazım reddedilmez)', () => {
    const elle = calismaElleBolmeleri({ elleBol: { '1.10': [{ adet: 15, m: '5' }, { adet: 5, m: '6' }] } });
    const r = calismaIsleri([op('1.10', '5', 1), op('1.10~2', '6', 1)], kimlik, new Set(['E1|10']), elle, adet);
    assert.deepEqual(r.yazilacak.map((i) => i.parca!.adet), [8, 2]);
    assert.equal(r.uyarilar.length, 1);
  });

  test('pay numarası atlanan, adım adedi bilinmeyen ya da pay sayısından az olan bölünmüş iş yazılamaz; bölmesiz çalışmada eski davranış', () => {
    const elle = calismaElleBolmeleri({ elleBol: { '1.10': [{ adet: 6, m: '5' }, { adet: 4, m: '6' }] } });
    assert.deepEqual(calismaIsleri([op('1.10', '5', 1), op('1.10~3', '7', 1)], kimlik, new Set(['E1|10']), elle, adet).yazilamaz, ['E1|10']);
    assert.deepEqual(calismaIsleri([op('1.10', '5', 1), op('1.10~2', '6', 1)], kimlik, new Set(['E1|10']), elle).yazilamaz, ['E1|10']);
    assert.deepEqual(calismaIsleri([op('1.10', '5', 1), op('1.10~2', '6', 1), op('1.10~3', '7', 1)], kimlik, new Set(['E1|10']), new Map(), new Map([['E1|10', 2]])).yazilamaz, ['E1|10']);
    assert.deepEqual(calismaIsleri([op('1.10', '5', 1)], kimlik, new Set(['E1|10'])).yazilacak.map((i) => i.parca), [undefined]);
  });

  test('taslaktaki elle bölme çalışmaya döner; motor bölmesi dönmez; taslakta bütün iş çalışmadaki bölmeyi kaldırır, tek paylı kayıt kalır', () => {
    const deger = {
      D: { meta: { baslangic: b } }, plan: { ops: { x: { S: 1, C: 2, m: '5' }, y: { S: 1, C: 2, m: '5' }, z: { S: 1, C: 2, m: '5' }, t: { S: 1, C: 2, m: '5' } } },
      elleBol: { y: [{ adet: 5, m: '5' }, { adet: 5, m: '6' }], t: [{ adet: 10, m: '5' }] },
    };
    const yer = (k: string, parcalar?: { adet: number; kaynak: { tur: 'makine' | 'kisi'; id: number }; motorBolmesi: boolean }[]) =>
      ({ k, anahtar: `E${k}|10`, kaynak: { tur: 'makine' as const, id: 5 }, baslangic: planAni(b, 3), bitis: planAni(b, 4), kilitli: false, ...(parcalar ? { parcalar } : {}) });
    const r = taslaktanCalismaya(deger, [
      yer('x', [{ adet: 7, kaynak: { tur: 'makine', id: 5 }, motorBolmesi: false }, { adet: 3, kaynak: { tur: 'kisi', id: 9 }, motorBolmesi: false }]),
      yer('y'),
      yer('z', [{ adet: 5, kaynak: { tur: 'makine', id: 5 }, motorBolmesi: true }, { adet: 5, kaynak: { tur: 'makine', id: 6 }, motorBolmesi: true }]),
      yer('t'),
    ])!;
    assert.deepEqual((r.deger as { elleBol: unknown }).elleBol, { x: [{ adet: 7, m: '5' }, { adet: 3, m: 'kisi-9' }], t: [{ adet: 10, m: '5' }] });
    assert.equal((taslaktanCalismaya({ D: { meta: { baslangic: b } }, plan: { ops: { x: { S: 1, C: 2, m: '5' } } } }, [yer('x')])!.deger as { elleBol?: unknown }).elleBol, undefined,
      'bölmesiz çalışmaya alan eklenmez');
  });
});
