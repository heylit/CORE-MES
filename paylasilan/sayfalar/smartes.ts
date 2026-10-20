import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Ana menüde görünmez: SmartES Sistem Ayarları > Bağlantılar'dan açılır; kayıt yetki ve adres için kalır.
export const SMARTES_SAYFALARI = [
  { yol: '/smartes', islem: 'sayfa.smartes', baslik: 'SmartES', simge: 'bolt', grup: 'Yönetim', sira: 9, menudeGizli: true },
] as const satisfies readonly SayfaTanimi[];

// Bütün maddeler sayfayı gören herkese açık okumadır; eşleme yazmak ayrıca `smartes.esleme-yaz` ister.
export const SMARTES_IKINCI_MENU = {
  kok: '/smartes',
  baslik: 'SmartES',
  simge: 'bolt',
  sayacUcu: '/smartes/menu-sayaclari',
  gruplar: [
    { maddeler: [
      { anahtar: 'durum', baslik: 'Bağlantı durumu', yol: '/smartes', simge: 'gauge', islem: 'sayfa.smartes' },
      { anahtar: 'eslemeler', baslik: 'Kod eşlemeleri', yol: '/smartes/eslemeler', simge: 'layers', islem: 'sayfa.smartes' },
    ] },
    { baslik: 'Gelen', maddeler: [
      { anahtar: 'is-emri-durumlari', baslik: 'Üretim sayıları', yol: '/smartes/is-emri-durumlari', simge: 'chart', islem: 'sayfa.smartes' },
      { anahtar: 'duruslar', baslik: 'Duruşlar', yol: '/smartes/duruslar', simge: 'pause', islem: 'sayfa.smartes' },
      { anahtar: 'alarmlar', baslik: 'Alarmlar', yol: '/smartes/alarmlar', simge: 'alert', islem: 'sayfa.smartes' },
    ] },
    { baslik: 'Giden', maddeler: [
      { anahtar: 'giden', baslik: 'İş emri gönderimi', yol: '/smartes/giden', simge: 'upload', islem: 'sayfa.smartes' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
