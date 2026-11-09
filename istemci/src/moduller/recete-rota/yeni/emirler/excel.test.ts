import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { YazimReddi, planKur } from '../../../../ortak/excel/kurallar.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { RrDurumu } from '../veri.ts';
import { EMIR_SAYFASI, emirKaynagi, emirSatiri, emirTanimi, emirYaz } from './excel.ts';

// Sentetik veri: gerçek ürün ya da proje yok.
const madde = (id: string, code: string, type: string) => ({ id, code, name: `Ad ${code}`, type, aktif: true });
const d = {
  items: [madde('11', 'MM-1', 'mamul'), madde('12', 'MM-2', 'mamul'), madde('13', 'HM-1', 'ham')],
  routeRevs: [{ id: '91', itemId: '11', status: 'yururlukte' }, { id: '92', itemId: '12', status: 'taslak' }],
  emirler: { orders: [
    { id: '1', itemId: '11', qty: 5, due: '2026-11-20', status: 'serbest' },
    { id: '2', itemId: '11', qty: 7, due: '2026-11-20', status: 'iptal' },
  ] },
} as unknown as RrDurumu;
const secenekler = { projeZorunlu: true, rotasizAcik: false, projeler: [{ id: 5, kod: 'PRJ-1', ad: 'Deneme projesi', satirlar: [] }] } as AcilisSecenekleri;
const oku = (...satirlar: (string | number | null)[][]) => ({
  [EMIR_SAYFASI]: [
    { no: 1, hucreler: ['Ürün *', 'Miktar *', 'Başlangıç *', 'Teslim *', 'Öncelik', 'Durum', 'Emir türü', 'Proje', 'Stoktan rezerve', 'Açıklama'] },
    ...satirlar.map((h, i) => ({ no: i + 2, hucreler: h })),
  ],
});

afterEach(() => { vi.restoreAllMocks(); });

describe('emir Excel tanımı', () => {
  it('listede yalnız yürürlükte rotası olan mamul ve yarı mamul var; aynı ürün iki satırda iki emirdir', () => {
    const t = emirTanimi(d, secenekler);
    expect(t.sayfalar[0]?.sutunlar[0]?.liste?.map((l) => l.kod)).toEqual(['MM-1']);
    const { plan } = planKur(t, oku(
      ['MM-1 — Ad MM-1', 5, '10.11.2026', '20.11.2026', null, 'Taslak', null, 'PRJ-1', 'Hayır', 'Excel'],
      ['mm-1', 2, '10.11.2026', '20.11.2026', '1', null, 'Stoğa üretim', null, null, null],
      ['MM-2', 1, '10.11.2026', '20.11.2026', null, null, null, null, null, null],
    ));
    expect(plan.map((p) => [p.islem, p.hatalar.length])).toEqual([['ekle', 0], ['ekle', 0], ['hata', 1]]);
    const k = emirKaynagi(d, secenekler);
    expect(emirSatiri(plan[0]!, 1, k)).toEqual({
      satir: 1, urunId: 11, adet: 5, baslangic: '2026-11-10', teslim: '2026-11-20', oncelik: 3, taslak: true, projeId: 5, aciklama: 'Excel',
    });
    expect(emirSatiri(plan[1]!, 2, k)).toEqual({ satir: 2, urunId: 11, adet: 2, baslangic: '2026-11-10', teslim: '2026-11-20', oncelik: 1, emirTuru: 'stok', stoktanRezerve: true });
  });
  it('kesirli miktar ve 200 üstü satır gönderilmeden reddedilir', async () => {
    const t = emirTanimi(d, secenekler);
    const { plan } = planKur(t, oku(['MM-1', 2.5, '10.11.2026', '20.11.2026', null, null, null, 'PRJ-1', null, null]));
    await expect(emirYaz(plan, 'x', emirKaynagi(d, secenekler))).rejects.toThrow(YazimReddi);
    await expect(emirYaz(Array.from({ length: 201 }, () => plan[0]!), 'x', emirKaynagi(d, secenekler))).rejects.toThrow(/en çok 200/);
  });

  it('sunucuya Excel satırı gider: ret iletisindeki "Satır N" dosyadaki satırdır (başlık 1. satır)', async () => {
    const t = emirTanimi(d, secenekler);
    const { plan } = planKur(t, oku(
      ['MM-1', 1, '10.11.2026', '20.11.2026', null, null, null, 'PRJ-1', null, null],
      ['MM-1', 2, '10.11.2026', '21.11.2026', null, null, null, 'PRJ-1', null, null],
    ));
    const post = vi.spyOn(api, 'post').mockResolvedValue({ eklenen: 2, guncellenen: 0 });
    await emirYaz(plan, 'x', emirKaynagi(d, secenekler));
    const govde = post.mock.calls[0]?.[1] as { satirlar: { satir: number }[] };
    expect(govde.satirlar.map((x) => x.satir)).toEqual([2, 3]);
  });
  it('aynı ürün, miktar ve teslimle açık emir uyarıdır; iptal emir sayılmaz; stok ayıracak emir sayısı özetlenir', () => {
    const t = emirTanimi(d, secenekler);
    const { plan } = planKur(t, oku(
      ['MM-1', 5, '10.11.2026', '20.11.2026', null, null, null, 'PRJ-1', null, null],
      ['MM-1', 7, '10.11.2026', '20.11.2026', null, null, null, 'PRJ-1', 'Hayır', null],
    ));
    expect(plan.map((p) => [p.islem, p.uyarilar ?? []])).toEqual([['ekle', ['Aynı ürün, miktar ve teslimle açık emir var.']], ['ekle', []]]);
    expect(t.ozet?.(plan)).toBe('1 emir stoktan rezerve ayıracak (Stoktan rezerve sütunu Evet ya da boş).');
  });
});
