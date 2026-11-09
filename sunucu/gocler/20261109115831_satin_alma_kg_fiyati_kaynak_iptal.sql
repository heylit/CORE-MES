-- 2455-A: kg fiyatının kaynağı (tedarikçi teklifi, piyasa listesi, son alış) ve yanlış girişin iptali. Tablo yalnız ekleme kalır:
-- iptal, iptal edilen girişi gösteren yeni satırdır; fiyat alanları boş, gerekçe açıklamadadır. Var olan satır değişmez, veri yazılmaz.
ALTER TABLE satin_alma_kg_fiyati
  ADD COLUMN kaynak text CONSTRAINT satin_alma_kg_fiyati_kaynak CHECK (kaynak IN ('tedarikci_teklifi', 'piyasa', 'son_alis')),
  ADD COLUMN iptal_edilen_id int CONSTRAINT satin_alma_kg_fiyati_iptal_edilen REFERENCES satin_alma_kg_fiyati (id),
  ALTER COLUMN kg_fiyati DROP NOT NULL,
  ALTER COLUMN para_birimi DROP NOT NULL,
  ADD CONSTRAINT satin_alma_kg_fiyati_iptal_satiri CHECK (CASE WHEN iptal_edilen_id IS NULL THEN kg_fiyati IS NOT NULL AND para_birimi IS NOT NULL
    ELSE kg_fiyati IS NULL AND para_birimi IS NULL AND talas_kg_fiyati IS NULL AND islem_katsayisi IS NULL AND araci_katsayisi IS NULL
      AND kaynak IS NULL AND btrim(aciklama) <> '' END);
-- Bir giriş en çok bir kez iptal edilir.
CREATE UNIQUE INDEX satin_alma_kg_fiyati_iptal_tek ON satin_alma_kg_fiyati (iptal_edilen_id) WHERE iptal_edilen_id IS NOT NULL;
