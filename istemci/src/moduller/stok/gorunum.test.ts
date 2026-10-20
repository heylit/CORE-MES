import { describe, expect, it } from 'vitest';
import { belirsizMiktarVar, miktarGirdisi } from './gorunum.ts';
import { eksikSatirlari } from './MalKabul.tsx';

describe('miktar girdisi', () => {
  it('nokta da virgül de ondalıktır; virgül varsa noktalar binliktir', () => {
    expect(miktarGirdisi('12,5')).toBe('12.5');
    expect(miktarGirdisi(' 12.5 ')).toBe('12.5');
    expect(miktarGirdisi('1.250,5')).toBe('1250.5');
    expect(miktarGirdisi('40')).toBe('40');
  });
  it('virgülsüz ve noktadan sonra üç rakamlı giriş belirsizdir ve işaretlenir; virgüllü ve üç rakamsız giriş değil', () => {
    for (const v of ['1.250', ' 12.500 ', '-1.250']) expect(belirsizMiktarVar(miktarGirdisi(v))).toBe(true);
    for (const v of ['1,250', '1.250,5', '1.25', '1.2500', '1250', '0,125']) expect(belirsizMiktarVar(miktarGirdisi(v))).toBe(false);
    expect(belirsizMiktarVar({ kalemler: [{ miktar: miktarGirdisi('2.000') }] })).toBe(true);
    expect(belirsizMiktarVar({ aciklama: '1.250', miktar: '1.250' })).toBe(false);
  });
});

describe('mal kabulde sunucudan dolan miktar', () => {
  it('binlikli miktar alana noktasız dolar; gönderilince binlik ondalığa dönmez', () => {
    const satirlar = eksikSatirlari({
      emir: { id: 1, emirNo: 'UE-0001', durum: 'yayinda', adet: 1, malzemeId: 900, malzemeAd: null }, cikti: { girilen: '0', kalan: '1' }, engel: null,
      bilesenler: [{ malzemeId: 901, malzemeAd: 'Deneme sac', hizmet: false, brut: '1250.000', verilen: '0', kalan: '1250.000', mevcut: '0', eksik: '1250.000' }],
    });
    expect(miktarGirdisi(satirlar[0]!.miktar)).toBe('1250');
  });
});
