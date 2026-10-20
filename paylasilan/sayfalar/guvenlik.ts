import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Denetim Kaydı ile Mesaj arasında durur; yalnız bayraklı yönetici görür (kullanıcı kararı 14.10.2026).
export const GUVENLIK_SAYFALARI = [
  { yol: '/guvenlik', islem: 'sayfa.guvenlik', baslik: 'Güvenlik Merkezi', simge: 'lock', grup: 'Yönetim', sira: 6 },
] as const satisfies readonly SayfaTanimi[];

// Bütün bölümler aynı okumadır (guvenlik.oku); yazma düğmeleri ayrıca guvenlik.yonet ister. Sayaç açık alarm sayısıdır.
export const GUVENLIK_IKINCI_MENU = {
  kok: '/guvenlik',
  baslik: 'Güvenlik Merkezi',
  simge: 'lock',
  sayacUcu: '/guvenlik/menu-sayaclari',
  gruplar: [
    { baslik: 'İzleme', maddeler: [
      { anahtar: 'durum', baslik: 'Durum', yol: '/guvenlik', simge: 'gauge', islem: 'guvenlik.oku' },
      { anahtar: 'alarmlar', baslik: 'Alarmlar', yol: '/guvenlik/alarmlar', simge: 'bell', islem: 'guvenlik.oku' },
    ] },
    { baslik: 'Takip', maddeler: [
      { anahtar: 'girisler', baslik: 'Girişler', yol: '/guvenlik/girisler', simge: 'user', islem: 'guvenlik.oku' },
      { anahtar: 'oturumlar', baslik: 'Oturumlar ve kilitler', yol: '/guvenlik/oturumlar', simge: 'lock', islem: 'guvenlik.oku' },
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
