-- 3437 a (dilim 3a): teklif satırı istenen malzemenin yerine alternatif teklif edebilir (kalite, durum, yüzey, ölçü). Sonuç sunucuda
-- kalemin daraltılmış kabul zarfından (3437-2) hesaplanıp yazılır; karar sınır dışını seçemez. Boş sütun "istenenin aynısı" demektir:
-- var olan satırlar değişmez. Yalnız ekleyen göç.
--   alternatif: teklif edilen nitelikler ({kalite, durum, yuzey, olcu}); boş alan istenenle aynıdır.
--   alternatif_sonuc: ayni / icinde / sartli / disi (motorun sonucu, kayıt anında).
--   alternatif_nedenler: sonucun gerekçeleri (ekranda gösterilir).
--   alternatif_izin: şartlı sonucun izni; 'talep' talep edenin talepte "şartlı muadilleri kabul ediyorum" işaretidir.
ALTER TABLE satin_alma_teklif_satiri
  ADD COLUMN alternatif jsonb CONSTRAINT satin_alma_teklif_satiri_alternatif CHECK (jsonb_typeof(alternatif) = 'object'),
  ADD COLUMN alternatif_sonuc text CONSTRAINT satin_alma_teklif_satiri_alternatif_sonuc CHECK (alternatif_sonuc IN ('ayni', 'icinde', 'sartli', 'disi')),
  ADD COLUMN alternatif_nedenler text[] CONSTRAINT satin_alma_teklif_satiri_alternatif_nedenler CHECK (cardinality(alternatif_nedenler) <= 20),
  ADD COLUMN alternatif_izin text CONSTRAINT satin_alma_teklif_satiri_alternatif_izin CHECK (alternatif_izin IN ('talep')),
  ADD CONSTRAINT satin_alma_teklif_satiri_alternatif_tam CHECK (
    (alternatif IS NULL AND alternatif_sonuc IS NULL AND alternatif_nedenler IS NULL AND alternatif_izin IS NULL)
    OR (alternatif IS NOT NULL AND alternatif_sonuc IS NOT NULL AND alternatif_nedenler IS NOT NULL)
  );
