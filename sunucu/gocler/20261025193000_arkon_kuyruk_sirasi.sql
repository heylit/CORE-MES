-- Üretim Hazırlık'ın istasyon kuyruğu sırası (kart 527, 519 1 c, 522 1 a): operatör bu sırayı izler, canlı plan referans kalır. Satırı olmayan
-- iş plan sırasıyla kuyruğun sonunda durur; satır, işin bugünkü istasyonu değilse sayılmaz (plan işi başka istasyona aldı).
CREATE TABLE arkon_kuyruk_sirasi (
  -- Yabancı anahtar BİLİNÇLİ YOK: iş emri satırına anahtar, sıralama işlemine KEY SHARE kilidi verir; TMI komutlarının FOR UPDATE'iyle çakışır
  -- (arkon_tmi_yansima ile aynı gerekçe). Kapanan iş emrinin satırı istasyon yeniden sıralanınca silinir.
  is_emri_id int NOT NULL,
  -- Bölünmüş işin parçası (1'den); bölünmemiş iş 0.
  parca_no int NOT NULL DEFAULT 0 CONSTRAINT arkon_kuyruk_sirasi_parca_eksi_degil CHECK (parca_no >= 0),
  istasyon_id int NOT NULL REFERENCES istasyon (id),
  sira int NOT NULL CONSTRAINT arkon_kuyruk_sirasi_sira_pozitif CHECK (sira > 0),
  -- Yazım sürümü (milisaniye): ekranın gördüğü sıra bununla değil sıranın kendisiyle karşılaştırılır; satırın ne zaman yazıldığını söyler.
  surum bigint NOT NULL,
  kisi_id int NOT NULL REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (is_emri_id, parca_no),
  -- Yazım istasyonun bütün satırlarını yeniden numaralar; ara adımda aynı sıra iki satırda olabilir.
  CONSTRAINT arkon_kuyruk_sirasi_istasyon_sira_tekil UNIQUE (istasyon_id, sira) DEFERRABLE INITIALLY DEFERRED
);
