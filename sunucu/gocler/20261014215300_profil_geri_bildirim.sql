-- Şikayet, istek ve öneri kutusu: her çalışan üst çubuktan yazar, profilinde kendi geçmişini görür. Gönderilen kayıt
-- değişmez (yalnız ekleme): yazanın sözü sonradan düzeltilmez, okuyan da değiştiremez.
CREATE TABLE profil_geri_bildirim (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kisi_id int NOT NULL CONSTRAINT profil_geri_bildirim_kisi_fk REFERENCES kisi,
  konu text NOT NULL CONSTRAINT profil_geri_bildirim_konu_gecerli CHECK (konu IN ('sirket', 'uygulama')),
  tur text NOT NULL CONSTRAINT profil_geri_bildirim_tur_gecerli CHECK (tur IN ('sikayet', 'istek', 'oneri')),
  metin text NOT NULL CONSTRAINT profil_geri_bildirim_metin_gecerli CHECK (length(btrim(metin)) BETWEEN 3 AND 2000),
  gonderildi timestamptz NOT NULL DEFAULT now()
);
-- Kişinin geçmişi ve okuyanın listesi en yeniden eskiye.
CREATE INDEX profil_geri_bildirim_kisi_zaman ON profil_geri_bildirim (kisi_id, gonderildi DESC, id DESC);
CREATE INDEX profil_geri_bildirim_zaman ON profil_geri_bildirim (gonderildi DESC, id DESC);

CREATE TRIGGER profil_geri_bildirim_degismez BEFORE UPDATE OR DELETE ON profil_geri_bildirim
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER profil_geri_bildirim_bosaltilmaz BEFORE TRUNCATE ON profil_geri_bildirim
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
