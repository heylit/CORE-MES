import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/projeler',
    ozet: 'Müşteri projelerini listeler; her projenin statüsünü, görevlerini, kilometre taşlarını ve bağlı üretim emirlerini gösterir.',
    nasil: [
      '"Ara" kutusuna proje no ya da ad yazın, "Durum" süzgecini seçin.',
      '"Proje ekle" ile proje no, ad, müşteri ve tarihleri girip "Kaydet"e basın.',
      'Projeyi açın: "Özet", "Görevler", "Kilometre taşları", "Statü geçmişi" ve "Genel" sekmeleri görünür; proje bilgisini değiştirmek için "Düzenle".',
      'Başlıktaki statü çipine basın: listeden statü seçin ya da (izin açıksa) "Listede yok, yazacağım" ile yazın; not isteğe bağlıdır.',
      '"Görevler" sekmesinde "Görev ekle"; satıra basınca durum, gerçek tarihler ve ilerleme girilir. "Pano" görevleri duruma göre dizer.',
      'Kilometre taşı eklerken taban tarihi girilir ve donar; değiştirmek için "Taban" düğmesiyle yeni tarih ve gerekçe yazın.',
      'İkinci menüde "Statü listesi": statü ekleyin, düzenleyin ya da kapatın; "Listede olmayan statü elle yazılabilsin" serbest yazıya izin verir.',
    ],
    sinirlar: [
      'Ekleme ve düzenleme proje yazma yetkisi ister.',
      'Pasif firma yeni projeye seçilemez; aynı proje kodu iki kez kullanılamaz.',
      'Görev ve kilometre taşı görev yazma, statü statü yazma yetkisi ister; tamamlanan ya da iptal edilen projeye görev eklenmez.',
      'Statü listesini değiştirmek ayrı yetki ister; statü silinmez, kapatılan statü geçmişte adıyla kalır.',
      'Plan ve gerçekleşen zaman çizelgesi Plan sayfasındadır; burada hesaplanmaz.',
    ],
    sozcukler: ['proje', 'müşteri projesi', 'görev', 'kilometre taşı', 'statü'],
  },
];
