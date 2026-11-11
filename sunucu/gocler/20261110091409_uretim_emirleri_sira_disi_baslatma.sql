-- 2768 (2756 b): hazır olmayan adım terminalden uyarıyla başlar ve iz bırakır: öncül başına bir satır (kim, ne zaman, öncülden gelen
-- hazır adet, öncülün sayılan sağlamı). Amir anomali sayfasında "sayımı geride kalan önceki adım" olarak görür. Yeni boş tablo, yalnız eklenir.
CREATE TABLE uretim_emirleri_sira_disi_baslatma (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- Başlatma komutu emri zaten kilitli tutar (FOR UPDATE); emir anahtarı ek kilit getirmez. İş emri anahtarı BİLİNÇLİ YOK: öncül adım
  -- satırına KEY SHARE kilidi, o adımın sayım komutlarının FOR UPDATE'iyle çakışırdı (arkon_hazirlik_maddesi ile aynı gerekçe).
  uretim_emri_id int NOT NULL REFERENCES uretim_emri (id),
  is_emri_id int NOT NULL CONSTRAINT uretim_emirleri_sira_disi_baslatma_adim CHECK (is_emri_id > 0),
  oncul_is_emri_id int NOT NULL CONSTRAINT uretim_emirleri_sira_disi_baslatma_oncul CHECK (oncul_is_emri_id > 0),
  oncul_turu text NOT NULL CONSTRAINT uretim_emirleri_sira_disi_baslatma_tur CHECK (oncul_turu IN ('bekleyen', 'akisli')),
  devir_adedi int CONSTRAINT uretim_emirleri_sira_disi_baslatma_devir CHECK (devir_adedi IS NULL OR devir_adedi > 0),
  hazir_adet int NOT NULL CONSTRAINT uretim_emirleri_sira_disi_baslatma_hazir CHECK (hazir_adet >= 0),
  oncul_sayilan int NOT NULL CONSTRAINT uretim_emirleri_sira_disi_baslatma_sayilan CHECK (oncul_sayilan >= 0),
  kisi_id int NOT NULL REFERENCES kisi (id),
  istasyon_id int NOT NULL REFERENCES istasyon (id),
  zaman timestamptz NOT NULL,
  CONSTRAINT uretim_emirleri_sira_disi_baslatma_farkli CHECK (oncul_is_emri_id <> is_emri_id)
);
CREATE INDEX uretim_emirleri_sira_disi_baslatma_zaman_idx ON uretim_emirleri_sira_disi_baslatma (zaman, id);
CREATE INDEX uretim_emirleri_sira_disi_baslatma_emir_idx ON uretim_emirleri_sira_disi_baslatma (uretim_emri_id, id);
CREATE TRIGGER uretim_emirleri_sira_disi_baslatma_degismez BEFORE UPDATE OR DELETE ON uretim_emirleri_sira_disi_baslatma
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER uretim_emirleri_sira_disi_baslatma_bosaltilmaz BEFORE TRUNCATE ON uretim_emirleri_sira_disi_baslatma
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
