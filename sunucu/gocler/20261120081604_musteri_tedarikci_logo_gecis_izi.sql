-- 3474-1 Logo geçişi cariler: toplu işlemin her satırı izlenir; "Son toplu işlem" şeridi ve "Bu işlemi geri al" bu izden çalışır.
-- Geri al yalnız CORE'da: açılan firma pasife alınır (MT-6: firma silinmez), bağlama çözülür ve önceki Logo alanları geri yazılır.
-- Yeni, boş tablo; var olan satır değişmez.
CREATE TABLE musteri_tedarikci_logo_gecis_izi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  islem uuid NOT NULL,
  sira int NOT NULL CONSTRAINT musteri_tedarikci_logo_gecis_izi_sira CHECK (sira >= 0),
  tur text NOT NULL CONSTRAINT musteri_tedarikci_logo_gecis_izi_tur CHECK (tur IN ('al', 'bagla')),
  logo_kodu text NOT NULL CONSTRAINT musteri_tedarikci_logo_gecis_izi_logo_kodu CHECK (btrim(logo_kodu) <> '' AND length(logo_kodu) <= 64),
  tamam boolean NOT NULL,
  -- Başarılı satırda işlenen firma; reddedilen satırda nedeni.
  firma_id int CONSTRAINT musteri_tedarikci_logo_gecis_izi_firma REFERENCES musteri_tedarikci_firma (id),
  ileti text CONSTRAINT musteri_tedarikci_logo_gecis_izi_ileti CHECK (ileti IS NULL OR length(ileti) <= 500),
  -- Firmanın işlemden hemen sonraki sürümü: sonra değişen firma geri alınmaz.
  firma_surumu int,
  -- Bağlamada firmanın önceki kodu, Logo cari kodu ve gönderim durumu; almada yok.
  onceki jsonb,
  kisi_id int NOT NULL CONSTRAINT musteri_tedarikci_logo_gecis_izi_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now(),
  geri_alindi timestamptz,
  geri_ileti text CONSTRAINT musteri_tedarikci_logo_gecis_izi_geri_ileti CHECK (geri_ileti IS NULL OR length(geri_ileti) <= 500),
  CONSTRAINT musteri_tedarikci_logo_gecis_izi_satir UNIQUE (islem, sira),
  CONSTRAINT musteri_tedarikci_logo_gecis_izi_butun CHECK (
    (tamam AND firma_id IS NOT NULL AND firma_surumu IS NOT NULL AND ileti IS NULL)
    OR (NOT tamam AND firma_id IS NULL AND firma_surumu IS NULL AND ileti IS NOT NULL AND geri_alindi IS NULL)),
  CONSTRAINT musteri_tedarikci_logo_gecis_izi_onceki CHECK (NOT tamam OR (tur = 'bagla') = (onceki IS NOT NULL))
);
-- Kişinin son işlemi şeritte okunur.
CREATE INDEX musteri_tedarikci_logo_gecis_izi_kisi_zaman ON musteri_tedarikci_logo_gecis_izi (kisi_id, zaman DESC, id DESC);
