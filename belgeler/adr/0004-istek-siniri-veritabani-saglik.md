# ADR 0004 — İstek sınırı, veritabanı ve sağlık kararları

Durum: kabul edildi (05-06.10.2026). Kullanıcının tek tek onayladığı çekirdek kararlarının kaydıdır;
önce devir notunda ve commit mesajlarında duruyordu. Kararlar özel takip deposundadır.

## Karar

1. **Transaction.** Yazma komutu tek transaction'da koşar. İşleyici dönünce `db` kapanır; sonuçlanmamış
   sorgu bırakan işleyici geri alınır ve istek 500 alır. İptal durumundaki transaction'ın yazısı kalmaz.
2. **Okuma.** Her GET salt okunur, tek görüntülü transaction'da koşar; yazma denemesi veritabanında
   reddedilir. `txDisi` yalnız veritabanı yokken de cevap vermesi gereken GET içindir (bugün sağlık uçları ve
   çerezsiz istekte veritabanına gitmemesi gereken `GET /oturum`; bu uçta çerez varsa ve veritabanı
   yoksa `oturum` modülü 503 `VERITABANI_YOK`'u çekirdeğin kurucusuyla kendisi fırlatır).
   Her GET istek boyunca bir bağlantı tutar. Durum kodu yalnız GET uçlarında yazılabilir.
3. **Yakalanmamış söz reddi** sunucuyu düşürmez, günlüğe hata olarak yazılır. Yayın hazırlığında yeniden
   ele alınır (kart #44).
4. **Tipler.** `numeric` ve `date` metin, `int8` güvenli sayı döner. Ondalık metin şeması `+` işaretini,
   baştaki ve sondaki noktayı reddeder; veritabanındaki `NaN` / `Infinity` cevabı hatayla düşürür.
5. **Kısıt ihlali** istek sınırında çevrilir: 23505 -> 409 `CAKISMA` ("Aynı bilgilerle bir kayıt zaten
   var."), 23503 -> 409 `BAGIMLI_KAYIT` ("İşlem yapılamadı: bağlanmak istenen kayıt yok ya da bu kayda
   bağlı başka kayıtlar var."), 23514 -> 422 `GECERSIZ` ("Girilen değerler kabul edilmedi. Bilgileri
   kontrol edip yeniden deneyin."). 23502 çevrilmez, 500 kalır. İhlal günlüğe bilgi düzeyinde, satır
   değeri olmadan yazılır. `RAISE` ile üretilen iletiler süzülmez.
6. **Süreler ve havuz ortamdan gelir, varsayılanı yoktur:** bağlantı, sorgu (10 sn), okuma, kilit bekleme ve boşta
   transaction; havuz boyutu (`TMIV2_PG_HAVUZ`, 100 kullanıcıda 30 önerilir). Okuma transaction'ı (GET) kendi kısa
   sınırıyla açılır (`TMIV2_PG_OKUMA_SURE_MS`, sorgu sınırından büyük olamaz): kilitli tabloyu okuyan istek bağlantıyı
   tutup ilgisiz ekranları bekletmez (11.10.2026, kart #485, denetim S-05; önce havuz sabit 10'du, okuma sorgu
   sınırındaydı). Göçte sorgu süre sınırı yoktur.
7. **Doluluk ve geçici veritabanı hatası.** Havuz doluyken sıra süresi dolan istek 503 `MESGUL` alır: "Sistem şu an
   meşgul, birkaç saniye sonra tekrar deneyin." Sorgu ya da kilit bekleme süre aşımı (57014, 55P03) da 503 `MESGUL`
   alır; sunucuya ulaşılamama ve istek sırasında kopan bağlantı 503 `VERITABANI_YOK` alır: "Veritabanına ulaşılamıyor,
   birkaç saniye sonra tekrar deneyin." İkisi günlüğe uyarı olarak yazılır (11.10.2026, kart #485, denetim S-08; önce
   500 `SUNUCU` idi). Öteki her beklenmeyen hata 500 `SUNUCU` kalır; emin olunamayan durum 500 sayılır (sağlam
   bağlantıda sürücünün attığı hata dahil). Doluluk günlüğe dakikada en çok bir uyarıyla yazılır.
8. **Sağlık.** Veritabanı durumu yalnız herkese açık `/saglik`'tan gelir (yokken 503 ve gövdede durum).
   Yoklama 2 saniyede "ulaşılamadı" sayılır. `/saglik/ayrinti` `saglik.ayrinti-oku` işlemini ister;
   veritabanı yokken kimlik doğrulanamadığı için 503 `VERITABANI_YOK` ve "Veritabanına ulaşılamıyor,
   kimlik doğrulanamadı." döner; aynı cevap kimliği çözülemeyen çerezli her istekte geçerlidir (tek istisna
   `/saglik`, kendi gövdesini döner). Yetki testleri gerçek giriş akışıyla kurulur.
9. **Göç.** Uygulanmış göç değişmez. Uygulanmış son göçten eski damgalı yeni göç reddedilir; birleştirme
   öncesi denetim aynı kıyası ana dalın ucuna göre yapar.
10. **Oturum.** Kimlik çözücü okuma isteğinde de son görülmeyi yazar (60 saniyeden eskiyse); oturum
    zaman aşımı buna dayanır. Parola en az 8 karakterdir.
11. **İstemci.** Rota yolu biçimi dardır; modül ekranları açılışta topluca yüklenir.
12. **Lint.** Satır içi kapatma yorumu etkisizdir. İstemci `paylasilan`'dan değeri yalnız zod taşımayan
    serbest dosyalardan alır; gerisi yalnız tip. TSX'te `style` ve `fill` / `stroke` / `color` içinde hex
    yasaktır; değişken üzerinden gelen hex ve yayma ile gelen stil araçla yakalanmaz, denetçi bakar.

## Açık konular

- Ondalık metne uzunluk sınırı (#26). Çerezsiz `GET /oturum` karar 2'de, eşzamanlı göç kilidi `sunucu/cekirdek/goc.ts`'tedir.
