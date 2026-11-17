import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { adaySirala, artikOlcusu, artikPayi, karsilanan, olcuEslestir, payMm, type EslesmeAdayi, type OlcuIstegi } from './olcu-kurallar.ts';

const pay = { tur: 'yuzde', deger: 15, enAzMm: 3 } as const;
const cubuk = (o: Partial<OlcuIstegi> = {}): OlcuIstegi => ({ form: 'cubuk', olcu: { d: 50 }, parcaBoyu: 180, parcaEni: null, adet: 40, pay, kesmeMm: 3, ...o });
const stok = (olcu: Record<string, number>, miktar: number, birim = 'adet', a: Partial<EslesmeAdayi> = {}): EslesmeAdayi =>
  ({ kaynak: 'stok', olcu, miktar, birim, yogunluk: null, ilkGiris: null, ...a });

describe('stok kontrol: ölçüyle eşleştirme (3398)', () => {
  test('fazla pay: yüzde en az mm, mm, tam', () => {
    assert.equal(payMm(pay, 50), 7.5);
    assert.equal(payMm(pay, 10), 3);
    assert.equal(payMm({ tur: 'mm', deger: 5, enAzMm: 0 }, 50), 5);
    assert.equal(payMm({ tur: 'tam', deger: 15, enAzMm: 3 }, 50), 0);
  });

  test('çubuk: aynı çap tam, pay içinde büyük yakın, pay dışı ve küçük ayrılır', () => {
    assert.equal(olcuEslestir(cubuk(), stok({ d: 50, l: 3000 }, 1))?.durum, 'tam');
    const yakin = olcuEslestir(cubuk(), stok({ d: 55, l: 3000 }, 3));
    assert.equal(yakin?.durum, 'yakin');
    assert.deepEqual(yakin?.fazla, { d: 5 });
    assert.equal(yakin?.fireYuzde, 21);
    assert.equal(olcuEslestir(cubuk(), stok({ d: 70, l: 3000 }, 1))?.durum, 'pay-disi');
    assert.equal(olcuEslestir(cubuk(), stok({ d: 45, l: 3000 }, 1)), null);
    assert.equal(olcuEslestir(cubuk({ pay: { tur: 'tam', deger: 0, enAzMm: 0 } }), stok({ d: 55, l: 3000 }, 1))?.durum, 'pay-disi');
  });

  test('parça sayısı: adet boy başına, metre toplam boydan, bilinmeyen birim null', () => {
    // 3000 / 183 = 16 parça (son kesimden kalan 72 mm)
    assert.equal(olcuEslestir(cubuk(), stok({ d: 50, l: 3000 }, 2))?.parcaSayisi, 32);
    assert.equal(olcuEslestir(cubuk(), stok({ d: 50, l: 3000 }, 6, 'm'))?.parcaSayisi, 32);
    assert.equal(olcuEslestir(cubuk(), stok({ d: 50, l: 3000 }, 10, 'torba'))?.parcaSayisi, null);
    assert.equal(olcuEslestir(cubuk({ parcaBoyu: null }), stok({ d: 50, l: 3000 }, 2))?.parcaSayisi, null);
    // kg: yoğunluk 7,85 g/cm³, Ø50 kesit ~1963 mm², 1 m ~15,4 kg
    assert.equal(olcuEslestir(cubuk(), stok({ d: 50, l: 3000 }, 15.42, 'kg', { yogunluk: 7.85 }))?.parcaSayisi, 5);
    assert.equal(olcuEslestir(cubuk(), stok({ d: 50, l: 3000 }, 15.42, 'kg'))?.parcaSayisi, null);
  });

  test('parçadan kısa artık önerilmez', () => {
    assert.equal(olcuEslestir(cubuk(), stok({ d: 50, l: 120 }, 1, 'adet', { kaynak: 'artik' })), null);
    assert.equal(olcuEslestir(cubuk(), stok({ d: 50, l: 1250 }, 1, 'adet', { kaynak: 'artik' }))?.parcaSayisi, 6);
  });

  test('levha: kalınlık kesit, plaka iki yönde yerleşir', () => {
    const levha: OlcuIstegi = { form: 'levha', olcu: { t: 20 }, parcaBoyu: 400, parcaEni: 300, adet: 6, pay, kesmeMm: 0 };
    assert.equal(olcuEslestir(levha, stok({ t: 20, w: 600, l: 800 }, 1))?.parcaSayisi, 4);
    assert.equal(olcuEslestir(levha, stok({ t: 22, w: 1000, l: 2000 }, 1))?.durum, 'yakin');
    assert.equal(olcuEslestir(levha, stok({ t: 20, w: 250, l: 800 }, 1)), null);
  });

  test('lama döndürülür; boruda iç çap istenenden büyük olamaz', () => {
    const lama: OlcuIstegi = { form: 'lama', olcu: { a: 40, b: 10 }, parcaBoyu: 100, parcaEni: null, adet: null, pay, kesmeMm: 3 };
    assert.equal(olcuEslestir(lama, stok({ a: 10, b: 40, l: 1000 }, 1))?.durum, 'tam');
    const boru: OlcuIstegi = { form: 'boru', olcu: { D: 60, t: 5 }, parcaBoyu: 250, parcaEni: null, adet: 12, pay, kesmeMm: 3 };
    assert.equal(olcuEslestir(boru, stok({ D: 60, t: 4, l: 6000 }, 1)), null);
    assert.equal(olcuEslestir(boru, stok({ D: 60, t: 6, l: 6000 }, 1))?.durum, 'yakin');
    assert.equal(olcuEslestir(boru, stok({ D: 60, t: 5, l: 6000 }, 1))?.durum, 'tam');
  });

  test('sıra: artık, tam, yakın en az fire, ilk giren; pay dışı sonda; karşılanan gerekende durur', () => {
    const l = adaySirala([
      { ad: 'yakin21', kaynak: 'stok', durum: 'yakin', fireYuzde: 21, ilkGiris: '2026-01-01', parcaSayisi: 48 },
      { ad: 'disi', kaynak: 'stok', durum: 'pay-disi', fireYuzde: 96, ilkGiris: '2025-01-01', parcaSayisi: 16 },
      { ad: 'tam-yeni', kaynak: 'stok', durum: 'tam', fireYuzde: 0, ilkGiris: '2026-05-01', parcaSayisi: 16 },
      { ad: 'tam-eski', kaynak: 'stok', durum: 'tam', fireYuzde: 0, ilkGiris: '2026-02-01', parcaSayisi: 16 },
      { ad: 'artik', kaynak: 'artik', durum: 'tam', fireYuzde: 0, ilkGiris: '2026-09-01', parcaSayisi: 6 },
    ] as const);
    assert.deepEqual(l.map((x) => x.ad), ['artik', 'tam-eski', 'tam-yeni', 'yakin21', 'disi']);
    assert.equal(karsilanan(40, l), 40);
    assert.equal(karsilanan(100, l), 86);
    assert.equal(karsilanan(null, l), null);
    assert.equal(karsilanan(5, [{ durum: 'tam', parcaSayisi: null }]), null);
  });

  test('artık ölçüsü kartın ölçüsünden, kalan boy kartı aşamaz', () => {
    assert.deepEqual(artikOlcusu('cubuk', { d: 50, l: 3000 }, 1250, null), { olcu: { d: 50, l: 1250 } });
    assert.ok('hata' in artikOlcusu('cubuk', { d: 50, l: 3000 }, 3500, null));
    assert.ok('hata' in artikOlcusu('cubuk', { l: 3000 }, 1000, null));
    assert.ok('hata' in artikOlcusu('levha', { t: 20, w: 1000, l: 2000 }, 800, null));
    assert.deepEqual(artikOlcusu('levha', { t: 20, w: 1000, l: 2000 }, 800, 600), { olcu: { t: 20, w: 600, l: 800 } });
    assert.ok('hata' in artikOlcusu('blok', { a: 1, b: 1, h: 1 }, 10, null));
  });

  test('artık payı stok biriminde: adet bir boy, m boyu, kg hacim ve yoğunluk; bilinmeyende null', () => {
    assert.equal(artikPayi('cubuk', { d: 50, l: 1250 }, 2, 'adet', null), 2);
    assert.equal(artikPayi('cubuk', { d: 50, l: 1250 }, 2, 'm', null), 2.5);
    assert.equal(Math.round(artikPayi('cubuk', { d: 50, l: 1000 }, 1, 'kg', 7.85)! * 100) / 100, 15.41);
    assert.equal(artikPayi('cubuk', { d: 50, l: 1000 }, 1, 'kg', null), null);
    assert.equal(artikPayi('levha', { t: 20, w: 600, l: 800 }, 1, 'm', null), null);
    assert.equal(artikPayi('cubuk', { d: 50, l: 1000 }, 1, 'torba', null), null);
  });
});
