import { afterEach, describe, expect, it, vi } from 'vitest';
import { YazimReddi, planKur } from '../../../../ortak/excel/kurallar.ts';
import { api } from '../../../../ortak/veri/api.ts';
import type { RrDurumu } from '../veri.ts';
import { AYNI_ADIM, ONAYDA, ROTA_SAYFASI, rotaKaynagi, rotaKayitlari, rotaSatiri, rotaTanimi, rotaYaz } from './excel.ts';

// Sentetik veri: gerçek ürün, istasyon ya da makine yok.
const madde = (id: string, code: string, type: string) => ({ id, code, name: `Ad ${code}`, type, aktif: true });
const adim = (opNo: number, ek: Record<string, unknown> = {}) => ({
  id: `a${String(opNo)}`, seq: opNo, opNo, opId: '1', name: `Adım ${String(opNo)}`, stationId: '5', machineId: null, setup: 30, cycle: 2, proc: null, chg: null, ...ek,
});
const rev = (id: string, itemId: string, status: string, steps: unknown[]) => ({ id, itemId, status, surum: Number(id) - 90, data: { base: null, steps } });
const d = {
  items: [madde('11', 'MM-1', 'mamul'), madde('12', 'MM-2', 'mamul'), madde('13', 'YM-1', 'yari'), madde('14', 'HM-1', 'ham')],
  opdefs: [{ id: '1', code: 'TOR', name: 'Tornalama', aktif: true }, { id: '2', code: 'FRZ', name: 'Frezeleme', aktif: true }],
  stations: [{ id: '5', code: 'IST-1', name: 'Torna hattı', aktif: true }, { id: '6', code: 'IST-2', name: 'Freze hattı', aktif: true }],
  machines: [{ id: '8', code: 'MK-1', name: 'Makine bir', stationId: '6', aktif: true }],
  routeRevs: [
    rev('91', '11', 'yururlukte', [adim(10), adim(20, { opId: '2', stationId: null, machineId: '8' })]),
    rev('92', '11', 'taslak', [adim(10, { setup: 45 }), adim(20), adim(30)]),
    rev('93', '12', 'onay', [adim(10)]),
  ],
} as unknown as RrDurumu;
const oku = (...satirlar: (string | number | null)[][]) => ({
  [ROTA_SAYFASI]: [
    { no: 1, hucreler: ['Ürün *', 'OP no', 'Operasyon *', 'Adım adı *', 'İstasyon', 'Makine', 'Hazırlık (dk)', 'Birim süre (dk)'] },
    ...satirlar.map((h, i) => ({ no: i + 2, hucreler: h })),
  ],
});

afterEach(() => { vi.restoreAllMocks(); });

describe('rota adımı Excel tanımı', () => {
  it('kayıtlar açık revizyondan okunur, yoksa yürürlükteki; ham malzeme listede yok', () => {
    const k = rotaKayitlari(d);
    expect(k.map((x) => `${x.urunKod}|${String(x.opNo)}|${String(x.hazirlik)}`)).toEqual(['MM-1|10|45', 'MM-1|20|30', 'MM-1|30|30', 'MM-2|10|30']);
    expect(rotaTanimi(d).sayfalar[0]?.sutunlar[0]?.liste?.map((l) => l.kod)).toEqual(['MM-1', 'MM-2', 'YM-1']);
    // Dayanak istek kimliğine girer: aynı dosya rota değişince yeni istektir.
    expect(rotaTanimi(d).kimlikEki).toEqual([[11, { revizyonId: 92, surum: 2 }], [12, { revizyonId: 93, surum: 3 }]]);
  });

  it('ürün ve OP no adımı bulur; yalnız değişen alan gider, makine istasyona üstün gelir, OP no boşsa yeni adım', () => {
    const t = rotaTanimi(d);
    const { plan } = planKur(t, oku(
      ['MM-1', 10, 'TOR', 'Adım 10', 'IST-1', null, 50, null],
      ['MM-1', 20, null, null, null, 'MK-1', null, 3],
      ['YM-1', null, 'FRZ', 'Kaba freze', 'IST-2', null, 15, 1.5],
      ['MM-1', 30, null, null, null, null, null, null],
      ['MM-1', 40, null, 'Yok', null, null, null, null],
      ['YM-1', null, null, 'Eksik', null, null, null, null],
    ));
    expect(plan.map((p) => [p.islem, p.kod])).toEqual([['guncelle', 'MM-1 / 10'], ['guncelle', 'MM-1 / 20'], ['ekle', 'YM-1'], ['ayni', 'MM-1 / 30'], ['hata', 'MM-1 / 40'], ['hata', 'YM-1']]);
    expect(plan[4]?.hatalar[0]).toMatch(/OP no kayıtlı değil/);
    expect(plan[5]?.hatalar).toEqual(['Operasyon zorunlu.']);
    const k = rotaKaynagi(d);
    expect(rotaSatiri(plan[0]!, 2, k)).toEqual({ satir: 2, urunId: 11, dayanak: { revizyonId: 92, surum: 2 }, opNo: 10, ayarSuresiDk: 50 });
    expect(rotaSatiri(plan[1]!, 3, k)).toEqual({ satir: 3, urunId: 11, dayanak: { revizyonId: 92, surum: 2 }, opNo: 20, kaynak: { tur: 'makine', id: 8 }, birimSureDk: 3 });
    expect(rotaSatiri(plan[2]!, 4, k)).toEqual({
      satir: 4, urunId: 13, dayanak: null, opNo: null, operasyonTipiId: 2, ad: 'Kaba freze', kaynak: { tur: 'istasyon', id: 6 }, ayarSuresiDk: 15, birimSureDk: 1.5,
    });
  });

  it('OP no boş satır aynı operasyon ve adla adım varsa uyarır (yeniden yükleme), yazımı durdurmaz', () => {
    const { plan } = planKur(rotaTanimi(d), oku(['MM-1', null, 'tor', ' adım 30 ', null, null, null, null], ['MM-1', null, 'FRZ', 'Adım 30', null, null, null, null]));
    expect(plan.map((p) => [p.islem, p.uyarilar ?? []])).toEqual([['ekle', [AYNI_ADIM]], ['ekle', []]]);
  });

  it('rotası onay bekleyen ürün önizlemede ve gönderimde reddedilir', async () => {
    const t = rotaTanimi(d);
    const { plan } = planKur(t, oku(['MM-2', 10, null, 'Yeni ad', null, null, null, null], ['MM-2', null, 'TOR', 'Ek adım', null, null, null, null]));
    expect(plan[0]?.hatalar).toEqual([ONAYDA]);
    await expect(rotaYaz([plan[1]!], 'x', rotaKaynagi(d))).rejects.toThrow(YazimReddi);
  });

  it('sunucuya Excel satır numarası ve istek kimliği gider', async () => {
    const t = rotaTanimi(d);
    const { plan } = planKur(t, oku(['MM-1', 10, null, 'Yeni ad', null, null, null, null], ['MM-1', null, 'TOR', 'Son adım', null, null, null, null]));
    const post = vi.spyOn(api, 'post').mockResolvedValue({ eklenen: 1, guncellenen: 1, taslaklar: 1 });
    await rotaYaz(plan, 'kimlik-1', rotaKaynagi(d));
    expect(post.mock.calls[0]?.[0]).toBe('/rota/adimlar/toplu-kaydet');
    expect((post.mock.calls[0]?.[1] as { satirlar: { satir: number }[] }).satirlar.map((x) => x.satir)).toEqual([2, 3]);
    expect(post.mock.calls[0]?.[2]).toEqual({ istekKimligi: 'kimlik-1' });
  });
});
