import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  KARNE_BILESENLERI, KARNE_SINIF_ALT_SINIRLARI, LOT_KARARLARI, LOT_KARAR_PUANI, hizmetPuaniGovdesi, karneCevabi, karneOlayi,
  karneAgirlikGovdesi, yillikKarneGovdesi,
} from './musteri-tedarikci.ts';

const ZAMAN = '2026-10-30T09:00:00+03:00';

test('ağırlık gövdesi toplamı 100 ister, sınıf eşikleri azalarak sıralıdır (2456, 1260 a)', () => {
  const agirliklar = { lot: 25, ppm: 15, zamaninda: 25, tam: 10, teklif: 5, satinAlma: 10, kalite: 10 };
  assert.equal(karneAgirlikGovdesi.safeParse({ surum: 2, agirliklar, gerekce: 'deneme' }).success, true);
  assert.equal(karneAgirlikGovdesi.safeParse({ surum: 2, agirliklar: { ...agirliklar, lot: 26 }, gerekce: 'deneme' }).success, false);
  assert.equal(karneAgirlikGovdesi.safeParse({ surum: 2, agirliklar: { ...agirliklar, lot: -5, ppm: 45 }, gerekce: 'deneme' }).success, false);
  assert.equal(karneAgirlikGovdesi.safeParse({ surum: 2, agirliklar, gerekce: ' ' }).success, false);
  assert.equal(Object.keys(agirliklar).length, KARNE_BILESENLERI.length);
  const esikler = Object.values(KARNE_SINIF_ALT_SINIRLARI);
  assert.deepEqual([...esikler].sort((a, b) => b - a), esikler);
  assert.equal(esikler.at(-1), 0);
});

test('her lot kararının puanı vardır ve 0 ile 1 arasındadır', () => {
  for (const karar of LOT_KARARLARI) {
    const puan = LOT_KARAR_PUANI[karar];
    assert.ok(puan >= 0 && puan <= 1, karar);
  }
});

test('karne olayı türüne göre ayrılır; eksik ya da yabancı alan reddedilir', () => {
  const teslim = { kaynak: 'satin-alma', anahtar: 'teslim:7', firmaId: 3, zaman: ZAMAN, tur: 'teslim', termin: '2026-10-28', teslimGunu: '2026-10-30', tam: true };
  assert.deepEqual(karneOlayi.parse(teslim), teslim);
  const lot = { kaynak: 'kalite-merkezi', anahtar: 'lot:9', firmaId: 3, zaman: ZAMAN, tur: 'lot', karar: 'iade' };
  assert.deepEqual(karneOlayi.parse(lot), lot);
  assert.equal(karneOlayi.safeParse({ ...lot, karar: 'hurda' }).success, false);
  assert.equal(karneOlayi.safeParse({ ...teslim, tam: undefined }).success, false);
  assert.equal(karneOlayi.safeParse({ ...lot, kaynak: 'finans' }).success, false);
  assert.equal(karneOlayi.safeParse({ ...lot, anahtar: ' ' }).success, false);
  assert.equal(karneOlayi.safeParse({ ...lot, firmaId: 0 }).success, false);
});

test('hizmet puanı 1-5 tam sayıdır, boş not null olur', () => {
  assert.deepEqual(hizmetPuaniGovdesi.parse({ puan: 4, not: ' ' }), { puan: 4, not: null });
  for (const puan of [0, 6, 3.5]) assert.equal(hizmetPuaniGovdesi.safeParse({ puan }).success, false, String(puan));
});

test('yıllık karne gövdesi puan taşımaz; puanı sunucu hesaplar', () => {
  assert.deepEqual(yillikKarneGovdesi.parse({ yil: 2026, puan: 100 }), { yil: 2026, not: null });
  assert.equal(yillikKarneGovdesi.safeParse({ yil: 1999 }).success, false);
});

test('yetersiz veride puan ve sınıf null taşınır, sıfır uydurulmaz', () => {
  const cevap = karneCevabi.parse({
    karne: {
      firmaId: 3, donemBasi: '2025-10-30', donemSonu: '2026-10-30',
      teslim: { toplam: 1, zamaninda: 1, tam: 1, oran: null }, kalite: { lot: 0, kararlar: {}, puan: null },
      hizmet: { sayi: 0, ortalama: null, puan: null }, kaliteDegerlendirmesi: { sayi: 0, ortalama: null, puan: null },
      bilesenler: KARNE_BILESENLERI.map((anahtar) => ({ anahtar, deger: null, agirlik: 0, etkinAgirlik: null })),
      gruplar: { kalite: null, teslim: null, elle: null }, hesapSurumu: 2,
      puan: null, sinif: null, yetersizVeri: true,
    },
    yillikKarneler: [],
    hizmetPuanlari: [],
  });
  assert.equal(cevap.karne.puan, null);
  assert.equal(karneCevabi.shape.karne.shape.puan.safeParse(101).success, false);
});
