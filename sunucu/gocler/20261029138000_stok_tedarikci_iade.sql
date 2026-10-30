-- 1253 a (kullanıcı teyidi 30.10.2026): giriş kontrolünde kalitenin red kararı partiyi tedarikçiye iade çıkışıyla düşürür. Çıkış nedeni
-- listesine yalnız değer eklenir; var olan hareket satırları değişmez.
ALTER TABLE stok_hareketi DROP CONSTRAINT stok_hareketi_cikis_nedeni;
ALTER TABLE stok_hareketi ADD CONSTRAINT stok_hareketi_cikis_nedeni CHECK (
  (tur = 'cikis') = (cikis_nedeni IS NOT NULL)
  AND (cikis_nedeni IS NULL OR cikis_nedeni IN ('uretime_sarf', 'sevk', 'fire', 'numune', 'diger', 'tedarikci_iade'))
);
