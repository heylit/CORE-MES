-- 3118: GKK kaydı numarayla bulunur (numara belge numarası düzeninden, kalıbı Sistem Ayarları'nda) ve kontrol listesini taşır
-- (madde sonuçları, ölçülen değerler, yarı mamulde işlem sonuçları ve seri listesi). İkisi de yalnız GKK aşamasında yazılır; eski
-- kayıtlar numarasız ve listesiz kalır (geriye dönük doldurma yok). Tablo yalnız eklemeli kalır.
ALTER TABLE kalite_merkezi_giris_karari
  ADD COLUMN gkk_no text CONSTRAINT kalite_merkezi_giris_karari_gkk_no CHECK (gkk_no IS NULL OR (btrim(gkk_no) <> '' AND length(gkk_no) <= 60)),
  ADD COLUMN kontrol jsonb CONSTRAINT kalite_merkezi_giris_karari_kontrol CHECK (kontrol IS NULL OR jsonb_typeof(kontrol) = 'object'),
  ADD CONSTRAINT kalite_merkezi_giris_karari_gkk_alanlari CHECK (asama = 'gkk' OR (gkk_no IS NULL AND kontrol IS NULL));

CREATE UNIQUE INDEX kalite_merkezi_giris_karari_gkk_no_tek ON kalite_merkezi_giris_karari (gkk_no) WHERE gkk_no IS NOT NULL;
