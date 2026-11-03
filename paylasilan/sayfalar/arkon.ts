import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Arkon MES tek sayfadır; Arkon'un kendi sayfaları bu sayfanın ikinci menüsündedir (/arkon/<sayfa>).
export const ARKON_SAYFALARI = [
  { yol: '/arkon', islem: 'sayfa.arkon', baslik: 'Üretim Hazırlık', simge: 'cube', grup: 'Üretim', sira: 30 },
  // Arkon'un operatör ekranı ana menüde kendi adıyla: operatör Arkon MES menüsünden geçmeden açar.
  { yol: '/uretim-terminali', islem: 'sayfa.uretim-terminali', baslik: 'Üretim Terminali', simge: 'gauge', grup: 'Üretim', sira: 25 },
] as const satisfies readonly SayfaTanimi[];

// Tek maddelik menü, terminalin çerçeveli (boşluksuz, tam ekran düğmeli) açılması içindir.
export const URETIM_TERMINALI_IKINCI_MENU = {
  kok: '/uretim-terminali',
  baslik: 'Üretim Terminali',
  simge: 'gauge',
  cerceveli: true,
  gruplar: [{ maddeler: [{ anahtar: 'operator', baslik: 'Operatör', yol: '/uretim-terminali', simge: 'gauge', islem: 'sayfa.uretim-terminali' }] }],
} as const satisfies IkinciMenuTanimi;

// Kuyruk sayfası (paylasilan/sayfalar/kuyruk.ts) Arkon'un Plan Kuyruğu'nu salt okunur açar; çerçeveli menü boşluksuz ve tam ekran düğmeli açmak içindir.
export const KUYRUK_IKINCI_MENU = {
  kok: '/kuyruk',
  baslik: 'Kuyruk',
  simge: 'layers',
  cerceveli: true,
  gruplar: [{ maddeler: [{ anahtar: 'kuyruk', baslik: 'Plan Kuyruğu', yol: '/kuyruk', simge: 'list', islem: 'sayfa.kuyruk' }] }],
} as const satisfies IkinciMenuTanimi;

// Madde anahtarı Arkon'daki adres işaretidir (operatör ekranınınki boştur, burada `operator`). Madde, sayfayı Arkon'un
// sunucudaki sabit matrisinde (sunucu/moduller/arkon/kurallar.ts ARKON_VARSAYILAN_YETKILER) açabilen rollerin işlemleriyle
// görünür; eşitliği kurallar testi denetler. Ayarlar her Arkon rolünde açıktır. Operatör ekranı menüde yoktur:
// ana menüdeki Üretim Terminali onu açar, /arkon/operator yolu Pano'yu göremeyen rolün girişi olarak kalır (kullanıcı kararı, kart #1073).
const PANO_ROLLERI = ['arkon.hazirlik', 'arkon.kalite', 'arkon.amir', 'arkon.bakim', 'arkon.yonetici'] as const;

export const ARKON_IKINCI_MENU = {
  kok: '/arkon',
  baslik: 'Üretim Hazırlık',
  simge: 'cube',
  cerceveli: true,
  gruplar: [
    { maddeler: [
      { anahtar: 'pano', baslik: 'Pano', yol: '/arkon/pano', simge: 'grid', islem: 'arkon.planlama', veya: PANO_ROLLERI },
      { anahtar: 'planlama', baslik: 'Plan Kuyruğu', yol: '/arkon/planlama', simge: 'list', islem: 'arkon.planlama', veya: ['arkon.hazirlik', 'arkon.amir', 'arkon.yonetici'] },
    ] },
    { baslik: 'Hazırlık ve kalite', maddeler: [
      { anahtar: 'hazirlik', baslik: 'Üretim Terminali Hazırlık', yol: '/arkon/hazirlik', simge: 'layers', islem: 'arkon.hazirlik', veya: ['arkon.planlama', 'arkon.yonetici'] },
      // Hazırlık ile aynı roller görür; sunucudaki GET /arkon/anomaliler de bu üç işlemi ister (kart #1193).
      { anahtar: 'anomali', baslik: 'Üretim Anomalisi', yol: '/arkon/anomali', simge: 'alert', islem: 'arkon.hazirlik', veya: ['arkon.planlama', 'arkon.yonetici'] },
      { anahtar: 'kalite', baslik: 'Kalite', yol: '/arkon/kalite', simge: 'target', islem: 'arkon.kalite', veya: ['arkon.planlama', 'arkon.hazirlik', 'arkon.amir', 'arkon.yonetici'] },
      { anahtar: 'cizim', baslik: 'Çizim', yol: '/arkon/cizim', simge: 'lab', islem: 'arkon.hazirlik', veya: ['arkon.planlama', 'arkon.yonetici'] },
    ] },
    { baslik: 'Takip', maddeler: [
      { anahtar: 'bakim', baslik: 'Bakım', yol: '/arkon/bakim', simge: 'wrench', islem: 'arkon.bakim', veya: ['arkon.amir', 'arkon.yonetici'] },
      { anahtar: 'raporlar', baslik: 'Raporlar', yol: '/arkon/raporlar', simge: 'chart', islem: 'arkon.planlama', veya: PANO_ROLLERI },
      // TMI ekranıdır, çerçevede açılmaz.
      { anahtar: 'tmi-yansimalari', baslik: 'TMI\'ye yazılamayanlar', yol: '/arkon/tmi-yansimalari', simge: 'alert', islem: 'arkon.yansima-oku' },
    ] },
    { baslik: 'Sistem', maddeler: [
      { anahtar: 'ayarlar', baslik: 'Ayarlar', yol: '/arkon/ayarlar', simge: 'gear', islem: 'sayfa.arkon' },
    ] },
  ],
} as const satisfies IkinciMenuTanimi;
