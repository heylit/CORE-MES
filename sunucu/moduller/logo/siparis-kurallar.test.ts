import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { satirRefleriniAyikla } from './kopru.ts';
import {
  FIS_NO_EN_COK, iskontoAciklamasi, iskontoluFiyat, logoBirimKodu, logoTarihi, satirEslemesi, SIPARIS_ALANLARI, SIPARIS_LOGO_DURUMU, siparisGovdesi,
} from './kurallar.ts';
import type { GonderilecekSiparis, SiparisGovdeSecenegi } from './kurallar.ts';

const siparis = (ek: Partial<GonderilecekSiparis> = {}): GonderilecekSiparis => ({
  id: 7, no: 'SP-2026-001', tarih: '2026-10-12', paraBirimi: 'TRY', kur: null, iskontoYuzdesi: '0', termin: '2026-10-20',
  satirlar: [
    { satirId: 11, stokKodu: 'HM-DEN-00001', hizmet: false, miktar: '12.5', birim: 'kg', birimFiyat: '100' },
    { satirId: 12, stokKodu: 'HZ-DEN-00001', hizmet: true, miktar: '1', birim: 'adet', birimFiyat: '250.5' },
  ],
  ...ek,
});
const secenek: SiparisGovdeSecenegi = { cariKodu: 'C-0001', kdv: 20, hizmetKdv: null };

describe('Logo satın alma siparişi gövdesi (kullanıcının köprü notu 2.3)', () => {
  test('LGS-1: gövde alan haritasından kurulur; tarih dd.MM.yyyy, durum 4, satır türü malzeme 0 / hizmet 4, birim büyük harf, termin satırda', () => {
    const r = siparisGovdesi(siparis(), secenek);
    assert.ok('govde' in r);
    assert.deepEqual(r.govde, {
      number: 'SP-2026-001', date: '12.10.2026', arpCode: 'C-0001', orderStatus: SIPARIS_LOGO_DURUMU,
      lines: [
        { type: 0, masterCode: 'HM-DEN-00001', quantity: 12.5, price: 100, unitCode: 'KG', vatRate: 20, dueDate: '20.10.2026' },
        { type: 4, masterCode: 'HZ-DEN-00001', quantity: 1, price: 250.5, unitCode: 'ADET', dueDate: '20.10.2026' },
      ],
    });
    assert.equal(SIPARIS_ALANLARI.satirlar, 'lines');
  });

  test('LGS-2: iskonto ayrı alan değildir (DISCPER yok): fiyata yedirilir, açıklamaya "(isk. %n)" yazılır', () => {
    const r = siparisGovdesi(siparis({ iskontoYuzdesi: '10.000' }), secenek);
    assert.ok('govde' in r);
    const satirlar = r.govde['lines'] as Record<string, unknown>[];
    assert.equal(satirlar[0]?.['price'], 90);
    assert.equal(satirlar[1]?.['price'], 225.45);
    assert.equal(satirlar[0]?.['description'], '(isk. %10)');
    assert.ok(satirlar.every((s) => !('DISCPER' in s) && !('discountRate' in s)));
  });

  test('LGS-2: iskontolu fiyat kayan noktasız, dört ondalık, yarım yukarı; geçersiz girdi null', () => {
    assert.equal(iskontoluFiyat('0.1', '0'), '0.1');
    assert.equal(iskontoluFiyat('33.3333', '33.333'), '22.2223');
    assert.equal(iskontoluFiyat('1.00005', '0'), '1.0001');
    assert.equal(iskontoluFiyat('100', '100'), '0');
    assert.equal(iskontoluFiyat('100', '100.5'), null);
    assert.equal(iskontoluFiyat('-1', '0'), null);
    assert.equal(iskontoAciklamasi('0.000'), null);
    assert.equal(iskontoAciklamasi('12.500'), '(isk. %12.5)');
  });

  test('LGS-3: döviz: USD 1, EUR 20 ve kur; TL döviz alanı taşımaz; tanımsız para birimi gövde vermez', () => {
    const usd = siparisGovdesi(siparis({ paraBirimi: 'USD', kur: '41.25' }), secenek);
    assert.ok('govde' in usd);
    assert.equal(usd.govde['currencyCode'], 1);
    assert.equal(usd.govde['rate'], 41.25);
    const eur = siparisGovdesi(siparis({ paraBirimi: 'EUR', kur: null }), secenek);
    assert.ok('govde' in eur);
    assert.equal(eur.govde['currencyCode'], 20);
    assert.equal('rate' in eur.govde, false);
    const tl = siparisGovdesi(siparis(), secenek);
    assert.ok('govde' in tl);
    assert.equal('currencyCode' in tl.govde, false);
    assert.deepEqual(siparisGovdesi(siparis({ paraBirimi: 'GBP' }), secenek), { hata: 'Para birimi GBP için Logo döviz türü tanımlı değil.' });
  });

  test('LGS-4 (ret): numara 1-16, tarih, cari kodu, satır, karta bağlı kalem, 24 karakter, pozitif miktar ve birim zorunlu', () => {
    const hata = (s: GonderilecekSiparis, o = secenek): string => {
      const r = siparisGovdesi(s, o);
      assert.ok('hata' in r, JSON.stringify(r));
      return r.hata;
    };
    const satir = siparis().satirlar[0]!;
    assert.match(hata(siparis({ no: 'X'.repeat(FIS_NO_EN_COK + 1) })), /Sipariş numarası 1-16/);
    assert.match(hata(siparis({ no: '  ' })), /Sipariş numarası/);
    assert.equal(hata(siparis({ tarih: '' })), 'Sipariş tarihi yok.');
    assert.equal(hata(siparis(), { ...secenek, cariKodu: null }), 'Firmanın Logo cari kodu yok.');
    assert.equal(hata(siparis({ satirlar: [] })), 'Siparişin satırı yok.');
    assert.equal(hata(siparis({ satirlar: [{ ...satir, stokKodu: null }] })), 'Satır 1: kalem malzeme kartına bağlı değil.');
    assert.match(hata(siparis({ satirlar: [{ ...satir, stokKodu: 'K'.repeat(25) }] })), /24 karakteri aşıyor/);
    assert.match(hata(siparis({ satirlar: [{ ...satir, miktar: '0' }] })), /miktar sıfırdan büyük/);
    assert.match(hata(siparis({ satirlar: [{ ...satir, birim: ' ' }] })), /birim yok/);
    // Sınırda geçer.
    assert.ok('govde' in siparisGovdesi(siparis({ no: 'X'.repeat(FIS_NO_EN_COK) }), secenek));
  });

  test('LGS-5: KDV malzeme satırında logo.kdv-orani, hizmet satırında logo.hizmet-kdv-orani; boşsa gönderilmez', () => {
    const r = siparisGovdesi(siparis(), { cariKodu: 'C', kdv: null, hizmetKdv: 10 });
    assert.ok('govde' in r);
    const satirlar = r.govde['lines'] as Record<string, unknown>[];
    assert.equal('vatRate' in satirlar[0]!, false);
    assert.equal(satirlar[1]?.['vatRate'], 10);
  });

  test('LGS-6: Logo satır kayıt numaraları sırayla eşlenir; sayı tutmazsa eşleme yok', () => {
    assert.deepEqual(satirEslemesi([{ satirId: 3 }, { satirId: 4 }], [901, 902]), [{ satirId: 3, logoSatirRef: '901' }, { satirId: 4, logoSatirRef: '902' }]);
    assert.equal(satirEslemesi([{ satirId: 3 }, { satirId: 4 }], [901]), null);
  });

  test('LGS-6: AddRich cevabından ve satır listesinden kayıt numaraları satır sırasıyla (lineNo) okunur; okunamayan biçim null', () => {
    assert.deepEqual(satirRefleriniAyikla({ success: true, logicalRef: 5, order: { logicalRef: 5, lines: [{ logicalRef: 9, lineNo: 2 }, { logicalRef: 8, lineNo: 1 }] } }), [8, 9]);
    assert.deepEqual(satirRefleriniAyikla([{ LOGICALREF: 4 }, { LOGICALREF: 6 }]), [4, 6]);
    assert.deepEqual(satirRefleriniAyikla({ data: [{ logicalRef: 1 }] }), [1]);
    assert.equal(satirRefleriniAyikla({ success: true, logicalRef: 5 }), null);
    assert.equal(satirRefleriniAyikla([{ logicalRef: 0 }]), null);
  });

  test('yardımcılar: Logo tarihi ve birim kodu', () => {
    assert.equal(logoTarihi('2026-01-05'), '05.01.2026');
    assert.equal(logoTarihi('05.01.2026'), null);
    assert.equal(logoBirimKodu(' adet '), 'ADET');
    assert.equal(logoBirimKodu('litre'), 'LİTRE');
  });
});
