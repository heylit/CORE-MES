-- 3077 a: Logo kopyası yalnız geçiş içindir; tam tur saatte bir kendiliğinden başlamaz, yalnız "Şimdi oku" isteğiyle baştan okunur.
-- İstek imleçte işarettir: yeni tur başlayınca kalkar; tur sürerken gelen istek bu tur bitince bir tur daha okutur. Saat karşılaştırması
-- yok (sunucu saati ile iş turu saati ayrışabilir). Varsayılanlı yeni sütun; veri silmez, dönüştürmez.
ALTER TABLE logo_okuma_imleci ADD COLUMN tur_istendi boolean NOT NULL DEFAULT false;
