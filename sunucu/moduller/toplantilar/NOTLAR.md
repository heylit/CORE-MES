# Notlar (toplantilar)

- Katılımcı ekranı `/profil/toplantilarim` (Profilim altı): `sayfa.profil` her roldedir, rol matrisi değişmez. Bildirim yolu kayıtlı
  bir sayfanın altında olmalıdır (`araclar/bildirim-yollari.test.ts`); ayrı `sayfa.toplantilarim` her role yetki göçü isterdi.
- Okuma uçları `oturum`; süzme serviste (`goruntulerMi`). Başkasının toplantısı 403 (sahiplik `kendi`).
- Takvimde geçmiş günde "Yapıldı" işaretlenmemiş toplantı gecikmiş görünür: sonuç yazılmasını hatırlatır.
- Göreve çevirme aksiyonun sürümünü artırır; projelerdeki tekil dizin (iptal dışı) ikinci açık görevi ayrıca reddeder.
- Kişi seçici `/kisiler/secim-ara` ucunu kullanır (`kisiler.oku` ya da istasyon işlemleri); rol dağılımında `toplantilar.yaz` alan role bu da gerekir.
- Bildirim başlığı serbest metindir (uygulama içi); e-posta konusu ve gövdesi yalnız sabit alanlardan kurulur (bildirim kurallar `toplantiAlanlari`).
