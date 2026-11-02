-- Yanlış girilen kalibrasyon kaydının iptali (KAL-1, kart 1813). Defter yalnız ekleme alır, kayıt değiştirilemez ve silinemez;
-- iptal ayrı bir satırdır: hangi kaydı kimin neden iptal ettiği izde kalır. İptal edilen kayıt vade ve durum hesabına girmez.
-- Yeni boş tablo; var olan hiçbir satır ya da sütun değişmez. İptal de geri alınmaz (yalnız ekleme).
CREATE TABLE kalibrasyon_kaydi_iptal (
  kayit_id int CONSTRAINT kalibrasyon_kaydi_iptal_pk PRIMARY KEY
    CONSTRAINT kalibrasyon_kaydi_iptal_kayit REFERENCES kalibrasyon_kaydi (id),
  kisi_id int NOT NULL CONSTRAINT kalibrasyon_kaydi_iptal_kisi REFERENCES kisi (id),
  neden text NOT NULL CONSTRAINT kalibrasyon_kaydi_iptal_neden_dolu CHECK (btrim(neden) <> '' AND char_length(neden) <= 300),
  olusturuldu timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER kalibrasyon_kaydi_iptal_degismez BEFORE UPDATE OR DELETE ON kalibrasyon_kaydi_iptal
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER kalibrasyon_kaydi_iptal_bosaltilmaz BEFORE TRUNCATE ON kalibrasyon_kaydi_iptal
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
