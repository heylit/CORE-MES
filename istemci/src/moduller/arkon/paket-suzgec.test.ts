import { describe, expect, it } from 'vitest';
import { paketleriSuz, suzgecOku, suzgecSayisi, suzgecSecenekleri } from '../../../../arkon/web/src/data/paket-suzgec.ts';

const pk = (id: string, no: string, machine: string, mc: string | undefined, partNo: string, part = `Ad ${partNo}`) => ({ id, no, machine, mc, partNo, part });

describe('Hazırlık listesi süzgeci', () => {
  const paketler = [
    pk('a', 'UE-1', 'T1', 'M-1', 'P-1'),
    pk('b', 'UE-1', 'F1', 'M-3', 'P-1'),
    pk('c', 'UE-2', 'T1', 'M-2', 'P-2'),
    pk('d', 'Y-1', '', undefined, ''),
  ];

  it('seçili alanlar birlikte uygulanır; boş metin değeri girilmemişleri seçer', () => {
    expect(paketleriSuz(paketler, { istasyon: 'T1' }).map((p) => p.id)).toEqual(['a', 'c']);
    expect(paketleriSuz(paketler, { istasyon: 'T1', parca: 'P-1' }).map((p) => p.id)).toEqual(['a']);
    expect(paketleriSuz(paketler, { makine: '' }).map((p) => p.id)).toEqual(['d']);
    expect(paketleriSuz(paketler, {}).length).toBe(4);
  });

  it('arama no, parça, istasyon ve makinede büyük küçük harf ayırmadan arar', () => {
    expect(paketleriSuz(paketler, {}, 'm-2').map((p) => p.id)).toEqual(['c']);
    expect(paketleriSuz(paketler, {}, ' ue-1 ').map((p) => p.id)).toEqual(['a', 'b']);
    expect(paketleriSuz(paketler, { istasyon: 'F1' }, 'ue-2')).toEqual([]);
  });

  it('seçenek sayıları öteki süzgeçlere göre; boş değer en sonda adıyla', () => {
    expect(suzgecSecenekleri(paketler, {}, 'istasyon', (_t, kod) => (kod === 'T1' ? 'Torna' : undefined))).toEqual([
      { deger: 'F1', etiket: 'F1', sayi: 1 }, { deger: 'T1', etiket: 'T1 · Torna', sayi: 2 }, { deger: '', etiket: 'İstasyonsuz', sayi: 1 },
    ]);
    expect(suzgecSecenekleri(paketler, { parca: 'P-1' }, 'istasyon').map((o) => [o.deger, o.sayi])).toEqual([['F1', 1], ['T1', 1]]);
    // Kendi seçimi kendi seçeneklerini daraltmaz.
    expect(suzgecSecenekleri(paketler, { emir: 'UE-2' }, 'emir').map((o) => o.deger)).toEqual(['UE-1', 'UE-2', 'Y-1']);
  });

  it('seçili değer sıfıra düşse de listede kalır', () => {
    expect(suzgecSecenekleri(paketler, { istasyon: 'F1', emir: 'UE-2' }, 'istasyon')).toContainEqual({ deger: 'F1', etiket: 'F1', sayi: 0 });
  });

  it('kayıtlı süzgeç okunurken yalnız bilinen metin alanları alınır', () => {
    expect(suzgecOku({ istasyon: 'T1', makine: '', parca: 3, x: 'y' })).toEqual({ istasyon: 'T1', makine: '' });
    for (const d of [null, undefined, 'x', 1]) expect(suzgecOku(d)).toEqual({});
    expect(suzgecSayisi({ istasyon: 'T1', makine: '' })).toBe(2);
  });
});
