# Yetki, oturum ve denetim

Kural kodu: YTK. Bu dosyadaki her satır onay bekliyor; sınıf anlamları için 00 numaralı dosyaya bakın.

| No | Kural | Sınıf | Durum | Not |
|---|---|---|---|---|
| YTK-01 | Yetki sunucuda uygulanır; arayüz yalnız menüyü şekillendirir. | Değişmez | onay bekliyor | |
| YTK-02 | Yetki sayfa bazlıdır: her sayfa için Yok, Görüntüle ya da Düzenle. | Tanım | değişsin | Karar: düzeyler oku / yaz / yonet; satır yoksa yetki yok. |
| YTK-03 | Üç yerleşik rol vardır: yönetici, planlamacı, operatör; başka roller özel rol olarak açılır. | Tanım | kalsın | Kalite yerleşik rol değildir. |
| YTK-04 | Kişiye özel yetki tanımlıysa rol şablonunu ezer. | Akış | kalsın | |
| YTK-05 | Bilinmeyen rol hiçbir yetki almaz. | Değişmez | kalsın | |
| YTK-06 | Yönetim yetkisi bütün kapıları açar; yönetim yetkili en az bir kullanıcı her zaman kalır. | Değişmez | onay bekliyor | |
| YTK-07 | İstasyona bağlı kullanıcı yalnız kendi istasyonunda adımı olan emirleri görür ve yalnız onlara kayıt girer; okuma ve yazma kuralı aynıdır. | Değişmez | onay bekliyor | Sınır sunucuda uygulanır. |
| YTK-08 | Parça sayfası yetkisi olmayan kullanıcıya çizim yolu, görsel, malzeme, ölçü ve revizyon alanları gönderilmez (gizlenmez, hiç gönderilmez). | Değişmez | onay bekliyor | |
| YTK-09 | Çizelge, kuyruk ve plan sayfalarını gösteren veri, bu sayfalardan en az birine yetkisi olmayana verilmez. | Değişmez | onay bekliyor | Çizelgede kapsam süzgeci yoktur: görebilen herkes tüm işleri görür. |
| YTK-10 | Eski sistem özel rollerin yazma ve üretim yeteneğini her zaman açık tutuyor, gerçek kısıtı yalnız sayfa matrisi yapıyordu. | Açık soru | değişsin | Karar: sayfa matrisine ek rol yetenekleri: üretim kaydı, adım onayı, kayıt silme / iptal, plan yayınlama. |
| YTK-11 | Eski sistemde yetki tablosunda tanımı olmayan yol serbest geçiyordu; yeni yolun tabloya eklenmesi unutulursa yetkisiz kullanılabilirdi. | Açık soru | değişsin | Karar: tanımsız yol reddedilir. |
| YTK-12 | Eski sistemde alan daraltma yalnız parça, firma ve proje sayfalarında uygulanıyordu. | Açık soru | onay bekliyor | Yeni sistemde hangi sayfalarda hangi alanlar daraltılsın? |
| YTK-13 | Oturum 12 saat hareketsizlikte, en geç 30 gün sonunda kapanır; oturum anahtarı özet olarak saklanır; yanlış kullanıcı adı ile yanlış şifre aynı sürede cevaplanır. | Akış | kalsın | |
| YTK-14 | Beş hatalı şifre denemesinden sonra 15 dakika kilit uygulanır ve her deneme denetim kaydına düşer. | Akış | kalsın | |
| YTK-15 | Her başarılı veri değişikliği ve her belge indirme denetim kaydına yazılır: kim, ne zaman, ne yaptı. | Değişmez | onay bekliyor | |
| YTK-16 | Denetim kayıtları birbirine zincirle bağlıdır ve imzalanır; sonradan silme, değiştirme ya da araya kayıt sokma doğrulamada görünür. | Değişmez | gitsin | Karar: ilk sürümde zincir ve imza yok; kayıt yalnız eklenir, değiştirilemez. |
| YTK-17 | Diski ele geçiren biri zinciri yeniden imzalayabilir; bu yüzden imza doğrulama anahtarı ayrı yerde saklanır. | Sınır | gitsin | YTK-16 ile birlikte. |
| YTK-18 | Geri yüklemeden önce mevcut durumun güvenlik yedeği alınır; alınamazsa geri yükleme yapılmaz; kaynağı doğrulanmayan ya da yabancı yedek geri yüklenmez. | Akış | onay bekliyor | |
| YTK-19 | Yedek günlük, haftalık ve açılışta alınır; yedek yoksa açık uyarı verilir. | Akış | onay bekliyor | |
| YTK-20 | Sayfa durumu (açık, bakımda, geliştirme, kapalı) yetkiden ayrı bir eksendir; kapalı sayfa menüden düşer. | Tanım | onay bekliyor | Durum yetkinin yerine geçmez. |
| YTK-21 | Bağlantı şifrelenmez ve fabrika iç ağı güvenilir kabul edilir. | Sınır | onay bekliyor | |
