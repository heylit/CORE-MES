import type { IkinciMenuTanimi } from '#paylasilan/sayfa-tanimi.ts';

// Planlama sayfaları ayrı çerçevededir (cerceve/planlama-modulu.html); Reçete ve Rota bölümleri kendi çerçevesinde kalır.
// Anahtar planlama sayfasının kimliğidir; plan, studio ve kanban eski bağlantılar için kalır (plan ve kanban planlama motoruna,
// studio planlama atölyesine açılır).
export const PLANLAMA_ANAHTARLARI: readonly string[] = [
  'plan', 'studio', 'kanban', 'ysiparis', 'maliyet', 'giderler', 'mesaiplan', 'fasonplan', 'malzplan', 'terminler', 'denge', 'yillik', 'sevkiyat',
];

// Planlama sayfalarını görme işlemi; Aşama 1'de yalnız yöneticidedir (kullanıcı kararı 353 a). Menü maddesi ve planlama
// çerçevesinin açılışı bunu ister; sunucudaki kayıt okuması bunu bilmez (UYUM-BORCU).
export const PLANLAMA_ISLEMI = 'recete-rota.planlama-oku';

// Çerçevenin bildirdiği yol planlama sayfası mı: /recete-rota/<anahtar> ya da altı.
export function planlamaYoluMu(yol: string): boolean {
  const m = /^\/recete-rota\/([a-z][a-z0-9-]*)(?:\/|$)/.exec(yol);
  return m !== null && PLANLAMA_ANAHTARLARI.includes(m[1] ?? '');
}

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
    ] },
    { baslik: 'Planlama', maddeler: [
      { anahtar: 'plan', baslik: 'Planlama motoru', yol: '/recete-rota/plan', simge: 'gantt', islem: PLANLAMA_ISLEMI },
      { anahtar: 'studio', baslik: 'Planlama atölyesi', yol: '/recete-rota/studio', simge: 'flag', islem: PLANLAMA_ISLEMI },
      { anahtar: 'ysiparis', baslik: 'Siparişler', yol: '/recete-rota/ysiparis', simge: 'list', islem: PLANLAMA_ISLEMI },
      { anahtar: 'maliyet', baslik: 'Maliyetler', yol: '/recete-rota/maliyet', simge: 'lira', islem: PLANLAMA_ISLEMI },
      { anahtar: 'giderler', baslik: 'Genel gider', yol: '/recete-rota/giderler', simge: 'layers', islem: PLANLAMA_ISLEMI },
      { anahtar: 'mesaiplan', baslik: 'Ek mesai planı', yol: '/recete-rota/mesaiplan', simge: 'clock', islem: PLANLAMA_ISLEMI },
      { anahtar: 'fasonplan', baslik: 'Fason planı', yol: '/recete-rota/fasonplan', simge: 'truck', islem: PLANLAMA_ISLEMI },
      { anahtar: 'malzplan', baslik: 'Malzeme satın alma planı', yol: '/recete-rota/malzplan', simge: 'box', islem: PLANLAMA_ISLEMI },
      { anahtar: 'terminler', baslik: 'Terminler', yol: '/recete-rota/terminler', simge: 'flag', islem: PLANLAMA_ISLEMI },
      { anahtar: 'denge', baslik: 'Termin ve kâr', yol: '/recete-rota/denge', simge: 'gauge', islem: PLANLAMA_ISLEMI },
      { anahtar: 'yillik', baslik: 'Yıllık plan', yol: '/recete-rota/yillik', simge: 'chart', islem: PLANLAMA_ISLEMI },
      { anahtar: 'sevkiyat', baslik: 'Sevkiyat', yol: '/recete-rota/sevkiyat', simge: 'truck', islem: PLANLAMA_ISLEMI },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
