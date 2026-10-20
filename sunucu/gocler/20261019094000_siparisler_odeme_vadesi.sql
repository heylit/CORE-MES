-- 205 a: plan finansman bedelini siparişin ödeme vadesinden hesaplar; boşsa sabit oran kullanılır. Yalnız boş olabilen sütun eklenir.
ALTER TABLE siparisler_siparis
  ADD COLUMN odeme_vadesi_gun integer CONSTRAINT siparisler_siparis_odeme_vadesi_gun CHECK (odeme_vadesi_gun BETWEEN 0 AND 365);
