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
        { anahtar: 'is-kutusu', baslik: 'Bugün', yol: '/stok', simge: 'dash', islem: 'sayfa.stok' },
        { anahtar: 'mal-kabul', baslik: 'Mal kabul', yol: '/stok/mal-kabul', simge: 'truck', islem: 'stok.giris' },
        // 3129: Excel'den toplu başlangıç stoğu (3134 a); yükleme mal kabulle aynı işlem.
        { anahtar: 'baslangic-stogu', baslik: 'Başlangıç stoğu', yol: '/stok/baslangic-stogu', simge: 'upload', islem: 'stok.giris' },
        // Sevkiyatın tetiklediği son çıkış ve kabuller (960); çıkış stok.cikis, kabul stok.giris ister.
        { anahtar: 'depo-sevk', baslik: 'Depo sevk', yol: '/stok/depo-sevk', simge: 'route', islem: 'stok.cikis', veya: ['stok.giris'] },
        // Malzeme istekleri ve toplama listeleri tek yerde: depocu aynı işi iki ekranda yapmaz.
        { anahtar: 'hazirlik', baslik: 'Malzeme istekleri', yol: '/stok/hazirlik', simge: 'list', islem: 'stok.transfer', veya: ['stok.toplama'] },
        { anahtar: 'sepet', baslik: 'Transfer', yol: '/stok/sepet', simge: 'box', islem: 'stok.transfer' },
      ],
    },
    {
      baslik: 'Stok',
      maddeler: [
        // Kimyasallar, kesici takımlar ve aparatlar (2099-6 a) Malzemeler'in sekmeleridir (2896); yolları bu maddenin altındadır.
        { anahtar: 'malzemeler', baslik: 'Malzemeler', yol: '/stok/malzemeler', simge: 'layers', islem: 'sayfa.stok' },
        { anahtar: 'hareketler', baslik: 'Hareketler', yol: '/stok/hareketler', simge: 'sort', islem: 'sayfa.stok' },
        { anahtar: 'refakat-kartlari', baslik: 'Refakat kartları', yol: '/stok/refakat-kartlari', simge: 'route', islem: 'sayfa.stok' },
        { anahtar: 'malzeme-fisleri', baslik: 'Belgeler', yol: '/stok/malzeme-fisleri', simge: 'list', islem: 'sayfa.stok' },
        // Göz ve etiket okutarak kör sayım; okuyucunun hafızasından aktarım da buradan (1905).
        // Okut panelinin Seri modunda toplanan listeler; düzeltilip bir işe verilir (1915).
        { anahtar: 'seri-listeler', baslik: 'Seri listeler', yol: '/stok/seri-listeler', simge: 'list', islem: 'stok.istek' },
        // Basılı komut barkodları (1909): okuyucuyla ekrandaki düğmeye basılır.
        { anahtar: 'komut-karti', baslik: 'Komut kartı', yol: '/stok/komut-karti', simge: 'printer', islem: 'sayfa.stok' },
        // Eşiği aşan sayım farkı ikinci yetkilinin onayını bekler (1279 a); sayan da listeyi görür.
        { anahtar: 'sayim-onaylari', baslik: 'Sayım onayları', yol: '/stok/sayim-onaylari', simge: 'check', islem: 'stok.sayim-onayla', veya: ['stok.sayim'] },
        // 2547 a: statüde durup hiçbir açık emre ayrılmamış stok (rezervesi kaldırılan ya da emri kapanan).
        { anahtar: 'sahipsiz-statulu', baslik: 'Sahipsiz statülü stok', yol: '/stok/sahipsiz-statulu', simge: 'alert', islem: 'sayfa.stok' },
        { anahtar: 'defter-farklari', baslik: 'Defter farkları', yol: '/stok/defter-farklari', simge: 'alert', islem: 'stok.eksi-onayla' },
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
      maddeler: [{ anahtar: 'ayarlar', baslik: 'Ayarlar', yol: '/stok/ayarlar', simge: 'tool', islem: 'stok.harita-yaz', veya: ['stok.raf-yaz', 'stok.konum-yaz', 'stok.malzeme-ayari'] }],
    },
  ],
} as const satisfies IkinciMenuTanimi;
