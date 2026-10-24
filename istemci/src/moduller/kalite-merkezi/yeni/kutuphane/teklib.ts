// Teknik kütüphanenin sabit bölümü (uygulamadaki TEKLIB) olduğu gibi. Kaynak: ASME Y14.5, ISO 1101/1660/286.
// Satır: işaret, ad, tür, anlamı, nasıl ölçülür (boşsa yazılmaz).
export type KutuphaneSatiri = readonly [isaret: string, ad: string, tur: string, anlam: string, olcum: string];
export interface KutuphaneBolumu { baslik: string; satirlar: readonly KutuphaneSatiri[] }

export const TEKNIK_KUTUPHANE: readonly KutuphaneBolumu[] = [
  {
    baslik: 'Geometrik toleranslar (ASME Y14.5 / ISO 1101)',
    satirlar: [
      ['⏤', 'Doğrusallık', 'Form', 'Datumsuz; çizgi/eksenin doğruluğu.', 'Manuel (cetvel/komparatör) ya da CMM'],
      ['⏥', 'Düzlemsellik', 'Form', 'Datumsuz; iki paralel düzlem arası bölge.', '≥0,02 mm: pleyt + komparatör; dar: CMM (minimum bölge)'],
      ['○', 'Dairesellik', 'Form', 'Her kesitte iki eş merkezli daire arası.', 'Yuvarlaklık cihazı / CMM tarama'],
      ['⌭', 'Silindiriklik', 'Form', 'İki eş eksenli silindir arası.', 'CMM tarama veya form cihazı'],
      ['⌒', 'Çizgi profili', 'Profil', 'Kesitte nominal eğriye göre bölge; datumlu veya datumsuz.', 'CMM tarama'],
      ['⌓', 'Yüzey profili', 'Profil', 'Nominal yüzeye göre bölge; çoğunlukla datumlu.', 'CMM tarama, CAD karşılaştırma'],
      ['∥', 'Paralellik', 'Yönelim', 'Datuma paralel iki düzlem arası.', 'Pleyt + mihengir ya da CMM'],
      ['⟂', 'Diklik', 'Yönelim', 'Datuma dik bölge.', 'Gönye + komparatör ya da CMM'],
      ['∠', 'Açısallık', 'Yönelim', 'Datuma göre temel açıda bölge.', 'CMM ya da sinüs cetveli'],
      ['⌖', 'Konum', 'Konum', 'Temel ölçülerle tanımlı teorik konuma göre bölge; DRF zorunlu.', 'CMM; Ⓜ ile seri üretimde fonksiyonel mastar'],
      ['◎', 'Eş eksenlilik', 'Konum', '(Y14.5-2018\'de kaldırıldı; ISO\'da var) orta noktalar.', 'CMM'],
      ['⌯', 'Simetri', 'Konum', '(Y14.5-2018\'de kaldırıldı; ISO\'da var) orta düzlem.', 'CMM'],
      ['↗', 'Dairesel salgı', 'Salgı', 'Datum ekseni etrafında tek kesitte.', 'Punta/V-blok + komparatör'],
      ['⌰', 'Toplam salgı', 'Salgı', 'Tüm yüzey boyunca.', 'Punta + komparatör ya da CMM'],
    ],
  },
  {
    baslik: 'Değiştiriciler ve çerçeve',
    satirlar: [
      ['Ⓜ', 'Maksimum malzeme koşulu (MMC)', 'Değiştirici', 'Boyut MMC\'den uzaklaştıkça bonus tolerans.', 'CMM bonusu hesaplar; mastar uygulanabilir'],
      ['Ⓛ', 'Minimum malzeme koşulu (LMC)', 'Değiştirici', 'Et kalınlığı korumaları.', 'CMM'],
      ['Ⓟ', 'Projeksiyonlu bölge', 'Değiştirici', 'Bölge, parça dışına belirtilen boyda uzatılır (ör. vida delikleri).', 'CMM: eksen uzatılarak'],
      ['Ⓕ', 'Serbest durum', 'Değiştirici', 'Esnek parça bağlanmadan değerlendirilir.', 'CMM, bağlama kuvvetsiz'],
      ['Ⓣ', 'Teğet düzlem', 'Değiştirici', 'Yüzeyin yüksek noktalarına teğet düzlem.', 'CMM'],
      ['Ⓤ', 'Eşit dağılmamış profil', 'Değiştirici', 'Profil bölgesi bir yöne kaydırılır.', 'CMM'],
      ['ST', 'İstatistiksel tolerans', 'Değiştirici', 'İstatistiksel süreç kontrolü gerekir.', 'SPC'],
      ['CF', 'Sürekli özellik', 'Değiştirici', 'Kesintili yüzeyler tek özellik sayılır.', 'CMM'],
      ['┃⌖┃', 'Bileşik çerçeve', 'Çerçeve', 'Tek sembol iki satır: üst satır desen konumu (PLTZF), alt satır özellikler arası (FRTZF).', 'CMM: iki ayrı değerlendirme'],
    ],
  },
  {
    baslik: 'Ölçü ve özellik işaretleri',
    satirlar: [
      ['Ø', 'Çap', 'Ölçü', 'Çap ölçüsü.', 'Kumpas/mikrometre/mastar/CMM'],
      ['R', 'Yarıçap', 'Ölçü', '', 'Radyüs mastarı/CMM'],
      ['SØ', 'Küresel çap', 'Ölçü', '', 'CMM'],
      ['□', 'Kare', 'Ölçü', 'Kare kesit.', ''],
      ['⌴', 'Havşa (düz)', 'Delik', 'Düz havşa / alın yüzeyi.', ''],
      ['⌵', 'Konik havşa', 'Delik', '', ''],
      ['↧', 'Derinlik', 'Delik', '', ''],
      ['nX', 'Adet', 'Ölçü', '\"9 x Ø4.5\" = 9 özellik; her biri ayrı raporlanır (5a, 5b…).', ''],
      ['a/b', 'Limit ölçü', 'Ölçü', '\"Ø4.5/4.7\" = alt ve üst sınır doğrudan yazılmış.', ''],
      ['( )', 'Referans ölçü', 'Ölçü', 'Bilgi amaçlı; ölçülmez.', ''],
      ['▭', 'Temel (basic) ölçü', 'Ölçü', 'Kutulu; toleransı geometrik toleranstadır.', ''],
      ['a×b°', 'Pah', 'Ölçü', '\"2.5x30°\" = boy × açı.', ''],
      ['H7 / g6', 'ISO 286 uyum', 'Tolerans', 'Harf ve IT derecesinden sınırlar hesaplanır.', ''],
    ],
  },
  {
    baslik: 'Datum işaretleri',
    satirlar: [
      ['▣A', 'Datum özelliği', 'Datum', 'Kare içinde harf, üçgenle yüzeye bağlanır.', ''],
      ['ⓐA1', 'Datum hedefi', 'Datum', 'Bölünmüş daire: harf + numara; nokta, çizgi veya alan.', 'Fikstür pimleri ile'],
      ['A|B|C', 'Datum referans çerçevesi', 'Datum', 'Birincil, ikincil, üçüncül; 6 serbestlik derecesini kısıtlar.', 'CMM hizalaması 3-2-1'],
    ],
  },
  {
    baslik: 'Kritiklik ve not bayrakları',
    satirlar: [
      ['⬡', 'Altıgen bayrak', 'Bayrak', 'Genellikle bir nota bağlı kritik/özel karakteristik. Anlamı firmaya ve müşteriye göre değişir.', ''],
      ['◇', 'Elmas bayrak', 'Bayrak', 'Çoğunlukla kritik/fonksiyonel karakteristik.', ''],
      ['△', 'Üçgen bayrak', 'Bayrak', 'Revizyon işareti ya da özel karakteristik (otomotivde SC).', ''],
    ],
  },
];
