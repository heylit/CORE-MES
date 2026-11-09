import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Planlama plan modülünün tek sayfasıdır (658 b, 661 a): Reçete ve Rota planı besler, planı Planlama ve motoru kurar. Maddeler eski
// Reçete ve Rota > Planlama grubunun aynısıdır; madde anahtarı görünümün adıdır. Planlama maddeleri planlama sayfalarını görme işlemini
// ister (yönetici, müdür ve planlama; 195 a, 663 a), maliyet ve kâr gösteren üçü birim maliyet okumasını (planlama rolü maliyet görmez, 200 a).
export const PLAN_SAYFALARI = [
  { yol: '/plan', islem: 'sayfa.plan', baslik: 'Planlama', simge: 'dash', grup: 'Planlama', sira: 10 },
] as const satisfies readonly SayfaTanimi[];

// 2535 a, 2538 b: ikinci menü 12 maddedir. Atölye ilk maddedir ve kök adrestir; Terminler ile Termin ve kâr Siparişler'in, Yıllık plan
// Ufuk'un, Malzeme ihtiyacı Malzeme'nin, Plan sağlığı ile Veri sağlığı Analiz'in sekmesidir (sekme kendi işlemini korur). İlk grubun maddeleri
// Planlama sayfasının görünümleridir (planlama/gorunumler.ts); öteki gruplarda da görünüm olan maddeler (Kaynaklar, Maliyet) aynı sayfadadır.
export const PLAN_IKINCI_MENU = {
  kok: '/plan',
  baslik: 'Planlama',
  simge: 'dash',
  gruplar: [
    { maddeler: [
      { anahtar: 'studio', baslik: 'Atölye', yol: '/plan', simge: 'flag', islem: 'plan.planlama-oku' },
      { anahtar: 'plan', baslik: 'Motor', yol: '/plan/plan', simge: 'gantt', islem: 'plan.planlama-oku' },
      { anahtar: 'ysiparis', baslik: 'Siparişler', yol: '/plan/ysiparis', simge: 'list', islem: 'plan.planlama-oku' },
      { anahtar: 'ufuk', baslik: 'Ufuk', yol: '/plan/ufuk', simge: 'route', islem: 'plan.planlama-oku' },
      { anahtar: 'sevkiyat', baslik: 'Sevkiyat', yol: '/plan/sevkiyat', simge: 'truck', islem: 'plan.planlama-oku' },
    ] },
    { baslik: 'Kaynaklar', maddeler: [
      { anahtar: 'mesaiplan', baslik: 'Ek mesai planı', yol: '/plan/mesaiplan', simge: 'clock', islem: 'plan.planlama-oku' },
      { anahtar: 'fasonplan', baslik: 'Fason planı', yol: '/plan/fasonplan', simge: 'truck', islem: 'plan.planlama-oku' },
      { anahtar: 'malzplan', baslik: 'Malzeme', yol: '/plan/malzplan', simge: 'box', islem: 'plan.planlama-oku' },
    ] },
    { baslik: 'Maliyet', maddeler: [
      { anahtar: 'maliyet', baslik: 'Maliyetler', yol: '/plan/maliyet', simge: 'lira', islem: 'finans.maliyet-oku' },
      { anahtar: 'giderler', baslik: 'Genel gider', yol: '/plan/giderler', simge: 'layers', islem: 'finans.maliyet-oku' },
    ] },
    // Salt okunur raporlar (782, 1560, 2151) tek sayfada üç sekmedir; motor ayarları (811) Plan ayarları maddesidir (2536 a).
    { baslik: 'Analiz', maddeler: [
      { anahtar: 'analiz', baslik: 'Analiz', yol: '/plan/analiz', simge: 'chart', islem: 'plan.planlama-oku' },
    ] },
    { baslik: 'Ayarlar', maddeler: [
      { anahtar: 'motor-ayarlari', baslik: 'Plan ayarları', yol: '/plan/motor-ayarlari', simge: 'gear', islem: 'plan.planlama-oku' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
