import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/taleplerim',
    ozet: 'Kendi adınıza malzeme ya da hizmet satın alma talebi açar ve taleplerinizin durumunu görürsünüz.',
    nasil: [
      '"Satın alma talebi" kartında türü seçin: "Malzeme" ya da "Hizmet".',
      'Kartı arayıp seçin; listede yoksa "Adıyla yazın" ile kalem adı ve birim girin.',
      'Miktarı girin, gerekirse "Kalem ekle"; istenen tarihi yazıp "Talebi gönder"e basın.',
      'Taleplerinizin durumu "Taleplerim" kartında görünür (Satın almada, Onayda, Sipariş verildi).',
    ],
    sinirlar: [
      'Herkes yalnız kendi taleplerini görür; fiyat, teklif ve tedarikçi görünmez.',
      'Kartsız kalem, malzeme kartı bağlanmadan siparişe dönmez.',
    ],
    sozcukler: ['talep', 'satın alma', 'istek', 'sipariş', 'malzeme iste'],
  },
  {
    yol: '/satin-alma',
    ozet: 'Gelen talepler için teklif toplar, karşılaştırır, onaya gönderir ve siparişi izler.',
    nasil: [
      'Talepleri "İş kutusu" ya da "Talepler"de görün.',
      '"Teklif iste", sonra "Teklifleri gir" (ya da "Excel\'den yapıştır").',
      '"Karşılaştır ve karar ver" ile teklifi seçin; onaylayan "Onaylar"da "Onayla" ya da "Reddet".',
      'Fason işleri "Dış operasyonlar"da izleyin.',
    ],
    sinirlar: [
      'Teklif ve sipariş işlemleri ile onay ayrı yetkilerdir; ayar açıksa kararı veren onaylayamaz.',
      'Siparişe geçmek için onaylı karar gerekir.',
      '"Teslim alındı" elle yazılmaz; stoktaki mal kabulden gelir.',
    ],
    sozcukler: ['teklif', 'sipariş', 'tedarikçi', 'onay', 'fason', 'alım'],
  },
];
