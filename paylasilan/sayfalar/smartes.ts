import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Menüde görünür (K25 a): sayfayı gören müdür ve planlama Sistem Ayarları'na giremez; yönetici ayrıca Sistem Ayarları > Bağlantılar'dan da açar.
export const SMARTES_SAYFALARI = [
  { yol: '/smartes', islem: 'sayfa.smartes', baslik: 'SmartES', simge: 'laptop', grup: 'Yönetim', sira: 9 },
] as const satisfies readonly SayfaTanimi[];

// Bütün maddeler sayfayı gören herkese açık okumadır; eşleme yazmak ayrıca `smartes.esleme-yaz`, adet onayı `smartes.adet-onayla` ister.
export const SMARTES_IKINCI_MENU = {
  kok: '/smartes',
  baslik: 'SmartES',
  simge: 'laptop',
  sayacUcu: '/smartes/menu-sayaclari',
  gruplar: [
    { maddeler: [
      { anahtar: 'durum', baslik: 'Bağlantı durumu', yol: '/smartes', simge: 'gauge', islem: 'sayfa.smartes' },
      { anahtar: 'eslemeler', baslik: 'Kod eşlemeleri', yol: '/smartes/eslemeler', simge: 'layers', islem: 'sayfa.smartes' },
    ] },
    { baslik: 'Gelen', maddeler: [
      { anahtar: 'onay-bekliyor', baslik: 'Onay bekliyor', yol: '/smartes/onay-bekleyenler', simge: 'check', islem: 'sayfa.smartes' },
      { anahtar: 'makineler', baslik: 'Makineler canlı', yol: '/smartes/makineler', simge: 'cpu', islem: 'sayfa.smartes' },
      { anahtar: 'makine-bulgulari', baslik: 'Makine bulguları', yol: '/smartes/makine-bulgulari', simge: 'gauge', islem: 'sayfa.smartes' },
      { anahtar: 'is-emri-durumlari', baslik: 'Üretim sayıları', yol: '/smartes/is-emri-durumlari', simge: 'chart', islem: 'sayfa.smartes' },
      { anahtar: 'duruslar', baslik: 'Duruşlar', yol: '/smartes/duruslar', simge: 'pause', islem: 'sayfa.smartes' },
      { anahtar: 'alarmlar', baslik: 'Alarmlar', yol: '/smartes/alarmlar', simge: 'alert', islem: 'sayfa.smartes' },
      { anahtar: 'fire', baslik: 'Fire', yol: '/smartes/fire', simge: 'trash', islem: 'sayfa.smartes' },
      { anahtar: 'ambar', baslik: 'Ambar hareketleri', yol: '/smartes/ambar', simge: 'pallet', islem: 'sayfa.smartes' },
      { anahtar: 'kalite', baslik: 'Kalite ölçümleri', yol: '/smartes/kalite', simge: 'ruler', islem: 'sayfa.smartes' },
      { anahtar: 'hesaplar', baslik: 'SmartES hesapları', yol: '/smartes/hesaplar', simge: 'target', islem: 'sayfa.smartes' },
    ] },
    { baslik: 'Giden', maddeler: [
      { anahtar: 'giden', baslik: 'İş emri gönderimi', yol: '/smartes/giden', simge: 'upload', islem: 'sayfa.smartes' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
