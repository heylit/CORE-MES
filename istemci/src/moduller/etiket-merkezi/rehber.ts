import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/etiket-merkezi',
    ozet: 'Zebra ve Argox etiket yazıcıları için hazır etiket şablonlarını önizler ve etiketi üç yoldan basar.',
    nasil: [
      'Ne basılacağını ve kayıtları seçin; önizleme gerçek ölçüsüyle görünür.',
      'Ağ yazıcısı: "Yazıcıya gönder" ile sunucu yazıcıya doğrudan gönderir (Sistem Ayarları\'nda doğrudan baskı açıksa).',
      'Bu bilgisayara takılı yazıcı (USB ya da Windows yazıcısı): "Vektörel yazdır" ile yazdırma penceresi açılır; yazıcıyı orada seçin. Yazıcı tanımı gerekmez.',
      'Dosya yazıcısı: "Yazıcı için indir" ile komut dosyasını alın ve yazıcının kendi aracıyla gönderin.',
      'Yeni yazıcıda önce "Yazıcı denemesi" etiketini basın.',
      'Vektörel yazdırma kurulumu: yazıcının Windows sürücüsünü kurun; sürücüde kâğıt boyutunu etiket boyutuna eşitleyin. İstenirse Chrome ya da Edge kiosk yazdırma ayarıyla (--kiosk-printing) pencere atlanır ve varsayılan yazıcıya basılır.',
    ],
    sinirlar: [
      'Vektörel yazdırmada yazıcıya ZPL/PPLB komutu gitmez; sayfayı sürücü basar. Karartma ve hız gibi yazıcı ayarları sürücüden yönetilir.',
      'Tarayıcı etiketin basıldığını bildirmez; defter yazdırma penceresinin açıldığını gösterir. Etiketi yazıcının başında kontrol edin.',
    ],
    sozcukler: ['etiket', 'zebra', 'argox', 'zpl', 'yazıcı', 'qr', 'yazdır', 'usb'],
  },
];
