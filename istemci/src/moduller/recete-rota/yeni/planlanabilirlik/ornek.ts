import type { PlanlanabilirlikCevabi, RotaPlanlanabilirlikCevabi } from '#paylasilan/sozlesme/plan.ts';

// Test verisi (uydurma): kullanıcının gördüğü durumun biçimi. OP 20 ufukta yer bulamadı, OP 60 insanlı istasyonda vardiyalı kişi yok,
// OP 30-50 OP 20'yi, OP 70 OP 60'ı bekliyor. İkinci emir yalnız süre eksiği taşır.
const tamam = (kod: 'sure-bos' | 'istasyon-yok' | 'makine-yok' | 'yetkin-kisi-yok' | 'takvim-yok') => ({ kod, durum: 'tamam' as const, metin: 'Tamam.', hedef: null, yaklasik: false });

export function ornekEmirler(): PlanlanabilirlikCevabi {
  return {
    motorZamani: '2026-11-10T08:00:00.000Z',
    acikEmir: 5,
    emirler: [
      {
        uretimEmriId: 101, emirNo: 'UE-0101', urunId: 11, urunKodu: 'MM-0001', urunAdi: 'Örnek gövde', adet: 100, termin: '2026-12-10',
        adimlar: [
          { opNo: 20, ad: 'Frezeleme', istasyon: 'Freze 1', kok: 'ufuk', bekledigiEmirNo: null, bekledigiOp: null, kontroller: [
            tamam('sure-bos'), tamam('istasyon-yok'), tamam('makine-yok'), tamam('takvim-yok'),
            { kod: 'ufuk', durum: 'eksik', metin: 'Adımın süresi kalan ufku aşıyor.', hedef: null, yaklasik: true },
          ] },
          { opNo: 30, ad: 'Taşlama', istasyon: 'Taşlama', kok: 'oncul', bekledigiEmirNo: null, bekledigiOp: 20, kontroller: [] },
          { opNo: 40, ad: 'Çapak', istasyon: 'Tezgâh', kok: 'oncul', bekledigiEmirNo: null, bekledigiOp: 20, kontroller: [] },
          { opNo: 50, ad: 'Yıkama', istasyon: 'Yıkama', kok: 'oncul', bekledigiEmirNo: null, bekledigiOp: 20, kontroller: [] },
          { opNo: 60, ad: 'Kontrol', istasyon: 'Kalite', kok: 'kisi-vardiyasiz', bekledigiEmirNo: null, bekledigiOp: null, kontroller: [
            tamam('sure-bos'), tamam('yetkin-kisi-yok'),
            { kod: 'kisi-vardiyasiz', durum: 'eksik', metin: 'Kalite insanlı istasyon; yetkin kişilerin vardiyası yok.', hedef: { tur: 'istasyon', id: 7, ad: 'Kalite' }, yaklasik: false },
          ] },
          { opNo: 70, ad: 'Paketleme', istasyon: 'Paket', kok: 'oncul', bekledigiEmirNo: null, bekledigiOp: 60, kontroller: [] },
        ],
      },
      {
        uretimEmriId: 102, emirNo: 'UE-0102', urunId: 12, urunKodu: 'MM-0002', urunAdi: 'Örnek mil', adet: 10, termin: null,
        adimlar: [
          { opNo: 10, ad: 'Tornalama', istasyon: 'Torna 1', kok: 'sure-bos', bekledigiEmirNo: null, bekledigiOp: null, kontroller: [
            { kod: 'sure-bos', durum: 'eksik', metin: 'Rotada çevrim süresi girilmemiş.', hedef: null, yaklasik: false },
            { kod: 'takvim-yok', durum: 'olculemedi', metin: 'Süre olmadan ölçülemedi.', hedef: null, yaklasik: false },
          ] },
        ],
      },
    ],
  };
}

export function ornekRotalar(): RotaPlanlanabilirlikCevabi {
  return {
    urunler: [
      { urunId: 12, urunKodu: 'MM-0002', urunAdi: 'Örnek mil', acikEmir: 3, adimlar: [
        { opNo: 10, ad: 'Tornalama', istasyon: 'Torna 1', kok: 'sure-bos', bekledigiEmirNo: null, bekledigiOp: null, kontroller: [
          { kod: 'sure-bos', durum: 'eksik', metin: 'Rotada çevrim süresi girilmemiş.', hedef: null, yaklasik: false },
        ] },
        { opNo: 20, ad: 'Frezeleme', istasyon: 'Freze 1', kok: null, bekledigiEmirNo: null, bekledigiOp: null, kontroller: [tamam('sure-bos'), tamam('makine-yok')] },
      ] },
      { urunId: 13, urunKodu: 'MM-0003', urunAdi: 'Örnek flanş', acikEmir: 0, adimlar: [
        { opNo: 10, ad: 'Tornalama', istasyon: 'Torna 1', kok: null, bekledigiEmirNo: null, bekledigiOp: null, kontroller: [tamam('sure-bos')] },
      ] },
    ],
  };
}
