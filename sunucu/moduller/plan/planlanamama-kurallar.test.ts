import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { NEDEN_DUZELTME_YERI, PLANLANAMAMA_NEDENLERI } from '#paylasilan/sozlesme/planlanamama-sabitleri.ts';
import { hedef, zamanNedeni, type ZamanAdayi } from './planlanamama-kurallar.ts';

// 2780: motorun 'zaman' nedeni (aday var, ufukta yer yok) aday tezgâhların ölçüsüyle tek nedene iner. Veriler uydurmadır.
const T1 = { tur: 'makine', id: 101, ad: 'Torna 1' } as const;
const T2 = { tur: 'makine', id: 102, ad: 'Torna 2' } as const;
const aday = (makine: ZamanAdayi['makine'], acikSaat: number, sureSaat = 4, personelYok = false): ZamanAdayi => ({ makine, acikSaat, sureSaat, personelYok });
const z = (adaylar: ZamanAdayi[], malzemeHazirSaat: number | null = null) => zamanNedeni({ ufukGun: 120, malzemeHazirSaat, adaylar });

describe('zaman nedeni (saf, 2780)', () => {
  test('PN-01: malzeme ufuk dışında hazırsa neden malzemedir (tezgâhtan önce)', () => {
    assert.deepEqual(z([aday(T1, 0)], 120 * 24), { kod: 'malzeme', metin: 'Malzemesi planlama ufkunda (120 gün) karşılanmıyor.', hedef: null });
    assert.deepEqual(z([aday(T1, 0)], Infinity).kod, 'malzeme');
    assert.notEqual(z([aday(T1, 0)], 120 * 24 - 1).kod, 'malzeme');
  });
  test('PN-02: hiçbir adayın ufukta açık saati yoksa takvim; tek aday adıyla, çok aday listeyle', () => {
    assert.deepEqual(z([aday(T1, 0)]), { kod: 'takvim-yok', metin: 'Torna 1 tezgâhının planlama ufkunda (120 gün) vardiyası yok.', hedef: T1 });
    assert.deepEqual(z([aday(T1, 0), aday(T2, 0)]).metin, 'Aday tezgâhların hiçbirinin planlama ufkunda (120 gün) vardiyası yok (Torna 1, Torna 2).');
  });
  test('PN-03: vardiyalı adayların hepsinde işçi yoksa kişi vardiyası; vardiyasız aday ölçüye girmez', () => {
    assert.deepEqual(z([aday(T1, 0), aday(T2, 100, 4, true)]), { kod: 'kisi-vardiyasiz', metin: 'Torna 2 tezgâhı için planlama ufkunda (120 gün) vardiyada çalışacak yetkin kişi yok.', hedef: T2 });
  });
  test('PN-04: işin süresi her uygun adayın açık süresinden uzunsa ufuk, en geniş tezgâhla', () => {
    const n = z([aday(T1, 10, 50), aday(T2, 20, 50)]);
    assert.deepEqual([n.kod, n.hedef], ['ufuk', T2]);
    assert.equal(n.metin, 'İşin süresi (50 sa) Torna 2 tezgâhının planlama ufkunda (120 gün) açık süresinden (20 sa) uzun.');
  });
  test('PN-05: süre sığıyor ama yer yoksa tezgâh doludur; adaysız ölçü bilinmiyor', () => {
    assert.deepEqual(z([aday(T1, 100)]), { kod: 'ufuk', metin: 'Torna 1 tezgâhı planlama ufkunda (120 gün) dolu.', hedef: T1 });
    assert.equal(z([aday(T1, 100), aday(T2, 100)]).metin, 'Aday tezgâhlar planlama ufkunda (120 gün) dolu (Torna 1, Torna 2).');
    assert.equal(z([]).kod, 'bilinmiyor');
  });
  test('PN-06: hedef yalnız pozitif tam sayı kimlikle kurulur; düzeltme tablosu her kodu kapsar', () => {
    assert.deepEqual(hedef('istasyon', '10', 'Torna'), { tur: 'istasyon', id: 10, ad: 'Torna' });
    for (const x of ['@3', 'kisi-5', 0, null, '']) assert.equal(hedef('makine', x, 'x'), null, String(x));
    assert.deepEqual(Object.keys(NEDEN_DUZELTME_YERI).sort(), [...PLANLANAMAMA_NEDENLERI].sort());
  });
});
