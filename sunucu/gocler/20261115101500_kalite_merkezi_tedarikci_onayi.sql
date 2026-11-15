-- 3279-2 a: tedarikçinin şirket dışı onayları (müşteri onayı, adıyla diğer onay). Şirket onayı kalite_merkezi_kategori_onayi'nda kalır
-- (iki çelişen şirket kararı oluşmaz). Onay silinmez: onaysız yapılır ya da süresi biter; her yazma yalnız eklenen geçmişe de düşer.
CREATE TABLE kalite_merkezi_tedarikci_onayi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  firma_id int NOT NULL CONSTRAINT kalite_merkezi_tedarikci_onayi_firma REFERENCES musteri_tedarikci_firma (id),
  tur text NOT NULL CONSTRAINT kalite_merkezi_tedarikci_onayi_tur CHECK (tur IN ('musteri', 'diger')),
  musteri_firma_id int CONSTRAINT kalite_merkezi_tedarikci_onayi_musteri REFERENCES musteri_tedarikci_firma (id),
  ad text CONSTRAINT kalite_merkezi_tedarikci_onayi_ad CHECK (ad IS NULL OR (btrim(ad) = ad AND ad <> '' AND length(ad) <= 120)),
  kapsam_tumu boolean NOT NULL DEFAULT false,
  durum text NOT NULL CONSTRAINT kalite_merkezi_tedarikci_onayi_durum CHECK (durum IN ('onayli', 'sartli', 'onaysiz')),
  aciklama text CONSTRAINT kalite_merkezi_tedarikci_onayi_aciklama CHECK (aciklama IS NULL OR (btrim(aciklama) <> '' AND length(aciklama) <= 500)),
  bitis date,
  belge_kimligi text CONSTRAINT kalite_merkezi_tedarikci_onayi_belge CHECK (belge_kimligi IS NULL OR belge_kimligi ~ '^[A-Za-z0-9_.:@+~|-]{1,200}$'),
  kisi_id int NOT NULL CONSTRAINT kalite_merkezi_tedarikci_onayi_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT clock_timestamp(),
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT kalite_merkezi_tedarikci_onayi_musteri_turu CHECK ((tur = 'musteri') = (musteri_firma_id IS NOT NULL)),
  CONSTRAINT kalite_merkezi_tedarikci_onayi_diger_adi CHECK (tur <> 'diger' OR ad IS NOT NULL),
  CONSTRAINT kalite_merkezi_tedarikci_onayi_kendisi CHECK (musteri_firma_id IS NULL OR musteri_firma_id <> firma_id),
  CONSTRAINT kalite_merkezi_tedarikci_onayi_sart CHECK (durum <> 'sartli' OR aciklama IS NOT NULL)
);
CREATE INDEX kalite_merkezi_tedarikci_onayi_firmasi ON kalite_merkezi_tedarikci_onayi (firma_id, id);

-- Kapsam: kapsam_tumu değilse en az bir kategori (servis denetler); kategori Malzemeler ağacındaki (tür, kod).
CREATE TABLE kalite_merkezi_tedarikci_onayi_kapsami (
  onay_id int NOT NULL CONSTRAINT kalite_merkezi_tedarikci_onayi_kapsami_onay REFERENCES kalite_merkezi_tedarikci_onayi (id),
  kategori_turu text NOT NULL CONSTRAINT kalite_merkezi_tedarikci_onayi_kapsami_tur CHECK (kategori_turu IN ('hammadde', 'sarf', 'demirbas', 'hizmet')),
  kategori_kodu text NOT NULL CONSTRAINT kalite_merkezi_tedarikci_onayi_kapsami_kod CHECK (btrim(kategori_kodu) = kategori_kodu AND kategori_kodu <> '' AND length(kategori_kodu) <= 40),
  PRIMARY KEY (onay_id, kategori_turu, kategori_kodu)
);

CREATE TABLE kalite_merkezi_tedarikci_onayi_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  onay_id int NOT NULL CONSTRAINT kalite_merkezi_tedarikci_onayi_gecmisi_onay REFERENCES kalite_merkezi_tedarikci_onayi (id),
  onceki_durum text,
  durum text NOT NULL,
  aciklama text,
  bitis date,
  kapsam_tumu boolean NOT NULL,
  kapsam text[] NOT NULL,
  kisi_id int NOT NULL CONSTRAINT kalite_merkezi_tedarikci_onayi_gecmisi_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX kalite_merkezi_tedarikci_onayi_gecmisi_kayit ON kalite_merkezi_tedarikci_onayi_gecmisi (onay_id, id);

CREATE TRIGGER kalite_merkezi_tedarikci_onayi_gecmisi_degismez BEFORE UPDATE OR DELETE ON kalite_merkezi_tedarikci_onayi_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
