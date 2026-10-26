import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const ISTASYONLAR_SAYFALARI = [
  { yol: '/istasyonlar', islem: 'sayfa.istasyonlar', baslik: 'İstasyonlar', simge: 'cpu', grup: 'Tanımlar', sira: 20, aramaUcu: '/istasyonlar/ara' },
] as const satisfies readonly SayfaTanimi[];

// Kaynaklar tek sayfanın bölümleridir (Reçete ve Rota düzeni, kart #1109); bölümü adres seçer (`Istasyonlar.tsx` bölümleri bu maddelerden okur).
export const ISTASYONLAR_IKINCI_MENU = {
  kok: '/istasyonlar',
  baslik: 'İstasyonlar',
  simge: 'cpu',
  gruplar: [
    { maddeler: [
      { anahtar: 'genel', baslik: 'Genel bakış', yol: '/istasyonlar', simge: 'grid', islem: 'sayfa.istasyonlar' },
      { anahtar: 'is-merkezleri', baslik: 'İş merkezleri ve istasyonlar', yol: '/istasyonlar/is-merkezleri', simge: 'layers', islem: 'sayfa.istasyonlar' },
      { anahtar: 'makineler', baslik: 'Makineler', yol: '/istasyonlar/makineler', simge: 'cpu', islem: 'sayfa.istasyonlar' },
      { anahtar: 'personel', baslik: 'Personel', yol: '/istasyonlar/personel', simge: 'user', islem: 'sayfa.istasyonlar' },
      { anahtar: 'yetkinlik', baslik: 'Yetkinlik', yol: '/istasyonlar/yetkinlik', simge: 'clipboard-check', islem: 'sayfa.istasyonlar' },
      { anahtar: 'vardiyalar', baslik: 'Vardiyalar', yol: '/istasyonlar/vardiyalar', simge: 'clock', islem: 'sayfa.istasyonlar' },
    ] },
    { baslik: 'Yönetim', maddeler: [
      { anahtar: 'operasyon-tipleri', baslik: 'Operasyon tipleri', yol: '/istasyonlar/operasyon-tipleri', simge: 'list', islem: 'sayfa.istasyonlar' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
