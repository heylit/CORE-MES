import { isBekliyor, isTanimi } from '#cekirdek/zamanlayici.ts';
import { gunlukSkorYaz } from './servis.ts';

// 1456 b: günlük sağlık skoru sunucuda hesaplanır, ekranı açmak kayıt oluşturmaz. Tur on beş dakikada birdir; günün satırı
// yazılınca sonraki turlar yalnız varlığına bakar. Tesis günü değişince ilk tur yeni günün skorunu yazar.
export const isler = [
  isTanimi({
    ad: 'finans-gunluk-skor', aralikMs: 900_000,
    calis: async (db) => {
      if ((await gunlukSkorYaz(db, new Date())) === 'hesaplanamadi') return isBekliyor('Finans sağlık skoru hesaplanamadı: kayıt yok ya da skor ağırlıkları sıfır.');
    },
  }),
];
