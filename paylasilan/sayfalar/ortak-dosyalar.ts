import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const ORTAK_DOSYALAR_SAYFALARI = [
  { yol: '/ortak-dosyalar', islem: 'sayfa.ortak-dosyalar', baslik: 'Ortak Dosyalar', simge: 'more', grup: 'Yönetim', sira: 7 },
] as const satisfies readonly SayfaTanimi[];

// Üç görünüm sayfayı gören herkese açıktır (Ayarlar yalnız yetki işlemiyle); klasör ve dosya, kişinin klasör düzeyine göre sunucuda süzülür (ADR 0030).
export const ORTAK_DOSYALAR_IKINCI_MENU = {
  kok: '/ortak-dosyalar',
  baslik: 'Ortak Dosyalar',
  simge: 'more',
  gruplar: [
    { maddeler: [
      { anahtar: 'klasorler', baslik: 'Klasörler', yol: '/ortak-dosyalar', simge: 'layers', islem: 'sayfa.ortak-dosyalar' },
      { anahtar: 'son', baslik: 'Son eklenenler', yol: '/ortak-dosyalar/son-eklenenler', simge: 'clock', islem: 'sayfa.ortak-dosyalar' },
      { anahtar: 'arsiv', baslik: 'Arşiv', yol: '/ortak-dosyalar/arsiv', simge: 'lock', islem: 'sayfa.ortak-dosyalar' },
      // Kayda bağlı klasörlerin ayarları (kart 3288): yalnız yetki işlemi olan (yönetici rolü) görür; sunucu her uçta yeniden denetler.
      { anahtar: 'ayarlar', baslik: 'Ayarlar', yol: '/ortak-dosyalar/ayarlar', simge: 'gear', islem: 'ortak-dosyalar.yetki-ver' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
