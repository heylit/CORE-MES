-- 3593 (P1, yalnız genişleten göç): alternatif kartında (veride set) nitelik kipi ve işlem. Var olan satırlar değişmez: kip boş kalır ve
-- bugünkü anlamını korur (listede değerlerden biri, ölçüde en az ve en çok). İşlem satırı olmayan eski kartta işlem serbesttir.
-- 'birebir' ana kartın değerini izler (değer yazılmaz), 'pay' ana ölçünün altına ve üstüne mm, 'aralik' en az ve en çok.

ALTER TABLE malzeme_alternatif_seti_niteligi
  ADD COLUMN kip text CONSTRAINT malzeme_alternatif_seti_niteligi_kip CHECK (kip IN ('birebir', 'pay', 'aralik')),
  ADD COLUMN pay_alt numeric(10, 3) CONSTRAINT malzeme_alternatif_seti_niteligi_pay_alt CHECK (pay_alt >= 0 AND pay_alt <= 100000),
  ADD COLUMN pay_ust numeric(10, 3) CONSTRAINT malzeme_alternatif_seti_niteligi_pay_ust CHECK (pay_ust >= 0 AND pay_ust <= 100000);

ALTER TABLE malzeme_alternatif_seti_niteligi
  DROP CONSTRAINT malzeme_alternatif_seti_niteligi_nitelik,
  ADD CONSTRAINT malzeme_alternatif_seti_niteligi_nitelik
    CHECK (nitelik IN ('form', 'kalite', 'durum', 'standart', 'yuzey', 'islem', 'd', 's', 'a', 'b', 't', 'D', 'h', 'l')),
  DROP CONSTRAINT malzeme_alternatif_seti_niteligi_bicim,
  ADD CONSTRAINT malzeme_alternatif_seti_niteligi_bicim CHECK (
    (nitelik IN ('form', 'kalite', 'durum', 'standart', 'yuzey', 'islem') AND alt IS NULL AND ust IS NULL AND pay_alt IS NULL AND pay_ust IS NULL
      AND ((kip IS NULL AND degerler IS NOT NULL AND cardinality(degerler) BETWEEN 1 AND 40) OR (kip = 'birebir' AND degerler IS NULL)))
    OR (nitelik NOT IN ('form', 'kalite', 'durum', 'standart', 'yuzey', 'islem') AND degerler IS NULL AND (
      ((kip IS NULL OR kip = 'aralik') AND (alt IS NOT NULL OR ust IS NOT NULL) AND pay_alt IS NULL AND pay_ust IS NULL)
      OR (kip = 'birebir' AND alt IS NULL AND ust IS NULL AND pay_alt IS NULL AND pay_ust IS NULL)
      OR (kip = 'pay' AND alt IS NULL AND ust IS NULL AND pay_alt IS NOT NULL AND pay_ust IS NOT NULL))));
