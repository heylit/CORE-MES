import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/uretim-terminali',
    ozet: 'Operatörün makinedeki işi başlattığı, parça saydığı, duruş ve yardım çağırdığı ekran.',
    nasil: [
      'Üst karttaki önerilen düğmeye basın: "Başlat", "Hazırlığa geç", "Üretime geç", "Bitir".',
      'Parça saymak için "İyi +1" ya da "Hurda +1" (hurda nedeni sorulur); çok adet için "Toplu giriş".',
      'Makine durunca "Neden durdu?" penceresinde nedeni seçip "Duruşu kaydet"e basın.',
      'Yardım için zil düğmesiyle "Andon çağrısı" açın; çözülünce "Çözüldü · kapat".',
      'Vardiya sonunda "Menü" > "Vardiya özeti ve devir" > "Vardiyayı devret".',
    ],
    sinirlar: [
      'Başlatma, sayım ve bitirme üretim kaydı yetkisi ister.',
      'İlk parça kalite onayı olmadan seri üretim başlamaz; bitmiş işte sayı değişmez.',
      'İş, canlı planda bu istasyona yerleşmeden başlatılamaz. Çoğu işlemde kısa süre "Geri al" çıkar.',
    ],
    sozcukler: ['operatör', 'sayım', 'hurda', 'duruş', 'andon', 'başlat', 'bitir', 'vardiya devri'],
  },
  {
    yol: '/arkon',
    ozet: 'İş paketi (resim, kontrol planı, adımlar) hazırlanıp operatöre gönderilir; pano, kalite, bakım ve raporlar buradadır.',
    nasil: [
      'Başlığın altındaki sekmelerden bölümü seçin: Pano, Plan Kuyruğu, Üretim Terminali Hazırlık, Kalite, Bakım, Raporlar.',
      '"Üretim Terminali Hazırlık"ta paketi seçin; teknik resmi ya da modeli ekleyin ("Çizim Merkezi\'nden ekle").',
      '"Kontrol planı"nda ölçüleri onaylayın, "Adım ekle" ile operasyon adımı ekleyin.',
      '"Yayın öncesi kontrol"den geçin, "Önizle", sonra "Operatöre gönder". Geri almak için "Operatörden geri çek".',
    ],
    sinirlar: [
      'Yeni paket yalnız üretim emri açılınca oluşur; kalite onayı olmadan yayınlanamaz.',
      'Karara bağlanmış kalite kaydını yalnız kararı veren rol ve yönetici değiştirir.',
      'Bölümler yetkiye göre görünür.',
    ],
    sozcukler: ['hazırlık', 'iş paketi', 'kontrol planı', 'bakım', 'anomali', 'pano'],
  },
  {
    yol: '/kuyruk',
    ozet: 'İstasyonların iş sıralarını salt okunur gösterir.',
    nasil: [
      'Her istasyon bir şerittir; iş sayısı ve tahmini bitiş yazar.',
      'Üstteki iş merkezi düğmeleriyle ("Tümü" ya da merkez adı) süzün.',
      'Bitmiş işler için "Tamamlananları göster"i işaretleyin.',
      'Kartlardaki "Acil", "Gecikecek", "Planlı duruşta" işaretlerine bakın.',
    ],
    sinirlar: [
      'Sıra burada değiştirilemez; sıralama Üretim Hazırlık > Plan Kuyruğu\'nda plan yetkisiyle yapılır.',
      'Tahmin kalan adet ve çevrim süresinden hesaplanır; vardiya, mola ve planlı duruşlar dahildir.',
    ],
    sozcukler: ['sıra', 'iş sırası', 'plan', 'tahmini bitiş'],
  },
];
