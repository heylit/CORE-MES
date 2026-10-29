import type { IkinciMenuTanimi } from '#paylasilan/sayfa-tanimi.ts';

// Planlama plan modülünün sayfasıdır (658 b). Anahtar planlama görünümünün kimliğidir; eski `/recete-rota/<anahtar>` bağlantıları
// Planlama'ya yönlenir (rotalar.tsx).
export const PLANLAMA_ANAHTARLARI: readonly string[] = [
  'plan', 'studio', 'kanban', 'ysiparis', 'maliyet', 'giderler', 'mesaiplan', 'fasonplan', 'malzplan', 'terminler', 'denge', 'yillik', 'ufuk', 'sevkiyat',
];

// Planlama sayfalarını görme işlemi; yönetici, müdür ve planlamadadır (195 a, 663 a).
export const PLANLAMA_ISLEMI = 'plan.planlama-oku';

// Maliyet ve kâr gösteren planlama sayfaları birim maliyet okumasını da ister: planlama rolü maliyet görmez (200 a), 195 a bunu korur.
export const MALIYET_ISLEMI = 'finans.maliyet-oku';
export const MALIYET_ANAHTARLARI: readonly string[] = ['maliyet', 'giderler', 'denge'];

// İkinci menü önerisi (Aşama 1): menü paylasilan/sayfalar/recete-rota.ts'dedir (çekirdek şeridi); test ikisinin aynı olduğunu denetler.
export const ONERILEN_IKINCI_MENU = {
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
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
