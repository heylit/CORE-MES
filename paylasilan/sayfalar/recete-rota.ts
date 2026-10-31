import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Reçete ve Rota Motoru tek sayfadır; içerik prototipin kendisidir ve yalıtılmış çerçevede açılır. Prototipin bölümleri
// ikinci menüdedir (kullanıcı kararı, kart #1031); madde anahtarı prototipin sekme kimliğidir, çerçeveye görünüm adı olarak gider.
// Menüde eski Rota'nın yerindedir (kullanıcı kararı, 13.10.2026). Planlama plan modülünün sayfasıdır (658 b; paylasilan/sayfalar/plan.ts).
export const RECETE_ROTA_SAYFALARI = [
  { yol: '/recete-rota', islem: 'sayfa.recete-rota', baslik: 'Reçete ve Rota', simge: 'tool', grup: 'Tanımlar', sira: 10 },
] as const satisfies readonly SayfaTanimi[];

export const RECETE_ROTA_IKINCI_MENU = {
  kok: '/recete-rota',
  baslik: 'Reçete ve Rota',
  simge: 'tool',
  cerceveli: true,
  gruplar: [
    { baslik: 'Reçete ve Rota', maddeler: [
      { anahtar: 'orders', baslik: 'Üretim emirleri', yol: '/recete-rota', simge: 'list', islem: 'sayfa.recete-rota' },
      { anahtar: 'stock', baslik: 'Stok', yol: '/recete-rota/stock', simge: 'box', islem: 'sayfa.recete-rota' },
      { anahtar: 'schema', baslik: 'Ürün ve rotalar', yol: '/recete-rota/schema', simge: 'layers', islem: 'sayfa.recete-rota' },
      { anahtar: 'ops', baslik: 'Operasyonlar', yol: '/recete-rota/ops', simge: 'edit', islem: 'sayfa.recete-rota' },
      { anahtar: 'sureler', baslik: 'Süreler', yol: '/recete-rota/sureler', simge: 'clock', islem: 'sayfa.recete-rota' },
      { anahtar: 'items', baslik: 'Malzemeler', yol: '/recete-rota/items', simge: 'cube', islem: 'sayfa.recete-rota' },
      { anahtar: 'res', baslik: 'Kaynaklar', yol: '/recete-rota/res', simge: 'cpu', islem: 'sayfa.recete-rota' },
      { anahtar: 'sartnameler', baslik: 'Şartname ve talimatlar', yol: '/recete-rota/sartnameler', simge: 'clipboard-check', islem: 'sayfa.recete-rota' },
      // Emrin evi burasıdır (1416 a): kapanış onayı burada verilir; liste kapanış okuma yetkisiyle görünür, onay düğmeleri onay yetkisiyle.
      { anahtar: 'kapanis', baslik: 'Kapanış onayları', yol: '/recete-rota/kapanis', simge: 'check', islem: 'uretim-emirleri.kapanis-oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
