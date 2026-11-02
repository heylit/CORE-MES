import { describe, expect, it } from 'vitest';
import type { Hareket, MalKabulOzeti } from '#paylasilan/sozlesme/stok.ts';
import { ayniIrsaliyeliBelgeler, MAL_KABUL_DISI_KONUMLAR } from './MalKabul.tsx';
import { tekilTasimalar } from './Sepet.tsx';

const belge = (id: number, irsaliyeNo: string | null, duzeltenId: number | null = null) =>
  ({ id, no: `MK-${id}`, irsaliyeNo, duzeltenId }) as unknown as MalKabulOzeti;
const hareket = (id: number, o: Partial<Hareket>) =>
  ({ id, fisId: null, otomatik: false, hareketFisiNo: `HF-${id}`, kaynakKonumKod: 'A', hedefKonumKod: 'B', ...o }) as unknown as Hareket;

describe('STK-8 mal kabul ve taşı', () => {
  it('aynı irsaliye: yalnız düzeltilmemiş ve no tam eşleşen belge; boşluk ve harf farkı sayılmaz, boş aramada uyarı yok', () => {
    const l = [belge(1, 'irs-7'), belge(2, 'IRS-70'), belge(3, 'IRS-7', 9), belge(4, null)];
    expect(ayniIrsaliyeliBelgeler(l, ' IRS-7 ').map((b) => b.id)).toEqual([1]);
    expect(ayniIrsaliyeliBelgeler(l, '')).toEqual([]);
    expect(ayniIrsaliyeliBelgeler(l, 'IRS-8')).toEqual([]);
  });
  it('mal kabul konum seçeneği akışların konumlarını göstermez', () => {
    expect([...MAL_KABUL_DISI_KONUMLAR].sort()).toEqual(['hurda', 'sevkiyat', 'uretim_cikisi', 'yolda']);
  });
  it('tekil taşıma: fişsiz, elle, yer değiştiren hareket; sepet fişli, otomatik ve yerinde statü değişimi gösterilmez', () => {
    const l = [hareket(1, {}), hareket(2, { fisId: 5 }), hareket(3, { otomatik: true }), hareket(4, { hedefKonumKod: 'A' }), hareket(5, { hareketFisiNo: null })];
    expect(tekilTasimalar(l).map((x) => x.id)).toEqual([1]);
    expect(tekilTasimalar(Array.from({ length: 12 }, (_, i) => hareket(i + 10, {}))).length).toBe(8);
  });
});
