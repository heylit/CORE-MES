-- 2428: her dış işlem (fason) tek belgeyle izlenir. Emre bağlı adımda belge iş emriyle 1:1'dir ve alanlarını iş emrinden okur;
-- stoktaki partinin işinde parça, parti, işlem ve adet belgededir. Durum saklanmaz, hareketlerden ve iş emrinden türer.
CREATE TABLE uretim_emirleri_dis_islem_emri (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text NOT NULL CONSTRAINT uretim_emirleri_dis_islem_emri_no_tekil UNIQUE,
  is_emri_id int CONSTRAINT uretim_emirleri_dis_islem_emri_is_emri_tekil UNIQUE
    CONSTRAINT uretim_emirleri_dis_islem_emri_is_emri REFERENCES uretim_emirleri_is_emri ON DELETE CASCADE,
  malzeme_no int CONSTRAINT uretim_emirleri_dis_islem_emri_malzeme REFERENCES malzeme_katalog_karti (no),
  -- Stok üst kattadır: parti ve konum yalnız kimlik olarak durur, yabancı anahtar yoktur; varlığını açan uç stoktan denetler.
  parti_id bigint,
  konum_id int,
  operasyon_tipi_id int CONSTRAINT uretim_emirleri_dis_islem_emri_operasyon_tipi REFERENCES istasyonlar_operasyon_tipi,
  hizmet_no int CONSTRAINT uretim_emirleri_dis_islem_emri_hizmet REFERENCES malzeme_katalog_karti (no),
  fason_firma_id int CONSTRAINT uretim_emirleri_dis_islem_emri_firma REFERENCES musteri_tedarikci_firma,
  adet int CONSTRAINT uretim_emirleri_dis_islem_emri_adet CHECK (adet > 0),
  planlanan_gidis date,
  termin date,
  aciklama text CONSTRAINT uretim_emirleri_dis_islem_emri_aciklama CHECK (btrim(aciklama) <> '' AND length(aciklama) <= 500),
  acilis text NOT NULL CONSTRAINT uretim_emirleri_dis_islem_emri_acilis CHECK (acilis IN ('plan', 'talep', 'elle', 'goc')),
  olusturan_kisi_id int CONSTRAINT uretim_emirleri_dis_islem_emri_olusturan REFERENCES kisi,
  olusturma_zamani timestamptz NOT NULL DEFAULT now(),
  tamamlanma_zamani timestamptz,
  tamamlayan_kisi_id int CONSTRAINT uretim_emirleri_dis_islem_emri_tamamlayan REFERENCES kisi,
  iptal_zamani timestamptz,
  iptal_eden_kisi_id int CONSTRAINT uretim_emirleri_dis_islem_emri_iptal_eden REFERENCES kisi,
  surum int NOT NULL DEFAULT 1,
  CONSTRAINT uretim_emirleri_dis_islem_emri_kaynak_tek CHECK (num_nonnulls(is_emri_id, parti_id) = 1),
  -- Emre bağlı belgede firma, termin, adet ve bitiş iş emrindedir; ikinci kopya iki doğru kaynağı olurdu.
  CONSTRAINT uretim_emirleri_dis_islem_emri_emirde_sade CHECK (is_emri_id IS NULL OR num_nonnulls(
    malzeme_no, konum_id, operasyon_tipi_id, hizmet_no, fason_firma_id, adet, planlanan_gidis, termin, tamamlanma_zamani, iptal_zamani) = 0),
  CONSTRAINT uretim_emirleri_dis_islem_emri_partide_tam CHECK (parti_id IS NULL
    OR (malzeme_no IS NOT NULL AND adet IS NOT NULL AND num_nonnulls(operasyon_tipi_id, hizmet_no) >= 1)),
  -- Sistem (plan ve göç) yalnız emre bağlı belge açar; kişinin açtığı belgede kişi durur.
  CONSTRAINT uretim_emirleri_dis_islem_emri_acan CHECK ((acilis IN ('elle', 'talep')) = (olusturan_kisi_id IS NOT NULL)),
  CONSTRAINT uretim_emirleri_dis_islem_emri_partiyi_kisi_acar CHECK (parti_id IS NULL OR acilis IN ('elle', 'talep')),
  CONSTRAINT uretim_emirleri_dis_islem_emri_tamamlayan_var CHECK ((tamamlanma_zamani IS NULL) = (tamamlayan_kisi_id IS NULL)),
  CONSTRAINT uretim_emirleri_dis_islem_emri_iptal_eden_var CHECK ((iptal_zamani IS NULL) = (iptal_eden_kisi_id IS NULL)),
  CONSTRAINT uretim_emirleri_dis_islem_emri_tek_son CHECK (tamamlanma_zamani IS NULL OR iptal_zamani IS NULL),
  CONSTRAINT uretim_emirleri_dis_islem_emri_termin_sirasi CHECK (termin IS NULL OR planlanan_gidis IS NULL OR termin >= planlanan_gidis)
);
CREATE INDEX uretim_emirleri_dis_islem_emri_parti_idx ON uretim_emirleri_dis_islem_emri (parti_id) WHERE parti_id IS NOT NULL;
CREATE INDEX uretim_emirleri_dis_islem_emri_acik_idx ON uretim_emirleri_dis_islem_emri (id) WHERE tamamlanma_zamani IS NULL AND iptal_zamani IS NULL;

-- Numara emir no ile aynı kalıpta sunucuda kurulur; yalnız boş gelen eklemede yazılır.
CREATE FUNCTION uretim_emirleri_dis_islem_emri_no() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.no IS NULL THEN
    NEW.no := 'DIE-' || CASE WHEN NEW.id < 1000000 THEN lpad(NEW.id::text, 6, '0') ELSE NEW.id::text END;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER uretim_emirleri_dis_islem_emri_no BEFORE INSERT ON uretim_emirleri_dis_islem_emri
  FOR EACH ROW EXECUTE FUNCTION uretim_emirleri_dis_islem_emri_no();

-- 2428-1: plandaki (rotadan, fasona alınan, bölünen ya da kopyalanan) her fason adımın belgesi kendiliğinden açılır. İş emrini yazan
-- yollar çok olduğu için kural tek yerde, yazmanın kendisinde durur: belge yoksa açılır, varsa (elle açılmış) dokunulmaz.
-- Adım içeri alınırsa belge kalır, durumu iş emrinden "iptal" türer; yeniden fasona alınırsa aynı belge sürer.
CREATE FUNCTION uretim_emirleri_dis_islem_emri_plandan() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.fason_firma_id IS NOT NULL THEN
    INSERT INTO uretim_emirleri_dis_islem_emri (is_emri_id, acilis) VALUES (NEW.id, 'plan') ON CONFLICT (is_emri_id) DO NOTHING;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER uretim_emirleri_dis_islem_emri_plandan AFTER INSERT OR UPDATE OF fason_firma_id ON uretim_emirleri_is_emri
  FOR EACH ROW EXECUTE FUNCTION uretim_emirleri_dis_islem_emri_plandan();

-- Stoktaki partinin hareketleri belgeye bağlanır; emre bağlı hareketler iş emrine bağlı kalır (var olan satır değişmez).
ALTER TABLE uretim_emirleri_fason_hareketi
  ALTER COLUMN is_emri_id DROP NOT NULL,
  ADD COLUMN die_id int CONSTRAINT uretim_emirleri_fason_hareketi_die REFERENCES uretim_emirleri_dis_islem_emri,
  ADD CONSTRAINT uretim_emirleri_fason_hareketi_tek_bag CHECK (num_nonnulls(is_emri_id, die_id) = 1);
CREATE INDEX uretim_emirleri_fason_hareketi_die_idx ON uretim_emirleri_fason_hareketi (die_id, id) WHERE die_id IS NOT NULL;
