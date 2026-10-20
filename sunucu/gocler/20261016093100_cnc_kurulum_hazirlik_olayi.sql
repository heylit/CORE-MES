-- CNC hazırlık adımlarının onay defteri (plan belgeler/cnc/cnc-kurulum-plan.md, B; kullanıcı kararı 16.10.2026). Prototip
-- hazırlık onayını kendi durumunda (prep.done, prep.fin) tutar ama kimin ne zaman onayladığını tutmaz; sunucu her yazmada
-- önceki ve yeni durumu karşılaştırıp onay, geri alma ve tamamlanmayı buraya ekler. Yalnız eklenir, güncellenmez.
-- Kişi ve emir sütunları cnc_kurulum_kayit gibi Aşama 2'de yabancı anahtarla bağlanır.
CREATE TABLE cnc_kurulum_hazirlik_olayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  adim text NOT NULL,
  olay text NOT NULL,
  -- Prototipin adım imzası: onaylanan seçim değişince imza değişir, onay düşer.
  imza text,
  -- Onay anında kurulumda seçili üretim emri (yoksa null).
  emir_id int,
  kisi_id int NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cnc_kurulum_hazirlik_olayi_olay CHECK (olay IN ('onay', 'geri', 'tamam')),
  CONSTRAINT cnc_kurulum_hazirlik_olayi_adim CHECK (length(adim) BETWEEN 1 AND 80),
  CONSTRAINT cnc_kurulum_hazirlik_olayi_imza CHECK (imza IS NULL OR length(imza) <= 2000)
);

CREATE INDEX cnc_kurulum_hazirlik_olayi_adim_idx ON cnc_kurulum_hazirlik_olayi (adim, id);
CREATE INDEX cnc_kurulum_hazirlik_olayi_emir_idx ON cnc_kurulum_hazirlik_olayi (emir_id, id) WHERE emir_id IS NOT NULL;
