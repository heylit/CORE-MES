-- 2112 (2099-1 a): aparatın plan kapasitesi. Aparat kartı Malzemeler'de (demirbaş, kalıp), adedi ve yeri Stok'ta; burada planın
-- aynı anda kullanabileceği adet tutulur. Yeni ve boş tablo; var olan tabloya dokunulmaz.
-- Aparat kartı malzemelerin kart kimliğidir ve yabancı anahtarsız düz sayıdır: malzemeler istasyonları okur, ters yön açılmaz (ADR 0006).
-- İstasyon boşsa aparat istasyonlar arasında ortaktır; bir kart bir istasyonda (ya da ortakta) tek satırdır.
CREATE TABLE istasyonlar_aparat_kapasitesi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT istasyonlar_aparat_kapasitesi_pk PRIMARY KEY,
  aparat_karti_id int NOT NULL CONSTRAINT istasyonlar_aparat_kapasitesi_kart CHECK (aparat_karti_id > 0),
  -- Kapasite istasyonun parçasıdır: kullanılmayan istasyon silinince satırı da gider.
  istasyon_id int CONSTRAINT istasyonlar_aparat_kapasitesi_istasyon_fk REFERENCES istasyon ON DELETE CASCADE,
  adet int NOT NULL CONSTRAINT istasyonlar_aparat_kapasitesi_adet CHECK (adet BETWEEN 1 AND 10000),
  degistiren_kisi_id int NOT NULL CONSTRAINT istasyonlar_aparat_kapasitesi_degistiren_fk REFERENCES kisi,
  degisme timestamptz NOT NULL DEFAULT now(),
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT istasyonlar_aparat_kapasitesi_tek UNIQUE NULLS NOT DISTINCT (aparat_karti_id, istasyon_id)
);
-- İstasyon silinirken yabancı anahtar denetimi alt tabloyu taramasın (818 B4).
CREATE INDEX istasyonlar_aparat_kapasitesi_istasyon_fk_idx ON istasyonlar_aparat_kapasitesi (istasyon_id) WHERE istasyon_id IS NOT NULL;

-- 1968 a: planın kapasite girdileri değişiklik defterine düşer; değiştiren kişi ve zaman satırdadır, defter kişiyi oturumdan alır.
CREATE TRIGGER istasyonlar_aparat_kapasitesi_degisiklik AFTER INSERT OR UPDATE OR DELETE ON istasyonlar_aparat_kapasitesi
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum', 'degistiren_kisi_id', 'degisme');
