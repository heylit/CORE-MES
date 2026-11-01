import { describe, expect, it } from 'vitest';
import type { MrpIhtiyaciCevabi } from '#paylasilan/sozlesme/plan.ts';
import { gunMetni, mrpOzeti, sayiMetni, suz, turAdi, yetkiNotu, type MrpSatiri } from './kurallar.ts';

// Malzeme ihtiyacı ekranının saf kuralları (1560). Veriler uydurmadır.

const satir = (id: number, kod: string, ek: Partial<MrpSatiri> = {}): MrpSatiri => ({
  malzeme: { id, kod, ad: `Malzeme ${kod}`, tur: 'hammadde', birim: 'kg' }, brut: 10, serbest: 0, acikSiparis: 0, net: 0, emniyetPayi: null,
  ihtiyacTarihi: '2026-11-03', eksikTarihi: null, emirler: ['E-1'], acilanlar: [], acildi: false, ...ek,
});
const RAPOR: MrpIhtiyaciCevabi = {
  hesaplanan: '2026-11-01T09:00:00.000Z', stokGorunur: true, satinAlmaGorunur: true, urunsuzEmir: 0,
  satirlar: [
    satir(1, 'YM-1', { acildi: true, net: 4, eksikTarihi: '2026-11-02' }),
    satir(2, 'HM-1', { net: 6, eksikTarihi: '2026-11-05', acilanlar: [{ id: 1, kod: 'YM-1' }] }),
    satir(3, 'HM-2', { net: 2, eksikTarihi: '2026-11-04' }),
    satir(4, 'Çİ-3'),
  ],
};

describe('malzeme ihtiyacı kuralları', () => {
  it('biçimler: gün saat dilimine çevrilmez, miktar dört haneye kadar, bilinmeyen tür olduğu gibi', () => {
    expect(gunMetni('2026-11-04')).toBe('04.11.2026');
    expect(gunMetni(null)).toBeNull();
    expect(sayiMetni(1234.56789)).toBe('1.234,5679');
    expect(turAdi('yarimamul')).toBe('Yarı mamul');
    expect(turAdi('yeni_tur')).toBe('yeni_tur');
    expect(turAdi(null)).toBeNull();
  });

  it('özet: ağaçla açılan yarı mamul eksik sayılmaz; ilk eksik günü satın alınacaklardan', () => {
    expect(mrpOzeti(RAPOR)).toEqual({ malzeme: 4, eksik: 2, ilkEksikGunu: '2026-11-04' });
    expect(mrpOzeti({ ...RAPOR, satirlar: [satir(4, 'X')] })).toEqual({ malzeme: 1, eksik: 0, ilkEksikGunu: 'yok' });
  });

  it('1545 a: stok ya da satın alma görünmezse eksik ve ilk gün bilinmez, not hangi alanların gizli olduğunu söyler', () => {
    expect(mrpOzeti({ ...RAPOR, stokGorunur: false })).toEqual({ malzeme: 4, eksik: null, ilkEksikGunu: null });
    expect(yetkiNotu(RAPOR)).toBeNull();
    expect(yetkiNotu({ stokGorunur: false, satinAlmaGorunur: true })).toEqual({
      baslik: 'Stok okuma yetkiniz yok.', metin: 'Serbest stok ve emniyet payı, net ihtiyaç ve eksik günü gösterilmez; brüt ihtiyaç ve günleri tam.' });
    expect(yetkiNotu({ stokGorunur: true, satinAlmaGorunur: false })?.metin).toBe('Açık sipariş, net ihtiyaç ve eksik günü gösterilmez; brüt ihtiyaç ve günleri tam.');
    expect(yetkiNotu({ stokGorunur: false, satinAlmaGorunur: false })?.baslik).toBe('Stok ve satın alma okuma yetkiniz yok.');
  });

  it('süzgeç: eksik, ağaçtan ve Türkçe büyük-küçük harfe duyarsız arama', () => {
    const kodlar = (l: MrpSatiri[]) => l.map((s) => s.malzeme.kod);
    expect(kodlar(suz(RAPOR.satirlar, 'eksik', ''))).toEqual(['YM-1', 'HM-1', 'HM-2']);
    expect(kodlar(suz(RAPOR.satirlar, 'agac', ''))).toEqual(['YM-1', 'HM-1']);
    expect(kodlar(suz(RAPOR.satirlar, 'tum', 'çi'))).toEqual(['Çİ-3']);
    expect(kodlar(suz(RAPOR.satirlar, 'tum', '  hm-2 '))).toEqual(['HM-2']);
  });
});
