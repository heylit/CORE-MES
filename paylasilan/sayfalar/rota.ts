import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

export const ROTA_SAYFALARI = [
  // Menüdeki yerini Reçete ve Rota Motoru aldı (kullanıcı kararı, 13.10.2026): eski ekranlar adresle açılır, menüde görünmez.
  { yol: '/rota', islem: 'sayfa.rota', baslik: 'Rota', simge: 'tool', grup: 'Tanımlar', sira: 10, menudeGizli: true },
  // Emir listesi artık Üretim Emirleri sayfasıdır (kart #1185); bu adres oraya yönlenir, menüde görünmez, işlem rol matrisinde durur.
  { yol: '/emirler', islem: 'sayfa.emirler', baslik: 'Üretim Emirleri', simge: 'list', grup: 'Üretim', sira: 10, menudeGizli: true },
] as const satisfies readonly SayfaTanimi[];

// Reçete ve Rota: prototipin bütün bölümleri bu sayfanın ikinci menüsündedir (kullanıcı kararı K2). Rota modülünün sahibi
// olmadığı bölümlerin verisi kendi modüllerindedir; ekranları bu sayfada, uçları gelene kadar "modülü bekleniyor" gösterir.
export const ROTA_IKINCI_MENU = {
  kok: '/rota',
  baslik: 'Reçete ve Rota',
  simge: 'tool',
  sayacUcu: '/plan/menu-sayaclari',
  gruplar: [
    { baslik: 'Atölye', maddeler: [
      { anahtar: 'stok', baslik: 'Stok', yol: '/rota/stok', simge: 'box', islem: 'sayfa.rota' },
    ] },
    { baslik: 'Ana veriler', maddeler: [
      { anahtar: 'rotalar', baslik: 'Ürün ve rotalar', yol: '/rota', simge: 'tool', islem: 'sayfa.rota' },
      // Operasyon kataloğu İstasyonlar'dadır (kart #544); bu bölümde rota revizyonları kalır.
      { anahtar: 'operasyonlar', baslik: 'Rota revizyonları', yol: '/rota/operasyonlar', simge: 'edit', islem: 'sayfa.rota' },
      { anahtar: 'sablonlar', baslik: 'Rota şablonları', yol: '/rota/sablonlar', simge: 'gantt', islem: 'sayfa.rota' },
      { anahtar: 'malzemeler', baslik: 'Malzemeler', yol: '/rota/malzemeler', simge: 'cube', islem: 'sayfa.rota' },
      { anahtar: 'kaynaklar', baslik: 'Kaynaklar', yol: '/rota/kaynaklar', simge: 'cpu', islem: 'sayfa.rota' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
