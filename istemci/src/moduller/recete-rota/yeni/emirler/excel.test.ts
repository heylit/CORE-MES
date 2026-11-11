import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { YazimReddi, planKur } from '../../../../ortak/excel/kurallar.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { RrDurumu } from '../veri.ts';
import { EMIR_SAYFASI, GUNCELLE_SAYFASI, PLANLI_TASLAGA_DONMEZ, emirGuncelleSatiri, emirGuncelleTanimi, emirGuncelleYaz, emirKaynagi, emirSatiri, emirTanimi, emirYaz } from './excel.ts';

// Sentetik veri: gerçek ürün ya da proje yok.
const madde = (id: string, code: string, type: string) => ({ id, code, name: `Ad ${code}`, type, aktif: true });
const d = {
  items: [madde('11', 'MM-1', 'mamul'), madde('12', 'MM-2', 'mamul'), madde('13', 'HM-1', 'ham')],
  routeRevs: [{ id: '91', itemId: '11', status: 'yururlukte' }, { id: '92', itemId: '12', status: 'taslak' }],
  emirler: { orders: [
    { id: '1', no: 'UE-1', itemId: '11', qty: 5, due: '2026-11-20', priority: 3, status: 'serbest', surum: 1 },
    { id: '2', itemId: '11', qty: 7, due: '2026-11-20', status: 'iptal' },
    { id: '3', no: 'UE-3', itemId: '11', qty: 4, due: '2026-11-25', priority: 3, status: 'taslak', surum: 2 },
    { id: '4', no: 'UE-4', itemId: '12', qty: 6, due: null, priority: 2, status: 'serbest', surum: 5 },
    { id: '5', no: 'UE-5', itemId: '12', qty: 6, due: null, priority: 2, status: 'uretimde', surum: 1 },
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

describe('açık emirleri güncelleme (2704 a)', () => {
  const okuG = (...satirlar: (string | number | null)[][]) => ({
    [GUNCELLE_SAYFASI]: [
      { no: 1, hucreler: ['Emir no *', 'Ürün', 'Miktar', 'Teslim', 'Öncelik', 'Durum'] },
      ...satirlar.map((h, i) => ({ no: i + 2, hucreler: h })),
    ],
  });
  it('yalnız taslak ve planlı emirler; öncelik ve plana alma gider, bilgi sütunu değişirse ve planlı taslağa dönerse satır hatalı', () => {
    const t = emirGuncelleTanimi(d);
    expect(t.sayfalar[0]?.kayitlar.map((o) => (o as { no: string }).no)).toEqual(['UE-1', 'UE-3', 'UE-4']);
    const { plan } = planKur(t, okuG(['UE-3', 'MM-1', 4, '25.11.2026', '1', 'Planlı (plana girer)'], ['UE-4', null, null, null, 'Acil', null], ['UE-5', null, null, null, '1', null]));
    expect(plan.map((p) => p.islem)).toEqual(['guncelle', 'guncelle', 'hata']);
    const tek = (h: (string | number | null)[]) => planKur(t, okuG(h)).plan[0];
    expect(tek(['UE-4', null, 9, null, null, null])?.hatalar).toEqual(['Miktar bu sayfada değişmez.']);
    expect(tek(['UE-4', null, null, null, null, 'Taslak'])?.hatalar).toEqual([PLANLI_TASLAGA_DONMEZ]);
    expect(tek(['UE-3', null, null, null, null, null])?.islem).toBe('ayni');
    expect(emirGuncelleSatiri(plan[0]!, 2)).toEqual({ satir: 2, id: 3, surum: 2, oncelik: 1, planaAl: true });
    expect(emirGuncelleSatiri(plan[1]!, 3)).toEqual({ satir: 3, id: 4, surum: 5, oncelik: 1 });
  });
  it('sunucuya Excel satır numarası ve istek kimliği gider', async () => {
    const { plan } = planKur(emirGuncelleTanimi(d), okuG(['UE-4', null, null, null, '4', null]));
    const post = vi.spyOn(api, 'post').mockResolvedValue({ eklenen: 0, guncellenen: 1 });
    await emirGuncelleYaz(plan, 'k1');
    expect(post.mock.calls[0]).toEqual(['/adimli-emirler/toplu-guncelle', { satirlar: [{ satir: 2, id: 4, surum: 5, oncelik: 4 }] }, { istekKimligi: 'k1' }]);
  });
});
