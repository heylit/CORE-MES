-- Refakat partisi (kart #123, kullanıcı kararları 22.10: Soru 120 b, 122 a): depo bir lotu bir emre ayırınca doğar ve kartı
-- basılır; teslim kartla yapılır. Parti emir + gelen lottur: aynı emre aynı lotun kalanı aynı partiyle, başka lot yeni partiyle gider.
-- Yeni tablodur; var olan tablolar değişmez.
CREATE TABLE stok_refakat_partisi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  uretim_emri_id int NOT NULL, -- Aşama 2: yabancı anahtar ayrı göçle (STK6 b)
  -- Emrin kaçıncı partisi; kart etiketinde emir no ile okunur (UE-000120-P2).
  sira int NOT NULL CONSTRAINT stok_refakat_partisi_sira_pozitif CHECK (sira > 0),
  malzeme_id integer NOT NULL,
  -- Kaynak, depodan verilen hammadde lotudur.
  parti_id bigint NOT NULL,
  durum text NOT NULL DEFAULT 'acik' CONSTRAINT stok_refakat_partisi_durum_degeri CHECK (durum IN ('acik', 'iptal')),
  acan_kisi_id int NOT NULL REFERENCES kisi,
  kayit_zamani timestamptz NOT NULL DEFAULT now(),
  iptal_eden_kisi_id int REFERENCES kisi,
  iptal_zamani timestamptz,
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT stok_refakat_partisi_lot_malzemesi FOREIGN KEY (parti_id, malzeme_id) REFERENCES stok_parti (id, malzeme_id),
  CONSTRAINT stok_refakat_partisi_sira_tek UNIQUE (uretim_emri_id, sira),
  CONSTRAINT stok_refakat_partisi_iptal_tutarli CHECK ((durum = 'iptal') = (iptal_eden_kisi_id IS NOT NULL AND iptal_zamani IS NOT NULL))
);
-- Bir emre bir lot için tek açık parti; iptal edilenin yerine yenisi açılabilir.
CREATE UNIQUE INDEX stok_refakat_partisi_tek ON stok_refakat_partisi (uretim_emri_id, parti_id) WHERE durum = 'acik';
CREATE INDEX stok_refakat_partisi_parti_idx ON stok_refakat_partisi (parti_id);
