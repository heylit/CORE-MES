import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Bildirim Merkezi (3405-4 a): bildirimler, duyurular ve kademeli takip tek sayfada. Sayfa işlemi her role verilir (göç); kişinin
// kendi bildirimi ve gecikenleri oturumla okunur (telefon bildirimi anahtarı Profilim'dedir), öteki maddeler kendi veri işlemiyle görünür. Yetki modeli değişmez.
export const BILDIRIM_SAYFALARI = [
  { yol: '/bildirim-merkezi', islem: 'sayfa.bildirim-merkezi', baslik: 'Bildirim Merkezi', simge: 'bell', grup: 'Yönetim', sira: 2 },
] as const satisfies readonly SayfaTanimi[];

export const BILDIRIM_IKINCI_MENU = {
  kok: '/bildirim-merkezi',
  baslik: 'Bildirim Merkezi',
  simge: 'bell',
  gruplar: [
    {
      maddeler: [
        { anahtar: 'gelenler', baslik: 'Gelenler', yol: '/bildirim-merkezi', simge: 'bell', islem: 'sayfa.bildirim-merkezi' },
        { anahtar: 'gecikenlerim', baslik: 'Gecikenlerim', yol: '/bildirim-merkezi/gecikenlerim', simge: 'clock', islem: 'sayfa.bildirim-merkezi' },
        // 3456-2 a: Arşiv Gelenler'de cip, yeni duyuru Duyurular sayfasında düğmedir.
        {
          anahtar: 'yayinlar', baslik: 'Duyurular', yol: '/bildirim-merkezi/yayinlar', simge: 'eye', islem: 'bildirim.yayinla',
          veya: ['bildirim.yayin-oku'], okur: ['/bildirimler/yayinlar'],
        },
      ],
    },
    {
      baslik: 'Yönetim',
      maddeler: [
        { anahtar: 'acik-takipler', baslik: 'Açık takipler', yol: '/bildirim-merkezi/acik-takipler', simge: 'list', islem: 'bildirim.kademe-yonet', okur: ['/bildirim-kademe/acik-takipler'] },
        // 3456: olaylar, kim alır, kademeli uyarı, ekip çağrıları ve e-posta (şablon, sunucu, defter) tek sayfada; her sekme kendi işlemiyle.
        {
          anahtar: 'yonetim', baslik: 'Bildirim ayarları', yol: '/bildirim-merkezi/yonetim', simge: 'gear', islem: 'ayarlar.yaz',
          veya: ['bildirim.eposta-yonet', 'bildirim.kademe-yonet'],
          okur: [
            '/bildirimler/cagri-yonlendirme', '/bildirimler/alicilar', '/bildirimler/gosterim', '/bildirimler/push/turler', '/bildirim-kademe/kaynaklar',
            '/bildirimler/eposta/durum',
          ],
        },
      ],
    },
  ],
} as const satisfies IkinciMenuTanimi;
