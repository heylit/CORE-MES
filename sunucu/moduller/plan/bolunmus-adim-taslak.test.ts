import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { calismaIsleri } from './planlama-kurallar.ts';
import { elleBolSilUygula, elleBolUygula } from './taslak-kurallar.ts';

// 3681 (C, D): başlamış adımın elle bölünmesi taslak kuralıdır. Çalışan tezgâh 1. paydır, sayımı olan payın tezgâhı bölmede kalır, pay adedi
// sayılanın altına inmez; bitmiş adım bölünmez. Sunucu denetler; ekran yalnız nedeni gösterir. Veriler uydurmadır.
const k = { kim: 'ORN-Planlamaci', sayfa: 'Kokpit', t: 1, kilitYetkisi: true };
type Gercek = { m: string; S: number; n?: number; paylar?: Record<string, number>; C?: number };
const calisma = (ek: { gercek?: Record<string, Gercek>; elleBol?: Record<string, unknown>; adet?: number } = {}) => ({
  D: {
    tezgahlar: [{ id: 'T1', kod: 'TZ-1' }, { id: 'T2', kod: 'TZ-2' }, { id: 'T3', kod: 'TZ-3' }],
    siparisler: [{ id: 'S1', urun: 'U', adet: ek.adet ?? 30 }],
    urunler: [{ id: 'U', rota: [{ k: '10', tezgahlar: [{ id: 'T1' }, { id: 'T2' }, { id: 'T3' }] }, { k: '20', fason: true, tezgahlar: [] }] }],
  },
  locks: {}, plan: { ops: {} }, gercek: ek.gercek ?? {}, ...(ek.elleBol ? { elleBol: ek.elleBol } : {}),
});
const bol = (paylar: [string, number][]) => ({ isId: 'S1.10', paylar: paylar.map(([tezgah, adet]) => ({ tezgah, adet })) });
const ileti = (r: ReturnType<typeof elleBolUygula>): string => ('hata' in r ? r.hata.ileti : 'gecti');
const yarim = (ek: Partial<Gercek> = {}): Record<string, Gercek> => ({ 'S1.10': { m: 'T1', S: 1, n: 8, ...ek } });

describe('3681 C: başlamış adımı bölme (taslak kuralı)', () => {
  test('başlamış, bölünmemiş adım: çalışan tezgâh 1. payda 8+11=19, ikinci pay 11; bölme çalışmanın elleBol\'una yazılır', () => {
    const r = elleBolUygula(calisma({ gercek: yarim() }), bol([['T1', 19], ['T2', 11]]), k);
    assert.ok('deger' in r && r.degisti, JSON.stringify(r));
    assert.deepEqual((r.deger as { elleBol: unknown }).elleBol, { 'S1.10': [{ adet: 19, m: 'T1' }, { adet: 11, m: 'T2' }] });
  });

  test('çalışan tezgâh 1. pay olmalı', () => {
    assert.equal(ileti(elleBolUygula(calisma({ gercek: yarim() }), bol([['T2', 11], ['T1', 19]]), k)), 'Çalışan tezgâh (TZ-1) 1. pay olmalı.');
  });

  test('çalışan payın adedi sayılanın altına indirilemez; sayılana eşit olabilir', () => {
    assert.equal(ileti(elleBolUygula(calisma({ gercek: yarim() }), bol([['T1', 7], ['T2', 23]]), k)), "Parça 1'in adedi sayılandan az (sayılan 8).");
    assert.ok('deger' in elleBolUygula(calisma({ gercek: yarim() }), bol([['T1', 8], ['T2', 22]]), k));
  });

  test('sayımı olan payın tezgâhı bölmede kalmalı: pay silinemez', () => {
    const g = yarim({ m: 'T2', n: 20, paylar: { T1: 15, T2: 5 } });
    assert.equal(ileti(elleBolUygula(calisma({ gercek: g }), bol([['T2', 15], ['T3', 15]]), k)), 'Başlamış payın tezgâhı (TZ-1) bölmede kalmalı; sayımı olan pay silinemez.');
    assert.ok('deger' in elleBolUygula(calisma({ gercek: g }), bol([['T2', 10], ['T1', 20]]), k), 'kalanı yeniden böl: 100 -> 15+5, çalışan -> 5+5');
  });

  test('fazla sayılan pay (18/15) kayıtlı bölmede aynen kalır; yeni komutta sayılanın altı reddedilir', () => {
    const g = yarim({ m: 'T1', n: 18, paylar: { T1: 18 } });
    const kayitli = { 'S1.10': [{ adet: 15, m: 'T1' }, { adet: 15, m: 'T2' }] };
    assert.ok('deger' in elleBolUygula(calisma({ gercek: g, elleBol: kayitli }), bol([['T1', 15], ['T2', 15]]), k), 'değişmemiş pay fazla sayılsa da reddedilmez');
    assert.equal(ileti(elleBolUygula(calisma({ gercek: g }), bol([['T1', 15], ['T2', 15]]), k)), "Parça 1'in adedi sayılandan az (sayılan 18).");
    assert.equal(ileti(elleBolUygula(calisma({ gercek: g, elleBol: kayitli }), bol([['T1', 14], ['T2', 16]]), k)), "Parça 1'in adedi sayılandan az (sayılan 18).");
  });

  test('bitmiş ve fason adım bölünmez; neden metni döner', () => {
    assert.equal(ileti(elleBolUygula(calisma({ gercek: { 'S1.10': { m: 'T1', S: 1, C: 9, n: 30 } } }), bol([['T1', 15], ['T2', 15]]), k)), 'Adım bitmiş; bölünmez.');
    assert.equal(ileti(elleBolUygula(calisma(), { isId: 'S1.20', paylar: [{ tezgah: 'T1', adet: 15 }, { tezgah: 'T2', adet: 15 }] }, k)), 'Fason adım elle bölünmez.');
  });

  test('rotada olmayan tezgâha verilen pay reddedilir ve neden döner', () => {
    assert.equal(ileti(elleBolUygula(calisma(), bol([['T1', 15], ['T9', 15]]), k)), 'T9 bu adıma uygun değil.');
  });

  test('bölmeyi kaldır: yalnız çalışan payda sayım varsa bütün adım olur; başka payda sayım varsa reddedilir', () => {
    const kayitli = { 'S1.10': [{ adet: 19, m: 'T1' }, { adet: 11, m: 'T2' }] };
    const r = elleBolSilUygula(calisma({ gercek: yarim(), elleBol: kayitli }), { isId: 'S1.10' }, k);
    assert.ok('deger' in r && r.degisti);
    const g = yarim({ m: 'T2', n: 20, paylar: { T1: 15, T2: 5 } });
    const red = elleBolSilUygula(calisma({ gercek: g, elleBol: kayitli }), { isId: 'S1.10' }, k);
    assert.ok('hata' in red && /Başka payda sayım var \(TZ-1\)/.test(red.hata.ileti), JSON.stringify(red));
  });

  test('başlamamış adımın bugünkü bölmesi değişmez', () => {
    assert.ok('deger' in elleBolUygula(calisma(), bol([['T2', 20], ['T3', 10]]), k));
    assert.equal(ileti(elleBolUygula(calisma(), bol([['T2', 20], ['T3', 9]]), k)), 'Parçaların toplamı 29; adımın adedi 30.');
  });
});

describe('3681: bölünmüş başlamış adım canlıya yazılır', () => {
  const kimlik = { 'O1.10': 'E1|10' };
  const op = (id: string, m: string, bitti = false) => ({ id, m, S: 1, C: 5, bitti });
  const planlanacak = new Set(['E1|10']);

  test('bir payı biten adıma dokunulmaz denmez: öteki paylar sürer, pay adetleri elle bölmeden gelir', () => {
    const elle = new Map([['O1.10', [{ adet: 20, m: '100' }, { adet: 10, m: '101' }]]]);
    const r = calismaIsleri([op('O1.10', '101'), op('O1.10~2', '100', true)], kimlik, planlanacak, elle, new Map([['E1|10', 30]]));
    assert.equal(r.dokunulmaz.size, 0);
    assert.deepEqual(r.yazilamaz, []);
    assert.deepEqual(r.yazilacak.map((y) => [y.parca?.no, y.parca?.adet, y.kaynak.id, y.parca?.motorBolmesi]), [[1, 10, 101, undefined], [2, 20, 100, undefined]], 'çalışan tezgâh 1. pay, adet kendi tezgâhının elle payından');
    assert.deepEqual(r.uyarilar, []);
  });

  test('bütün payları biten adım ve fasona giden adım değişmez', () => {
    const elle = new Map([['O1.10', [{ adet: 15, m: '100' }, { adet: 15, m: '101' }]]]);
    assert.equal(calismaIsleri([op('O1.10', '101', true), op('O1.10~2', '100', true)], kimlik, planlanacak, elle, new Map([['E1|10', 30]])).dokunulmaz.size, 1);
    assert.equal(calismaIsleri([op('O1.10', '@7')], kimlik, planlanacak).dokunulmaz.size, 1);
  });
});
