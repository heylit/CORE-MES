-- Tezgâh deneme sayfası (kart 3811): alarm olayları. MTConnect'te Fault hâlindeki koşullar ve tetiklenmiş acil stop,
-- Heidenhain'de hata iletileri; uyarılar (Warning) yazılmaz. Başlangıç, bitiş ve metin 90 gün tutulur (okuma turunun
-- temizliği siler); o anki iş emri okurken makine kullanımından bulunur. Yeni boş tablo; başka tabloya dokunmaz.
CREATE TABLE tezgah_alarm_olayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cihaz_adi text NOT NULL CONSTRAINT tezgah_alarm_olayi_cihaz_adi CHECK (btrim(cihaz_adi) <> '' AND length(cihaz_adi) <= 100),
  -- Olayı açan öğe (koşul ya da acil stop kimliği); aynı öğede aynı anda tek açık olay vardır.
  oge text NOT NULL CONSTRAINT tezgah_alarm_olayi_oge CHECK (btrim(oge) <> '' AND length(oge) <= 200),
  kod text CONSTRAINT tezgah_alarm_olayi_kod CHECK (length(kod) <= 100),
  metin text NOT NULL CONSTRAINT tezgah_alarm_olayi_metin CHECK (length(metin) <= 1000),
  baslangic timestamptz NOT NULL,
  bitis timestamptz CONSTRAINT tezgah_alarm_olayi_sira CHECK (bitis IS NULL OR bitis >= baslangic)
);
CREATE UNIQUE INDEX tezgah_alarm_olayi_acik ON tezgah_alarm_olayi (cihaz_adi, oge) WHERE bitis IS NULL;
CREATE INDEX tezgah_alarm_olayi_zaman ON tezgah_alarm_olayi (cihaz_adi, baslangic);
