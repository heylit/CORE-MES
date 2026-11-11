import { describe, expect, it } from 'vitest';
import type { BakiyeSatiri, KodCozCevabi } from '#paylasilan/sozlesme/stok.ts';
import { alOkutmasi, YERLESTIR_BASI, yerlestirArtir, yerlestirGeriAl, yerlestirGovdeleri, yerlestirOkut, type YerlestirDurumu } from './yerlestir-al.ts';

// Yerleştir ve Al (1916): sentetik kayıtlar.
const bakiye = (malzemeId: number, partiId: number | null, konumId: number, konumKod: string, miktar = '10.000'): BakiyeSatiri => ({
  id: malzemeId * 100 + konumId, malzemeId, malzemeAd: `Deneme ${malzemeId}`, konumId, konumKod, partiId, partiEtiketi: partiId ? `LT-${partiId}` : null,
  miktar, ilkGiris: '2026-10-28T09:00:00+03:00', ambalaj: null, statuId: null, kaliteDurumu: 'serbest',
});
const goz = (id: number, kod: string): KodCozCevabi => ({
  tur: 'konum', bakiyeler: [],
  konum: { id, kod, tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 0, haritaGozId: null, haritaAlanId: null, surum: 1 },
});
const ozet = (id: number) => ({ id, tur: 'hammadde' as const, kod: `HM-${id}`, ad: `Deneme ${id}`, onayDurumu: 'onayli' as const, kullanilabilir: true, birim: 'adet' });
const lot = (partiId: number, malzemeId: number, bakiyeler: BakiyeSatiri[]): KodCozCevabi =>
  ({ tur: 'lot', parti: { id: partiId, lotNo: `LT-${partiId}`, etiket: `LT-${partiId}` }, toplam: '10', bakiyeler, ozet: ozet(malzemeId) });
const malzeme = (malzemeId: number, bakiyeler: BakiyeSatiri[]): KodCozCevabi => ({ tur: 'malzeme', bakiyeler, ozet: ozet(malzemeId) }) as KodCozCevabi;

const uygula = (d: YerlestirDurumu, ...x: [string, KodCozCevabi][]) => x.reduce((a, [k, c]) => yerlestirOkut(a, k, c).durum, d);

describe('Yerlestir', () => {
  it('goz okutulmadan lot alinmaz; lot kaynaktaki miktarin tamamiyla gelir, malzeme her okutmada bir artar', () => {
    expect(yerlestirOkut(YERLESTIR_BASI, 'LOT:LT-7', lot(7, 1, [bakiye(1, 7, 1, 'KABUL')])).sonuc.baslik).toBe('Önce gözü okut');
    const d = uygula(YERLESTIR_BASI,
      ['LOC:A-01-1', goz(41, 'A-01-1')],
      ['LOT:LT-7', lot(7, 1, [bakiye(1, 7, 1, 'KABUL', '25.000')])],
      ['MLZ:2', malzeme(2, [bakiye(2, null, 1, 'KABUL')])],
      ['MLZ:2', malzeme(2, [bakiye(2, null, 1, 'KABUL')])]);
    expect(d.satirlar.map((s) => [s.ad, s.miktar, s.kaynakKod])).toEqual([['Deneme 1 · LT-7', '25.000', 'KABUL'], ['Deneme 2', '2', 'KABUL']]);
    expect(yerlestirOkut(d, 'LOT:LT-7', lot(7, 1, [bakiye(1, 7, 1, 'KABUL')])).sonuc.baslik).toBe('Bu lot zaten listede');
    expect(yerlestirGovdeleri(d).govdeler.map((g) => g.govde)).toEqual([
      { malzemeId: 1, kaynakKonumId: 1, partiId: 7, hedefKonumId: 41, miktar: '25.000', aciklama: 'Yerleştir' },
      { malzemeId: 2, kaynakKonumId: 1, partiId: null, hedefKonumId: 41, miktar: '2', aciklama: 'Yerleştir' },
    ]);
  });

  it('cok yerli satir kaydedilmez; satir varken baska goz okutulmaz; geri al once satiri sonra gozu birakir', () => {
    let d = uygula(YERLESTIR_BASI, ['LOC:A-01-1', goz(41, 'A-01-1')], ['LOT:LT-9', lot(9, 3, [bakiye(3, 9, 1, 'KABUL'), bakiye(3, 9, 2, 'ZEMIN')])]);
    expect(d.satirlar[0]!.neden).toMatch(/2 yerde/);
    expect(yerlestirGovdeleri(d)).toEqual({ govdeler: [], atlanan: 1 });
    expect(yerlestirOkut(d, 'LOC:B-01-1', goz(42, 'B-01-1')).sonuc.baslik).toBe('Önce bu gözü kaydet');
    d = yerlestirArtir(d, 2);
    expect(d.satirlar[0]!.miktar).toBe('3');
    d = yerlestirGeriAl(d);
    expect(d).toEqual({ goz: { id: 41, kod: 'A-01-1' }, satirlar: [] });
    expect(yerlestirGeriAl(d)).toEqual(YERLESTIR_BASI);
  });
});

describe('Yerlestir raf', () => {
  it('raf etiketi gozun etiketini ister, durumu degistirmez (reddedilen)', () => {
    const d = uygula(YERLESTIR_BASI, ['LOC:A-01-1', goz(41, 'A-01-1')]);
    const r = yerlestirOkut(d, 'RAF:A12', { tur: 'bilinmiyor', kod: 'RAF:A12' });
    expect(r.sonuc).toMatchObject({ ton: 'uyari', baslik: 'Raf A12' });
    expect(r.durum).toBe(d);
  });
});

describe('Al', () => {
  it('malzeme ya da lot etiketi ne, baska etiket nereden; yeni malzeme yeri korur', () => {
    let k = alOkutmasi({ kod: '', yerKodu: '' }, 'LOT:LT-7');
    k = alOkutmasi(k, 'LOC:IST-F2');
    expect(k).toEqual({ kod: 'LOT:LT-7', yerKodu: 'LOC:IST-F2' });
    expect(alOkutmasi(k, 'MLZ:5')).toEqual({ kod: 'MLZ:5', yerKodu: 'LOC:IST-F2' });
  });
});
