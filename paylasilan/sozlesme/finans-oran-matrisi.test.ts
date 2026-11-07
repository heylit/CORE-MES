import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ORAN_KULLANIMLARI, kurCiftiGovdesi, oranEkleGovdesi, oranTopluGovdesi, yillikFaizdenAylik, yillikFaizdenGunluk, yillikVadeIndirimCarpani,
} from './finans.ts';
import { aylikFaizdenGunluk } from './finansman.ts';

test('kur çifti: alış ve satış birlikte, satış alıştan küçük olamaz, TRY reddedilir', () => {
  const g = kurCiftiGovdesi.parse({ paraBirimi: 'usd', tarih: '2026-11-06', alis: 41.1, satis: 41.2 });
  assert.deepEqual(g, { paraBirimi: 'USD', tarih: '2026-11-06', alis: '41.100000', satis: '41.200000' });
  assert.equal(kurCiftiGovdesi.safeParse({ paraBirimi: 'USD', tarih: '2026-11-06', alis: 41.2, satis: 41.1 }).success, false);
  assert.equal(kurCiftiGovdesi.safeParse({ paraBirimi: 'USD', tarih: '2026-11-06', alis: 41.1 }).success, false);
  assert.equal(kurCiftiGovdesi.safeParse({ paraBirimi: 'TRY', tarih: '2026-11-06', alis: 1, satis: 1 }).success, false);
});

test('oran: tür kredi/mevduat/politika, yıllık 0-1000, dört ondalık, not isteğe bağlı', () => {
  assert.equal(oranEkleGovdesi.parse({ tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-11-01', yillikYuzde: 120.5 }).yillikYuzde, '120.5000');
  assert.equal(oranEkleGovdesi.parse({ tur: 'mevduat', paraBirimi: 'EUR', gecerlilikBaslangic: '2026-11-01', yillikYuzde: 1, not: '' }).not, null);
  assert.equal(oranEkleGovdesi.safeParse({ tur: 'aylik', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-11-01', yillikYuzde: 3 }).success, false);
  assert.equal(oranEkleGovdesi.safeParse({ tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-11-01', yillikYuzde: 1000.5 }).success, false);
  assert.equal(oranEkleGovdesi.safeParse({ tur: 'kredi', paraBirimi: 'TRY', gecerlilikBaslangic: '2026-11-01', yillikYuzde: 1.00001 }).success, false);
});

test('toplu: aynı tür, para birimi ve tarih ikinci kez reddedilir; kur satırı çifti denetler', () => {
  const satir = { tur: 'kredi', paraBirimi: 'TRY', tarih: '2026-11-01', yillikYuzde: 30 };
  assert.equal(oranTopluGovdesi.safeParse({ satirlar: [satir, { ...satir, tur: 'mevduat' }] }).success, true);
  assert.equal(oranTopluGovdesi.safeParse({ satirlar: [satir, satir] }).success, false);
  assert.equal(oranTopluGovdesi.safeParse({ satirlar: [{ tur: 'kur', paraBirimi: 'EUR', tarih: '2026-11-06', alis: 2, satis: 1 }] }).success, false);
});

test('yıllık çevirme basit faiz ve 365 gün: aylık x 12 ile aynı sonuç', () => {
  assert.equal(yillikFaizdenGunluk(36.5), 0.1);
  assert.equal(yillikFaizdenAylik(36), 3);
  assert.ok(Math.abs(yillikFaizdenGunluk(3 * 12) - aylikFaizdenGunluk(3)) < 1e-12);
  assert.ok(Math.abs(yillikVadeIndirimCarpani(36.5, 100) - 1 / 1.1) < 1e-12);
  assert.equal(yillikVadeIndirimCarpani(36.5, -5), 1);
});

test('kullanım matrisi kullanıcının kararlarıyla aynı', () => {
  assert.equal(ORAN_KULLANIMLARI.muhasebe.kur, 'alis');
  assert.equal(ORAN_KULLANIMLARI.satinAlmaMaliyeti.kur, 'satis');
  assert.deepEqual([...ORAN_KULLANIMLARI.satinAlmaVadesi.faizler], ['kredi', 'mevduat']);
  assert.deepEqual(ORAN_KULLANIMLARI.beklemeFinansmani, { faiz: 'kredi', paraBirimi: 'TRY' });
});
