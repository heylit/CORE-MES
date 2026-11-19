-- 3429-3 F2: satış siparişinin "Stoktan" kalemi onayda depoya ayırma isteği açar. Talep alanları yalnız satın alma kaynağında dolu,
-- sipariş kaynağında sipariş ve kalem kimliği dolu; talep_no belgenin numarasıdır (sipariş no). Mevcut satırlar 'satin-alma' kalır, veri dönüştürülmez.
ALTER TABLE stok_ayirma_istegi DROP CONSTRAINT stok_ayirma_istegi_kaynak_degeri;
ALTER TABLE stok_ayirma_istegi ADD CONSTRAINT stok_ayirma_istegi_kaynak_degeri CHECK (kaynak IN ('satin-alma', 'siparis'));
ALTER TABLE stok_ayirma_istegi ALTER COLUMN talep_id DROP NOT NULL, ALTER COLUMN kalem_id DROP NOT NULL;
ALTER TABLE stok_ayirma_istegi ADD COLUMN siparis_id integer, ADD COLUMN siparis_satiri_id integer;
ALTER TABLE stok_ayirma_istegi ADD CONSTRAINT stok_ayirma_istegi_kaynak_butun CHECK (
  CASE kaynak
    WHEN 'satin-alma' THEN talep_id IS NOT NULL AND kalem_id IS NOT NULL AND siparis_id IS NULL AND siparis_satiri_id IS NULL
    ELSE talep_id IS NULL AND kalem_id IS NULL AND siparis_id IS NOT NULL AND siparis_satiri_id IS NOT NULL
  END);
-- Sipariş kalemi başına tek açık istek: onay tekrarlansa da istek çiftlenmez.
CREATE UNIQUE INDEX stok_ayirma_istegi_siparis_satiri_acik ON stok_ayirma_istegi (siparis_satiri_id) WHERE durum IN ('bekliyor', 'ayrildi');
