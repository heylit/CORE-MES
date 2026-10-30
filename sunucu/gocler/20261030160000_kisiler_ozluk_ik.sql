-- Kişi kartının özlük alanları İK'nındır (1302 a): İK personel kartına bağlı kişide ad, sicil no ve görev İK'dan itilir, Kişiler'de
-- salt okunurdur; çıkış tarihi (1315) gelince kişi pasife alınır ve İK'da çıkış kaldırılmadan aktif yapılamaz. Var olan satırlar
-- değişmez: bayrak yanlış, çıkış tarihi boş başlar; bağ İK kaydedince kurulur.
ALTER TABLE kisi
  ADD COLUMN ozluk_ik boolean NOT NULL DEFAULT false,
  ADD COLUMN ozluk_cikis_tarihi date,
  ADD CONSTRAINT kisi_ozluk_cikisi_ik_bagli CHECK (ozluk_cikis_tarihi IS NULL OR ozluk_ik);

-- Günlük iş, çıkış tarihi gelen aktif kişiyi buradan bulur.
CREATE INDEX kisi_ozluk_cikis_idx ON kisi (ozluk_cikis_tarihi) WHERE ozluk_cikis_tarihi IS NOT NULL AND aktif;
