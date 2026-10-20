-- Kod değişince eski kod burada kalır: başka modüllerin eski kayıtlarındaki kod bugünkü kayda çözülebilsin (AG2-2).
-- Geçmiş bu göçten başlar; önceki kod değişiklikleri bilinmiyor. Silinen kaydın geçmişi de silinir.
DO $$ DECLARE merkez bigint; istasyon_sayisi bigint; makine_sayisi bigint; BEGIN
  SELECT count(*) INTO merkez FROM is_merkezi;
  SELECT count(*) INTO istasyon_sayisi FROM istasyon;
  SELECT count(*) INTO makine_sayisi FROM makine;
  RAISE NOTICE 'iş merkezi: %, istasyon: %, makine: % satır; hiçbiri değişmez, geçmiş boş başlar', merkez, istasyon_sayisi, makine_sayisi;
END $$;

CREATE TABLE istasyonlar_kod_gecmisi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_merkezi_id int REFERENCES is_merkezi ON DELETE CASCADE,
  istasyon_id int REFERENCES istasyon ON DELETE CASCADE,
  makine_id int REFERENCES makine ON DELETE CASCADE,
  kod text NOT NULL,
  birakildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT istasyonlar_kod_gecmisi_tek_duzey CHECK (num_nonnulls(is_merkezi_id, istasyon_id, makine_id) = 1)
);
