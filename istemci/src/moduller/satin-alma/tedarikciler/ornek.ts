import type { OnayliListeCevabi } from '#paylasilan/sozlesme/satin-alma.ts';

type Kalite = NonNullable<OnayliListeCevabi['firmalar'][number]['kalite']>;
const kalite = (k: Partial<Kalite>): Kalite => ({
  durum: 'Onaylı', firmaAskida: null, adIleEslendi: false, kritiklik: null, sertifikalar: [], sertifikaBitisi: null, sonDenetim: null, kategoriler: [], onaylar: [], ...k,
});

type Onay = Kalite['onaylar'][number];
const onay: Onay = {
  tur: 'musteri', musteriFirmaId: null, musteriAd: null, ad: null, kapsamTumu: false, kapsam: [], durum: 'onayli', suresiGecti: false, aciklama: null, bitis: null, belgeVar: false,
};

// Uydurma ORN- veri: dört firma, iki kategori (ısıl işlem kararlı, kesici takım kararsız).
export const ORNEK_LISTE: OnayliListeCevabi = {
  kaliteBagli: true,
  firmalar: [
    { firmaId: 1, ad: 'ORN-Anka', satinAlmaTedarikcisi: true, sonYil: { siparis: 23, teslim: 20, zamanindaYuzde: 96, yetersizVeri: false }, kalite: kalite({ kritiklik: 'Kritik', sertifikalar: ['ISO 9001'], sertifikaBitisi: '2027-09-18', sonDenetim: '2026-02-05',
      kategoriler: [{ kategoriTuru: 'hizmet', kategoriKodu: 'isil', durum: 'onayli', aciklama: null, tarih: '2026-03-12T08:00:00.000Z', kisiAd: 'ORN-Kalite Sorumlusu' }],
      onaylar: [
        { ...onay, musteriFirmaId: 50, musteriAd: 'ORN-Müşteri Hava', kapsam: [{ kategoriTuru: 'hizmet', kategoriKodu: 'isil' }], bitis: '2027-12-31', belgeVar: true },
        { ...onay, musteriFirmaId: 51, musteriAd: 'ORN-Müşteri Kara', kapsamTumu: true, durum: 'sartli', aciklama: 'ORN müşteri şartı' },
        { ...onay, tur: 'diger', ad: 'ORN-Sınıf onayı', kapsamTumu: true },
      ] }) },
    { firmaId: 2, ad: 'ORN-Demir', satinAlmaTedarikcisi: true, sonYil: { siparis: 1, teslim: 1, zamanindaYuzde: 100, yetersizVeri: true }, kalite: kalite({ durum: 'Şartlı onaylı', adIleEslendi: true, sertifikalar: ['ISO 9001'], sertifikaBitisi: '2026-12-02',
      kategoriler: [{ kategoriTuru: 'hizmet', kategoriKodu: 'isil', durum: 'sartli', aciklama: 'ORN şart: her partide rapor', tarih: '2026-03-12T08:00:00.000Z', kisiAd: 'ORN-Kalite Sorumlusu' }],
      onaylar: [{ ...onay, musteriFirmaId: 50, musteriAd: 'ORN-Müşteri Hava', kapsam: [{ kategoriTuru: 'hizmet', kategoriKodu: 'isil' }], durum: 'onaysiz', suresiGecti: true, bitis: '2026-10-01' }] }) },
    { firmaId: 3, ad: 'ORN-Kuzey', satinAlmaTedarikcisi: false, sonYil: { siparis: 1, teslim: 1, zamanindaYuzde: 100, yetersizVeri: true }, kalite: kalite({ durum: 'Askıda', sertifikaBitisi: '2026-10-20' }) },
    { firmaId: 4, ad: 'ORN-Ege', satinAlmaTedarikcisi: true, sonYil: { siparis: 1, teslim: 1, zamanindaYuzde: 100, yetersizVeri: true }, kalite: null },
  ],
  kategoriler: [
    { tur: 'hizmet', kod: 'isil', ad: 'Isıl işlem', ustAd: 'Hizmet', aktif: true },
    { tur: 'sarf', kod: 'kesici', ad: 'Kesici takım', ustAd: 'Sarf', aktif: true },
    { tur: 'sarf', kod: 'eski', ad: 'Eski', ustAd: 'Sarf', aktif: false },
  ],
  malzemeKategorileri: [{ malzemeNo: 10, tur: 'hizmet', kod: 'isil' }, { malzemeNo: 11, tur: 'sarf', kod: 'kesici' }],
  projeMusterileri: [{ projeId: 7, musteriFirmaId: 50, musteriAd: 'ORN-Müşteri Hava' }],
};
export const BUGUN = '2026-11-15';
