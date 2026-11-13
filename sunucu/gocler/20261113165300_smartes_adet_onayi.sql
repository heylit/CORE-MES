-- 3173 b, 3193 a (ADR 0013 eki): SmartES'ten okunan adet kendiliğinden işlenmez; fark satırı onay bekler, onaylanan üretim emrine yazılır.
-- Satır SmartES'teki değerin o ana dek kuyruğa girmiş toplamdan farkıdır; reddedilen de toplama sayılır (yeniden gelmez).
CREATE TABLE smartes_adet_onayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  smartes_id bigint NOT NULL REFERENCES smartes_is_emri_durumu,
  tur text NOT NULL CONSTRAINT smartes_adet_onayi_tur CHECK (tur IN ('saglam', 'red')),
  adet int NOT NULL CONSTRAINT smartes_adet_onayi_adet CHECK (adet <> 0),
  -- İlk satır SmartES'in ilk değeridir; sonrakiler SmartES'te sonradan yapılan düzeltmedir.
  duzeltme boolean NOT NULL,
  olusma timestamptz NOT NULL,
  durum text NOT NULL DEFAULT 'bekliyor' CONSTRAINT smartes_adet_onayi_durum CHECK (durum IN ('bekliyor', 'onaylandi', 'reddedildi')),
  karar_veren_kisi_id int REFERENCES kisi,
  karar_zamani timestamptz,
  red_nedeni text CONSTRAINT smartes_adet_onayi_red_nedeni CHECK (red_nedeni IS NULL OR (btrim(red_nedeni) <> '' AND length(red_nedeni) <= 500)),
  CONSTRAINT smartes_adet_onayi_karar_butun CHECK ((durum = 'bekliyor') = (karar_veren_kisi_id IS NULL) AND (karar_veren_kisi_id IS NULL) = (karar_zamani IS NULL)),
  CONSTRAINT smartes_adet_onayi_red_nedenli CHECK ((durum = 'reddedildi') = (red_nedeni IS NOT NULL))
);
CREATE INDEX smartes_adet_onayi_satir ON smartes_adet_onayi (smartes_id, id);
CREATE INDEX smartes_adet_onayi_bekleyen ON smartes_adet_onayi (id) WHERE durum = 'bekliyor';
