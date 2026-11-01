import type { PatlatmaOnizlemeCevabi } from '#paylasilan/sozlesme/rota.ts';

// Patlamış rota önizlemesinin uydurma cevabı (1476-F testleri): kök 11 (Rev A, 71), alt parça 13 (K1, kök başına 2), onun altı 14 (K1.1, 6).
const urun = (id: number, kod: string, ad: string, tur: string) => ({ id, stokKodu: kod, ad, tur, stokBirimi: 'adet', onayDurumu: 'onayli' });
export function onizlemeOrnegi(ek: Partial<PatlatmaOnizlemeCevabi> = {}): PatlatmaOnizlemeCevabi {
  return {
    kokRevizyon: { id: 71, harf: 'A' }, ileti: null, engel: null,
    dugumler: [
      { dugum: '0.1.1', dal: 'K1.1', katman: 2, malzeme: urun(14, 'YM-0014', 'Örnek burç', 'yari'), revizyon: { id: 91, harf: 'A' }, kokBasina: '6',
        tuketen: { dugum: '0.1', dal: 'K1', kaynakOpNo: 10, emirOpNo: 1020 }, adimlar: [{ kaynakOpNo: 10, emirOpNo: 1010, ad: 'Torna', yer: 'Torna hücresi' }] },
      { dugum: '0.1', dal: 'K1', katman: 1, malzeme: urun(13, 'YM-0013', 'Örnek mil', 'yari'), revizyon: { id: 81, harf: 'B' }, kokBasina: '2',
        tuketen: { dugum: '0', dal: null, kaynakOpNo: 10, emirOpNo: 10 }, adimlar: [{ kaynakOpNo: 10, emirOpNo: 1020, ad: 'Freze', yer: null }] },
      { dugum: '0', dal: null, katman: 0, malzeme: urun(11, 'MM-0011', 'Örnek gövde', 'mamul'), revizyon: { id: 71, harf: 'A' }, kokBasina: '1',
        tuketen: null, adimlar: [{ kaynakOpNo: 10, emirOpNo: 10, ad: 'Tornalama', yer: 'Montaj' }] },
    ],
    ...ek,
  };
}
