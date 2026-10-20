-- Tek aktif iş kilidi istasyondan makineye taşınır (kart #1143): makinede aynı anda tek açık kullanım. Makinesiz iş
-- istasyonun makinesiz yerini tutar (eski kural); aynı işe birden çok kişinin girmesi kilit değil katılımdır.
-- Açık satır, işin orada şu an çalıştığını söyler; duraklatma, durdurma ve bitirme satırı kapatır.
DO $$
DECLARE
  kilitleyen bigint;
  makineli bigint;
  makinesiz bigint;
BEGIN
  SELECT count(*) INTO kilitleyen FROM uretim_emri WHERE durum = 'basladi' AND calisma <> 'durakli';
  SELECT count(*) INTO makineli FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id
   WHERE e.durum = 'basladi' AND e.calisma = 'calisiyor' AND i.durum = 'calisiyor' AND i.makine_id IS NOT NULL;
  SELECT count(*) INTO makinesiz FROM uretim_emri e
   WHERE e.durum = 'basladi' AND e.calisma = 'calisiyor' AND e.istasyon_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id AND i.durum = 'calisiyor' AND i.makine_id IS NOT NULL);
  RAISE NOTICE 'istasyon kilidini tutan emir: %; açık makine kullanımı yazılacak: %; açık istasyon yeri yazılacak: %', kilitleyen, makineli, makinesiz;
END $$;

CREATE TABLE uretim_emirleri_makine_kullanimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emir_id int NOT NULL REFERENCES uretim_emri,
  is_emri_id int REFERENCES uretim_emirleri_is_emri,
  istasyon_id int NOT NULL REFERENCES istasyon,
  -- Boş: makinesiz iş istasyon yerini tutar.
  makine_id int REFERENCES makine,
  kisi_id int NOT NULL REFERENCES kisi,
  baslama timestamptz NOT NULL,
  bitis timestamptz,
  kapatan_id int REFERENCES kisi,
  CONSTRAINT uretim_emirleri_makine_kullanimi_kapanis CHECK ((bitis IS NULL) = (kapatan_id IS NULL)),
  CONSTRAINT uretim_emirleri_makine_kullanimi_sira CHECK (bitis IS NULL OR bitis >= baslama)
);
CREATE UNIQUE INDEX uretim_emirleri_makine_kullanimi_makinede_tek ON uretim_emirleri_makine_kullanimi (makine_id) WHERE bitis IS NULL;
CREATE UNIQUE INDEX uretim_emirleri_makine_kullanimi_istasyonda_tek ON uretim_emirleri_makine_kullanimi (istasyon_id)
  WHERE bitis IS NULL AND makine_id IS NULL;
CREATE INDEX uretim_emirleri_makine_kullanimi_emir_idx ON uretim_emirleri_makine_kullanimi (emir_id, id);
CREATE INDEX uretim_emirleri_makine_kullanimi_makine_idx ON uretim_emirleri_makine_kullanimi (makine_id, baslama);

-- Şu an çalışan işler açık kullanımla başlar; başlatan son başlatma kaydının kişisidir. Aynı yerde iki çalışan iş varsa
-- tekil dizin göçü durdurur, hiçbir şey değişmez.
INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama)
SELECT e.id, i.id, COALESCE(i.istasyon_id, e.istasyon_id), i.makine_id,
       COALESCE((SELECT k.kisi_id FROM uretim_kaydi k WHERE k.emir_id = e.id AND k.olay = 'baslat' ORDER BY k.id DESC LIMIT 1), e.acan_id),
       COALESCE(i.baslama, e.baslama)
  FROM uretim_emri e JOIN uretim_emirleri_is_emri i ON i.uretim_emri_id = e.id
 WHERE e.durum = 'basladi' AND e.calisma = 'calisiyor' AND i.durum = 'calisiyor' AND i.makine_id IS NOT NULL
   AND COALESCE(i.istasyon_id, e.istasyon_id) IS NOT NULL;

INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, kisi_id, baslama)
SELECT e.id, (SELECT i.id FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id AND i.durum = 'calisiyor' LIMIT 1), e.istasyon_id,
       COALESCE((SELECT k.kisi_id FROM uretim_kaydi k WHERE k.emir_id = e.id AND k.olay = 'baslat' ORDER BY k.id DESC LIMIT 1), e.acan_id),
       e.baslama
  FROM uretim_emri e
 WHERE e.durum = 'basladi' AND e.calisma = 'calisiyor' AND e.istasyon_id IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM uretim_emirleri_is_emri i WHERE i.uretim_emri_id = e.id AND i.durum = 'calisiyor' AND i.makine_id IS NOT NULL);

DROP INDEX uretim_emri_istasyonda_tek_kilitleyen;
