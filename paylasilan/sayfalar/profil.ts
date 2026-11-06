import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Geri Bildirim Merkezi (kart 2192): çalışanların şikayet, istek ve önerileri. Gönderme üst çubuktaki Hesap menüsündedir ve
// her çalışanındır; bu sayfa okuyan ve yanıtlayanındır. Profilim menü sayfası değildir, burada yoktur.
export const PROFIL_SAYFALARI = [
  { yol: '/geri-bildirim', islem: 'sayfa.geri-bildirim', baslik: 'Geri Bildirim Merkezi', simge: 'clipboard-check', grup: 'Yönetim', sira: 8 },
] as const satisfies readonly SayfaTanimi[];

export const PROFIL_IKINCI_MENU = {
  kok: '/geri-bildirim',
  baslik: 'Geri Bildirim Merkezi',
  simge: 'clipboard-check',
  gruplar: [
    {
      maddeler: [
        {
          anahtar: 'gelen', baslik: 'Gelen kutusu', yol: '/geri-bildirim', simge: 'list', islem: 'profil.geri-bildirim-oku',
          okur: ['/profil/geri-bildirimler', '/profil/geri-bildirim-secenekleri'],
        },
        {
          anahtar: 'ozet', baslik: 'Toplam ve eğilim', yol: '/geri-bildirim/ozet', simge: 'chart', islem: 'profil.geri-bildirim-oku',
          okur: ['/profil/geri-bildirim-ozeti'],
        },
        {
          anahtar: 'kategoriler', baslik: 'Kategoriler', yol: '/geri-bildirim/kategoriler', simge: 'tag', islem: 'profil.geri-bildirim-oku',
          okur: ['/profil/geri-bildirim-secenekleri'],
        },
      ],
    },
  ],
} as const satisfies IkinciMenuTanimi;
