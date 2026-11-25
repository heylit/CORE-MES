import { describe, expect, test } from 'vitest';
import { kartAyrintiSatirlari } from '../disari.ts';

describe('3706-2 kartAyrintiSatirlari', () => {
  test('hizmet kartı: grup, yön ve çeşit satırları gelir; kod ve ad tekrarlanmaz', async () => {
    const satirlar = await kartAyrintiSatirlari({ tur: 'hizmet', g: { kat: 'isil', yon: 'Alınan', cesit: 'Hidrojen gevrekliği giderme' }, com: { ad: 'ORNEK Isıl işlem (fason)', kod: 'HZ-ORN-00001', birim: 'kg', sertifika: [] } });
    const ad = (a: string) => satirlar.find((s) => s.ad === a)?.deger;
    console.log(JSON.stringify(satirlar));
    expect(satirlar.length).toBeGreaterThan(2);
    expect(JSON.stringify(satirlar)).toContain('Hidrojen gevrekliği giderme');
    expect(JSON.stringify(satirlar)).toContain('Alınan');
    expect(ad('Kod')).toBeUndefined();
    expect(ad('Ad')).toBeUndefined();
  });
});
