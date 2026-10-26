import { describe, expect, it } from 'vitest';
import type { IsMalzemeleriCevabi, Teslim } from '#paylasilan/sozlesme/stok.ts';
import { durumMetni, isMalzemeDurumu } from './is-malzeme-durumu.ts';

type Malzeme = IsMalzemeleriCevabi['isler'][number]['malzemeler'][number];
const malzeme = (malzemeId: number, gereken: string, istasyonda: string, istek: Malzeme['istek'] = null): Malzeme => ({
  malzemeId, kod: `HM-${malzemeId}`, ad: null, birim: null, birAdet: '1.000', gereken, istasyonda, eksik: Number(istasyonda) < 1, yerler: [], istek,
});
const is = (uretimEmriId: number, malzemeler: Malzeme[]): IsMalzemeleriCevabi['isler'][number] => ({
  uretimEmriId, emirNo: `UE-${uretimEmriId}`, opNo: 10, adimAd: 'Tornalama', calisiyor: false, kalanAdet: 10, malzemeler,
});
const uc = (istasyonId: number | null) => ({ konumId: 1, kod: 'K', ad: 'K', istasyonId });
const teslim = (uretimEmriId: number | null, hedefIstasyonId: number | null, durum: Teslim['durum'] = 'yolda'): Teslim => ({
  id: 1, no: 'TS-1', malzemeId: 1, malzemeAd: null, miktar: '1.000', partiId: null, statuId: null, kaynak: uc(null), hedef: uc(hedefIstasyonId),
  uretimEmriId, istekId: null, aciklama: null, durum, alinan: null, redNedeni: null, gonderenAd: null, kapatanAd: null, aliciAd: null,
  gonderim: '2026-10-26T08:00:00+03:00', kapanis: null, surum: 1,
});

describe('isin malzeme durumu (618)', () => {
  const c: IsMalzemeleriCevabi = { isler: [
    is(70, [
      malzeme(1, '10.000', '0.000'),
      malzeme(2, '10.000', '2.000', { id: 3, no: 'IST-3', durum: 'acik' }),
      malzeme(3, '10.000', '12.000'),
      // Teslim edilmiş istek açık sayılmaz: hâlâ yetmiyorsa eksiktir.
      malzeme(4, '10.000', '0.000', { id: 4, no: 'IST-4', durum: 'teslim' }),
    ]),
    is(71, [malzeme(9, '5.000', '0.000')]),
  ] };

  it('yalniz o emrin girdisini sayar; acik istekli eksik "istendi", istegi kapali eksik "eksik"', () => {
    expect(isMalzemeDurumu(c, [], 2, 70)).toEqual({ girdi: 4, eksik: 2, istendi: 1, gelen: 0 });
  });

  it('gelen: yalniz bu emir icin bu istasyona yolda olan teslimler', () => {
    const gelenler = [teslim(70, 2), teslim(70, 3), teslim(71, 2), teslim(null, 2), teslim(70, 2, 'teslim')];
    expect(isMalzemeDurumu(c, gelenler, 2, 70).gelen).toBe(1);
  });

  it('girdisi olmayan emir bos doner', () => {
    expect(isMalzemeDurumu(c, [], 2, 99)).toEqual({ girdi: 0, eksik: 0, istendi: 0, gelen: 0 });
  });

  it('metin once yapilacak isi soyler: gelen, sonra eksik, sonra istendi', () => {
    expect(durumMetni({ girdi: 3, eksik: 1, istendi: 1, gelen: 2 })).toEqual({ metin: 'Gelen 2', ton: 'bilgi' });
    expect(durumMetni({ girdi: 3, eksik: 1, istendi: 1, gelen: 0 })).toEqual({ metin: '1 eksik', ton: 'hata' });
    expect(durumMetni({ girdi: 3, eksik: 0, istendi: 2, gelen: 0 })).toEqual({ metin: 'İstendi 2', ton: 'uyari' });
    expect(durumMetni({ girdi: 3, eksik: 0, istendi: 0, gelen: 0 })).toEqual({ metin: 'Girdi tamam', ton: 'tamam' });
  });
});
