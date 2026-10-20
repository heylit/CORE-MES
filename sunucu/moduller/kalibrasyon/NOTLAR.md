# Kalibrasyon notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.

- Karar (06.10.2026, kart #76): kalibrasyonu geçmiş alet ölçümü engellemez; modül yalnız `gecerliAletVarMi`
  cevabını verir. Ölçüme alet yazmak başka modüllerin işidir.
- Son kalibrasyon ve vade saklanmaz: son "uygun" kayıttan türetilir. Kaydı olmayan aletin vadesi `null`,
  durumu "kayıt yok"; `gecerliAletVarMi` bu aleti geçerli saymaz.
- Elle kullanım dışı: neden zorunlu, aletin kendi satırında durur. Kullanıma dönmenin tek yolu yeni bir
  "uygun" kayıttır; güncelleme gövdesi kullanım durumunu taşımaz. Uygunsuz kayıt elle yazılmış nedeni ezmez.
- Karar (06.10.2026, kart #97): kullanım durumunu en yeni kalibrasyon tarihli kayıt belirler, giriş sırası değil;
  gelecek tarihli kayıt reddedilir. Aynı tarihte sonradan girilen belirler; belirleyen
  olmayan kayıt (uygun ya da uygunsuz) deftere girer ama kullanım durumuna dokunmaz, elle kullanım dışını da kaldırmaz.
- Vazgeçilen yol: her yazmada belirleyen kaydın etkisini yeniden uygulamak; eski tarihli ilgisiz bir kayıt elle
  kullanım dışı bırakılmış aleti kullanıma döndürürdü.
- Karar (kart #97): kaydı giren kişinin satırı silinemez (kademeli silme yok). Kişi adı SQL ile okunmaz, kişiler
  modülünün listesinden alınır; liste bütün kişileri döner, ayrıntıda kayıt varsa bir kez çağrılır.
- Testte "bugün" servis fonksiyonuna parametre girer; uç yolunda veritabanının günüdür. Yalnız okuma işlemi taşıyan
  yerleşik rol olmadığından test geçici rolü ve tek `rol_islemi` satırını doğrudan yazar.
- Arama I, İ, ı ve i'yi aynı harf sayar (alet numarası İngilizce klavyeyle aranır); ş, ğ, ü, ö, ç ayrı kalır.
- Özet sayıları arama süzgecinden bağımsızdır; listeyi daraltan arama atölyenin durumunu değiştirmez.
- Sertifika dosya eki yok (dosya saklama henüz yok); yalnız sertifika numarası.
- Karar (kart #97): dışa aktarma bu modülde yazılmaz; ayrı kartla, ortak tablo dışa aktarma parçasıyla gelir.
- Güncelleme gövdesi tam kayıttır: gönderilmeyen metin alanı silinir, periyot ise zorunludur (varsayılan yalnız
  eklemede). Kısmi güncellemeden vazgeçildi; eksik periyot vadeyi sessizce kaydırıyordu.
- "Yaklaşan" alette kalan gün yoksa sayı yazılmaz, yalnız durum yazılır; sunucu bu birleşimi üretmez, sözleşme tipi izin verir.
