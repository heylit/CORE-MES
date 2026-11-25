-- 3708: iş emri rota adımının kontrol türünü ve muayene süresini kopyalar (var olan satırlar 'gkk'); fason adımı sonraki firmaya "aktarım"
-- kaydıyla kapanabilir (kaynağında muayene ya da kontrolsüz geçiş). Aktarım stok hareketi değildir.
ALTER TABLE uretim_emirleri_is_emri
  ADD COLUMN kontrol_turu text NOT NULL DEFAULT 'gkk' CONSTRAINT uretim_emirleri_is_emri_kontrol_turu CHECK (kontrol_turu IN ('gkk', 'kaynakta', 'kontrolsuz')),
  ADD COLUMN muayene_suresi_saat numeric(6, 2) CONSTRAINT uretim_emirleri_is_emri_muayene_suresi CHECK (muayene_suresi_saat > 0),
  ADD CONSTRAINT uretim_emirleri_is_emri_kontrol_fasonda CHECK (kontrol_turu = 'gkk' OR fason_firma_id IS NOT NULL OR fason_firmasiz),
  ADD CONSTRAINT uretim_emirleri_is_emri_muayene_suresi_kaynakta CHECK (muayene_suresi_saat IS NULL OR kontrol_turu = 'kaynakta');

-- Her aktarım ayrı satırdır (kısmi aktarım); yalnız eklenir. Gönderilen adedi ikinci fasonda aktarılan sağlam adetler toplamı sınırlar.
CREATE TABLE uretim_emirleri_fason_aktarimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  is_emri_id int NOT NULL REFERENCES uretim_emirleri_is_emri,
  hedef_firma_id int NOT NULL REFERENCES musteri_tedarikci_firma (id),
  saglam_adet int NOT NULL CONSTRAINT uretim_emirleri_fason_aktarimi_saglam CHECK (saglam_adet >= 0),
  hurda_adet int NOT NULL CONSTRAINT uretim_emirleri_fason_aktarimi_hurda CHECK (hurda_adet >= 0),
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uretim_emirleri_fason_aktarimi_bos_degil CHECK (saglam_adet + hurda_adet > 0)
);
CREATE INDEX uretim_emirleri_fason_aktarimi_is_emri_idx ON uretim_emirleri_fason_aktarimi (is_emri_id, id);
CREATE TRIGGER uretim_emirleri_fason_aktarimi_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_fason_aktarimi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_fason_aktarimi_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_fason_aktarimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
