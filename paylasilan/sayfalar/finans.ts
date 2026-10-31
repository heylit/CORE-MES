import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Finans tek sayfadır; kendi sayfaları ikinci menüdedir. Her madde finans ekranını kendi adresinde açar, ekran maddeleri kendi
// sekmesi olarak çizer (1392 a).
// Sira 5: Sistem Ayarları (10) Yönetim grubunda en sonda kalır.
export const FINANS_SAYFALARI = [
  { yol: '/finans', islem: 'sayfa.finans', baslik: 'Finans ve Muhasebe', simge: 'lira', grup: 'Yönetim', sira: 5 },
] as const satisfies readonly SayfaTanimi[];

// Firmalar firma kartı yetkisiyle (musteri-tedarikci.oku), genel gider oranı maliyet yetkisiyle (finans.maliyet-oku), öteki maddeler finans rakamlarıyla (finans.oku) açılır: yalnız firma
// yetkisi olan kullanıcı finansa girince yalnız Firmalar'ı görür. Kartın asıl sayfası Müşteriler ve Tedarikçiler'dir (kart #1164).
export const FINANS_IKINCI_MENU = {
  kok: '/finans',
  baslik: 'Finans ve Muhasebe',
  simge: 'lira',
  // Ekran dolgusunu ve kaydırmasını kendisi yapar; kabuk içerik alanını dolgusuz verir, tam ekran düğmesi kalır.
  cerceveli: true,
  sayacUcu: '/finans/menu-sayaclari',
  gruplar: [
    { maddeler: [
      { anahtar: 'ana-sayfa', baslik: 'Ana sayfa', yol: '/finans', simge: 'gauge', islem: 'finans.oku' },
      { anahtar: 'kayitlar', baslik: 'Kayıtlar', yol: '/finans/kayitlar', simge: 'list', islem: 'finans.oku' },
      { anahtar: 'firmalar', baslik: 'Firmalar', yol: '/finans/firmalar', simge: 'user', islem: 'musteri-tedarikci.oku' },
      { anahtar: 'cekler', baslik: 'Çek ve senet', yol: '/finans/cekler', simge: 'layers', islem: 'finans.oku' },
    ] },
    { baslik: 'Plan', maddeler: [
      { anahtar: 'nakit', baslik: 'Nakit planı', yol: '/finans/nakit', simge: 'chart', islem: 'finans.oku' },
      { anahtar: 'butce', baslik: 'Bütçe', yol: '/finans/butce', simge: 'target', islem: 'finans.oku' },
      { anahtar: 'vergi', baslik: 'Vergi takvimi', yol: '/finans/vergi', simge: 'clock', islem: 'finans.oku' },
    ] },
    { baslik: 'Raporlar', maddeler: [
      { anahtar: 'durum', baslik: 'Durum ve öneriler', yol: '/finans/durum', simge: 'eye', islem: 'finans.oku' },
      { anahtar: 'gelir-tablosu', baslik: 'Gelir tablosu', yol: '/finans/gelir-tablosu', simge: 'grid', islem: 'finans.oku' },
      { anahtar: 'karar-araclari', baslik: 'Karar araçları', yol: '/finans/karar-araclari', simge: 'tool', islem: 'finans.oku' },
      { anahtar: 'ay-sonu', baslik: 'Ay sonu kapanışı', yol: '/finans/ay-sonu', simge: 'check', islem: 'finans.oku' },
      { anahtar: 'tahminler', baslik: 'Tahminler ve doğruluk', yol: '/finans/tahminler', simge: 'lab', islem: 'finans.oku' },
    ] },
    { baslik: 'Sistem', maddeler: [
      { anahtar: 'genel-gider', baslik: 'Genel gider oranı', yol: '/finans/genel-gider', simge: 'tag', islem: 'finans.maliyet-oku' },
      { anahtar: 'ayarlar', baslik: 'Ayarlar', yol: '/finans/ayarlar', simge: 'gear', islem: 'finans.yonet' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
