-- 3244 b: kalem üretim çeşidine göre partilere ayrılır (örnek 10 FAI + 90 seri); proje ve üretim emri partiden açılır.
-- Yeni boş tablo, yalnız ekler. Partisiz eski kalem okumada tek seri parti sayılır; eski satır yazılmaz.
-- Taslak düzenlemede kalemler silinip yeniden yazıldığı için parti kalemle gider (CASCADE); emre bağlı partiyi emrin yabancı anahtarı korur.
-- Tür listesi paylasilan/sozlesme/emir-turleri.ts ve uretim_emri_emir_turu ile aynıdır.
CREATE TABLE siparisler_siparis_satiri_parti (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  satir_id int NOT NULL CONSTRAINT siparisler_parti_satir REFERENCES siparisler_siparis_satiri (id) ON DELETE CASCADE,
  sira smallint NOT NULL CONSTRAINT siparisler_parti_sira CHECK (sira BETWEEN 1 AND 20),
  emir_turu text NOT NULL CONSTRAINT siparisler_parti_emir_turu
    CHECK (emir_turu IN ('seri', 'fai', 'numune', 'prototip', 'stok', 'rework', 'bakim_deneme', 'fason')),
  adet numeric(14,3) NOT NULL CONSTRAINT siparisler_parti_adet CHECK (adet > 0),
  CONSTRAINT siparisler_parti_sira_tek UNIQUE (satir_id, sira),
  CONSTRAINT siparisler_parti_tur_tek UNIQUE (satir_id, emir_turu)
);

-- Partiler de plana iş getirir: kalem gibi değişiklik defterine düşer (20261103090800 ile aynı tetik).
CREATE TRIGGER siparisler_siparis_satiri_parti_degisiklik AFTER INSERT OR UPDATE OR DELETE ON siparisler_siparis_satiri_parti
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id');
