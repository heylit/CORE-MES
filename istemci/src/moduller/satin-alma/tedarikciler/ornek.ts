import type { OnayliListeCevabi } from '#paylasilan/sozlesme/satin-alma.ts';

type Kalite = NonNullable<OnayliListeCevabi['firmalar'][number]['kalite']>;
const kalite = (k: Partial<Kalite>): Kalite => ({
  durum: 'Onaylı', adIleEslendi: false, kritiklik: null, sertifikalar: [], sertifikaBitisi: null, sonDenetim: null, kategoriler: [], ...k,
});

// Uydurma ORN- veri: dört firma, iki kategori (ısıl işlem kararlı, kesici takım kararsız).
export const ORNEK_LISTE: OnayliListeCevabi = {
  kaliteBagli: true,
  firmalar: [
    { firmaId: 1, ad: 'ORN-Anka', satinAlmaTedarikcisi: true, kalite: kalite({ kritiklik: 'Kritik', sertifikalar: ['ISO 9001'], sertifikaBitisi: '2027-09-18', sonDenetim: '2026-02-05',
      kategoriler: [{ kategoriTuru: 'hizmet', kategoriKodu: 'isil', durum: 'onayli', aciklama: null, tarih: '2026-03-12T08:00:00.000Z' }] }) },
    { firmaId: 2, ad: 'ORN-Demir', satinAlmaTedarikcisi: true, kalite: kalite({ durum: 'Şartlı onaylı', adIleEslendi: true, sertifikalar: ['ISO 9001'], sertifikaBitisi: '2026-12-02',
      kategoriler: [{ kategoriTuru: 'hizmet', kategoriKodu: 'isil', durum: 'sartli', aciklama: 'ORN şart: her partide rapor', tarih: '2026-03-12T08:00:00.000Z' }] }) },
    { firmaId: 3, ad: 'ORN-Kuzey', satinAlmaTedarikcisi: false, kalite: kalite({ durum: 'Askıda', sertifikaBitisi: '2026-10-20' }) },
    { firmaId: 4, ad: 'ORN-Ege', satinAlmaTedarikcisi: true, kalite: null },
  ],
  kategoriler: [
    { tur: 'hizmet', kod: 'isil', ad: 'Isıl işlem', ustAd: 'Hizmet', aktif: true },
    { tur: 'sarf', kod: 'kesici', ad: 'Kesici takım', ustAd: 'Sarf', aktif: true },
    { tur: 'sarf', kod: 'eski', ad: 'Eski', ustAd: 'Sarf', aktif: false },
  ],
  malzemeKategorileri: [{ malzemeNo: 10, tur: 'hizmet', kod: 'isil' }, { malzemeNo: 11, tur: 'sarf', kod: 'kesici' }],
};
export const BUGUN = '2026-11-15';
