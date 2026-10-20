import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/etiket-merkezi',
    ozet: 'Zebra ve Argox etiket yazıcıları için hazır etiket şablonlarını önizler ve yazıcı komut dosyasını üretir.',
    nasil: [
      'Soldan şablonu seçin; önizleme gerçek ölçüsüyle görünür.',
      'Yazıcı dilini (Zebra ZPL ya da Argox PPLB), çözünürlüğü ve adedi seçin.',
      '"Komut dosyasını indir" ile dosyayı alın ve yazıcının kendi aracıyla gönderin.',
      'Yeni yazıcıda önce "Yazıcı denemesi" etiketini basın.',
    ],
    sinirlar: [
      'Şimdilik örnek değerlerle basılır; konum, lot ve refakat kartı kayıtları sonraki adımda bağlanır.',
      'Yazıcıya doğrudan gönderim yoktur.',
    ],
    sozcukler: ['etiket', 'zebra', 'argox', 'zpl', 'yazıcı', 'qr'],
  },
];
