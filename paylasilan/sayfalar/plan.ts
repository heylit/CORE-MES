import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Planlama plan modülünün tek sayfasıdır (658 b, 661 a): Reçete ve Rota planı besler, planı Planlama ve motoru kurar. Maddeler eski
// Reçete ve Rota > Planlama grubunun aynısıdır; madde anahtarı görünümün adıdır. Planlama maddeleri planlama sayfalarını görme işlemini
// ister (yönetici, müdür ve planlama; 195 a, 663 a), maliyet ve kâr gösteren üçü birim maliyet okumasını (planlama rolü maliyet görmez, 200 a).
export const PLAN_SAYFALARI = [
  { yol: '/plan', islem: 'sayfa.plan', baslik: 'Planlama', simge: 'dash', grup: 'Planlama', sira: 10 },
] as const satisfies readonly SayfaTanimi[];

export const PLAN_IKINCI_MENU = {
  kok: '/plan',
  baslik: 'Planlama',
  simge: 'dash',
  gruplar: [
    { maddeler: [
      { anahtar: 'plan', baslik: 'Planlama motoru', yol: '/plan', simge: 'gantt', islem: 'plan.planlama-oku' },
      { anahtar: 'studio', baslik: 'Planlama atölyesi', yol: '/plan/studio', simge: 'flag', islem: 'plan.planlama-oku' },
      { anahtar: 'ysiparis', baslik: 'Siparişler', yol: '/plan/ysiparis', simge: 'list', islem: 'plan.planlama-oku' },
      { anahtar: 'maliyet', baslik: 'Maliyetler', yol: '/plan/maliyet', simge: 'lira', islem: 'finans.maliyet-oku' },
      { anahtar: 'giderler', baslik: 'Genel gider', yol: '/plan/giderler', simge: 'layers', islem: 'finans.maliyet-oku' },
      { anahtar: 'mesaiplan', baslik: 'Ek mesai planı', yol: '/plan/mesaiplan', simge: 'clock', islem: 'plan.planlama-oku' },
      { anahtar: 'fasonplan', baslik: 'Fason planı', yol: '/plan/fasonplan', simge: 'truck', islem: 'plan.planlama-oku' },
      { anahtar: 'malzplan', baslik: 'Malzeme satın alma planı', yol: '/plan/malzplan', simge: 'box', islem: 'plan.planlama-oku' },
      { anahtar: 'terminler', baslik: 'Terminler', yol: '/plan/terminler', simge: 'flag', islem: 'plan.planlama-oku' },
      { anahtar: 'denge', baslik: 'Termin ve kâr', yol: '/plan/denge', simge: 'gauge', islem: 'finans.maliyet-oku' },
      { anahtar: 'yillik', baslik: 'Yıllık plan', yol: '/plan/yillik', simge: 'chart', islem: 'plan.planlama-oku' },
      { anahtar: 'ufuk', baslik: 'Ufuk', yol: '/plan/ufuk', simge: 'route', islem: 'plan.planlama-oku' },
      { anahtar: 'sevkiyat', baslik: 'Sevkiyat', yol: '/plan/sevkiyat', simge: 'truck', islem: 'plan.planlama-oku' },
    ] },
    // Planlama sayfasının görünümü değil, ayrı sayfalar: salt okunur rapor (782) ve motor ayarları (811); ilk grup görünüm kaydıdır
    // (planlama/gorunumler.ts).
    { baslik: 'Veri', maddeler: [
      { anahtar: 'veri-sagligi', baslik: 'Veri sağlığı', yol: '/plan/veri-sagligi', simge: 'alert', islem: 'plan.planlama-oku' },
      { anahtar: 'motor-ayarlari', baslik: 'Motor ayarları', yol: '/plan/motor-ayarlari', simge: 'gear', islem: 'plan.planlama-oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
