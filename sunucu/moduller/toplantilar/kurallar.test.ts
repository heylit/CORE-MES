import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GOREVI_VAR, KAPALI_AKSIYON, PROJESIZ, baslamisMi, degisiklikOzeti, goreveCevirmeReddi, goruntulerMi, gorevTarihleri, katilimciFarki,
  konuSutunlari, konuTuru, planlandiMi, tekGunMu, zamanAraligi,
} from './kurallar.ts';

test('TOP-1: toplantı tesis saatiyle aynı gün biter', () => {
  assert.equal(tekGunMu('2026-11-21T06:30:00Z', '2026-11-21T07:15:00Z'), true);
  // 23:30-00:30 tesis saati (UTC+3): iki gün.
  assert.equal(tekGunMu('2026-11-21T20:30:00Z', '2026-11-21T21:30:00Z'), false);
});

test('TOP-2, TOP-3: yalnız planlanan değişir; yapıldı başlangıçtan sonra', () => {
  assert.deepEqual(['planlandi', 'yapildi', 'iptal'].map((d) => planlandiMi(d as 'planlandi')), [true, false, false]);
  assert.equal(baslamisMi('2026-11-21T06:30:00Z', '2026-11-21T06:29:59Z'), false);
  assert.equal(baslamisMi('2026-11-21T06:30:00Z', '2026-11-21T06:30:00Z'), true);
});

test('TOP-5: aksiyon yalnız projeli toplantıda, açıkken ve görevi yokken göreve çevrilir', () => {
  assert.equal(goreveCevirmeReddi({ projeId: null, aksiyonDurumu: 'acik', gorevVar: false }), PROJESIZ);
  assert.equal(goreveCevirmeReddi({ projeId: 4, aksiyonDurumu: 'bitti', gorevVar: false }), KAPALI_AKSIYON);
  assert.equal(goreveCevirmeReddi({ projeId: 4, aksiyonDurumu: 'acik', gorevVar: true }), GOREVI_VAR);
  assert.equal(goreveCevirmeReddi({ projeId: 4, aksiyonDurumu: 'acik', gorevVar: false }), null);
});

test('TOP-6: düzenleyen, katılımcı ve toplantilar.oku görür; başkası görmez', () => {
  const kisi = { id: 7, islemler: [] as string[] };
  assert.equal(goruntulerMi(kisi, 7, false), true);
  assert.equal(goruntulerMi(kisi, 8, true), true);
  assert.equal(goruntulerMi(kisi, 8, false), false);
  assert.equal(goruntulerMi({ id: 7, islemler: ['toplantilar.oku'] }, 8, false), true);
  assert.equal(goruntulerMi({ id: 7, islemler: ['toplantilar.yaz'] }, 8, false), false);
});

test('TOP-7: konu tek sütundur, geri okunur', () => {
  for (const konu of [{ tur: 'proje', id: 3 }, { tur: 'uretim-emri', id: 4 }, { tur: 'firma', id: 5 }, { tur: 'serbest' }] as const) {
    const sutun = konuSutunlari(konu);
    assert.equal(Object.values(sutun).filter((v) => v !== null).length, konu.tur === 'serbest' ? 0 : 1);
    assert.equal(konuTuru(sutun), konu.tur);
  }
});

test('TOP-8, TOP-9: zaman aralığı tesis saatiyle; saat değişince önceki aralık yazılır', () => {
  assert.equal(zamanAraligi('2026-11-21T06:30:00Z', '2026-11-21T07:15:00Z'), '21.11.2026 09:30-10:15');
  const eski = { baslik: 'Haftalık', baslangic: '2026-11-21T06:30:00Z', bitis: '2026-11-21T07:15:00Z', yer: 'Salon' };
  assert.deepEqual(degisiklikOzeti(eski, { ...eski, yer: 'Ofis' }), { degisenler: ['yer'], zaman: '21.11.2026 09:30-10:15' });
  // Aynı an, farklı yazım: saat değişmedi.
  assert.deepEqual(degisiklikOzeti(eski, { ...eski, baslangic: '2026-11-21T09:30:00+03:00' }).degisenler, []);
  assert.deepEqual(degisiklikOzeti(eski, { ...eski, bitis: '2026-11-21T07:45:00Z', baslik: 'Aylık' }), {
    degisenler: ['saat', 'başlık'], zaman: '21.11.2026 09:30-10:45 (önceki: 21.11.2026 09:30-10:15)',
  });
});

test('TOP-10: davet eklenene, değişiklik kalana, iptal çıkana', () => {
  assert.deepEqual(katilimciFarki([1, 2, 3], [3, 4, 2]), { eklenen: [4], kalan: [3, 2], cikan: [1] });
});

test('TOP-11: görevin planı bugünden son tarihe; geçmiş son tarihte tek gün', () => {
  assert.deepEqual(gorevTarihleri('2026-11-19', '2026-11-28'), { planBaslangic: '2026-11-19', planBitis: '2026-11-28' });
  assert.deepEqual(gorevTarihleri('2026-11-19', '2026-11-10'), { planBaslangic: '2026-11-10', planBitis: '2026-11-10' });
});
