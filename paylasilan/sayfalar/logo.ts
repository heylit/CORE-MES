import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// 3068: geçişin başında Logo'daki kayıtları CORE'a almak ya da bağlamak için. Sayfa işlemi yalnız görünürlüktür; veriyi sekmenin
// sahibi modülün işlemleri açar (malzemeler okuma ve yazma).
// 3345 a: Logo irsaliyeleri yalnız okuma sayfasıdır; veri logo.irsaliye-oku ister. Stok grubunda: Satın Alma grubu tek sayfadır (sayfalar.test.ts).
export const LOGO_SAYFALARI = [
  { yol: '/logo-gecisi', islem: 'sayfa.logo-gecisi', baslik: 'Logo geçişi', simge: 'login', grup: 'Tanımlar', sira: 60 },
  { yol: '/logo-irsaliyeleri', islem: 'sayfa.logo-irsaliyeleri', baslik: 'Logo İrsaliyeleri', simge: 'sort', grup: 'Stok', sira: 50 },
] as const satisfies readonly SayfaTanimi[];

export const LOGO_IRSALIYELERI_IKINCI_MENU = {
  kok: '/logo-irsaliyeleri',
  baslik: 'Logo İrsaliyeleri',
  simge: 'sort',
  gruplar: [
    {
      maddeler: [
        { anahtar: 'alis', baslik: 'Alış irsaliyeleri', yol: '/logo-irsaliyeleri', simge: 'download', islem: 'logo.irsaliye-oku' },
        { anahtar: 'satis', baslik: 'Satış irsaliyeleri', yol: '/logo-irsaliyeleri/satis', simge: 'upload', islem: 'logo.irsaliye-oku' },
      ],
    },
  ],
} as const satisfies IkinciMenuTanimi;
