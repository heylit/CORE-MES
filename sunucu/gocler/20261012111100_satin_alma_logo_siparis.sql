-- Satın alma siparişi Logo'ya gider (#205 karar 1). Belgenin Logo durumu sahibi modüldedir (ADR 0010 karar 8); giden kutusu
-- (logo_giden) siparişi sayı kimliğiyle tanır, bu yüzden siparişe tekil sayı kimliği eklenir (birincil anahtar uuid çifti kalır).
-- Var olan siparişlere dokunulmaz: Logo durumları boş kalır, göçten önce verilmiş sipariş kendiliğinden Logo'ya gitmez.
ALTER TABLE satin_alma_siparis
  ADD COLUMN id int GENERATED ALWAYS AS IDENTITY CONSTRAINT satin_alma_siparis_id_tek UNIQUE,
  ADD COLUMN logo_kayit_no text CONSTRAINT satin_alma_siparis_logo_kayit_no CHECK (logo_kayit_no IS NULL OR (btrim(logo_kayit_no) <> '' AND length(logo_kayit_no) <= 64)),
  ADD COLUMN logo_gonderim_durumu text CONSTRAINT satin_alma_siparis_logo_durumu CHECK (logo_gonderim_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  ADD COLUMN logo_gonderim_zamani timestamptz,
  ADD COLUMN logo_hata text CONSTRAINT satin_alma_siparis_logo_hata CHECK (logo_hata IS NULL OR (btrim(logo_hata) <> '' AND length(logo_hata) <= 2000)),
  ADD COLUMN logo_iptal_durumu text CONSTRAINT satin_alma_siparis_logo_iptal_durumu CHECK (logo_iptal_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  ADD COLUMN logo_iptal_hata text CONSTRAINT satin_alma_siparis_logo_iptal_hata CHECK (logo_iptal_hata IS NULL OR (btrim(logo_iptal_hata) <> '' AND length(logo_iptal_hata) <= 2000)),
  -- S2 b: Logo'ya gitmiş siparişin TMI'deki değişikliği Logo'ya düzenleme olarak gider.
  ADD COLUMN logo_guncelleme_durumu text CONSTRAINT satin_alma_siparis_logo_guncelleme_durumu CHECK (logo_guncelleme_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  ADD COLUMN logo_guncelleme_hata text CONSTRAINT satin_alma_siparis_logo_guncelleme_hata CHECK (logo_guncelleme_hata IS NULL OR (btrim(logo_guncelleme_hata) <> '' AND length(logo_guncelleme_hata) <= 2000)),
  -- Düzenlemede kaldırılan, Logo'da numarası olan satırlar; düzenleme gidince boşalır. Logo silineni bu listeden alır, çıkarım yapmaz.
  ADD COLUMN logo_kaldirilan_satir_refleri text[] NOT NULL DEFAULT '{}',
  -- Kayıt numarası yalnız gönderilmişte; zaman sonuçla birlikte; hata metni yalnız hatada. İptal ve düzenleme yalnız Logo'da kaydı olan siparişte.
  ADD CONSTRAINT satin_alma_siparis_logo_butun CHECK (
    (logo_kayit_no IS NOT NULL) = (logo_gonderim_durumu IS NOT DISTINCT FROM 'gonderildi')
    AND (logo_gonderim_zamani IS NOT NULL) = (logo_gonderim_durumu IS NOT DISTINCT FROM 'gonderildi' OR logo_gonderim_durumu IS NOT DISTINCT FROM 'hata')
    AND (logo_hata IS NOT NULL) = (logo_gonderim_durumu IS NOT DISTINCT FROM 'hata')
    AND (logo_iptal_durumu IS NULL OR logo_kayit_no IS NOT NULL)
    AND (logo_iptal_hata IS NOT NULL) = (logo_iptal_durumu IS NOT DISTINCT FROM 'hata')
    AND (logo_guncelleme_durumu IS NULL OR logo_kayit_no IS NOT NULL)
    AND (logo_guncelleme_hata IS NOT NULL) = (logo_guncelleme_durumu IS NOT DISTINCT FROM 'hata')
  );

ALTER TABLE satin_alma_siparis_satiri
  ADD COLUMN logo_satir_ref text CONSTRAINT satin_alma_siparis_satiri_logo_ref CHECK (logo_satir_ref IS NULL OR (btrim(logo_satir_ref) <> '' AND length(logo_satir_ref) <= 64));

CREATE UNIQUE INDEX satin_alma_siparis_logo_kayit_no_tek ON satin_alma_siparis (logo_kayit_no) WHERE logo_kayit_no IS NOT NULL;
-- Giden kutusu en eskiden okur.
CREATE INDEX satin_alma_siparis_logo_kuyrugu ON satin_alma_siparis (id) WHERE logo_gonderim_durumu IN ('bekliyor', 'hata');
CREATE INDEX satin_alma_siparis_logo_iptal_kuyrugu ON satin_alma_siparis (id) WHERE logo_iptal_durumu IN ('bekliyor', 'hata');
CREATE INDEX satin_alma_siparis_logo_guncelleme_kuyrugu ON satin_alma_siparis (id) WHERE logo_guncelleme_durumu IN ('bekliyor', 'hata');
