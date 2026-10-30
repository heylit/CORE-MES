-- 1289 a: firmaya bağlı nokta firmanın bir adresine (teslim, şube, fatura) bağlanabilir; adres ve koordinat o adresten, adres seçilmemişse
-- firmanın merkez adresinden okunur. Dolu tabloya boş olabilen sütun eklenir; mevcut noktalar değişmez, sütun boş başlar.
ALTER TABLE sevkiyat_noktasi
  ADD COLUMN adres_id int CONSTRAINT sevkiyat_noktasi_adres REFERENCES musteri_tedarikci_adres (id),
  ADD CONSTRAINT sevkiyat_noktasi_adres_firmali CHECK (adres_id IS NULL OR firma_id IS NOT NULL);
