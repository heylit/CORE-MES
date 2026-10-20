-- Sevkiyat bekleme listesi (kart #1310): biten üründen, fasona gönderimden ve "malzeme alınacak" talepten gelen yük işe çevrilene kadar burada
-- durur; tarih, nokta ve yükü planlayıcı verir. Yeni boş tablo; var olan tablolar değişmez.
CREATE TABLE sevkiyat_bekleyen (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kaynak text NOT NULL CONSTRAINT sevkiyat_bekleyen_kaynak CHECK (kaynak IN ('urun', 'fason', 'alim')),
  uretim_emri_id int CONSTRAINT sevkiyat_bekleyen_uretim_emri REFERENCES uretim_emri (id),
  fason_hareket_id int CONSTRAINT sevkiyat_bekleyen_fason_hareketi REFERENCES uretim_emirleri_fason_hareketi (id),
  talep_id uuid CONSTRAINT sevkiyat_bekleyen_talep REFERENCES satin_alma_talep (id),
  -- Fasonda gidilen, alımda alınacak firma; üründe boş (müşteriyi planlayıcı seçer).
  firma_id int CONSTRAINT sevkiyat_bekleyen_firma REFERENCES musteri_tedarikci_firma (id),
  malzeme_no int,
  adet numeric(18, 4) CONSTRAINT sevkiyat_bekleyen_adet CHECK (adet > 0),
  -- Emrin teslim günü ya da talebin ihtiyaç günü; bilinmiyorsa boş.
  istenen_tarih date,
  hazir_zamani timestamptz NOT NULL DEFAULT now(),
  is_id int CONSTRAINT sevkiyat_bekleyen_is REFERENCES sevkiyat_isi (id),
  -- İşe çevrilmeden listeden çıkarılan kayıt (ör. müşteri kendisi aldı).
  kaldirildi timestamptz,
  kaldiran_kisi_id int CONSTRAINT sevkiyat_bekleyen_kaldiran REFERENCES kisi (id),
  CONSTRAINT sevkiyat_bekleyen_kaynak_alanlari CHECK (
    (kaynak = 'urun' AND uretim_emri_id IS NOT NULL AND fason_hareket_id IS NULL AND talep_id IS NULL AND firma_id IS NULL)
    OR (kaynak = 'fason' AND uretim_emri_id IS NOT NULL AND fason_hareket_id IS NOT NULL AND talep_id IS NULL AND firma_id IS NOT NULL)
    OR (kaynak = 'alim' AND talep_id IS NOT NULL AND uretim_emri_id IS NULL AND fason_hareket_id IS NULL)
  ),
  CONSTRAINT sevkiyat_bekleyen_kaldirma_butun CHECK ((kaldirildi IS NULL) = (kaldiran_kisi_id IS NULL)),
  CONSTRAINT sevkiyat_bekleyen_kapanis_tek CHECK (is_id IS NULL OR kaldirildi IS NULL),
  CONSTRAINT sevkiyat_bekleyen_is_tek UNIQUE (is_id),
  CONSTRAINT sevkiyat_bekleyen_fason_tek UNIQUE (fason_hareket_id)
);
-- Bir emrin ürünü listeye bir kez düşer.
CREATE UNIQUE INDEX sevkiyat_bekleyen_urun_tek ON sevkiyat_bekleyen (uretim_emri_id) WHERE kaynak = 'urun';
CREATE INDEX sevkiyat_bekleyen_acik ON sevkiyat_bekleyen (hazir_zamani, id) WHERE is_id IS NULL AND kaldirildi IS NULL;
