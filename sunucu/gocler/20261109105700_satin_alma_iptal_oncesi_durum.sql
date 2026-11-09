-- 2413 a: elle durum değiştirme yalnız "İptali geri al"dır; talep iptalden önceki durumuna döner. Önceki durum iptal anında sunucuca yazılır,
-- iptalden çıkınca boşalır. Var olan iptallerde boştur (veri yazılmaz); geri alınınca önceki durum veriden türetilir.
ALTER TABLE satin_alma_talep ADD COLUMN iptal_oncesi_durum text
  CONSTRAINT satin_alma_talep_iptal_oncesi_durum CHECK (iptal_oncesi_durum IN ('taslak', 'teklif_isteniyor', 'degerlendirme', 'onayda', 'siparis_verildi')),
  ADD CONSTRAINT satin_alma_talep_iptal_oncesi_yalniz_iptalde CHECK (iptal_oncesi_durum IS NULL OR durum = 'iptal');
