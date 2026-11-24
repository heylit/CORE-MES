import { describe, expect, it } from 'vitest';
import type { SiparisAyrintisi, TeklifAyrintiCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { uygulamaDegisiklikVar, uygulamaFarki } from './teklif-uygula.ts';

const teklif = (fiyat1: string, fiyat2: string, ek: Partial<TeklifAyrintiCevabi['surumler'][number]> = {}) => ({
  satirlar: [{ id: 11, sira: 1, malzemeNo: 31, tanim: 'ORN Mil' }, { id: 12, sira: 2, malzemeNo: 32, tanim: 'ORN Flanş' }],
  surumler: [{
    surumNo: 2, iskontoOrani: '0', terminTarihi: null, odemeKosulu: null, kdvOrani: '20.00', toplam: '300.00', genelToplam: '360.00',
    fiyatlar: [{ satirId: 11, birimFiyat: fiyat1, iskontoluFiyat: fiyat1, tutar: '0' }, { satirId: 12, birimFiyat: fiyat2, iskontoluFiyat: fiyat2, tutar: '0' }], ...ek,
  }],
}) as unknown as TeklifAyrintiCevabi;
const siparis = (ek: Partial<SiparisAyrintisi> = {}) => ({
  termin: '2026-12-01', kdvOrani: '20.00', odemeKosulu: '30 gün', araToplam: '320.00', genelToplam: '384.00',
  satirlar: [{ sira: 1, malzemeNo: 31, malzemeAdi: 'Mil', birimFiyat: '10.0000' }, { sira: 2, malzemeNo: 32, malzemeAdi: 'Flanş', birimFiyat: '20.0000' }], ...ek,
}) as unknown as SiparisAyrintisi;

describe('3637 siparişe uygulama farkı', () => {
  it('değişen kalem fiyatını, toplamı ve sipariş sayılarını sürümden verir', () => {
    const f = uygulamaFarki(teklif('10.0000', '18.0000'), 2, siparis());
    expect(f?.satirlar.map((s) => [s.tanim, s.eski, s.yeni, s.degisti])).toEqual([['ORN Mil', '10.0000', '10.0000', false], ['ORN Flanş', '20.0000', '18.0000', true]]);
    expect(f?.toplam).toEqual({ eski: '320.00', yeni: '300.00' });
    expect(f?.genel).toEqual({ eski: '384.00', yeni: '360.00' });
    expect(f?.eslesmeyen).toBe(false);
    expect(f !== null && uygulamaDegisiklikVar(f)).toBe(true);
  });

  it('sayısal olarak aynı fiyat değişiklik sayılmaz; KDV ve ödeme koşulu ayrı farktır; sürümde null olan alan farkta yok', () => {
    const ayni = uygulamaFarki(teklif('10.00', '20'), 2, siparis());
    expect(ayni !== null && uygulamaDegisiklikVar(ayni)).toBe(false);
    const kosul = uygulamaFarki(teklif('10', '20', { kdvOrani: '10.00', odemeKosulu: '60 gün' }), 2, siparis());
    expect(kosul?.kdv).toEqual({ eski: '20.00', yeni: '10.00' });
    expect(kosul?.odeme).toEqual({ eski: '30 gün', yeni: '60 gün' });
    expect(kosul !== null && uygulamaDegisiklikVar(kosul)).toBe(true);
    const bos = uygulamaFarki(teklif('10', '20', { kdvOrani: null, odemeKosulu: null, genelToplam: null }), 2, siparis());
    expect([bos?.kdv, bos?.odeme, bos?.genel]).toEqual([null, null, null]);
  });

  it('termin farkı yalnız bilgi olarak döner; eşleşmeyen kalem işaretlenir; olmayan sürümde null', () => {
    expect(uygulamaFarki(teklif('10', '20', { terminTarihi: '2026-12-20' }), 2, siparis())?.terminFarki).toEqual({ surum: '2026-12-20', siparis: '2026-12-01' });
    const eksik = siparis({ satirlar: [{ sira: 1, malzemeNo: 99, malzemeAdi: 'Başka', birimFiyat: '10' }] as SiparisAyrintisi['satirlar'] });
    expect(uygulamaFarki(teklif('10', '20'), 2, eksik)?.eslesmeyen).toBe(true);
    expect(uygulamaFarki(teklif('10', '20'), 5, siparis())).toBeNull();
  });
});
