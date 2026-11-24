-- Kart 3671: kurun tek kaynağı alış ve satış çiftidir (finans_kur_cifti). Eski tek kur tablosu (finans_kur) yalnız geçmiştir:
-- satırları, çiftte o gün kaydı olmayanlar için alış ve satış aynı değerle çifte eklenir (eski satırda ayrı alış/satış yoktu);
-- tabloya bundan sonra yazılamaz, böylece plan, proje maliyeti ve satın almanın okuduğu kur ile ekrandan girilen kur ayrışamaz.
-- Ekleyici göç: var olan çift satırına dokunmaz, yeniden çalışırsa bir şey eklemez; finans_kur silinmez.
INSERT INTO finans_kur_cifti (para_birimi, tarih, alis, satis, olusturan_id, olusturma, guncelleyen_id, guncelleme)
SELECT k.para_birimi, k.tarih, k.kur, k.kur, k.olusturan_id, k.olusturma, k.guncelleyen_id, k.guncelleme
  FROM finans_kur k
 WHERE NOT EXISTS (SELECT 1 FROM finans_kur_cifti c WHERE c.para_birimi = k.para_birimi AND c.tarih = k.tarih);

CREATE FUNCTION finans_kur_eski_yazilmaz() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'finans_kur yalnız geçmiştir; kur alış ve satış çifti olarak finans_kur_cifti tablosuna girilir'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_kur_eski_yazilmaz';
END $$;
CREATE TRIGGER finans_kur_eski_yazilmaz BEFORE INSERT OR UPDATE ON finans_kur FOR EACH ROW EXECUTE FUNCTION finans_kur_eski_yazilmaz();
