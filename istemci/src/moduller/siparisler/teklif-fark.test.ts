import { describe, expect, it } from 'vitest';
import type { TeklifSurumuCevabi as Surum } from '#paylasilan/sozlesme/siparisler.ts';
import { farkVarMi, surumFarki } from './teklif-fark.ts';

// Cevaplar uydurmadır (ORN-).
const S1: Surum = {
  surumNo: 1, iskontoOrani: '0.00', teslimGun: 30, terminTarihi: null, odemeKosulu: '30 gün', gecerlilik: '2026-11-20', aciklama: 'İlk fiyat', olusturma: '2026-11-12T10:20:00+03:00',
  fiyatlar: [{ satirId: 1, birimFiyat: '120.0000', iskontoluFiyat: '120.0000', tutar: '24000.00' }, { satirId: 2, birimFiyat: '45.5000', iskontoluFiyat: '45.5000', tutar: '22750.00' }],
  toplam: '46750.00', kdvOrani: '20.00', kdvTutari: '9350.00', genelToplam: '56100.00', iskontoOnaylayan: null, iskontoOnayAni: null,
};
const S2: Surum = {
  ...S1, surumNo: 2, iskontoOrani: '5.00', teslimGun: 25, odemeKosulu: '45 gün', aciklama: 'Son fiyat',
  fiyatlar: [{ satirId: 1, birimFiyat: '118.0000', iskontoluFiyat: '112.1000', tutar: '22420.00' }, { satirId: 2, birimFiyat: '45.5000', iskontoluFiyat: '43.2250', tutar: '21612.50' }],
  toplam: '44032.50', kdvTutari: '8806.50', genelToplam: '52839.00',
};

describe('Teklif sürüm farkı (3635)', () => {
  it('koşullar, yalnız fiyatı değişen kalemler ve genel toplam farkı çıkar; değişmeyen kalem ve alan yoktur', () => {
    const f = surumFarki(S1, S2, true);
    expect(f.kosullar.map((k) => k.alan)).toEqual(['iskonto', 'teslim', 'odeme', 'not']);
    expect(f.kosullar[1]).toEqual({ alan: 'teslim', eski: '30', yeni: '25' });
    expect(f.kalemler).toHaveLength(1);
    expect(f.kalemler[0]).toMatchObject({ satirId: 1, eski: '120.0000', yeni: '118.0000' });
    expect(f.kalemler[0]?.yuzde).toBeCloseTo(-1.667, 2);
    expect(f.toplam).toMatchObject({ eski: '56100.00', yeni: '52839.00' });
    expect(farkVarMi(f)).toBe(true);
  });

  it('aynı değer farklı yazımla (5 ve 5.00) fark sayılmaz; aynı sürüm farksızdır', () => {
    expect(farkVarMi(surumFarki(S2, { ...S2, iskontoOrani: '5.0000', fiyatlar: S2.fiyatlar.map((x) => ({ ...x, birimFiyat: Number(x.birimFiyat).toFixed(2) })) }, true))).toBe(false);
  });

  it('KDV girilmemiş eski sürümde toplam, KDV hariç toplamla karşılaştırılır; sıfırdan değişimde yüzde yoktur', () => {
    const eski = { ...S1, kdvOrani: null, kdvTutari: null, genelToplam: null };
    const f = surumFarki(eski, { ...S1, toplam: '50000.00', genelToplam: null, kdvOrani: null }, true);
    expect(f.toplam).toMatchObject({ eski: '46750.00', yeni: '50000.00' });
    expect(surumFarki({ ...S1, fiyatlar: [{ satirId: 1, birimFiyat: '0.0000', iskontoluFiyat: '0', tutar: '0' }] }, S2, true).kalemler[0]?.yuzde).toBeNull();
  });

  it('fiyat görmeyene fiyat, iskonto, KDV ve toplam farkı hiç hesaplanmaz; koşul farkı kalır', () => {
    const f = surumFarki(S1, S2, false);
    expect(f.kosullar.map((k) => k.alan)).toEqual(['teslim', 'odeme', 'not']);
    expect(f.kalemler).toEqual([]);
    expect(f.toplam).toBeNull();
    expect(JSON.stringify(f)).not.toMatch(/118|120|56100|52839|iskonto|kdv/);
  });

  it('sunucunun fiyatsız cevabında (alanlar null) fiyat farkı çıkmaz', () => {
    const gizle = (v: Surum): Surum => ({ ...v, iskontoOrani: null, toplam: null, kdvTutari: null, genelToplam: null, fiyatlar: v.fiyatlar.map((x) => ({ ...x, birimFiyat: null, iskontoluFiyat: null, tutar: null })) });
    const f = surumFarki(gizle(S1), gizle(S2), true);
    expect(f.kalemler).toEqual([]);
    expect(f.toplam).toBeNull();
    expect(f.kosullar.map((k) => k.alan)).toEqual(['teslim', 'odeme', 'not']);
  });
});
