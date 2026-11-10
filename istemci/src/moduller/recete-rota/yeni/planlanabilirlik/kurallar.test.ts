import { describe, expect, it } from 'vitest';
import { PLANLANAMAMA_NEDENLERI } from '#paylasilan/sozlesme/planlanamama-sabitleri.ts';
import { adimSatirlari, eksikAdimlar, emirNedenleri, gecis, KONTROL_ADLARI, NEDEN_ADLARI, ozet, suzgeceUyar, zincirMetni } from './kurallar.ts';
import { ornekEmirler, ornekRotalar } from './ornek.ts';

describe('planlanabilirlik kuralları (2779)', () => {
  const [e1, e2] = ornekEmirler().emirler as [ReturnType<typeof ornekEmirler>['emirler'][number], ReturnType<typeof ornekEmirler>['emirler'][number]];

  it('her nedenin adı ve kontrol adı var', () => {
    for (const k of PLANLANAMAMA_NEDENLERI) {
      expect(NEDEN_ADLARI[k]).toBeTruthy();
      expect(KONTROL_ADLARI[k]).toBeTruthy();
    }
  });

  it('zincirdeki adım kök sayılmaz; emrin nedenleri yalnız kök adımlardır', () => {
    expect(emirNedenleri(e1)).toEqual(['ufuk', 'kisi-vardiyasiz']);
    expect(emirNedenleri(e2)).toEqual(['sure-bos']);
  });

  it('özet neden türü başına emir ve adım sayar, çok emri etkileyen önce', () => {
    const s = ozet([e1, e2, { ...e2, uretimEmriId: 103, emirNo: 'UE-0103' }]);
    expect(s[0]).toEqual({ kod: 'sure-bos', emir: 2, adim: 2 });
    expect(s.map((x) => x.kod)).toContain('ufuk');
    expect(s.find((x) => x.kod === 'oncul')).toBeUndefined();
  });

  it('süzgeç yalnız o nedende kök adımı olan emri bırakır; süzgeçsiz hepsi', () => {
    expect(suzgeceUyar(e1, 'ufuk')).toBe(true);
    expect(suzgeceUyar(e2, 'ufuk')).toBe(false);
    expect(suzgeceUyar(e2, 'oncul')).toBe(false);
    expect(suzgeceUyar(e2, null)).toBe(true);
  });

  it('öncül bekleyen adımlar beklediği kök adıma göre tek satırda toplanır', () => {
    const s = adimSatirlari(e1.adimlar);
    expect(s.map((x) => (x.tur === 'kok' ? x.adim.opNo : x.oplar))).toEqual([20, [30, 40, 50], 60, [70]]);
    const z = s[1];
    expect(z?.tur === 'zincir' ? zincirMetni(z) : null).toBe('OP 30, 40, 50: OP 20 düzelince yerleşir');
    expect(zincirMetni({ tur: 'zincir', bekledigiOp: null, oplar: [30] })).toBe('OP 30: önceki adım yerleşmedi');
  });

  it('rota sekmesinde yalnız eksiği olan adım listelenir', () => {
    const [u1, u2] = ornekRotalar().urunler;
    expect(eksikAdimlar(u1?.adimlar ?? []).map((a) => a.opNo)).toEqual([10]);
    expect(eksikAdimlar(u2?.adimlar ?? [])).toEqual([]);
  });

  it('düzeltme yeri sekmeye ya da başka sayfanın adresine çevrilir; yeri olmayan neden geçişsizdir', () => {
    expect(gecis('sure-bos')).toMatchObject({ tur: 'sekme', anahtar: 'sureler' });
    expect(gecis('istasyon-yok')).toMatchObject({ tur: 'sekme', anahtar: 'schema', urunlu: true });
    expect(gecis('kisi-vardiyasiz')).toMatchObject({ tur: 'adres', yol: '/vardiya/personel', islem: 'sayfa.vardiya' });
    expect(gecis('ufuk')).toMatchObject({ tur: 'adres', yol: '/plan/motor-ayarlari' });
    expect(gecis('oncul')).toBeNull();
    expect(gecis('yetki-disi')).toBeNull();
  });
});
