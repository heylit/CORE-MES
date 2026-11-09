-- 2466 (2461-2 a, 2466-2 a): tedarikçinin kategori başına Kalite kararı. Anahtar firma ve Malzemeler ağacındaki (tür, kod); kararı
-- olmayan kategori satırsızdır ("Kalite kararı yok"). Karar silinmez, değiştirilir; her karar yalnız eklenen geçmişe de yazılır.
CREATE TABLE kalite_merkezi_kategori_onayi (
  firma_id int NOT NULL CONSTRAINT kalite_merkezi_kategori_onayi_firma REFERENCES musteri_tedarikci_firma (id),
  kategori_turu text NOT NULL CONSTRAINT kalite_merkezi_kategori_onayi_tur CHECK (kategori_turu IN ('hammadde', 'sarf', 'demirbas', 'hizmet')),
  kategori_kodu text NOT NULL CONSTRAINT kalite_merkezi_kategori_onayi_kod CHECK (btrim(kategori_kodu) = kategori_kodu AND kategori_kodu <> '' AND length(kategori_kodu) <= 40),
  durum text NOT NULL CONSTRAINT kalite_merkezi_kategori_onayi_durum CHECK (durum IN ('onayli', 'sartli', 'onaysiz')),
  aciklama text CONSTRAINT kalite_merkezi_kategori_onayi_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 500)),
  kisi_id int NOT NULL CONSTRAINT kalite_merkezi_kategori_onayi_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT clock_timestamp(),
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT kalite_merkezi_kategori_onayi_sart CHECK (durum <> 'sartli' OR aciklama IS NOT NULL),
  PRIMARY KEY (firma_id, kategori_turu, kategori_kodu)
);

CREATE TABLE kalite_merkezi_kategori_onayi_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firma_id int NOT NULL CONSTRAINT kalite_merkezi_kategori_onayi_gecmisi_firma REFERENCES musteri_tedarikci_firma (id),
  kategori_turu text NOT NULL,
  kategori_kodu text NOT NULL,
  onceki_durum text,
  durum text NOT NULL,
  aciklama text,
  kisi_id int NOT NULL CONSTRAINT kalite_merkezi_kategori_onayi_gecmisi_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX kalite_merkezi_kategori_onayi_gecmisi_kayit ON kalite_merkezi_kategori_onayi_gecmisi (firma_id, kategori_turu, kategori_kodu, id);

CREATE TRIGGER kalite_merkezi_kategori_onayi_gecmisi_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_kategori_onayi_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
