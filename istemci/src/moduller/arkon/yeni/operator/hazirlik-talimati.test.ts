import { describe, expect, it } from 'vitest';
import type { EmirAdimi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { TalimatAdimi } from '#paylasilan/sozlesme/rota.ts';
import { eksikZorunlular, hazirlikAdimlari, kanitGovdesi, olcumHali, sinirMetni, tamamOlur, yonergeler } from './hazirlik-talimati.ts';

// Değerler uydurmadır.
const adim = (sira: number, asama: EmirAdimi['asama'], ek: Partial<EmirAdimi> = {}): EmirAdimi => ({
  id: sira * 10, sira, ad: `Adım ${String(sira)}`, aciklama: null, asama, tamam: false, tamamlayan: null, tamamlanma: null,
  kanit: null, gecenNot: null, buNot: null, talimat: null, ...ek,
});
const OLCUM = { tur: 'olcum' as const, ad: 'Çap', alt: 9.98, ust: 10.02, birim: 'mm' };
const TALIMAT: TalimatAdimi[] = [
  { sira: 1, baslik: 'Malzemeyi getir', metin: 'Raftan al\n\n Kasaya koy ', kontrol: { tur: 'onay' }, zorunlu: false, medya: [], asama: 'on_hazirlik' },
  { sira: 2, baslik: 'Sıfırı ölç', metin: null, kontrol: OLCUM, zorunlu: true, medya: [{ ozet: 'a'.repeat(64), ad: 'sifir.png', tur: 'resim', boyut: 10 }], asama: 'hazirlik' },
];

describe('hazırlık talimatı kuralları (2098c)', () => {
  it('emrin adımı rotadaki talimat adımıyla sırasından eşlenir; aşama süzülür; talimat yoksa emrin adı kalır', () => {
    const l = [adim(1, 'on_hazirlik'), adim(2, 'hazirlik'), adim(3, 'uretim')];
    const on = hazirlikAdimlari(l, TALIMAT, 'on_hazirlik');
    expect(on.map((x) => [x.id, x.baslik, x.yonerge])).toEqual([[10, 'Malzemeyi getir', ['Raftan al', 'Kasaya koy']]]);
    const hz = hazirlikAdimlari(l, TALIMAT, 'hazirlik');
    expect(hz[0]).toMatchObject({ zorunlu: true, kontrol: OLCUM, medya: [{ ad: 'sifir.png' }] });
    expect(hazirlikAdimlari(l, null, 'hazirlik')[0]).toMatchObject({ baslik: 'Adım 2', zorunlu: false, kontrol: { tur: 'yok' }, medya: [] });
    expect(yonergeler(null)).toEqual([]);
  });

  it('zorunlu adım kanıtsız tamamlanmaz; zorunsuz ölçümde boş ya da okunur değer yeter', () => {
    const z = { zorunlu: true, kontrol: OLCUM };
    expect(tamamOlur(z, { deger: '', secim: null, foto: null })).toBe(false);
    expect(tamamOlur(z, { deger: '10,05', secim: null, foto: null })).toBe(false);
    expect(tamamOlur(z, { deger: '10,01', secim: null, foto: null })).toBe(true);
    expect(tamamOlur({ zorunlu: false, kontrol: OLCUM }, { deger: '', secim: null, foto: null })).toBe(true);
    expect(tamamOlur({ zorunlu: false, kontrol: OLCUM }, { deger: 'abc', secim: null, foto: null })).toBe(false);
    expect(tamamOlur({ zorunlu: true, kontrol: { tur: 'foto', aciklama: null } }, { deger: '', secim: null, foto: null })).toBe(false);
    expect(tamamOlur({ zorunlu: true, kontrol: { tur: 'secim', secenekler: ['Var', 'Yok'] } }, { deger: '', secim: 'Var', foto: null })).toBe(true);
    expect(tamamOlur({ zorunlu: true, kontrol: { tur: 'onay' } }, { deger: '', secim: null, foto: null })).toBe(true);
  });

  it('ölçüm sınırı açık uçlu olabilir; sunucuya yalnız girilen kanıt gider', () => {
    expect(olcumHali({ ...OLCUM, ust: null }, '50')).toBe('uygun');
    expect(olcumHali({ ...OLCUM, alt: null }, '10,03')).toBe('disinda');
    expect(olcumHali({ tur: 'onay' }, '10')).toBeNull();
    expect(sinirMetni(OLCUM)).toBe('Sınır 9,98 – 10,02 mm');
    expect(sinirMetni({ ...OLCUM, ust: null })).toBe('En az 9,98 mm');
    expect(sinirMetni({ ...OLCUM, alt: null, ust: null })).toBe('Sınır yok');
    expect(kanitGovdesi({ kontrol: OLCUM }, { deger: '10,01', secim: 'x', foto: 'y' })).toEqual({ olcum: 10.01 });
    expect(kanitGovdesi({ kontrol: OLCUM }, { deger: '', secim: null, foto: null })).toBeUndefined();
    expect(kanitGovdesi({ kontrol: { tur: 'foto', aciklama: null } }, { deger: '', secim: null, foto: 'b'.repeat(64) })).toEqual({ foto: 'b'.repeat(64) });
    const l = hazirlikAdimlari([adim(1, 'hazirlik'), adim(2, 'hazirlik', { tamam: true })], [{ ...TALIMAT[1]!, sira: 1 }, { ...TALIMAT[1]!, sira: 2 }], 'hazirlik');
    expect(eksikZorunlular(l).map((x) => x.sira)).toEqual([1]);
  });
});
