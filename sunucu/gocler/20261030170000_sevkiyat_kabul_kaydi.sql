-- Depo kabulünün kaydı (1405 a): hangi mal kabul satırı geliş kaleminin ne kadarını kabul etti. Mal kabul düzeltmesi kabulü bu
-- kayıtla geri alır. Yeni tablo; dolu tablo değişmez. Bu göçten önceki kabullerin kaydı yoktur, onların düzeltmesi kalemi değiştirmez.
CREATE TABLE sevkiyat_kabul (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bekleyen_id int NOT NULL CONSTRAINT sevkiyat_kabul_bekleyen REFERENCES sevkiyat_bekleyen (id),
  -- Stokun mal kabul satırı; yön stok -> sevkiyat olduğu için yabancı anahtar bağlamada gelir. Bir satır tek kalemi kabul eder.
  mal_kabul_satiri_id bigint NOT NULL CONSTRAINT sevkiyat_kabul_satir_tek UNIQUE,
  adet numeric(18, 4) NOT NULL CONSTRAINT sevkiyat_kabul_adet CHECK (adet > 0),
  kisi_id int NOT NULL CONSTRAINT sevkiyat_kabul_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now(),
  geri_alindi timestamptz,
  geri_alan_kisi_id int CONSTRAINT sevkiyat_kabul_geri_alan REFERENCES kisi (id),
  CONSTRAINT sevkiyat_kabul_geri_alma_alanlari CHECK ((geri_alindi IS NULL) = (geri_alan_kisi_id IS NULL))
);
CREATE INDEX sevkiyat_kabul_bekleyen_idx ON sevkiyat_kabul (bekleyen_id);
