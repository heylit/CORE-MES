import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/stok',
    ozet: 'Depodaki malzemeyi okutur, teslim alır, taşır, hazırlar, stoktan düşer ve hareketleri izler.',
    nasil: [
      '"Bugün"de bekleyen işleri, kritik stoku ve son hareketleri görün.',
      '"Okut"ta ürün ya da raf kodunu okutun (kamera, fotoğraf ya da el okuyucu); "Sepete ekle" ya da "Stoktan düş".',
      '"Mal kabul"de malı sayıp "Teslim al"a, ardından "Etiket bas"a basın.',
      '"Malzeme istekleri"nde üretimden gelen istekleri görün: tek isteği "Teslim et" ile götürün ya da birkaçını seçip "Liste aç"ın, raf sırasıyla toplayıp "Bitir"e basın.',
      '"Transfer" kişisel taşıma sepetidir: Okut\'ta "Sepete ekle" dedikleriniz buraya gelir; her satıra yer seçip "Hepsini taşı". İstek gerekmez.',
      'Üst çubuktaki "Okut" düğmesi teslim al, teslim et ve malzeme iste işlerini her sayfadan açar; modu (Otomatik, Bilgi, Taşı, Say, Topla) panelin üstünden ya da Komut kartından seçilir.',
    ],
    sinirlar: [
      'Mal kabul, taşıma, toplama ve stoktan düşme ayrı yetkiler ister.',
      'Hareketi geri almak ayrı yetkidir; yetkisi olmayana ekran "müdüre haber ver" der.',
      'Mal kabul hareketi Hareketler\'de geri alınamaz.',
    ],
    sozcukler: ['depo', 'stok', 'mal kabul', 'teslim', 'raf', 'okut', 'barkod', 'qr', 'taşı', 'sepet', 'transfer', 'lot', 'malzeme isteği', 'toplama', 'hazırlık'],
  },
];
