import { describe, expect, it } from 'vitest';
import type { KodCozCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DENETIM_BASI, lotSonucu, okutmaEngeli, toplamaOkutmasi } from './toplama-okutmasi.ts';

// 1907 a: hazırlık adımının okutarak denetimi. Değerler uydurmadır.
const ADIM = { konumKod: 'A-01-02', malzemeId: 901, malzemeAd: 'Eldiven', partiId: 4, partiEtiketi: 'LT-000041 · TP-1' };
const lot = (partiId: number, lotNo: string, malzemeId = 901) => ({ tur: 'lot', parti: { id: partiId, lotNo, etiket: lotNo }, ozet: { id: malzemeId }, toplam: '1', bakiyeler: [] }) as unknown as KodCozCevabi;

describe('toplama okutmasi', () => {
  it('goz: onekli, kucuk harfli ve elle oneksiz yazilan dogru goz tamam; baska goz yanlis', () => {
    expect(toplamaOkutmasi(ADIM, 'LOC:A-01-02')).toEqual({ tur: 'goz', denetim: { ton: 'tamam', metin: 'A-01-02 doğru' } });
    expect(toplamaOkutmasi(ADIM, 'loc:a-01-02').tur).toBe('goz');
    expect(toplamaOkutmasi(ADIM, 'A-01-02')).toEqual({ tur: 'goz', denetim: { ton: 'tamam', metin: 'A-01-02 doğru' } });
    expect(toplamaOkutmasi(ADIM, 'LOC:A-01-03')).toEqual({ tur: 'goz', denetim: { ton: 'hata', metin: 'A-01-03 okutuldu, beklenen A-01-02' } });
  });

  it('lot etiketi (onekli ya da yalin) stok cozumune gider; fabrika ayarli okuyucunun bozdugu ayrac da duzelir', () => {
    expect(toplamaOkutmasi(ADIM, 'LOT:LT-000041')).toEqual({ tur: 'lot-coz', kod: 'LOT:LT-000041' });
    expect(toplamaOkutmasi(ADIM, 'LT-000041')).toEqual({ tur: 'lot-coz', kod: 'LOT:LT-000041' });
    expect(toplamaOkutmasi(ADIM, 'LOTŞLT*000041')).toEqual({ tur: 'lot-coz', kod: 'LOT:LT-000041' });
  });

  it('lot sonucu partinin kimligiyle karsilastirilir; LT-1 ile LT-12 karismaz', () => {
    expect(lotSonucu(ADIM, lot(4, 'LT-000041')).ton).toBe('tamam');
    expect(lotSonucu(ADIM, lot(5, 'LT-0000412'))).toEqual({ ton: 'hata', metin: 'Aynı malzeme, başka lot: LT-0000412' });
    expect(lotSonucu(ADIM, lot(7, 'LT-000077', 902)).ton).toBe('hata');
    expect(lotSonucu(ADIM, { tur: 'bilinmiyor', kod: 'LOT:X' } as KodCozCevabi)).toEqual({ ton: 'hata', metin: 'Lot bulunamadı' });
    expect(lotSonucu({ ...ADIM, partiId: null }, lot(9, 'LT-000009')).ton).toBe('tamam');
  });

  it('malzeme etiketi: dogru malzeme partili adimda uyari, partisizde tamam; baska malzeme yanlis', () => {
    expect(toplamaOkutmasi(ADIM, 'MLZ:901')).toEqual({ tur: 'lot', denetim: { ton: 'uyari', metin: 'Malzeme doğru, lot denetlenmedi' } });
    expect(toplamaOkutmasi({ ...ADIM, partiId: null }, 'MLZ:901')).toEqual({ tur: 'lot', denetim: { ton: 'tamam', metin: 'Malzeme doğru' } });
    expect(toplamaOkutmasi(ADIM, 'MLZ:902')).toEqual({ tur: 'lot', denetim: { ton: 'hata', metin: 'Yanlış malzeme; beklenen Eldiven' } });
  });

  it('baska tur kod denetimi degistirmez; yalniz yanlis goz ya da lot toplamayi kapatir', () => {
    expect(toplamaOkutmasi(ADIM, 'UE:4512').tur).toBe('yabanci');
    expect(okutmaEngeli(DENETIM_BASI)).toBe(false);
    expect(okutmaEngeli({ goz: { ton: 'tamam', metin: '' }, lot: { ton: 'uyari', metin: '' } })).toBe(false);
    expect(okutmaEngeli({ goz: { ton: 'tamam', metin: '' }, lot: { ton: 'hata', metin: '' } })).toBe(true);
  });
});
