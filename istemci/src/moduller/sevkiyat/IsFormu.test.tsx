import { describe, expect, it } from 'vitest';
import type { Arac } from '#paylasilan/sozlesme/sevkiyat.ts';
import { sabitAracUyarisi } from './IsFormu.tsx';

const ARAC: Arac = {
  id: 7, ad: 'Deneme Kamyonet', tur: 'kamyonet', plaka: null, kapasiteKilogram: '1500.00', kapasitePalet: 4, musaitBaslangic: '08:00', musaitBitis: '18:00',
  kilometreMaliyeti: null, saatMaliyeti: null, gunlukMaliyet: null, varsayilanMaliyet: null, aktif: true, surum: 1,
};
const taslak = (agirlikKilogram: string, paletSayisi: string, sabitAracId = '7') => ({ sabitAracId, agirlikKilogram, paletSayisi });

describe('sabitAracUyarisi (sabit aracın kapasitesini aşan yük formda uyarılır)', () => {
  it('sığan yükte ve sabit araç yokken uyarı yok', () => {
    expect(sabitAracUyarisi(taslak('1500', '4'), [ARAC])).toBeUndefined();
    expect(sabitAracUyarisi(taslak('3000', '6', ''), [ARAC])).toBeUndefined();
  });
  it('kg ya da palet aşınca aşılan sınırı yazar', () => {
    expect(sabitAracUyarisi(taslak('3000', '1'), [ARAC])).toBe('Deneme Kamyonet kapasitesini aşıyor (1.500 kg); bu araçla dağıtılamaz, iş havuzda kalır.');
    expect(sabitAracUyarisi(taslak('3000', '6'), [ARAC])).toBe('Deneme Kamyonet kapasitesini aşıyor (1.500 kg, 4 palet); bu araçla dağıtılamaz, iş havuzda kalır.');
  });
});
