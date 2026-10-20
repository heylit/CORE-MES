import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const CIZIMLER_SAYFALARI = [
  { yol: '/cizimler', islem: 'sayfa.cizimler', baslik: 'Çizim Merkezi', simge: 'fit', grup: 'Tanımlar', sira: 50 },
] as const satisfies readonly SayfaTanimi[];

// Başlıksız grup tektir (kabuk grubu başlığıyla anahtarlar). Bölümler belge türüdür; hepsi sayfayı gören herkese açıktır, yazma ayrıca `cizimler.yaz` ister. Sayaç belge sayısıdır.
export const CIZIMLER_IKINCI_MENU = {
  kok: '/cizimler',
  baslik: 'Çizim Merkezi',
  simge: 'fit',
  sayacUcu: '/cizimler/menu-sayaclari',
  gruplar: [
    { maddeler: [
      { anahtar: 'tumu', baslik: 'Tüm belgeler', yol: '/cizimler', simge: 'list', islem: 'sayfa.cizimler' },
      { anahtar: 'arsiv', baslik: 'Arşiv', yol: '/cizimler/arsiv', simge: 'lock', islem: 'sayfa.cizimler' },
      // CNC Kurulum Motoru'nun makineleri burada istasyonla eşleştirilir (ekranı cnc-kurulum modülündedir); eşleştirme yazmadır.
      { anahtar: 'cnc-makineleri', baslik: 'CNC makineleri', yol: '/cizimler/cnc-makineleri', simge: 'rotate', islem: 'cizimler.yaz' },
    ] },
    { baslik: 'Türler', maddeler: [
      { anahtar: 'teknik-resim', baslik: 'Teknik resimler', yol: '/cizimler/teknik-resim', simge: 'ruler', islem: 'sayfa.cizimler' },
      { anahtar: 'model-3b', baslik: '3B modeller', yol: '/cizimler/3b-model', simge: 'cube', islem: 'sayfa.cizimler' },
      { anahtar: 'makine', baslik: 'Makine dosyaları', yol: '/cizimler/makine', simge: 'cpu', islem: 'sayfa.cizimler' },
      { anahtar: 'sertifika', baslik: 'Sertifikalar', yol: '/cizimler/sertifika', simge: 'check', islem: 'sayfa.cizimler' },
      { anahtar: 'rapor', baslik: 'Raporlar', yol: '/cizimler/rapor', simge: 'lab', islem: 'sayfa.cizimler' },
      { anahtar: 'kroki', baslik: 'Krokiler', yol: '/cizimler/kroki', simge: 'grid', islem: 'sayfa.cizimler' },
      { anahtar: 'diger', baslik: 'Diğer', yol: '/cizimler/diger', simge: 'box', islem: 'sayfa.cizimler' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
