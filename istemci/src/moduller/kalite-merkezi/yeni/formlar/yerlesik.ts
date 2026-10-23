// Uygulamayla gelen standart formlar (uygulamanın BUILTIN listesi, metin olduğu gibi). Kullanıcı birini düzenlerse aynı koddaki
// `tpl` kaydı bunun yerine geçer ("özelleştirildi"); kayıt silinince bu metne döner.

export interface YerlesikSablon {
  kod: string;
  ad: string;
  std: string;
  kat: string;
  ne: string;
  etiket?: boolean;
  dsl: string;
}

export const YERLESIK_SABLONLAR: readonly YerlesikSablon[] = [
{kod:'KF-08',ad:'FOD kontrol listesi',std:'SAE AS9146',kat:'Üretim ve proses',ne:'Vardiya başı ve sonu, montaj kapanmadan önce',dsl:`# Genel bilgiler
Alan / hat *
Vardiya | seçim: 1. vardiya, 2. vardiya, 3. vardiya
Ürün / seri no
# Kontrol maddeleri
? Çalışma alanında sahipsiz alet, bağlantı elemanı veya atık yok
? Alet panosu / gölge pano tam, eksik alet yok
? Açık port, konnektör ve boru ağızları kapatılmış
? Kişisel eşyalar (takı, kalem, telefon) tanımlı alanda
? Montaj kapatılmadan önce iç görsel kontrol yapıldı
? Talaş, tel ve kesik parçalar toplandı
? Kayıp alet veya parça yok; varsa arama yapıldı ve raporlandı
# Kayıp alet / parça kaydı
[Tablo: Kayıp kalem, Son görüldüğü yer, Arama sonucu]
Açıklama / alınan önlem | metin`},
{kod:'KF-09',ad:'Sahte parça önleme kontrol listesi',std:'SAE AS5553 / AS6081 / AS6174',kat:'Tedarik zinciri',ne:'Elektronik komponent giriş muayenesinde',dsl:`# Parça bilgileri
Üretici parça no *
Üretici *
Tedarikçi / distribütör *
Tarih / lot kodu
Miktar | sayı
Kaynak tipi * | seçim: Orijinal üretici, Yetkili distribütör, Bağımsız distribütör, Stok / broker
# Belge ve görsel doğrulama
? Kaynak, üretici veya yetkili distribütör olarak doğrulandı
? Uygunluk sertifikası ve üretici izlenebilirlik belgesi mevcut
? Tarih / lot kodu, sertifika ve etiket birbiriyle tutarlı
? Ambalaj, nem bariyeri ve ESD koruması orijinal görünümde
? Gövdede yeniden markalama, zımparalama veya yeniden kaplama izi yok
? Bacak / top dizisinde yeniden işleme, oksit veya hasar izi yok
? Yetkisiz kaynak ise ek test planlandı
# Ek testler ve karar
Uygulanan ek testler | çoklu: Görsel (10x ve üzeri), X-ray, XRF, Dekapsülasyon, Elektriksel test, Çözücü testi
Karar * | seçim: Kabul, Karantina, Ret (şüpheli sahte), Ret (doğrulanmış sahte - bildirim gerekli)
Açıklama | metin`},
{kod:'KF-10',ad:'Konfigürasyon değişiklik talebi (ECR)',std:'AQAP-2110, EIA-649',kat:'Üretim ve proses',ne:'Tasarım, malzeme, proses veya yazılım değişikliğinde',dsl:`# Talep
Konfigürasyon kalemi / parça no *
Mevcut revizyon *
Önerilen revizyon
Değişiklik sınıfı * | seçim: Sınıf I (form/uyum/fonksiyon etkili - müşteri onayı), Sınıf II (doküman / küçük)
Etkilenen alanlar | çoklu: Tasarım, Malzeme, Proses, Yazılım, Test, Tedarikçi, Lojistik / yedek parça
Değişiklik gerekçesi * | metin
# Etki ve uygulama
FAI gerekli mi? | seçim: Evet - tam FAI, Evet - kısmi FAI, Hayır
Mevcut stok / WIP kararı | seçim: Kullanılabilir, Yeniden işlenecek, Hurda, Değerlendirilecek
Uygulama etkinlik noktası (seri / tarih)
# Onay
Karar | seçim: Değerlendirmede, Onaylandı, Reddedildi
Müşteri onay referansı`},
{kod:'KF-13',ad:'MRB karar formu',std:'AS9100D 8.7',kat:'Uygunsuzluk ve iyileştirme',ne:'Uygun olmayan ürünün kullanım kararında',dsl:`# Uygunsuzluk
NCR no *
Parça no / revizyon *
Lot / seri no
Miktar | sayı
Uygunsuzluk özeti * | metin
# Değerlendirme
? Uygunsuzluk form, uyum, fonksiyon, emniyet veya güvenilirliği etkilemiyor
? Ürün müşteri teknik gereksinimlerini karşılamaya devam ediyor
? Müşteri MRB yetkisi devredilmiş veya müşteri onayı alındı
? Etkilenebilecek diğer lot ve ürünler araştırıldı
Karar * | seçim: Olduğu gibi kullan, Tamir, Yeniden işle, Hurda, Tedarikçiye iade
Müşteri onay referansı
Teknik gerekçe | metin
# MRB üyeleri
[Tablo: Ad soyad, Birim, Görüş]`},
{kod:'KF-14',ad:'Sapma / feragat talebi',std:'AS9100D 8.7, AQAP-2110',kat:'Uygunsuzluk ve iyileştirme',ne:'Gereksinimden üretim öncesi sapma veya üretim sonrası feragat için',dsl:`# Talep
Talep tipi * | seçim: Sapma (üretim öncesi), Feragat (üretim sonrası)
Proje / sözleşme no *
Parça no / revizyon *
Etkilenen seri / lot aralığı *
Miktar | sayı
Gereksinim (resim / spesifikasyon maddesi) * | metin
Talep edilen sapma * | metin
Gerekçe ve kök neden | metin
# Etki
Etkilenen özellikler | çoklu: Emniyet, Güvenilirlik, Değiştirilebilirlik, Ağırlık / denge, Performans, Bakım, Maliyet, Teslimat
Sınıf | seçim: Kritik, Majör, Minör
İlgili DÖF no
# Onay
Karar | seçim: Değerlendirmede, Müşteri onayına gönderildi, Onaylandı, Reddedildi
Müşteri onay referansı`},
{kod:'KF-15',ad:'Müşteri şikâyeti formu',std:'AS9100D 9.1.2, 10.2',kat:'Uygunsuzluk ve iyileştirme',ne:'Müşteri veya sahadan gelen her geri bildirimde',dsl:`# Şikâyet
Müşteri *
Müşteri referans no
Ürün / parça no *
Seri / lot
Şikâyet tanımı * | metin
Kullanım / saha koşulu
# İlk değerlendirme
Ciddiyet * | seçim: Kritik (emniyet), Majör, Minör
Geçici önlem (24-48 saat) | metin
Stok ve sevk edilmiş ürün taraması | seçim: Yapıldı - uygunsuz yok, Yapıldı - uygunsuz bulundu, Yapılmadı
İlgili NCR / 8D no
Karar | seçim: Açık, 8D başlatıldı, Kapatıldı`},
{kod:'KF-16',ad:'Proses denetim kontrol listesi',std:'AS9100D 8.5.1',kat:'Üretim ve proses',ne:'Katmanlı proses denetiminde, istasyon bazında',dsl:`# Denetim
Proses / istasyon *
Ürün / parça no
Operatör
# Kontrol maddeleri
? Operatör güncel revizyon resim ve talimatla çalışıyor
? Kontrol planındaki kontroller tanımlı sıklıkta yapılmış ve kayıtlı
? Kullanılan ölçüm cihazlarının kalibrasyonu geçerli
? Operatörün bu operasyon için yetkinlik kaydı var
? Uygun olmayan ürün ayrılmış ve etiketlenmiş
? İş emri / seyahat kartı güncel ve imzalı
? Özel proses parametreleri onaylı değerlerde
? Alan FOD ve ESD gereklerine uygun
? Malzeme ve parçalar izlenebilir (lot / seri etiketli)
Bulgular ve anında düzeltmeler | metin`},
{kod:'KF-17',ad:'Tedarikçi denetim kontrol listesi',std:'AS9100D 8.4, AQAP-2110',kat:'Tedarik zinciri',ne:'Ön onay, periyodik ve şikâyet sonrası tedarikçi denetiminde',dsl:`# Denetim bilgileri
Tedarikçi *
Denetim tipi | seçim: Ön onay, Periyodik, Ürün / proses denetimi, Şikâyet sonrası
Kapsam (ürün / proses)
Denetçiler
# Kalite sistemi ve belgeler
? Geçerli AS9100 / AQAP-2110 / ISO 9001 sertifikası var
? Sipariş gereksinimleri alt tedarikçilere aktarılıyor
? Konfigürasyon ve değişiklik yönetimi tanımlı, müşteri onayı alınıyor
? Uygun olmayan ürün ve DÖF süreci etkin
# Üretim ve muayene
? Kontrol planı ve muayene kayıtları mevcut
? İlk parça muayenesi (AS9102) uygulanıyor
? Ölçüm cihazları kalibre ve izlenebilir
? Özel prosesler onaylı (NADCAP / müşteri onayı)
? Sahte parça önleme programı var
? FOD önleme programı var
? Kayıtlar sözleşmede istenen süre saklanıyor
# Sonuç
Puan (%) | sayı
Karar * | seçim: Onaylı, Şartlı onaylı, Onaylanmadı
Bulgular ve istenen aksiyonlar | metin`},
{kod:'KF-19',ad:'Ürün durum etiketi',std:'AS9100D 8.5.2, 8.7',kat:'Muayene ve kabul',ne:'Muayene sonrası ürün veya parti üzerine',etiket:true,dsl:`# Etiket
Durum * | seçim: KABUL, ŞARTLI KABUL, KARANTİNA, RET
Parça no *
Parça adı
Revizyon
Lot / seri no
Miktar | sayı
Referans (muayene / NCR no)
Açıklama`},
{kod:'KF-20',ad:'Uygunluk sertifikası (CoC)',std:'AS9100D 8.6, sözleşme',kat:'Muayene ve kabul',ne:'Her sevkiyatta müşteriye',dsl:`# Sevkiyat
Müşteri *
Sözleşme / sipariş no *
İrsaliye no
Parça no *
Parça adı
Revizyon *
Miktar * | sayı
Seri / lot numaraları | metin
# Beyan
? Ürünler sipariş, resim ve spesifikasyon gereksinimlerine uygun üretilmiş ve muayene edilmiştir
? Muayene, test ve FAI kayıtları saklanmakta, talep halinde sunulabilir
? Onaylı sapma / feragat yoktur ya da aşağıda belirtilmiştir
? Ürünler sahte parça içermez; elektronik komponentler yetkili kaynaktan temin edilmiştir
Onaylı sapma / feragat no
Yetkili kalite temsilcisi *`},
{kod:'KF-21',ad:'Kontrol planı',std:'AS9100D 8.5.1, AS9145',kat:'Üretim ve proses',ne:'Yeni parça veya proses değişikliğinde, FAI öncesi',dsl:`# Parça
Parça no / revizyon *
Parça adı
Plan tipi | seçim: Prototip, Ön seri, Seri üretim
Proses akış referansı
# Karakteristikler
[Tablo: Op no, Karakteristik, Sınıf (K/M/m), Spesifikasyon / tolerans, Ölçüm yöntemi / cihaz, Numune / sıklık, Kayıt, Reaksiyon planı]
# Onay
Hazırlayan ekip`}
];
