-- 3437 a (dilim 3b-1): talepte şartlı kabul işaretlenmemişse şartlı alternatifi talep eden sonradan onaylar ya da reddeder. İzin teklif
-- satırının o anki alternatifine bağlıdır: alternatif değişince izin düşer (servis). Var olan satırlar değişmez. Kısıt genişler, veri değişmez.
--   alternatif_izin: 'talep' (talepte işaret), 'soru' (talep eden sonradan onayladı), 'ret' (talep eden reddetti).
--   alternatif_izin_kisi_id, alternatif_izin_zaman, alternatif_izin_notu: sonradan verilen kararın kimi, zamanı ve notu.
ALTER TABLE satin_alma_teklif_satiri DROP CONSTRAINT satin_alma_teklif_satiri_alternatif_izin;
ALTER TABLE satin_alma_teklif_satiri
  ADD CONSTRAINT satin_alma_teklif_satiri_alternatif_izin CHECK (alternatif_izin IN ('talep', 'soru', 'ret')),
  ADD COLUMN alternatif_izin_kisi_id int REFERENCES kisi,
  ADD COLUMN alternatif_izin_zaman timestamptz,
  ADD COLUMN alternatif_izin_notu text CONSTRAINT satin_alma_teklif_satiri_alternatif_izin_notu CHECK (length(alternatif_izin_notu) <= 500),
  ADD CONSTRAINT satin_alma_teklif_satiri_alternatif_soru CHECK (
    COALESCE(alternatif_izin IN ('soru', 'ret'), false) = (alternatif_izin_kisi_id IS NOT NULL AND alternatif_izin_zaman IS NOT NULL)
  );
