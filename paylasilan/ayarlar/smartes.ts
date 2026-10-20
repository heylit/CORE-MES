import type { AyarTanimi } from '../ayar-tanimi.ts';

// Ana anahtar (karar 3b): okuma ve yazma (iş emri gönderimi) birlikte açılır ve kapanır. TMI "ERP'ye aktarıldı" işaretini koymaz (346 a).
// Sonradan eklenen akışların her birinin ayrı anahtarı vardır ve kapalı gelir; ana anahtar kapalıysa hiçbiri çalışmaz.
export const SMARTES_AYARLARI = {
  'smartes.baglanti': {
    modul: 'smartes',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'SmartES bağlantısı',
    aciklama: 'Açıkken makine gerçekleşenleri SmartES\'ten okunur ve SmartES karşılığı olan istasyonların iş emirleri SmartES\'e gönderilir; TMI "ERP\'ye aktarıldı" işaretini koymaz. Servis adresi sunucunun ortam değişkeninde yoksa açık olsa da istek çıkmaz.',
  },
  'smartes.kalite-ambar-okumasi': {
    modul: 'smartes',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'SmartES kalite, hurda ve ambar okuması',
    aciklama: 'Açıkken (ve SmartES bağlantısı da açıkken) on beş dakikada bir SmartES\'ten red/hurda, ambar hareketi ve kalite kontrol sonuçları okunup yalnız saklanır. Stok ya da kalite kayıtlarına işlenmez; SmartES\'te kayıt "aktarıldı" diye işaretlenmez.',
  },
  'smartes.tanim-gonderimi': {
    modul: 'smartes',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'SmartES tanım gönderimi',
    aciklama: 'Açıkken (ve SmartES bağlantısı da açıkken) SmartES\'te henüz tanımı olmayan aktif istasyonlar ve stok kartları SmartES\'e tanım olarak gönderilir; SmartES\'te kodu zaten olan kayıt gönderilmez. Kod eşlemesi gönderimle kendiliğinden yazılmaz; iş emri gönderimi için Kod eşlemeleri ekranından eşleyin.',
  },
} as const satisfies Record<string, AyarTanimi>;
