import type { KayitTuru } from '#paylasilan/sozlesme/etiket-merkezi.ts';

// Olaydan doğan etiket işleri: hangi olayda, hangi ekranda düğme çıkar, hangi etiket, kaç kopya, Basılacaklar'a düşer mi ve olay
// ekranındaki düğme tek dokunuşla basabilir mi (2916 a). Sunucu hiçbir etiketi kendiliğinden basmaz; kişi düğmeye basar.
// Liste depodaki düğmelerden çıkarılmıştır (EtiketMerkeziDugmesi ve `/etiket-merkezi?tur=` bağlantıları); yeni düğme eklenince buraya da
// satır eklenir, test her kayıt türünün listede olduğunu bekler.
export interface OtomatikIs {
  anahtar: string;
  olay: string;
  tur: KayitTuru;
  ekranlar: readonly { ad: string; yol: string }[];
  kopya: string;
  basilacaklar: boolean;
  // Olay ekranındaki düğme cihaz varsayılanıyla Etiket Merkezi'ni açmadan basar mı.
  tekDokunus: 'evet' | 'basilacaklarda' | 'hayir';
  // tekDokunus 'hayir' ise neden (kullanıcıya görünür).
  neden?: string;
}

export const OTOMATIK_ISLER: readonly OtomatikIs[] = [
  {
    anahtar: 'mal-kabul', olay: 'Mal kabul kaydedilince', tur: 'mal-kabul', kopya: 'Lot başına 1', basilacaklar: true, tekDokunus: 'evet',
    ekranlar: [{ ad: 'Stok · Mal kabul', yol: '/stok/mal-kabul' }, { ad: 'Mal kabul ayrıntısı', yol: '/stok/mal-kabul' }],
  },
  {
    anahtar: 'lot', olay: 'Tek lot (ayrıntıdan)', tur: 'lot', kopya: '1', basilacaklar: false, tekDokunus: 'evet',
    ekranlar: [{ ad: 'Stok · Malzeme ayrıntısı', yol: '/stok' }, { ad: 'Mal kabul yapılanlar', yol: '/stok/mal-kabul' }],
  },
  {
    anahtar: 'konum', olay: 'Konum açılınca ya da kodu değişince', tur: 'konum', kopya: '1', basilacaklar: false, tekDokunus: 'evet',
    ekranlar: [{ ad: 'Stok · Konumlar', yol: '/stok/konumlar' }, { ad: 'Raf matrisi, zemin ızgarası', yol: '/stok' }],
  },
  {
    anahtar: 'malzeme', olay: 'Malzeme kartı', tur: 'malzeme', kopya: '1', basilacaklar: false, tekDokunus: 'evet',
    ekranlar: [{ ad: 'Stok · Malzemeler', yol: '/stok/malzemeler' }, { ad: 'Hızlı işlem', yol: '/stok' }],
  },
  {
    anahtar: 'refakat', olay: 'Emre depodan lot verilince', tur: 'refakat-partisi', kopya: '2 (Kopya 1/2, 2/2)', basilacaklar: true, tekDokunus: 'basilacaklarda',
    ekranlar: [{ ad: 'Stok · Refakat kartları', yol: '/stok/refakat-kartlari' }, { ad: 'Üretim Emirleri · Refakat kartları', yol: '/uretim-emirleri' }],
    neden: 'Karttaki düğme Etiket Merkezi\'ni açar.',
  },
  {
    anahtar: 'kalite-durum', olay: 'Kalite kararı verilince', tur: 'kalite-durum', kopya: '1', basilacaklar: true, tekDokunus: 'basilacaklarda',
    ekranlar: [{ ad: 'Kalite Merkezi · Form belgesi', yol: '/kalite-merkezi' }],
    neden: 'Formdaki düğme Etiket Merkezi\'ni açar.',
  },
  {
    anahtar: 'hatali-parca', olay: 'Terminalde parça hatalı ayrılınca ya da karar değişince', tur: 'hatali-parca', kopya: '1', basilacaklar: true, tekDokunus: 'basilacaklarda',
    ekranlar: [], neden: 'Yalnız Basılacaklar\'dan basılır.',
  },
  {
    anahtar: 'sevk-koli', olay: 'Ürün sevke hazırlanınca', tur: 'sevk-koli', kopya: 'Koli sayısı kadar (n/N)', basilacaklar: false, tekDokunus: 'hayir',
    ekranlar: [{ ad: 'Sevkiyat · Tüm işler', yol: '/sevkiyat' }], neden: 'Koli sayısı her seferinde girilir.',
  },
  {
    anahtar: 'istasyon', olay: 'İstasyonun stok konumu açılınca', tur: 'istasyon', kopya: '1', basilacaklar: false, tekDokunus: 'hayir',
    ekranlar: [{ ad: 'İstasyonlar', yol: '/istasyonlar' }], neden: 'İstasyonlar düğmesi Etiket Merkezi\'ni açar.',
  },
  {
    anahtar: 'raf', olay: 'Fabrika Haritası\'nda raf kurulunca', tur: 'raf', kopya: '1', basilacaklar: false, tekDokunus: 'hayir',
    ekranlar: [], neden: 'Raf Etiket bas sayfasında seçilir.',
  },
];

// Katalogda olup henüz basılamayan türler (etiket_merkezi_etiket_turu durumu "Yapılacak").
export const YAPILACAK_ISLER: readonly { ad: string; olay: string }[] = [
  { ad: 'Kalibrasyon etiketi', olay: 'Ölçü aletinin kalibrasyonu uygun kaydedilince' },
  { ad: 'Seri no etiketi', olay: 'Parçaya seri no verilince' },
  { ad: 'Fason gidiş etiketi', olay: 'Parça fasona gönderilince' },
];
