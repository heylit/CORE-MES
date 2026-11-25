import { describe, expect, test } from 'vitest';
import { kartAyrintiSatirlari } from '../disari.ts';

describe('3706-2 kartAyrintiSatirlari', () => {
  test('hizmet kartı: grup, yön ve çeşit satırları gelir; kod ve ad tekrarlanmaz', async () => {
    const satirlar = await kartAyrintiSatirlari({ tur: 'hizmet', g: { kat: 'isil', yon: 'Alınan', cesit: 'Hidrojen gevrekliği giderme' }, com: { ad: 'ORNEK Isıl işlem (fason)', kod: 'HZ-ORN-00001', birim: 'kg', sertifika: [] } });
    const ad = (a: string) => satirlar.find((s) => s.ad === a)?.deger;
    expect(satirlar.length).toBeGreaterThan(2);
    expect(JSON.stringify(satirlar)).toContain('Hydrogen embrittlement relief');
    expect(JSON.stringify(satirlar)).toContain('Alınan');
    expect(ad('Kod')).toBeUndefined();
    expect(ad('Ad')).toBeUndefined();
  });

  test('demirbaş ve sarf: alış, garanti, bakım, kalibrasyon, depo, tedarik tipi ve açıklama satırları yok; teknik alan kalır', async () => {
    const com = { ad: 'ORN', kod: 'DB-ORN-1', birim: 'adet', sertifika: [] };
    const db = await kartAyrintiSatirlari({ tur: 'demirbas', g: { kat: 'olcu', marka: 'ORN-MARKA', fatura: 'F-ORN', alis: '2026-01-01', garantiBitis: '2027-01-01', bakimAy: 6, sonBakim: '2026-02-01', kalibrasyon: 'Gerekli', kalAy: 12, sonKal: '2026-03-01', kalKurulus: 'ORN-KURULUS' }, com });
    const sr = await kartAyrintiSatirlari({ tur: 'sarf', g: { kat: 'asindirici', marka: 'ORN-MARKA', depoYeri: 'RAF-9', tedarik: 'Stoklu', siparisNoktasi: '5' }, com: { ...com, kod: 'SR-ORN-1' } });
    const metin = JSON.stringify([...db, ...sr]);
    for (const yasak of ['F-ORN', 'ORN-KURULUS', 'RAF-9', 'Stoklu', 'Fatura', 'Garanti', 'Kalibrasyon', 'Depo yeri', 'Tedarik tipi']) expect(metin).not.toContain(yasak);
    expect([...db, ...sr].some((s) => /^Açıklama \d/.test(s.ad))).toBe(false);
    expect(metin).toContain('ORN-MARKA');
  });
});
