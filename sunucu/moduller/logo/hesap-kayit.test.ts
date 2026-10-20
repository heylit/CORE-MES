import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  eklemeGovdesi, geriCekilmeMs, iskontoAciklamasi, iskontoluFiyat, listeOkunmaliMi, logoBirimKodu, logoTarihi, satirEslemesi, satisTeklifiGovdesi, siparisGovdesi,
} from './kurallar.ts';
import type { GonderilecekKart, GonderilecekSatisTeklifi, GonderilecekSiparis, SiparisGovdeSecenegi } from './kurallar.ts';

// Bugünkü davranışın kaydı: düzeltmeden önce çıktılar sabitlenir, değişiklik bu testleri bilerek günceller.

test('LG-HESAP: iskontolu fiyat dört ondalık, yarım yukarı; %100 sıfır, %100 üstü null', () => {
  assert.deepEqual([iskontoluFiyat('120', '5'), iskontoluFiyat('100', '0'), iskontoluFiyat('99.99', '12.5'), iskontoluFiyat('100', '100'), iskontoluFiyat('100', '150')],
    ['114', '100', '87.4913', '0', null]);
});

test('LG-HESAP: iskonto açıklaması sıfırda yazılmaz', () => {
  assert.deepEqual([iskontoAciklamasi('5'), iskontoAciklamasi('0')], ['(isk. %5)', null]);
});

test('LG-HESAP: Logo tarihi yalnız ISO tarihten çıkar; saatli ya da bozuk değer null', () => {
  assert.deepEqual([logoTarihi('2026-10-15'), logoTarihi('2026-10-15T21:30:00Z'), logoTarihi('bozuk')], ['15.10.2026', null, null]);
});

test('LG-HESAP: birim kodu kırpılır ve büyük harfe çevrilir', () => {
  assert.deepEqual([logoBirimKodu(' kg '), logoBirimKodu('adet')], ['KG', 'ADET']);
});

test('LG-HESAP: geri çekilme 30 sn ile başlar, katlanır, 30 dk ile sınırlanır', () => {
  assert.deepEqual([0, 1, 2, 5, 10, 20].map(geriCekilmeMs), [30000, 30000, 60000, 480000, 1800000, 1800000]);
});

test('LG-HESAP: liste hiç okunmamışsa ya da bir saati geçmişse okunur', () => {
  const simdi = new Date('2026-10-15T10:00:00Z');
  assert.deepEqual([
    listeOkunmaliMi(null, null, simdi), listeOkunmaliMi(new Date('2026-10-15T09:30:00Z'), null, simdi), listeOkunmaliMi(new Date('2026-10-15T08:30:00Z'), null, simdi),
  ], [true, false, true]);
});

test('LG-HESAP: satır eşlemesi sırayla yapılır; sayı tutmazsa null', () => {
  assert.deepEqual(satirEslemesi([{ satirId: 1 }, { satirId: 2 }], [101, 102]), [{ satirId: 1, logoSatirRef: '101' }, { satirId: 2, logoSatirRef: '102' }]);
  assert.equal(satirEslemesi([{ satirId: 1 }], [101, 102]), null);
});

const BIRIMLER = new Set(['ADET', 'KG']);
const KART: GonderilecekKart = { tur: 'malzeme', stokKodu: ' KYT-001 ', ad: ' Kayit Malzeme A ', logoKartTuru: '10', logoBirimSeti: 'ADET' };

test('LG-HESAP: kart gövdesi KDV oranını alış ve satışa aynı yazar; oran boşsa KDV alanı yok', () => {
  assert.deepEqual(eklemeGovdesi(KART, { kdv: 20, gecerliBirimler: BIRIMLER }),
    { govde: { code: 'KYT-001', name: 'Kayit Malzeme A', cardType: 10, unitSetCode: 'ADET', auxilCode: 'TMI', vat: 20, sellVat: 20 } });
  assert.deepEqual(eklemeGovdesi(KART, { kdv: null, gecerliBirimler: BIRIMLER }),
    { govde: { code: 'KYT-001', name: 'Kayit Malzeme A', cardType: 10, unitSetCode: 'ADET', auxilCode: 'TMI' } });
});

test('LG-HESAP: kart gövdesi hizmeti, listede olmayan birimi ve kart türünü reddeder', () => {
  assert.deepEqual(eklemeGovdesi({ ...KART, logoBirimSeti: 'LT' }, { kdv: 20, gecerliBirimler: BIRIMLER }),
    { hata: 'Geçersiz karşılık: birim seti LT Logo birim seti listesinde yok.' });
  assert.deepEqual(eklemeGovdesi({ ...KART, tur: 'hizmet' }, { kdv: 20, gecerliBirimler: BIRIMLER }), { hata: 'Hizmet kartı malzeme olarak gönderilmez.' });
  assert.deepEqual(eklemeGovdesi({ ...KART, logoKartTuru: '99' }, { kdv: 20, gecerliBirimler: BIRIMLER }),
    { hata: 'Geçersiz karşılık: tür karşılığı Logo kart türlerinden biri olmalı (10, 11, 12, 13, 4, 1).' });
});

const SIPARIS: GonderilecekSiparis = {
  id: 1, no: 'SA-0001', tarih: '2026-10-15', paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '10', termin: '2026-10-30',
  satirlar: [
    { satirId: 1, stokKodu: 'KYT-001', hizmet: false, miktar: '2.5', birim: 'kg', birimFiyat: '99.99' },
    { satirId: 2, stokKodu: 'KYT-H1', hizmet: true, miktar: '1', birim: 'adet', birimFiyat: '150' },
  ],
};
const SECENEK: SiparisGovdeSecenegi = { cariKodu: 'CARI-A', kdv: 20, hizmetKdv: 10 };

test('LG-HESAP: TL sipariş: iskonto fiyata yedirilir, malzeme ve hizmet KDV ayrı, döviz alanı yok', () => {
  assert.deepEqual(siparisGovdesi(SIPARIS, SECENEK), {
    govde: {
      number: 'SA-0001', date: '15.10.2026', arpCode: 'CARI-A', orderStatus: 4, lines: [
        { type: 0, masterCode: 'KYT-001', quantity: 2.5, price: 89.991, unitCode: 'KG', vatRate: 20, dueDate: '30.10.2026', description: '(isk. %10)' },
        { type: 4, masterCode: 'KYT-H1', quantity: 1, price: 135, unitCode: 'ADET', vatRate: 10, dueDate: '30.10.2026', description: '(isk. %10)' },
      ],
    },
  });
});

test('LG-HESAP: dövizli sipariş: döviz türü ve kur yazılır; KDV ayarı boşsa KDV alanı yok', () => {
  assert.deepEqual(siparisGovdesi({ ...SIPARIS, paraBirimi: 'usd', kur: '32.5', iskontoYuzdesi: '0', termin: null }, { cariKodu: 'CARI-A', kdv: null, hizmetKdv: null }), {
    govde: {
      number: 'SA-0001', date: '15.10.2026', arpCode: 'CARI-A', orderStatus: 4, currencyCode: 1, rate: 32.5, lines: [
        { type: 0, masterCode: 'KYT-001', quantity: 2.5, price: 99.99, unitCode: 'KG' },
        { type: 4, masterCode: 'KYT-H1', quantity: 1, price: 150, unitCode: 'ADET' },
      ],
    },
  });
});

test('LG-HESAP: sipariş gövdesi tanımsız döviz, sıfır miktar ve boş cari kodunu reddeder', () => {
  assert.deepEqual(siparisGovdesi({ ...SIPARIS, paraBirimi: 'GBP' }, SECENEK), { hata: 'Para birimi GBP için Logo döviz türü tanımlı değil.' });
  assert.deepEqual(siparisGovdesi({ ...SIPARIS, satirlar: [{ ...SIPARIS.satirlar[0]!, miktar: '0' }] }, SECENEK), { hata: 'Satır 1: miktar sıfırdan büyük olmalı.' });
  assert.deepEqual(siparisGovdesi(SIPARIS, { ...SECENEK, cariKodu: ' ' }), { hata: 'Firmanın Logo cari kodu yok.' });
});

const TEKLIF: GonderilecekSatisTeklifi = {
  id: 1, no: 'ST-0001', tarih: '2026-10-15', gecerlilikBitis: '2026-11-15', paraBirimi: 'EUR', kur: '0',
  satirlar: [
    { satirId: 1, stokKodu: 'KYT-001', hizmet: false, miktar: '3', birim: 'adet', birimFiyat: '12.34567', iskontoYuzdesi: '7.5', termin: '2026-10-20' },
    { satirId: 2, stokKodu: 'KYT-H1', hizmet: true, miktar: '1', birim: 'adet', birimFiyat: '50', iskontoYuzdesi: '0', termin: null },
  ],
};

test('LG-HESAP: satış teklifinde iskonto ayrı alandır, fiyat dört ondalığa yuvarlanır, sıfır kur yazılmaz', () => {
  assert.deepEqual(satisTeklifiGovdesi(TEKLIF, SECENEK), {
    govde: {
      number: 'ST-0001', date: '15.10.2026', arpCode: 'CARI-A', status: 1, validUntil: '15.11.2026', currencyCode: 20, lines: [
        { type: 0, masterCode: 'KYT-001', quantity: 3, price: 12.3457, unitCode: 'ADET', discountRate: 7.5, vatRate: 20, dueDate: '20.10.2026' },
        { type: 4, masterCode: 'KYT-H1', quantity: 1, price: 50, unitCode: 'ADET', vatRate: 10 },
      ],
    },
  });
});

test('LG-HESAP: TL teklifte döviz ve geçerlilik yok; hizmet KDV boşsa yazılmaz; %100 üstü iskonto reddedilir', () => {
  assert.deepEqual(satisTeklifiGovdesi({ ...TEKLIF, paraBirimi: 'TL', gecerlilikBitis: null }, { cariKodu: 'CARI-A', kdv: 20, hizmetKdv: null }), {
    govde: {
      number: 'ST-0001', date: '15.10.2026', arpCode: 'CARI-A', status: 1, lines: [
        { type: 0, masterCode: 'KYT-001', quantity: 3, price: 12.3457, unitCode: 'ADET', discountRate: 7.5, vatRate: 20, dueDate: '20.10.2026' },
        { type: 4, masterCode: 'KYT-H1', quantity: 1, price: 50, unitCode: 'ADET' },
      ],
    },
  });
  assert.deepEqual(satisTeklifiGovdesi({ ...TEKLIF, satirlar: [{ ...TEKLIF.satirlar[0]!, iskontoYuzdesi: '101' }] }, SECENEK), { hata: 'Satır 1: iskonto 0-100 olmalı.' });
});
