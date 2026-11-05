import { describe, expect, it } from 'vitest';
import { agYuzAlanlari, islemAnahtari, kuralYuzleri, m2Metni, PATLATMA_KATI, patlatmaKaymasi, taslakAlanlari, ucgeninYuzu, yuzSirasiUyar, type TaslakIsaret } from './gorunum.ts';

describe('patlatmaKaymasi (2139)', () => {
  it('sıfır oranda parça yerinde kalır', () => {
    expect(patlatmaKaymasi([40, 20, 4], [0, 0, 6], 0)).toEqual([0, 0, 0]);
  });
  it('parça merkezden dışa, uzaklıkla orantılı kayar', () => {
    const [x, y, z] = patlatmaKaymasi([40, -20, 4], [0, 0, 6], 0.5);
    expect([x, y, z]).toEqual([40 * 0.5 * PATLATMA_KATI, -20 * 0.5 * PATLATMA_KATI, -2 * 0.5 * PATLATMA_KATI]);
  });
  it('merkezdeki parça kaymaz; oran 0-1 dışına çıkmaz', () => {
    expect(patlatmaKaymasi([0, 0, 6], [0, 0, 6], 1)).toEqual([0, 0, 0]);
    expect(patlatmaKaymasi([10, 0, 0], [0, 0, 0], 5)).toEqual([10 * PATLATMA_KATI, 0, 0]);
    expect(patlatmaKaymasi([10, 0, 0], [0, 0, 0], -1)).toEqual([0, 0, 0]);
  });
});

describe('yüzey işaretleri (2144)', () => {
  const yuzler = [
    { sira: 1, tur: 'duzlem' as const, ters: false, alanMm2: 800 },
    { sira: 2, tur: 'silindir' as const, ters: true, alanMm2: 300 },
    { sira: 3, tur: 'silindir' as const, ters: false, alanMm2: 600 },
  ];
  const boya = { tur: 'rota' as const, opNo: 40, sartnameId: 5 };
  const isaretler = new Map<number, TaslakIsaret>([[1, { islem: boya, oneri: false }], [2, { islem: { tur: 'maske' }, oneri: true }]]);
  it('kurallar: delik içi ters silindir, dış silindir, düzlem ve işaretsiz yüzler', () => {
    expect(kuralYuzleri('delik', yuzler, isaretler)).toEqual([2]);
    expect(kuralYuzleri('dis', yuzler, isaretler)).toEqual([3]);
    expect(kuralYuzleri('duzlem', yuzler, isaretler)).toEqual([1]);
    expect(kuralYuzleri('bos', yuzler, isaretler)).toEqual([3]);
  });
  it('taslağın alanları işlem başına toplanır; işaretsiz ve toplam ayrı', () => {
    const a = taslakAlanlari(yuzler, isaretler);
    expect(a.islemler.get(islemAnahtari(boya))).toEqual({ yuzSayisi: 1, alanMm2: 800 });
    expect(a.islemler.get('maske')).toEqual({ yuzSayisi: 1, alanMm2: 300 });
    expect([a.isaretsizMm2, a.toplamMm2]).toEqual([600, 1700]);
    expect(m2Metni(1700)).toBe('0,0017 m²');
  });
  it('ağ yüz alanı üçgenlerden; yüz sırası sayı ve alanla denetlenir', () => {
    // Birim kare iki üçgen (yüz 0), yanında tek üçgen (yüz 1, alan 0,5).
    const konum = [0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0, 20, 0, 0];
    const dizin = [0, 1, 2, 0, 2, 3, 1, 4, 2];
    const alanlar = agYuzAlanlari(konum, dizin, [0, 1, 2, 2]);
    expect(alanlar).toEqual([100, 50]);
    expect(yuzSirasiUyar(alanlar, [101, 49])).toBe(true);
    expect(yuzSirasiUyar(alanlar, [50, 100])).toBe(false);
    expect(yuzSirasiUyar(alanlar, [100, 50, 3])).toBe(false);
    expect(yuzSirasiUyar([], [])).toBe(false);
  });
  it('üçgenin yüzü aralıklardan bulunur', () => {
    const araliklar = [0, 1, 2, 2, 3, 9];
    expect([0, 1, 2, 3, 9].map((t) => ucgeninYuzu(araliklar, t))).toEqual([0, 0, 1, 2, 2]);
    expect(ucgeninYuzu(araliklar, 10)).toBeNull();
  });
});
