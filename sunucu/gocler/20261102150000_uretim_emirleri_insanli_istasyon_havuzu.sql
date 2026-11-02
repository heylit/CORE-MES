-- 1891 (A b, teyit-2 a): kapasite kaynağı insan olan istasyon yetkin kişilerin havuzudur; orada makinesiz (el) iş istasyonu kilitlemez,
-- aynı anda birden çok el işi açık olabilir. Öteki istasyonlarda makinesiz iş eskisi gibi istasyon yerini tutar. Kişiye sınır konmaz.
-- Bayrak kullanım açılırken yazılır: istasyonun kaynağı sonradan değişse de açık kullanımın kilidi değişmez. Var olan satırlar havuz değildir.
ALTER TABLE uretim_emirleri_makine_kullanimi ADD COLUMN havuz boolean NOT NULL DEFAULT false,
  ADD CONSTRAINT uretim_emirleri_makine_kullanimi_havuz_makinesiz CHECK (NOT havuz OR makine_id IS NULL);

DROP INDEX uretim_emirleri_makine_kullanimi_istasyonda_tek;
CREATE UNIQUE INDEX uretim_emirleri_makine_kullanimi_istasyonda_tek ON uretim_emirleri_makine_kullanimi (istasyon_id)
  WHERE bitis IS NULL AND makine_id IS NULL AND NOT havuz;
