import type { GenelKonu } from './rehber.ts';

// Bütün sayfalarda ortak olan kabuk parçalarının tarifi. Kabuk değişince burası da değişir.
export const GENEL_KONULAR: readonly GenelKonu[] = [
  {
    anahtar: 'menu',
    baslik: 'Sayfalar ve menü',
    simge: 'dash',
    metin: [
      'Sayfalar solda gruplar halinde durur: Üretim, Planlama, Stok, Satın Alma, Kalite, Tanımlar, Yönetim.',
      'Telefonda sayfalar alttaki çubukta; hepsi için "Tümü".',
      'Yalnız yetkinizin olduğu sayfaları ve bölümleri görürsünüz. Eksik bir sayfa varsa yöneticinize sorun.',
    ],
    sozcukler: ['gezinme', 'sayfa', 'bulamıyorum', 'yok'],
  },
  {
    anahtar: 'sekmeler',
    baslik: 'Sayfanın bölümleri',
    simge: 'list',
    metin: [
      'Sayfa başlığının altındaki sekmeler o sayfanın bölümleridir.',
      'Sekmenin yanındaki sayı bekleyen işi gösterir.',
    ],
    sozcukler: ['sekme', 'ikinci menü', 'bölüm'],
  },
  {
    anahtar: 'arama',
    baslik: 'Hızlı git, arama ve komut (Ctrl K)',
    simge: 'search',
    metin: [
      'Üst çubuktaki arama kutusu sayfa, bölüm, komut ve kayıt (emir, malzeme, istasyon) bulur.',
      'Açık sayfanın komutları "Bu sayfa" etiketiyle en üstte durur; kutu boşken de görünür.',
      'Komut ilgili ekranı ya da pencereyi açar; kaydı yine o ekranda siz yaparsınız.',
      'Klavyede Ctrl K ile açılır; oklarla seçip Enter\'a basın, Esc kapatır.',
    ],
    sozcukler: ['bul', 'ara', 'ctrl k', 'kısayol', 'komut'],
  },
  {
    anahtar: 'ne-oldu',
    baslik: '"Ne oldu?" paneli (+)',
    simge: 'plus',
    metin: [
      'Üst çubuktaki + düğmesi günlük olayları listeler: "Malzeme geldi", "İzin istiyorum" gibi.',
      'Olayı seçin; sistem sizi işin yapıldığı ekrana götürür. Yalnız yetkili olduğunuz olaylar görünür.',
    ],
    sozcukler: ['kayıt gir', 'olay', 'artı'],
  },
  {
    anahtar: 'gezi',
    baslik: 'Geri, ileri ve son yerler',
    simge: 'chev-left',
    metin: [
      'Üst çubuğun solundaki oklar geri ve ileri gider (Alt + sol / sağ ok da olur).',
      '"Son yerler" menüsü son açtığınız sayfaları listeler.',
    ],
    sozcukler: ['geri dön', 'önceki sayfa'],
  },
  {
    anahtar: 'hesap',
    baslik: 'Tema, parola ve çıkış',
    simge: 'user',
    metin: [
      'Sağ üstteki ay / güneş düğmesi koyu ve açık tema arasında geçer.',
      'Kişi düğmesi "Parolamı değiştir" penceresini açar; herkes kendi parolasını değiştirebilir.',
      'Kilit düğmesi çıkış yapar. Ortak cihazda işiniz bitince çıkış yapın.',
      'Telefonda bunlar sağ üstteki "Hesap" menüsündedir.',
    ],
    sozcukler: ['şifre', 'parola', 'karanlık', 'gece modu', 'çıkış', 'oturum'],
  },
  {
    anahtar: 'baglanti',
    baslik: 'Bağlantı koparsa',
    simge: 'alert',
    metin: [
      'Sunucuya ulaşılamayınca altta "Bağlantı yok" şeridi çıkar.',
      'Bağlantı dönünce ekran kendini yeniler. Kopukken gönderdiğiniz kaydı ekranda kontrol edin.',
    ],
    sozcukler: ['internet', 'hata', 'kopuk', 'bağlantı'],
  },
  {
    anahtar: 'telefon',
    baslik: 'Telefona kurmak',
    simge: 'download',
    metin: [
      'Sistem telefona uygulama gibi kurulabilir: tarayıcı menüsünde "Ana ekrana ekle"yi seçin.',
      'Veri her zaman sunucudan gelir; bağlantı yokken kayıt girilmez.',
    ],
    sozcukler: ['mobil', 'uygulama', 'kurulum', 'ana ekran'],
  },
  {
    anahtar: 'kurallar',
    baslik: 'Kurallar nerede denetlenir',
    simge: 'lock',
    metin: [
      'Yetki ve iş kuralları sunucuda denetlenir: ekranda görünen bir düğme yetkiniz yoksa işlem yapmaz.',
      'Onaylanmış ya da kesinleşmiş kayıt onaysız değişmez. Aynı kaydı başkası değiştirdiyse sayfayı yenilemeniz istenir.',
      'Her işlem kişi ve saatle kayda geçer.',
    ],
    sozcukler: ['yetki', 'izin yok', 'yapamıyorum', 'onay', 'kilit'],
  },
];
