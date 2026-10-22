import { describe, expect, it } from 'vitest';
import type { OkutCozCevabi, OkutYeri } from '#paylasilan/sozlesme/stok.ts';
import { OKUT_BASI, okutulanHedef, okutuldu, okutYolu, panelOkutuldu, teslimGovdesi, type OkutKaynagi } from './okut-akisi.ts';

const yer = (konumId: number, tur: OkutYeri['tur'], istasyonId: number | null = null): OkutYeri => ({ konumId, kod: `K${konumId}`, ad: null, tur, istasyonId });
const malzeme = (yerler: OkutYeri[]): OkutCozCevabi => ({
  tur: 'malzeme', malzeme: { id: 901, kod: 'HM-1', ad: 'Deneme sac', birim: 'kg' }, parti: null,
  yerler: yerler.map((y) => ({ ...y, partiId: null, partiEtiketi: null, statuId: null, miktar: '4.000' })),
});
const kaynak = (y: OkutYeri, statuId: number | null = null): OkutKaynagi => ({ malzemeId: 901, malzemeAd: 'Deneme sac', birim: 'kg', yer: y, partiId: null, partiEtiketi: null, statuId, miktar: '4.000' });

const KISI: OkutCozCevabi = { tur: 'kisi', kod: 'KSI-9-A-x', kisi: { id: 9, ad: 'Deneme Alıcı' }, istasyon: { id: 3, kod: 'T3', ad: 'Torna 3' } };

describe('QR okut akışı', () => {
  it('tek yerdeki malzeme doğrudan "nereye"ye geçer; birden çok yer seçim ister; yer yoksa söylenir', () => {
    expect(okutuldu(OKUT_BASI, malzeme([yer(1, 'istasyon', 3)])).adim).toBe('nereye');
    expect(okutuldu(OKUT_BASI, malzeme([yer(1, 'istasyon', 3), yer(2, 'kabul')])).adim).toBe('kaynak-sec');
    expect(okutuldu(OKUT_BASI, malzeme([]))).toEqual({ adim: 'ne', ileti: 'Deneme sac: alabileceğin bir yerde serbest stok yok.' });
  });

  it('alınamayan yer ilk okutmada kaynak olmaz; bilinmeyen kod söylenir', () => {
    expect(okutuldu(OKUT_BASI, { tur: 'yer', yer: yer(5, 'kabul'), satirlar: null })).toEqual({ adim: 'ne', ileti: 'K5 yerinden alamazsın; önce malzemeyi okut.' });
    expect(okutuldu(OKUT_BASI, { tur: 'bilinmiyor', kod: 'ZZZ' })).toEqual({ adim: 'ne', ileti: 'Kod tanınmadı: ZZZ' });
  });

  it('"nereye"de yalnız yer kabul edilir; aynı yer reddedilir', () => {
    const d = okutuldu(OKUT_BASI, malzeme([yer(1, 'istasyon', 3)]));
    expect(okutuldu(d, malzeme([yer(2, 'kabul')]))).toMatchObject({ adim: 'nereye', ileti: 'Nereye bırakılacağını okut: istasyon, raf ya da alan etiketi.' });
    expect(okutuldu(d, { tur: 'yer', yer: yer(9, 'istasyon', 3), satirlar: [] })).toMatchObject({ adim: 'nereye', ileti: 'Malzeme zaten burada; başka bir yer okut.' });
    expect(okutuldu(d, { tur: 'yer', yer: yer(7, 'ara_alan'), satirlar: [] })).toMatchObject({ adim: 'onay', hedef: { konumId: 7 } });
  });

  it('depo işlemi olan serbest stoğu istasyon dışı yerler arasında taşır; statülü, istasyonlu ya da depo işlemsiz teslimdir', () => {
    expect(okutYolu(kaynak(yer(5, 'kabul')), yer(6, 'raf_gozu'), true)).toBe('tasima');
    expect(okutYolu(kaynak(yer(5, 'kabul')), yer(6, 'raf_gozu'), false)).toBe('teslim');
    expect(okutYolu(kaynak(yer(5, 'kabul'), 3), yer(6, 'raf_gozu'), true)).toBe('teslim');
    expect(okutYolu(kaynak(yer(5, 'kabul')), yer(9, 'istasyon', 3), true)).toBe('teslim');
    expect(okutYolu(kaynak(yer(9, 'istasyon', 3)), yer(6, 'raf_gozu'), true)).toBe('teslim');
  });

  it('teslim gövdesi istasyonu istasyon olarak, konumu konum olarak gönderir', () => {
    expect(teslimGovdesi(kaynak(yer(9, 'istasyon', 3)), yer(7, 'ara_alan'), '2', 'k-1')).toEqual({
      malzemeId: 901, miktar: '2', partiId: null, statuId: null, kaynak: { istasyonId: 3 }, hedef: { konumId: 7 }, not: 'QR okut', kaynakKimligi: 'k-1',
    });
  });

  it('teslim et hedefi okutulur: istasyon istasyon olarak, konum konum olarak; yer olmayan kod söylenir', () => {
    expect(okutulanHedef({ tur: 'yer', yer: yer(20, 'istasyon', 1), satirlar: [] })).toEqual({ yer: { istasyonId: 1 }, alici: null });
    expect(okutulanHedef({ tur: 'yer', yer: yer(6, 'raf_gozu'), satirlar: null })).toEqual({ yer: { konumId: 6 }, alici: null });
    expect(okutulanHedef(KISI)).toEqual({ yer: { istasyonId: 3 }, alici: { kod: 'KSI-9-A-x', ad: 'Deneme Alıcı' } });
    expect(okutulanHedef(malzeme([]))).toBe('Nereye bırakılacağını okut: istasyon, raf ya da alan etiketi.');
    expect(okutulanHedef({ tur: 'bilinmiyor', kod: 'ZZZ' })).toBe('Kod tanınmadı: ZZZ');
  });

  it('kişi kodu kaynak olmaz; nereye adımında kişinin istasyonu hedeftir, malzeme zaten oradaysa reddedilir (372 a)', () => {
    expect(okutuldu(OKUT_BASI, KISI)).toEqual({ adim: 'ne', ileti: 'Kişinin kodu kaynak olmaz; önce malzemeyi okut, kişiyi nereye adımında okut.' });
    const d = okutuldu(OKUT_BASI, malzeme([yer(1, 'istasyon', 1)]));
    expect(okutuldu(d, KISI)).toMatchObject({ adim: 'onay', hedef: { alici: { kod: 'KSI-9-A-x', ad: 'Deneme Alıcı' }, istasyon: { id: 3 } } });
    const ayni = okutuldu(OKUT_BASI, malzeme([yer(1, 'istasyon', 3)]));
    expect(okutuldu(ayni, KISI)).toMatchObject({ adim: 'nereye', ileti: 'Malzeme zaten Torna 3 istasyonunda; başka bir yer okut.' });
  });

  it('kişiye teslim her zaman teslim kaydıdır ve alıcı kodunu taşır', () => {
    const h = { alici: { kod: 'KSI-9-A-x', ad: 'Deneme Alıcı' }, istasyon: { id: 3, kod: 'T3', ad: 'Torna 3' } };
    expect(okutYolu(kaynak(yer(5, 'kabul')), h, true)).toBe('teslim');
    expect(teslimGovdesi(kaynak(yer(5, 'kabul')), h, '1', 'k-2')).toEqual({
      malzemeId: 901, miktar: '1', partiId: null, statuId: null, kaynak: { konumId: 5 }, hedef: { istasyonId: 3 }, aliciKodu: 'KSI-9-A-x', not: 'QR okut', kaynakKimligi: 'k-2',
    });
  });

  it('pencere okuyucusu: ilk okutmada kişi Teslim et\'e yönlendirir; sonraki adımda ve öteki kodlarda akış sürer', () => {
    expect(panelOkutuldu(OKUT_BASI, KISI)).toEqual({ tur: 'teslim-et', hedef: { yer: { istasyonId: 3 }, alici: { kod: 'KSI-9-A-x', ad: 'Deneme Alıcı' } } });
    expect(panelOkutuldu(OKUT_BASI, malzeme([yer(1, 'istasyon', 1)]))).toMatchObject({ tur: 'akis', durum: { adim: 'nereye' } });
    const d = okutuldu(OKUT_BASI, malzeme([yer(1, 'istasyon', 1)]));
    expect(panelOkutuldu(d, KISI)).toMatchObject({ tur: 'akis', durum: { adim: 'onay' } });
    expect(panelOkutuldu(OKUT_BASI, { tur: 'bilinmiyor', kod: 'ZZZ' })).toEqual({ tur: 'akis', durum: { adim: 'ne', ileti: 'Kod tanınmadı: ZZZ' } });
  });
  it('kart #123: refakat kartı okutulunca kaynak kartı taşır, yol her zaman teslimdir, gövdeye kart girer; yalnız gelen varsa teslim al söylenir', () => {
    const refakat = {
      id: 12, qr: 'RP:12', etiket: 'UE-000001-P1', uretimEmriId: 1, emirNo: 'UE-000001', sira: 1, malzemeId: 901, malzemeKod: 'HM-1', malzemeAd: 'Deneme sac', birim: 'kg',
      partiId: 40, lotNo: 'LT-000040', tedarikciPartiNo: null, dokumNo: 'D-1', sertifikaNo: null, verilen: '0', durum: 'acik' as const, surum: 1, kayitZamani: '2026-10-22T10:00:00+03:00',
    };
    const kartli = { ...(malzeme([yer(5, 'kabul')]) as Extract<OkutCozCevabi, { tur: 'malzeme' }>), refakat, gelenler: [] };
    const d = okutuldu(OKUT_BASI, kartli);
    expect(d).toMatchObject({ adim: 'nereye', kaynak: { refakatPartisiId: 12 } });
    const k = (d as Extract<typeof d, { adim: 'nereye' }>).kaynak;
    expect(okutYolu(k, yer(6, 'raf_gozu'), true)).toBe('teslim');
    expect(teslimGovdesi(k, yer(9, 'istasyon', 3), '2', 'k-1')).toMatchObject({ refakatPartisiId: 12, hedef: { istasyonId: 3 } });
    expect(teslimGovdesi(kaynak(yer(5, 'kabul')), yer(9, 'istasyon', 3), '2', 'k-1')).not.toHaveProperty('refakatPartisiId');
    const gelen = { ...kartli, yerler: [], gelenler: [{} as never] };
    expect(okutuldu(OKUT_BASI, gelen)).toEqual({ adim: 'ne', ileti: 'UE-000001-P1: sana gelen teslim var; aşağıdan teslim al.' });
  });
});
