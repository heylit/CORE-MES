import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Satış tarafı tek sayfada: kök Satış siparişleri (asıl sahip), Teklifler ikinci maddedir (kullanıcı kararı 148).
// Yeni kayıt maddeleri yalnız yazabilene görünür; işlem yalnız görünürlüktür, veri yetkisi sunucuda.
export const SIPARISLER_SAYFALARI = [
  { yol: '/siparisler', islem: 'sayfa.siparisler', baslik: 'Siparişler', simge: 'download', grup: 'Planlama', sira: 45 },
] as const satisfies readonly SayfaTanimi[];

export const SIPARISLER_IKINCI_MENU = {
  kok: '/siparisler',
  baslik: 'Siparişler',
  simge: 'download',
  gruplar: [
    {
      maddeler: [
        { anahtar: 'siparisler', baslik: 'Satış siparişleri', yol: '/siparisler', simge: 'list', islem: 'siparisler.oku', okur: ['/siparisler', '/musteri-tedarikci/firmalar/secim'] },
        { anahtar: 'teklifler', baslik: 'Teklifler', yol: '/siparisler/teklifler', simge: 'edit', islem: 'siparisler.oku', okur: ['/siparisler/teklifler', '/musteri-tedarikci/firmalar/secim'] },
      ],
    },
    {
      baslik: 'Yeni kayıt',
      maddeler: [
        { anahtar: 'yeni-teklif', baslik: 'Yeni teklif', yol: '/siparisler/teklifler/yeni', simge: 'plus', islem: 'siparisler.yaz' },
        { anahtar: 'yeni-siparis', baslik: 'Yeni sipariş', yol: '/siparisler/yeni', simge: 'plus', islem: 'siparisler.yaz' },
      ],
    },
  ],
} as const satisfies IkinciMenuTanimi;
