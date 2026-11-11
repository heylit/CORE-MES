import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Denetim Kaydı ile Mesaj arasında durur; yalnız bayraklı yönetici görür (kullanıcı kararı 14.10.2026).
// Sistem sağlığı da bu sayfadadır: yönetici sağlığa ve güvenliğe tek yerden bakıp karar verir (2231).
export const GUVENLIK_SAYFALARI = [
  { yol: '/guvenlik', islem: 'sayfa.guvenlik', baslik: 'Sistem ve Güvenlik', simge: 'lock', grup: 'Yönetim', sira: 6 },
] as const satisfies readonly SayfaTanimi[];

// Bütün bölümler aynı okumadır (guvenlik.oku); yazma düğmeleri ayrıca guvenlik.yonet ister. Sayaç açık alarm sayısıdır.
export const GUVENLIK_IKINCI_MENU = {
  kok: '/guvenlik',
  baslik: 'Sistem ve Güvenlik',
  simge: 'lock',
  sayacUcu: '/guvenlik/menu-sayaclari',
  // 1365 a: açık alarm sayısı ana menüde de görünür; yönetici sayfaya girmeden görür.
  anaMenuSayaci: 'alarmlar',
  gruplar: [
    { baslik: 'İzleme', maddeler: [
      { anahtar: 'durum', baslik: 'Pano', yol: '/guvenlik', simge: 'gauge', islem: 'guvenlik.oku' },
      { anahtar: 'alarmlar', baslik: 'Alarmlar', yol: '/guvenlik/alarmlar', simge: 'bell', islem: 'guvenlik.oku' },
    ] },
    { baslik: 'Takip', maddeler: [
      { anahtar: 'girisler', baslik: 'Girişler', yol: '/guvenlik/girisler', simge: 'user', islem: 'guvenlik.oku' },
      { anahtar: 'oturumlar', baslik: 'Oturumlar ve kilitler', yol: '/guvenlik/oturumlar', simge: 'lock', islem: 'guvenlik.oku' },
      { anahtar: 'reddedilen', baslik: 'Reddedilen istekler', yol: '/guvenlik/reddedilen', simge: 'alert', islem: 'guvenlik.oku' },
    ] },
    { baslik: 'Koruma', maddeler: [
      { anahtar: 'koruma', baslik: 'Koruma durumu', yol: '/guvenlik/koruma', simge: 'check', islem: 'guvenlik.oku' },
      { anahtar: 'kurallar', baslik: 'Kurallar', yol: '/guvenlik/kurallar', simge: 'gear', islem: 'guvenlik.oku' },
    ] },
    { baslik: 'Kayıt', maddeler: [
      { anahtar: 'yonetici-islemleri', baslik: 'Yönetici işlemleri', yol: '/guvenlik/yonetici-islemleri', simge: 'eye', islem: 'guvenlik.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
