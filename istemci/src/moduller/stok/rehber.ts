import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/stok',
    ozet: 'Depodaki malzemeyi okutur, teslim alır, taşır, hazırlar, stoktan düşer ve hareketleri izler.',
    nasil: [
      '"İş kutusu"nda bekleyen işleri, kritik stoku ve son hareketleri görün.',
      '"Okut"ta ürün ya da raf kodunu okutun (kamera, fotoğraf ya da el okuyucu); "Sepete ekle" ya da "Stoktan düş".',
      '"Mal kabul"de malı sayıp "Teslim al"a, ardından "Etiket bas"a basın.',
      '"Taşı"da her satıra hedef seçip "Hepsini taşı"; "Hazırlık"ta istekleri toplayıp "Teslim et".',
      'Üst çubuktaki "Malzeme · Teslim" düğmesi teslim al, teslim et ve malzeme iste işlerini her sayfadan açar.',
    ],
    sinirlar: [
      'Mal kabul, taşıma, toplama ve stoktan düşme ayrı yetkiler ister.',
      'Hareketi geri almak ayrı yetkidir; yetkisi olmayana ekran "müdüre haber ver" der.',
      'Mal kabul hareketi Hareketler\'de geri alınamaz.',
    ],
    sozcukler: ['depo', 'stok', 'mal kabul', 'teslim', 'raf', 'okut', 'barkod', 'qr', 'taşı', 'sepet', 'lot'],
  },
];
