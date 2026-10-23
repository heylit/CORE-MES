import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const MALZEMELER_SAYFALARI = [
  { yol: '/malzemeler', islem: 'sayfa.malzemeler', baslik: 'Malzemeler ve Hizmetler', simge: 'tag', grup: 'Stok', sira: 20, aramaUcu: '/malzemeler/ara' },
] as const satisfies readonly SayfaTanimi[];

// Maddeler (Logo gönderimi dışında) prototipin kendi görünüm şeridindeki bölümlerdir (sıra, ad ve grup aynı); şerit çerçevede gizlenir. Anahtar prototipin görünüm adıdır
// (`setView`). Kök katalogdur: salt okuyan da açar. Madde işlemi yalnız görünürlüktür; yeni kartı yalnız yazabilen görür.
export const MALZEMELER_IKINCI_MENU = {
  kok: '/malzemeler',
  baslik: 'Malzemeler ve Hizmetler',
  simge: 'tag',
  cerceveli: true,
  gruplar: [
    { maddeler: [
      { anahtar: 'new', baslik: 'Yeni kart', yol: '/malzemeler/yeni', simge: 'plus', islem: 'malzemeler.yaz' },
      { anahtar: 'cat', baslik: 'Katalog', yol: '/malzemeler', simge: 'list', islem: 'sayfa.malzemeler',
        okur: ['/malzeme-katalogu-ayarlari', '/malzeme-katalogu-kartlari', '/stok/malzeme-kart-bilgileri'] },
    ] },
    { baslik: 'Tanımlar', maddeler: [
      { anahtar: 'tpl', baslik: 'Şablonlar', yol: '/malzemeler/sablonlar', simge: 'grid', islem: 'sayfa.malzemeler' },
      { anahtar: 'mayar', baslik: 'Malzeme ayarları', yol: '/malzemeler/ayarlar', simge: 'gear', islem: 'sayfa.malzemeler' },
    ] },
    // Prototipin görünümü değil, kabuğun kendi sayfası (kart #232): Logo gönderim durumu salt okunur, karşılıklar tanım yazanın.
    { baslik: 'Logo', maddeler: [
      { anahtar: 'logo', baslik: 'Logo gönderimi', yol: '/malzemeler/logo', simge: 'upload', islem: 'sayfa.malzemeler' },
    ] },
    { baslik: 'Yardım', maddeler: [
      { anahtar: 'kilavuz', baslik: 'Kılavuz', yol: '/malzemeler/kilavuz', simge: 'eye', islem: 'sayfa.malzemeler' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
