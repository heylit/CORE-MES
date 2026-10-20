-- Malzeme birim maliyeti, istasyon ve kişi saatlik maliyeti finanstadır (kart #1187). Anahtarlar sahibi modüllerin kimliğidir; yabancı anahtarlar ayrı göçle gelir.
-- Tablolar boş başlar: satır yoksa maliyet bilinmiyordur (null), sıfır değildir. Zaman damgası ve giren kişi her yazmada güncellenir.
CREATE TABLE finans_malzeme_maliyet (
  malzeme_no int PRIMARY KEY,
  birim_maliyet numeric(18,4) NOT NULL CONSTRAINT finans_malzeme_maliyet_tutar CHECK (birim_maliyet >= 0),
  para_birimi char(3) NOT NULL DEFAULT 'TRY' CONSTRAINT finans_malzeme_maliyet_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int NOT NULL REFERENCES kisi (id),
  surum int NOT NULL DEFAULT 1 CONSTRAINT finans_malzeme_maliyet_surum CHECK (surum >= 1)
);

CREATE TABLE finans_istasyon_maliyet (
  istasyon_id int PRIMARY KEY,
  saat_maliyeti numeric(18,4) NOT NULL CONSTRAINT finans_istasyon_maliyet_tutar CHECK (saat_maliyeti >= 0),
  para_birimi char(3) NOT NULL DEFAULT 'TRY' CONSTRAINT finans_istasyon_maliyet_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int NOT NULL REFERENCES kisi (id),
  surum int NOT NULL DEFAULT 1 CONSTRAINT finans_istasyon_maliyet_surum CHECK (surum >= 1)
);

CREATE TABLE finans_kisi_maliyet (
  kisi_id int PRIMARY KEY,
  saat_maliyeti numeric(18,4) NOT NULL CONSTRAINT finans_kisi_maliyet_tutar CHECK (saat_maliyeti >= 0),
  para_birimi char(3) NOT NULL DEFAULT 'TRY' CONSTRAINT finans_kisi_maliyet_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int NOT NULL REFERENCES kisi (id),
  surum int NOT NULL DEFAULT 1 CONSTRAINT finans_kisi_maliyet_surum CHECK (surum >= 1)
);
