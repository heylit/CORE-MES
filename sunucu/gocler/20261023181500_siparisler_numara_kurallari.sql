-- Sipariş ve teklif numaraları "Numara kuralları" ayarından gelir (ayarlar numaraAl); biçim kısıtı kalıba göre değil,
-- Logo fiş numarasının sınırına göre denetlenir (en çok 16 karakter). Var olan numaralar değişmez, tekillik kalır.
-- Eski yıllık sayaç tabloları eski kayıtlar için kalır, yenisine yazılmaz.
ALTER TABLE siparisler_siparis
  DROP CONSTRAINT siparisler_siparis_no_bicim,
  ADD CONSTRAINT siparisler_siparis_no_bicim CHECK (btrim(no) = no AND no <> '' AND length(no) <= 16);

ALTER TABLE siparisler_teklif
  DROP CONSTRAINT siparisler_teklif_no_bicim,
  ADD CONSTRAINT siparisler_teklif_no_bicim CHECK (btrim(no) = no AND no <> '' AND length(no) <= 16);
