import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  ALIS_TURLERI, degismeImleci, gorunenIrsaliyeTurleri, IRSALIYE_TUR_ADLARI, IRSALIYE_TURLERI, irsaliyeBeklemesiMs, irsaliyeEslesmesi, irsaliyeRefleriniAyikla,
  irsaliyeSayfasiniAyikla, KONSINYE_TURLERI, OKUMA_HATA_BEKLEME_MS, SATIS_TURLERI, sonrakiIrsaliyeSirasi,
} from './kurallar.ts';
import type { EslesmeGirdisi, EslesmeKaynaklari } from './kurallar.ts';

// 3345 a: Logo irsaliyeleri yalnız okunur; eşleşme saf kuraldır, hiçbir kayda yazmaz.
describe('Logo irsaliye kuralları', () => {
  test('TRCODE tablosu yardımcının çalışan koduyla aynıdır: 5 konsinye giriş, 4 konsinye çıkış iade; alış ve satış ayrılır', () => {
    assert.deepEqual([...IRSALIYE_TURLERI].sort((a, b) => a - b), [1, 3, 4, 5, 6, 8, 9, 10]);
    assert.equal(IRSALIYE_TUR_ADLARI[5], 'Konsinye giriş');
    assert.equal(IRSALIYE_TUR_ADLARI[4], 'Konsinye çıkış iade');
    assert.equal(IRSALIYE_TUR_ADLARI[1], 'Satın alma');
    assert.equal(IRSALIYE_TUR_ADLARI[6], 'Satın alma iade');
    assert.equal(IRSALIYE_TUR_ADLARI[8], 'Toptan satış');
    assert.equal(IRSALIYE_TUR_ADLARI[3], 'Satış iade');
    assert.deepEqual([...ALIS_TURLERI, ...SATIS_TURLERI].sort((a, b) => a - b), [1, 3, 4, 5, 6, 8, 9, 10], 'her tür tek yönde');
    assert.ok(ALIS_TURLERI.includes(5) && SATIS_TURLERI.includes(4));
  });

  test('ölçülmemiş konsinye türleri görünmez; ölçülünce görünür', () => {
    assert.deepEqual(gorunenIrsaliyeTurleri('alis'), [1, 6]);
    assert.deepEqual(gorunenIrsaliyeTurleri('satis'), [8, 3]);
    assert.deepEqual(gorunenIrsaliyeTurleri('alis', true), [1, 5, 6, 10]);
    assert.deepEqual(gorunenIrsaliyeTurleri('satis', true), [8, 9, 3, 4]);
    for (const t of KONSINYE_TURLERI) assert.ok(![...gorunenIrsaliyeTurleri('alis'), ...gorunenIrsaliyeTurleri('satis')].includes(t));
  });

  test('ayıklama: firma ve dönem yoksa okunamaz; beyaz liste dışı tür, kaydı ya da tarihi olmayan başlık atlanır; boş kur ve fiyat null kalır', () => {
    assert.equal(irsaliyeSayfasiniAyikla({ dispatches: [] }), null);
    assert.equal(irsaliyeSayfasiniAyikla([]), null);
    assert.equal(irsaliyeSayfasiniAyikla({ firm: 1, period: 2 }), null);
    const s = irsaliyeSayfasiniAyikla({
      firm: 1, period: 2,
      dispatches: [
        { logicalRef: 10, trCode: 1, ficheNo: ' ORN-1 ', docNumber: null, date: '2026-11-10', cancelled: false, warehouseNr: 0, arpCode: 'ORN-C', arpName: null,
          invoiceNo: null, eDespatch: true, modifiedAt: '2026-11-10T09:00:00.000', shipAddress: 'okunmaz', plate: 'okunmaz',
          lines: [{ logicalRef: 100, itemCode: 'ORN-M', quantity: 5, unitCode: 'ADET', price: null, currency: null, currencyPrice: null, orderLineRef: 77 }, { quantity: 1 }] },
        { logicalRef: 11, trCode: 7, date: '2026-11-10' },
        { logicalRef: 12, trCode: 8 },
        { trCode: 8, date: '2026-11-10' },
        'bozuk',
      ],
    });
    assert.ok(s);
    assert.equal(s.firma, 1);
    assert.equal(s.donem, 2);
    assert.equal(s.gelen, 5);
    assert.equal(s.atlanan, 4);
    assert.equal(s.basliklar.length, 1);
    const b = s.basliklar[0]!;
    assert.equal(b.fisNo, 'ORN-1');
    assert.equal(b.degisme, '2026-11-10T09:00:00.000');
    assert.ok(!('shipAddress' in b) && !JSON.stringify(b).includes('okunmaz'), 'sevk adresi ve plaka okunmaz');
    assert.deepEqual(b.satirlar, [{
      kayitNo: 100, malzemeKodu: 'ORN-M', malzemeAdi: null, miktar: '5', birim: 'ADET', fiyat: null, dovizTuru: null, dovizFiyati: null,
      siparisRef: null, siparisSatirRef: 77, siparisNo: null,
    }]);
    assert.deepEqual(irsaliyeRefleriniAyikla({ firm: 1, period: 2, refs: [1, 2, 0, -1, 'x'] }), { firma: 1, donem: 2, refler: [1, 2] });
    assert.equal(irsaliyeRefleriniAyikla({ refs: [] }), null);
  });

  test('değişme imleci yalnız ileri gider; eşit zamanda kayıt numarası karar verir; zamanı olmayan başlık oynatmaz', () => {
    const bas = { degisme: '2026-11-10T09:00:00.000', ref: 5 };
    assert.deepEqual(degismeImleci(bas, [{ degisme: '2026-11-09T09:00:00.000', kayitNo: 99 }, { degisme: null, kayitNo: 100 }]), bas);
    assert.deepEqual(degismeImleci(bas, [{ degisme: '2026-11-10T09:00:00.000', kayitNo: 6 }]), { degisme: '2026-11-10T09:00:00.000', ref: 6 });
    assert.deepEqual(degismeImleci({ degisme: null, ref: 0 }, [{ degisme: '2026-11-10T09:00:00.001', kayitNo: 1 }]), { degisme: '2026-11-10T09:00:00.001', ref: 1 });
  });

  test('tur sırası: yeniler bitince değişenler, onlar bitince saatte bir silinme denetimi', () => {
    const simdi = new Date('2026-11-16T10:00:00Z');
    assert.equal(sonrakiIrsaliyeSirasi('yeni', true, null, simdi), 'yeni');
    assert.equal(sonrakiIrsaliyeSirasi('yeni', false, null, simdi), 'degisen');
    assert.equal(sonrakiIrsaliyeSirasi('degisen', true, null, simdi), 'degisen');
    assert.equal(sonrakiIrsaliyeSirasi('degisen', false, null, simdi), 'refler');
    assert.equal(sonrakiIrsaliyeSirasi('degisen', false, new Date('2026-11-16T09:30:00Z'), simdi), 'yeni');
    assert.equal(sonrakiIrsaliyeSirasi('degisen', false, new Date('2026-11-16T09:00:00Z'), simdi), 'refler');
    assert.equal(sonrakiIrsaliyeSirasi('refler', false, null, simdi), 'yeni');
  });

  test('başarısız okumada bekleme her hatada artar, bir saatte durur', () => {
    assert.equal(irsaliyeBeklemesiMs(0), 0);
    assert.equal(irsaliyeBeklemesiMs(1), OKUMA_HATA_BEKLEME_MS);
    assert.equal(irsaliyeBeklemesiMs(2), 2 * OKUMA_HATA_BEKLEME_MS);
    assert.ok(irsaliyeBeklemesiMs(3) > irsaliyeBeklemesiMs(2));
    assert.equal(irsaliyeBeklemesiMs(50), 60 * 60_000);
  });

  describe('eşleşme', () => {
    const bos: EslesmeKaynaklari = { siparisSatirlari: new Map(), logoNetleri: new Map(), sevkler: new Map(), iadeMalKabulleri: new Map() };
    const alis = (satirlar: EslesmeGirdisi['satirlar'], ek: Partial<EslesmeGirdisi> = {}): EslesmeGirdisi =>
      ({ tur: 1, iptal: false, logodaYok: false, fisNo: 'ORN-1', belgeNo: null, satirlar, ...ek });
    const kaynak = (teslim: string, logoNet: string | null, birim = 'adet'): EslesmeKaynaklari => ({
      ...bos,
      siparisSatirlari: new Map([['77', { siparisSatiriId: 3, siparisNo: 'SP-2026-001', birim, teslim }]]),
      logoNetleri: logoNet === null ? new Map() : new Map([[77, logoNet]]),
    });
    const satir = { kayitNo: 100, miktar: '30', birim: 'ADET', siparisSatirRef: 77 };

    test('aynı sipariş satırında Logo net ve CORE net teslim eşitse eşleşti (birim büyük küçük harf duyarsız, ondalık yazımı fark etmez)', () => {
      const e = irsaliyeEslesmesi(alis([satir]), kaynak('30.0000', '30'));
      assert.equal(e.durum, 'eslesti');
      assert.deepEqual(e.satirlar[0], { kayitNo: 100, durum: 'eslesti', neden: null, core: { tur: 'siparis', id: 3, no: 'SP-2026-001' }, coreMiktari: '30', coreBirimi: 'adet' });
      assert.equal(e.ozet, 'Sipariş SP-2026-001');
    });

    test('kısmi kabul: iki irsaliyenin toplamı CORE teslimine eşitse ikisi de eşleşti; eksikse fark', () => {
      assert.equal(irsaliyeEslesmesi(alis([{ ...satir, miktar: '10' }]), kaynak('30', '30')).durum, 'eslesti', 'Logo net bütün irsaliyelerin toplamıdır');
      const e = irsaliyeEslesmesi(alis([satir]), kaynak('28', '30'));
      assert.equal(e.durum, 'fark');
      assert.equal(e.satirlar[0]?.neden, 'Logo net 30, CORE teslim 28');
      assert.equal(e.ozet, 'Sipariş SP-2026-001 · 1 satırda fark');
    });

    test('birim farklıysa çevrim yapılmaz, fark gösterilir', () => {
      const e = irsaliyeEslesmesi(alis([{ ...satir, birim: 'KG' }]), kaynak('30', '30'));
      assert.equal(e.durum, 'fark');
      assert.equal(e.satirlar[0]?.neden, 'Birim farklı: Logo KG, CORE adet');
    });

    test('siparişsiz satır ve CORE\'da olmayan sipariş satırı eşleşmedi; en kötü satır başlığın durumudur', () => {
      const e = irsaliyeEslesmesi(alis([satir, { ...satir, kayitNo: 101, siparisSatirRef: null }, { ...satir, kayitNo: 102, siparisSatirRef: 88 }]), kaynak('30', '30'));
      assert.deepEqual(e.satirlar.map((x) => [x.durum, x.neden]), [['eslesti', null], ['eslesmedi', 'Siparişsiz satır'], ['eslesmedi', 'Sipariş satırı CORE\'da yok']]);
      assert.equal(e.durum, 'eslesmedi');
      assert.equal(e.ozet, 'Sipariş SP-2026-001 · 2 satır eşleşmedi');
      assert.equal(irsaliyeEslesmesi(alis([]), bos).durum, 'eslesmedi');
    });

    test('Logo neti yoksa (satır aynada yok) fark', () => {
      assert.equal(irsaliyeEslesmesi(alis([satir]), kaynak('30', null)).satirlar[0]?.neden, 'Logo net yok, CORE teslim 30');
    });

    test('konsinye türleri karşılığı yok; iptal ve Logo\'da olmayan ayrı durumdur', () => {
      for (const tur of [4, 5, 9, 10] as const) assert.equal(irsaliyeEslesmesi(alis([satir], { tur }), kaynak('30', '30')).durum, 'karsiligi-yok');
      assert.equal(irsaliyeEslesmesi(alis([satir], { iptal: true }), kaynak('30', '30')).durum, 'iptal');
      assert.equal(irsaliyeEslesmesi(alis([satir], { logodaYok: true, iptal: true }), kaynak('30', '30')).durum, 'logoda-yok');
    });

    test('satış sevk işine, satış iadesi iade mal kabulüne fiş ya da belge numarasıyla bağlanır', () => {
      const sevk: EslesmeKaynaklari = { ...bos, sevkler: new Map([['ORN-E-1', { tur: 'sevk', id: 4, no: '#4 · 2026-11-10' }]]) };
      const e = irsaliyeEslesmesi({ ...alis([satir]), tur: 8, fisNo: 'ORN-S-1', belgeNo: 'ORN-E-1' }, sevk);
      assert.equal(e.durum, 'eslesti');
      assert.equal(e.ozet, 'Sevk #4 · 2026-11-10');
      assert.deepEqual(e.satirlar[0]?.core, { tur: 'sevk', id: 4, no: '#4 · 2026-11-10' });
      assert.equal(irsaliyeEslesmesi({ ...alis([satir]), tur: 8 }, bos).ozet, 'CORE\'da sevk yok');
      const iade: EslesmeKaynaklari = { ...bos, iadeMalKabulleri: new Map([['ORN-1', { tur: 'mal-kabul', id: 2, no: 'MK-000002' }]]) };
      assert.equal(irsaliyeEslesmesi({ ...alis([satir]), tur: 3 }, iade).ozet, 'İade mal kabulü MK-000002');
      assert.equal(irsaliyeEslesmesi({ ...alis([satir]), tur: 3 }, sevk).durum, 'eslesmedi', 'sevk işi satış iadesinin karşılığı değildir');
    });
  });
});
