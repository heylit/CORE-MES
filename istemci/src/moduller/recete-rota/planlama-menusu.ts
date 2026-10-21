import type { IkinciMenuTanimi } from '#paylasilan/sayfa-tanimi.ts';

// Planlama sayfaları ayrı çerçevededir (cerceve/planlama-modulu.html); Reçete ve Rota bölümleri kendi çerçevesinde kalır.
// Anahtar planlama sayfasının kimliğidir; plan, studio ve kanban eski bağlantılar için kalır (plan ve kanban planlama motoruna,
// studio planlama atölyesine açılır).
export const PLANLAMA_ANAHTARLARI: readonly string[] = [
  'plan', 'studio', 'kanban', 'ysiparis', 'maliyet', 'giderler', 'mesaiplan', 'fasonplan', 'malzplan', 'terminler', 'denge', 'yillik', 'sevkiyat',
];

// Çerçevenin bildirdiği yol planlama sayfası mı: /recete-rota/<anahtar> ya da altı.
export function planlamaYoluMu(yol: string): boolean {
  const m = /^\/recete-rota\/([a-z][a-z0-9-]*)(?:\/|$)/.exec(yol);
  return m !== null && PLANLAMA_ANAHTARLARI.includes(m[1] ?? '');
}

// İkinci menü önerisi (Aşama 1): menü paylasilan/sayfalar/recete-rota.ts'dedir (çekirdek şeridi). Bu tanım oraya olduğu gibi
// girer; girene kadar yeni planlama sayfaları çerçevenin kendi menüsünden açılır, adres izlemez.
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
    ] },
    { baslik: 'Planlama', maddeler: [
      { anahtar: 'plan', baslik: 'Planlama motoru', yol: '/recete-rota/plan', simge: 'gantt', islem: 'plan.oku' },
      { anahtar: 'studio', baslik: 'Planlama atölyesi', yol: '/recete-rota/studio', simge: 'flag', islem: 'plan.oku' },
      { anahtar: 'ysiparis', baslik: 'Siparişler', yol: '/recete-rota/ysiparis', simge: 'list', islem: 'plan.oku' },
      { anahtar: 'maliyet', baslik: 'Maliyetler', yol: '/recete-rota/maliyet', simge: 'lira', islem: 'plan.oku' },
      { anahtar: 'giderler', baslik: 'Genel gider', yol: '/recete-rota/giderler', simge: 'layers', islem: 'plan.oku' },
      { anahtar: 'mesaiplan', baslik: 'Ek mesai planı', yol: '/recete-rota/mesaiplan', simge: 'clock', islem: 'plan.oku' },
      { anahtar: 'fasonplan', baslik: 'Fason planı', yol: '/recete-rota/fasonplan', simge: 'truck', islem: 'plan.oku' },
      { anahtar: 'malzplan', baslik: 'Malzeme satın alma planı', yol: '/recete-rota/malzplan', simge: 'box', islem: 'plan.oku' },
      { anahtar: 'terminler', baslik: 'Terminler', yol: '/recete-rota/terminler', simge: 'flag', islem: 'plan.oku' },
      { anahtar: 'denge', baslik: 'Termin ve kâr', yol: '/recete-rota/denge', simge: 'gauge', islem: 'plan.oku' },
      { anahtar: 'yillik', baslik: 'Yıllık plan', yol: '/recete-rota/yillik', simge: 'chart', islem: 'plan.oku' },
      { anahtar: 'sevkiyat', baslik: 'Sevkiyat', yol: '/recete-rota/sevkiyat', simge: 'truck', islem: 'plan.oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
