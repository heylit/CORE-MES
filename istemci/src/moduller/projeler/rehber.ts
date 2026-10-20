import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/projeler',
    ozet: 'Müşteri projelerini listeler; her projenin bilgisini ve bağlı üretim emirlerini gösterir.',
    nasil: [
      '"Ara" kutusuna proje no ya da ad yazın, "Durum" süzgecini seçin.',
      '"Proje ekle" ile proje no, ad, müşteri ve tarihleri girip "Kaydet"e basın.',
      'Projeyi açın: "Proje bilgisi" ve "Üretim emirleri" kartları görünür; değiştirmek için "Düzenle".',
    ],
    sinirlar: [
      'Ekleme ve düzenleme proje yazma yetkisi ister.',
      'Pasif firma yeni projeye seçilemez; aynı proje kodu iki kez kullanılamaz.',
    ],
    sozcukler: ['proje', 'müşteri projesi'],
  },
];
