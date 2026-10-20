-- Logo giden kutusu (kart #207): Logo'ya gidecek her belgenin gönderim denemesi ve çift gönderim kalkanının kalıcı niyeti.
-- Belgenin asıl durumu sahibi modüldedir (malzeme: malzeme_katalog_karti.logo_*); bu tablo yalnız bağlantının izidir (ADR 0010 karar 8).
CREATE TABLE logo_giden (
  belge_turu text NOT NULL CONSTRAINT logo_giden_belge_turu CHECK (belge_turu IN ('malzeme', 'hizmet')),
  -- Belgenin sahibi modüldeki sayı kimliği (malzeme: malzeme_katalog_karti.no). Belge türü çok olacağı için yabancı anahtar yok;
  -- malzeme kartı silinmez (tetikleyici).
  belge_no int NOT NULL CONSTRAINT logo_giden_belge_no CHECK (belge_no > 0),
  -- Dolu iken bu belge için Logo'da kayıt açılmış olabilir: açma isteğinden önce kalıcı yazılır, sonucu kesinleşince boşalır.
  niyet_zamani timestamptz,
  deneme_sayisi int NOT NULL DEFAULT 0 CONSTRAINT logo_giden_deneme_sayisi CHECK (deneme_sayisi >= 0),
  ardisik_hata int NOT NULL DEFAULT 0 CONSTRAINT logo_giden_ardisik_hata CHECK (ardisik_hata >= 0),
  son_deneme timestamptz,
  son_sonuc text CONSTRAINT logo_giden_son_sonuc CHECK (son_sonuc IN ('gonderildi', 'zaten-vardi', 'reddedildi', 'yetkisiz', 'ulasilamadi', 'belirsiz', 'yazilamadi')),
  son_hata text CONSTRAINT logo_giden_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  sonraki_deneme timestamptz,
  logo_kayit_no text CONSTRAINT logo_giden_logo_kayit_no CHECK (logo_kayit_no IS NULL OR (btrim(logo_kayit_no) <> '' AND length(logo_kayit_no) <= 64)),
  olusma timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (belge_turu, belge_no),
  -- Sonuç ve zamanı birlikte; kayıt numarası yalnız başarılı sonuçta, hata metni yalnız başarısız sonuçta.
  CONSTRAINT logo_giden_butun CHECK (
    (son_sonuc IS NULL) = (son_deneme IS NULL)
    AND (logo_kayit_no IS NOT NULL) = (son_sonuc IS NOT DISTINCT FROM 'gonderildi' OR son_sonuc IS NOT DISTINCT FROM 'zaten-vardi')
    AND (son_hata IS NOT NULL) = (son_sonuc IS NOT NULL AND son_sonuc NOT IN ('gonderildi', 'zaten-vardi'))
    AND (son_sonuc NOT IN ('gonderildi', 'zaten-vardi') OR son_sonuc IS NULL OR niyet_zamani IS NULL)
  )
);
