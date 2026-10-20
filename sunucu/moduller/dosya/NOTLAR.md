# dosya notları

Koddan okunamayanlar: neden, vazgeçilen yol, tuzak. En çok 30 satır; eskiyen satır silinir.
- Modülün sahibi çekirdek konusudur (kullanıcı kararı DSm a); karar ve gerekçe ADR 0009.
- Okuma ucu yoktur (kişinin kendi bağsız yüklemesi dışında): dosyayı bağlayan modül kendi okuma işlemiyle verir. Böylece `dosya`
  hiçbir modülü ithal etmez ve okuma yetkisi tek yerde, kaydın sahibinde kalır.
- Özet okuma izni değildir: bağlama ve bağsız önizleme yalnız içeriği kendisi gönderip özetini doğrulatana açıktır (`dosya_yukleyeni`).
  Yoksa başka kayıtta özeti gören, dosyayı yazabildiği bir kayda bağlayıp o kaydın okuyanlarına açardı (denetçi bulgusu).
- Aynı içeriği ikinci yükleyen bütün parçaları gönderir (içerik yeniden yazılmaz, yalnız yükleyen eklenir). "Tamam" kısayolu yalnız
  içeriği daha önce kendisi göndermiş kişiyedir.
- Vazgeçildi: içeriği okuma transaction'ında akıtmak. Yavaş istemci boşta transaction süresine takılır ve bağlantıyı tutar.
- Vazgeçildi: sınırları ortam değişkeniyle vermek. Modüller ayarı almaz; ayarı modüle taşımak çekirdek arayüz değişikliğidir.
- Tamamlama şerit parçalarını SQL içinde `dosya_icerigi`ne kopyalar; özet parça parça hesaplanır, dosya belleğe bütün alınmaz.
