import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Reçete ve Rota Motoru tek sayfadır; içerik prototipin kendisidir ve yalıtılmış çerçevede açılır. Prototipin bölümleri
// ikinci menüdedir (kullanıcı kararı, kart #1031); madde anahtarı prototipin sekme kimliğidir, çerçeveye görünüm adı olarak gider.
// Menüde eski Rota'nın yerindedir (kullanıcı kararı, 13.10.2026). Planlama maddeleri yalnız planlama sayfalarını görme işlemini
// ister; Aşama 1'de bu işlem yalnız yöneticidedir (kullanıcı kararı 353 a). Planlama ayrı çerçevede açılır
// (istemci/src/moduller/recete-rota/planlama-menusu.ts); kanban menüde yoktur, adresi planlama motoruna gider.
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
    ] },
    { baslik: 'Planlama', maddeler: [
      { anahtar: 'plan', baslik: 'Planlama motoru', yol: '/recete-rota/plan', simge: 'gantt', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'studio', baslik: 'Planlama atölyesi', yol: '/recete-rota/studio', simge: 'flag', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'ysiparis', baslik: 'Siparişler', yol: '/recete-rota/ysiparis', simge: 'list', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'maliyet', baslik: 'Maliyetler', yol: '/recete-rota/maliyet', simge: 'lira', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'giderler', baslik: 'Genel gider', yol: '/recete-rota/giderler', simge: 'layers', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'mesaiplan', baslik: 'Ek mesai planı', yol: '/recete-rota/mesaiplan', simge: 'clock', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'fasonplan', baslik: 'Fason planı', yol: '/recete-rota/fasonplan', simge: 'truck', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'malzplan', baslik: 'Malzeme satın alma planı', yol: '/recete-rota/malzplan', simge: 'box', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'terminler', baslik: 'Terminler', yol: '/recete-rota/terminler', simge: 'flag', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'denge', baslik: 'Termin ve kâr', yol: '/recete-rota/denge', simge: 'gauge', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'yillik', baslik: 'Yıllık plan', yol: '/recete-rota/yillik', simge: 'chart', islem: 'recete-rota.planlama-oku' },
      { anahtar: 'sevkiyat', baslik: 'Sevkiyat', yol: '/recete-rota/sevkiyat', simge: 'truck', islem: 'recete-rota.planlama-oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
