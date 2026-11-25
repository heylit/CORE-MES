-- Logo irsaliye giden kutusu (kart 3694; 3665 mal kabul ve 3684 sevk için TEK tablo). Yazma ayarları kapalı gelir ve ölçüm kapısı açılmadan
-- açılmaz; tablo yalnız niyetin kalıcı yazıldığı yerdir: Logo'ya gidecek her irsaliyenin niyeti önce buraya yazılır, köprü çağrısı işlem dışıdır.
-- belge_no: mal kabulde kabul kaydı, sevkte sevk kaydı kimliği (kaynak modülün kimliği; bu tablo yabancı anahtar taşımaz, Aşama 2'de ayrı göç).
-- numara: Logo'ya yazılan irsaliye numarası; kural değişirse açılmış irsaliyenin numarası kaybolmasın (malzeme fişi 2948 ile aynı kalıp).
-- Yeni tablo, veri yok: geri alması DROP TABLE.
CREATE TABLE logo_irsaliye_giden (
  belge_turu text NOT NULL CONSTRAINT logo_irsaliye_giden_belge_turu CHECK (belge_turu IN ('satin-alma-irsaliyesi', 'satis-irsaliyesi', 'konsinye-irsaliyesi')),
  belge_no int NOT NULL CONSTRAINT logo_irsaliye_giden_belge_no CHECK (belge_no > 0),
  numara text CONSTRAINT logo_irsaliye_giden_numara CHECK (numara IS NULL OR (numara = btrim(numara) AND length(numara) BETWEEN 1 AND 16)),
  niyet_zamani timestamptz,
  deneme_sayisi int NOT NULL DEFAULT 0 CONSTRAINT logo_irsaliye_giden_deneme_sayisi CHECK (deneme_sayisi >= 0),
  ardisik_hata int NOT NULL DEFAULT 0 CONSTRAINT logo_irsaliye_giden_ardisik_hata CHECK (ardisik_hata >= 0),
  son_deneme timestamptz,
  son_sonuc text CONSTRAINT logo_irsaliye_giden_son_sonuc CHECK (son_sonuc IN ('gonderildi', 'zaten-vardi', 'reddedildi', 'yetkisiz', 'ulasilamadi', 'belirsiz', 'yazilamadi')),
  son_hata text CONSTRAINT logo_irsaliye_giden_son_hata CHECK (son_hata IS NULL OR (btrim(son_hata) <> '' AND length(son_hata) <= 2000)),
  sonraki_deneme timestamptz,
  logo_kayit_no text CONSTRAINT logo_irsaliye_giden_logo_kayit_no CHECK (logo_kayit_no IS NULL OR (btrim(logo_kayit_no) <> '' AND length(logo_kayit_no) <= 64)),
  olusma timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (belge_turu, belge_no),
  CONSTRAINT logo_irsaliye_giden_butun CHECK (
    (son_sonuc IS NULL) = (son_deneme IS NULL)
    AND (logo_kayit_no IS NOT NULL) = (son_sonuc IS NOT DISTINCT FROM 'gonderildi' OR son_sonuc IS NOT DISTINCT FROM 'zaten-vardi')
    AND (son_hata IS NOT NULL) = (son_sonuc IS NOT NULL AND son_sonuc NOT IN ('gonderildi', 'zaten-vardi'))
    AND (son_sonuc NOT IN ('gonderildi', 'zaten-vardi') OR son_sonuc IS NULL OR niyet_zamani IS NULL)
  )
);
