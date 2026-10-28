-- Sevkiyat Tüm işler (960): kalem serbest bırakılır, sevkiyat tetikler, depo son çıkışı ya da kabulü yapar. Dolu tablolar
-- sevkiyat_bekleyen ve sevkiyat_isi'ne sütun eklenir, CHECK genişler; satır silinmez, sütun düşmez, var olan değer değişmez.

-- ---------- sevkiyat_bekleyen: kalem ----------
ALTER TABLE sevkiyat_bekleyen
  ADD COLUMN yon text,
  -- Fason gidiş ve dönüşünde rotadaki fason adımı (gidiş hareketi artık depo çıkışında yazılır, kalem ondan önce açılır).
  ADD COLUMN is_emri_id int CONSTRAINT sevkiyat_bekleyen_is_emri REFERENCES uretim_emirleri_is_emri (id),
  -- Alımda sipariş satırı (Tüm işlerden açılan); satın almanın teslim yöntemiyle açılan eski alım satırında boş.
  ADD COLUMN siparis_satiri_id int CONSTRAINT sevkiyat_bekleyen_siparis_satiri REFERENCES satin_alma_siparis_satiri (id),
  -- Dönüş kaleminin gidişi (fason dönüşü, dönüşlü elle iş; 958 a).
  ADD COLUMN gidis_bekleyen_id int CONSTRAINT sevkiyat_bekleyen_gidis REFERENCES sevkiyat_bekleyen (id),
  ADD COLUMN elle_turu text CONSTRAINT sevkiyat_bekleyen_elle_turu CHECK (elle_turu IN ('numune', 'tamir', 'kalibrasyon', 'iade', 'diger')),
  ADD COLUMN aciklama text CONSTRAINT sevkiyat_bekleyen_aciklama CHECK (btrim(aciklama) <> ''),
  -- Serbest bırakma ve taşıma; taşımayı son yazan ve yeri (959 b).
  ADD COLUMN serbest_zamani timestamptz,
  ADD COLUMN tasima text CONSTRAINT sevkiyat_bekleyen_tasima CHECK (tasima IN ('biz', 'firma')),
  ADD COLUMN son_yazan_kisi_id int CONSTRAINT sevkiyat_bekleyen_son_yazan REFERENCES kisi (id),
  ADD COLUMN son_yazan_yer text CONSTRAINT sevkiyat_bekleyen_son_yazan_yer CHECK (son_yazan_yer IN ('tum-isler', 'satin-alma', 'sevkiyat', 'otomatik')),
  ADD COLUMN son_yazan_zamani timestamptz,
  -- Erken çıkış (945 a, 963 a): kim, ne zaman, gerekçe.
  ADD COLUMN erken_zamani timestamptz,
  ADD COLUMN erken_kisi_id int CONSTRAINT sevkiyat_bekleyen_erken_kisi REFERENCES kisi (id),
  ADD COLUMN erken_gerekce text CONSTRAINT sevkiyat_bekleyen_erken_gerekce CHECK (char_length(btrim(erken_gerekce)) >= 10),
  -- Depo son çıkışı ya da kabulün bittiği an; kısmi kabulde kabul_adet gelen toplamdır, depo_zamani boş kalır.
  ADD COLUMN depo_zamani timestamptz,
  ADD COLUMN depo_kisi_id int CONSTRAINT sevkiyat_bekleyen_depo_kisi REFERENCES kisi (id),
  ADD COLUMN kabul_adet numeric(18, 4) CONSTRAINT sevkiyat_bekleyen_kabul_adet CHECK (kabul_adet > 0);

-- Var olan satırlar bugün zaten sevkiyatın bekleme listesindedir: serbest bırakılmış, araçla taşınacak, otomatik yazılmış sayılır.
UPDATE sevkiyat_bekleyen SET
  yon = CASE kaynak WHEN 'alim' THEN 'gelis' ELSE 'gidis' END,
  serbest_zamani = hazir_zamani, tasima = 'biz', son_yazan_yer = 'otomatik', son_yazan_zamani = hazir_zamani;

ALTER TABLE sevkiyat_bekleyen
  ALTER COLUMN yon SET NOT NULL,
  ADD CONSTRAINT sevkiyat_bekleyen_yon CHECK (yon IN ('gidis', 'gelis')),
  DROP CONSTRAINT sevkiyat_bekleyen_kaynak,
  ADD CONSTRAINT sevkiyat_bekleyen_kaynak CHECK (kaynak IN ('urun', 'fason', 'fason-donus', 'alim', 'elle')),
  -- Eski satırlar ilk üç koşuldan birini zaten sağlar (fason satırında hareket dolu).
  DROP CONSTRAINT sevkiyat_bekleyen_kaynak_alanlari,
  ADD CONSTRAINT sevkiyat_bekleyen_kaynak_alanlari CHECK (
    (kaynak = 'urun' AND uretim_emri_id IS NOT NULL AND fason_hareket_id IS NULL AND talep_id IS NULL)
    OR (kaynak = 'fason' AND uretim_emri_id IS NOT NULL AND (fason_hareket_id IS NOT NULL OR is_emri_id IS NOT NULL) AND talep_id IS NULL AND firma_id IS NOT NULL)
    OR (kaynak = 'fason-donus' AND uretim_emri_id IS NOT NULL AND is_emri_id IS NOT NULL AND gidis_bekleyen_id IS NOT NULL AND fason_hareket_id IS NULL AND talep_id IS NULL AND firma_id IS NOT NULL)
    OR (kaynak = 'alim' AND talep_id IS NOT NULL AND uretim_emri_id IS NULL AND fason_hareket_id IS NULL)
    OR (kaynak = 'elle' AND firma_id IS NOT NULL AND aciklama IS NOT NULL AND uretim_emri_id IS NULL AND fason_hareket_id IS NULL AND talep_id IS NULL)
  ),
  ADD CONSTRAINT sevkiyat_bekleyen_yon_kaynagi CHECK (kaynak = 'elle' OR yon = CASE WHEN kaynak IN ('urun', 'fason') THEN 'gidis' ELSE 'gelis' END),
  ADD CONSTRAINT sevkiyat_bekleyen_elle_alanlari CHECK ((kaynak = 'elle') = (elle_turu IS NOT NULL)),
  ADD CONSTRAINT sevkiyat_bekleyen_siparis_alimda CHECK (siparis_satiri_id IS NULL OR kaynak = 'alim'),
  ADD CONSTRAINT sevkiyat_bekleyen_gidis_geliste CHECK (gidis_bekleyen_id IS NULL OR (yon = 'gelis' AND gidis_bekleyen_id <> id)),
  ADD CONSTRAINT sevkiyat_bekleyen_iade_donussuz CHECK (elle_turu IS DISTINCT FROM 'iade' OR gidis_bekleyen_id IS NULL),
  ADD CONSTRAINT sevkiyat_bekleyen_serbest_butun CHECK ((serbest_zamani IS NULL) = (tasima IS NULL)),
  ADD CONSTRAINT sevkiyat_bekleyen_son_yazan_butun CHECK (
    (son_yazan_yer IS NULL) = (son_yazan_zamani IS NULL) AND (son_yazan_kisi_id IS NULL OR son_yazan_yer IS NOT NULL)
  ),
  ADD CONSTRAINT sevkiyat_bekleyen_erken_butun CHECK (
    (erken_zamani IS NULL) = (erken_kisi_id IS NULL) AND (erken_zamani IS NULL) = (erken_gerekce IS NULL) AND (erken_zamani IS NULL OR serbest_zamani IS NOT NULL)
  ),
  ADD CONSTRAINT sevkiyat_bekleyen_depo_butun CHECK ((depo_zamani IS NULL) = (depo_kisi_id IS NULL) AND (depo_zamani IS NULL OR serbest_zamani IS NOT NULL)),
  ADD CONSTRAINT sevkiyat_bekleyen_kabul_geliste CHECK (kabul_adet IS NULL OR yon = 'gelis'),
  ADD CONSTRAINT sevkiyat_bekleyen_donus_tek UNIQUE (gidis_bekleyen_id);

-- Silinen üst kayda bakan yabancı anahtarlar dizinli (818 B4).
CREATE INDEX sevkiyat_bekleyen_is_emri_dizini ON sevkiyat_bekleyen (is_emri_id) WHERE is_emri_id IS NOT NULL;
CREATE INDEX sevkiyat_bekleyen_siparis_satiri_dizini ON sevkiyat_bekleyen (siparis_satiri_id) WHERE siparis_satiri_id IS NOT NULL;
-- Depo listesi: serbest, depo yapmamış, kaldırılmamış kalemler.
CREATE INDEX sevkiyat_bekleyen_depoda ON sevkiyat_bekleyen (serbest_zamani, id) WHERE serbest_zamani IS NOT NULL AND depo_zamani IS NULL AND kaldirildi IS NULL;

-- ---------- sevkiyat_isi: tetik ----------
ALTER TABLE sevkiyat_isi
  ADD COLUMN tetiklendi timestamptz,
  ADD COLUMN tetikleyen_kisi_id int CONSTRAINT sevkiyat_isi_tetikleyen REFERENCES kisi (id),
  ADD CONSTRAINT sevkiyat_isi_tetik_butun CHECK ((tetiklendi IS NULL) = (tetikleyen_kisi_id IS NULL));

-- Tetik yoldaki işte de verilir (araç yükleniyor): tetik alanları içerik sayılmaz, durum alanları gibi değişebilir.
CREATE OR REPLACE FUNCTION sevkiyat_onayli_plandaki_is_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  durum_alanlari text[] := ARRAY['durum', 'durum_zamani', 'tarih', 'surum', 'tetiklendi', 'tetikleyen_kisi_id'];
BEGIN
  IF OLD.durum IN ('yolda', 'tamamlandi') AND (to_jsonb(NEW) - durum_alanlari) <> (to_jsonb(OLD) - durum_alanlari) THEN
    RAISE EXCEPTION 'Yoldaki ya da tamamlanmış iş değiştirilemez' USING ERRCODE = 'check_violation', CONSTRAINT = 'sevkiyat_onayli_plandaki_is_degismez';
  END IF;
  RETURN NEW;
END $$;
