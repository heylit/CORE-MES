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
        { anahtar: 'arsiv', baslik: 'Arşiv', yol: '/bildirim-merkezi/arsiv', simge: 'layers', islem: 'sayfa.bildirim-merkezi' },
      ],
    },
    {
      baslik: 'Duyurular',
      maddeler: [
        { anahtar: 'hazirla', baslik: 'Hazırla', yol: '/bildirim-merkezi/hazirla', simge: 'plus', islem: 'bildirim.yayinla', okur: ['/bildirimler/yayinlar/hedefler'] },
        {
          anahtar: 'yayinlar', baslik: 'Yayınlar ve okunma', yol: '/bildirim-merkezi/yayinlar', simge: 'eye', islem: 'bildirim.yayinla',
          veya: ['bildirim.yayin-oku'], okur: ['/bildirimler/yayinlar'],
        },
      ],
    },
    {
      baslik: 'Takip',
      maddeler: [
        { anahtar: 'acik-takipler', baslik: 'Açık takipler', yol: '/bildirim-merkezi/acik-takipler', simge: 'list', islem: 'bildirim.kademe-yonet', okur: ['/bildirim-kademe/acik-takipler'] },
      ],
    },
    {
      baslik: 'Ayarlar',
      maddeler: [
        // 3435-3 a: olay ve kanal ayarları, e-posta şablonları, kademeli uyarı ve ekip çağrıları tek sayfada; her sekme kendi işlemiyle.
        {
          anahtar: 'yonetim', baslik: 'Bildirim ve uyarı yönetimi', yol: '/bildirim-merkezi/yonetim', simge: 'grid', islem: 'ayarlar.yaz',
          veya: ['bildirim.eposta-yonet', 'bildirim.kademe-yonet'],
          okur: ['/bildirimler/cagri-yonlendirme', '/bildirimler/alicilar', '/bildirimler/gosterim', '/bildirimler/push/turler', '/bildirim-kademe/kaynaklar'],
        },
        { anahtar: 'eposta', baslik: 'E-posta', yol: '/bildirim-merkezi/eposta', simge: 'mail', islem: 'bildirim.eposta-yonet', okur: ['/bildirimler/eposta/durum'] },
      ],
    },
  ],
} as const satisfies IkinciMenuTanimi;
