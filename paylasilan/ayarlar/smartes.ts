import type { AyarTanimi } from '../ayar-tanimi.ts';
import { siklikSecenekleri } from '../okuma-sikligi.ts';

// Ana anahtar (karar 3b): okuma ve yazma (iş emri gönderimi) birlikte açılır ve kapanır. TMI "ERP'ye aktarıldı" işaretini koymaz (346 a).
// Sonradan eklenen akışların her birinin ayrı anahtarı vardır ve kapalı gelir; ana anahtar kapalıysa hiçbiri çalışmaz.
export const SMARTES_AYARLARI = {
  'smartes.baglanti': {
    modul: 'smartes',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'SmartES bağlantısı',
    aciklama: 'Açıkken makine gerçekleşenleri SmartES\'ten okunur ve SmartES karşılığı olan istasyonların iş emirleri SmartES\'e gönderilir; CORE "ERP\'ye aktarıldı" işaretini koymaz. Servis adresi sunucunun ortam değişkeninde yoksa açık olsa da istek çıkmaz.',
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
  'smartes.makine-okumasi': {
    modul: 'smartes',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'SmartES canlı makine okuması',
    aciklama: 'Açıkken (ve SmartES bağlantısı da açıkken) her makinenin anlık durumu, programı, parça sayacı ve iş mili yükü dakikada bir SmartES\'ten okunur ve SmartES > Makineler canlı ekranında gösterilir. Her turda makine başına bir istek atılır; SmartES\'e hiçbir şey yazılmaz.',
  },
  'smartes.sayim-aktarimi': {
    modul: 'smartes',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'SmartES: sayım aktarımı',
    aciklama: 'Açıkken sayım kaynağı SmartES seçilen istasyonların sağlam adetleri SmartES > Onay bekliyor listesine düşer ve o istasyonlarda terminalden sağlam sayım yapılmaz. Hiçbir adet onaylanmadan üretim emrine ve stoğa yazılmaz. Kapatılınca aktarım durur, terminal yeniden sayar; kapalıyken başlamış SmartES kayıtları sonradan aktarılmaz.',
  },
  // 3445 a: zamanlanmış okumaların sıklığı (SmartES sayfası); varsayılanlar bugünkü aralıklardır.
  'smartes.is-emri-durumu-sikligi': {
    modul: 'smartes', tur: 'secim', varsayilan: '5dk', secenekler: siklikSecenekleri(['elle', '5dk', '15dk', '60dk']),
    baslik: 'SmartES: üretim sayıları okuma sıklığı',
    aciklama: 'SmartES\'ten okuma sıklığı (üretim sayıları). SmartES sayfasındaki "Şimdi oku" hemen okur.',
  },
  'smartes.durus-sikligi': {
    modul: 'smartes', tur: 'secim', varsayilan: '15dk', secenekler: siklikSecenekleri(['elle', '5dk', '15dk', '60dk']),
    baslik: 'SmartES: duruşlar okuma sıklığı',
    aciklama: 'SmartES\'ten okuma sıklığı (duruşlar). SmartES sayfasındaki "Şimdi oku" hemen okur.',
  },
  'smartes.alarm-sikligi': {
    modul: 'smartes', tur: 'secim', varsayilan: '15dk', secenekler: siklikSecenekleri(['elle', '5dk', '15dk', '60dk']),
    baslik: 'SmartES: alarmlar okuma sıklığı',
    aciklama: 'SmartES\'ten okuma sıklığı (alarmlar). SmartES sayfasındaki "Şimdi oku" hemen okur.',
  },
  'smartes.kalite-ambar-sikligi': {
    modul: 'smartes', tur: 'secim', varsayilan: '15dk', secenekler: siklikSecenekleri(['elle', '5dk', '15dk', '60dk']),
    baslik: 'SmartES: kalite, hurda ve ambar okuma sıklığı',
    aciklama: 'SmartES\'ten okuma sıklığı (kalite, hurda ve ambar). SmartES sayfasındaki "Şimdi oku" hemen okur.',
  },
  'smartes.makine-sikligi': {
    modul: 'smartes', tur: 'secim', varsayilan: '1dk', secenekler: siklikSecenekleri(['elle', '1dk', '5dk', '15dk']),
    baslik: 'SmartES: canlı makine durumu okuma sıklığı',
    aciklama: 'SmartES\'ten okuma sıklığı (canlı makine durumu). Seyrekleşince Makineler canlı ekranı o kadar eski gösterir. SmartES sayfasındaki "Şimdi oku" hemen okur.',
  },
  'smartes.ilerleme-sikligi': {
    modul: 'smartes', tur: 'secim', varsayilan: '5dk', secenekler: siklikSecenekleri(['elle', '5dk', '15dk', '60dk']),
    baslik: 'SmartES: iş emri ilerlemesi okuma sıklığı',
    aciklama: 'SmartES\'ten okuma sıklığı (iş emri ilerlemesi). SmartES sayfasındaki "Şimdi oku" hemen okur.',
  },
  'smartes.hesap-sikligi': {
    modul: 'smartes', tur: 'secim', varsayilan: '60dk', secenekler: siklikSecenekleri(['elle', '60dk', 'gunluk']),
    baslik: 'SmartES: hesaplar (OEE, çevrim süresi) okuma sıklığı',
    aciklama: 'SmartES\'ten okuma sıklığı (SmartES hesapları: OEE, çevrim süresi). SmartES sayfasındaki "Şimdi oku" hemen okur.',
  },
  'smartes.liste-sikligi': {
    modul: 'smartes', tur: 'secim', varsayilan: 'gunluk', secenekler: siklikSecenekleri(['elle', 'gunluk']),
    baslik: 'SmartES: tanım listeleri okuma sıklığı',
    aciklama: 'SmartES\'ten okuma sıklığı (tanım listeleri). SmartES sayfasındaki "Şimdi oku" hemen okur.',
  },
} as const satisfies Record<string, AyarTanimi>;
