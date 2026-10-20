-- Satın alma talebi Logo'ya talep fişi, sipariş satırı talep fişine karşılama olarak gider (#205 S3 b, kart #790; kullanıcı onayı
-- 12.10.2026). Giden kutusu belgeyi ve satırı sayı kimliğiyle tanır; talep ve kalemin birincil anahtarı uuid kalır.
-- Var olan kayıtlara dokunulmaz: Logo durumları boş kalır, göçten önce onaylanmış talep kendiliğinden Logo'ya gitmez.
ALTER TABLE satin_alma_talep
  ADD COLUMN sayi_id int GENERATED ALWAYS AS IDENTITY CONSTRAINT satin_alma_talep_sayi_id_tek UNIQUE,
  ADD COLUMN logo_kayit_no text CONSTRAINT satin_alma_talep_logo_kayit_no CHECK (logo_kayit_no IS NULL OR (btrim(logo_kayit_no) <> '' AND length(logo_kayit_no) <= 64)),
  ADD COLUMN logo_gonderim_durumu text CONSTRAINT satin_alma_talep_logo_durumu CHECK (logo_gonderim_durumu IN ('bekliyor', 'gonderildi', 'hata')),
  ADD COLUMN logo_hata text CONSTRAINT satin_alma_talep_logo_hata CHECK (logo_hata IS NULL OR (btrim(logo_hata) <> '' AND length(logo_hata) <= 2000)),
  ADD CONSTRAINT satin_alma_talep_logo_butun CHECK (
    (logo_kayit_no IS NOT NULL) = (logo_gonderim_durumu IS NOT DISTINCT FROM 'gonderildi')
    AND (logo_hata IS NOT NULL) = (logo_gonderim_durumu IS NOT DISTINCT FROM 'hata')
  );

ALTER TABLE satin_alma_talep_kalemi
  ADD COLUMN sayi_id int GENERATED ALWAYS AS IDENTITY CONSTRAINT satin_alma_talep_kalemi_sayi_id_tek UNIQUE,
  ADD COLUMN logo_satir_ref text CONSTRAINT satin_alma_talep_kalemi_logo_ref CHECK (logo_satir_ref IS NULL OR (btrim(logo_satir_ref) <> '' AND length(logo_satir_ref) <= 64));

-- Karşılama, iki taraf da Logo'da satır numarası alınca kuyruğa girer; durum boşsa henüz denenmemiştir.
ALTER TABLE satin_alma_siparis_satiri
  ADD COLUMN logo_karsilama_ref text CONSTRAINT satin_alma_siparis_satiri_karsilama_ref CHECK (logo_karsilama_ref IS NULL OR (btrim(logo_karsilama_ref) <> '' AND length(logo_karsilama_ref) <= 64)),
  ADD COLUMN logo_karsilama_durumu text CONSTRAINT satin_alma_siparis_satiri_karsilama_durumu CHECK (logo_karsilama_durumu IN ('gonderildi', 'hata')),
  ADD COLUMN logo_karsilama_hata text CONSTRAINT satin_alma_siparis_satiri_karsilama_hata CHECK (logo_karsilama_hata IS NULL OR (btrim(logo_karsilama_hata) <> '' AND length(logo_karsilama_hata) <= 2000)),
  ADD CONSTRAINT satin_alma_siparis_satiri_karsilama_butun CHECK (
    (logo_karsilama_ref IS NOT NULL) = (logo_karsilama_durumu IS NOT DISTINCT FROM 'gonderildi')
    AND (logo_karsilama_hata IS NOT NULL) = (logo_karsilama_durumu IS NOT DISTINCT FROM 'hata')
  );

CREATE UNIQUE INDEX satin_alma_talep_logo_kayit_no_tek ON satin_alma_talep (logo_kayit_no) WHERE logo_kayit_no IS NOT NULL;
CREATE INDEX satin_alma_talep_logo_kuyrugu ON satin_alma_talep (sayi_id) WHERE logo_gonderim_durumu IN ('bekliyor', 'hata');
