import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const STOK_SAYFALARI = [
  { yol: '/stok', islem: 'sayfa.stok', baslik: 'Stok Merkezi', simge: 'box', grup: 'Stok', sira: 10 },
] as const satisfies readonly SayfaTanimi[];

// İkinci menü veridir; kabuk çizer ve kullanıcının işlemlerine göre süzer (K6). Herkese açık okuma maddeleri sayfanın
// kendi işlemini taşır.
export const STOK_IKINCI_MENU = {
  kok: '/stok',
  baslik: 'Stok Merkezi',
  simge: 'box',
  sayacUcu: '/stok/menu-sayaclari',
  gruplar: [
    {
      maddeler: [
        { anahtar: 'is-kutusu', baslik: 'İş kutusu', yol: '/stok', simge: 'dash', islem: 'sayfa.stok' },
        { anahtar: 'okut', baslik: 'Okut', yol: '/stok/okut', simge: 'scan', islem: 'sayfa.stok' },
        { anahtar: 'mal-kabul', baslik: 'Mal kabul', yol: '/stok/mal-kabul', simge: 'truck', islem: 'stok.giris' },
        // Sevkiyatın tetiklediği son çıkış ve kabuller (960); çıkış stok.cikis, kabul stok.giris ister.
        { anahtar: 'depo-sevk', baslik: 'Depo sevk', yol: '/stok/depo-sevk', simge: 'route', islem: 'stok.cikis', veya: ['stok.giris'] },
        // Malzeme istekleri ve toplama listeleri tek yerde: depocu aynı işi iki ekranda yapmaz.
        { anahtar: 'hazirlik', baslik: 'Hazırlık', yol: '/stok/hazirlik', simge: 'list', islem: 'stok.transfer', veya: ['stok.toplama'] },
        { anahtar: 'sepet', baslik: 'Taşı', yol: '/stok/sepet', simge: 'box', islem: 'stok.transfer' },
      ],
    },
    {
      baslik: 'Stok',
      maddeler: [
        { anahtar: 'malzemeler', baslik: 'Malzemeler', yol: '/stok/malzemeler', simge: 'layers', islem: 'sayfa.stok' },
        { anahtar: 'hareketler', baslik: 'Hareketler', yol: '/stok/hareketler', simge: 'sort', islem: 'sayfa.stok' },
        { anahtar: 'refakat-kartlari', baslik: 'Refakat kartları', yol: '/stok/refakat-kartlari', simge: 'route', islem: 'sayfa.stok' },
        { anahtar: 'malzeme-fisleri', baslik: 'Malzeme fişleri', yol: '/stok/malzeme-fisleri', simge: 'list', islem: 'sayfa.stok' },
      ],
    },
    {
      baslik: 'Depo ve konumlar',
      maddeler: [
        { anahtar: 'depo', baslik: 'Depo', yol: '/stok/depo', simge: 'cube', islem: 'sayfa.stok' },
        { anahtar: 'konumlar', baslik: 'Konumlar', yol: '/stok/konumlar', simge: 'target', islem: 'sayfa.stok' },
      ],
    },
    {
      baslik: 'Sistem',
      maddeler: [{ anahtar: 'ayarlar', baslik: 'Ayarlar', yol: '/stok/ayarlar', simge: 'tool', islem: 'stok.tanim' }],
    },
  ],
} as const satisfies IkinciMenuTanimi;
