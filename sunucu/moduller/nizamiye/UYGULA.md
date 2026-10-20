# UYGULA: nizamiye

1. Sunucuyu kapat, `git pull`, `npm.cmd install`, `npm.cmd run yedek`, `npm.cmd run goc`, sunucuyu başlat.
2. Rol satırları Çekirdek göçüyle gelene kadar ekran yalnız yöneticide görünür: Yönetim > Güvenlik ve Karşılama.
3. Kart rafı > Kart ekle ile birkaç ziyaretçi kartı aç (örnek: Z-001).
4. Kapı > Habersiz ziyaretçi: ad yaz, neden ve ev sahibi seç, kimliği EVET yap, "İçeri al".
5. Kartı arama kutusuna yazıp Enter: çıkış paneli açılır; "Çıkar". Hemen ardından şeritteki "Geri al" son işlemi geri alır.
6. Acil durum listesi > Yazdır: A4 çıktı.
7. Herhangi bir çalışanla: üst çubukta "Ziyaretçi" > "Ziyaretçi bekliyorum", ad, neden, gün ve saat, "Kaydet". Kapıda Bekleniyor listesinde görünür.
8. Kişilere sicil no gir. İK kullanıcısıyla üst çubukta "PDKS": `Sicil;Tarih;Saat;Yon` başlıklı, satırları `S-001;19.10.2026;08:00;G` biçiminde bir deneme dosyası seç. İçerideki personel listede görünür.
9. Kart okuyucu (289 b, ADR 0016; marka gelene kadar deneme biçimi): `.env`'e `TMIV2_PDKS_CIHAZ_AGI=<cihaz ağı, örnek 10.0.7.0/24>` yaz, sunucuyu yeniden başlat. Kart okuyucu kaydı şimdilik yalnız API ile: `POST /api/nizamiye/pdks/cihazlar` `{ "ad": "Ana kapı", "ip": "10.0.7.21" }`, dönen anahtarı cihaza gir. Sistem Ayarları'nda "Kart okuyucudan PDKS kaydı"nı aç. Cihaz `POST https://<sunucu>/api/nizamiye/pdks/cihaz-hareketi` `{ "anahtar": "...", "ham": "S-001;20.10.2026;08:00;G" }` gönderir.
