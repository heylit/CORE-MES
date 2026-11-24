-- 3675 D2: değişen fatura okuması (iptal dahil) ve önceki dönemi bir süre daha okuma için imleç sütunları.
ALTER TABLE logo_fatura_baslik ADD COLUMN logo_degisme text;

ALTER TABLE logo_fatura_cari_imleci ADD COLUMN degisme text;
-- DEFAULT var: varsayılansız NOT NULL eklenmez (Risk N6); mevcut satırlar ilk okumayı son okumayla doldurur.
ALTER TABLE logo_fatura_cari_imleci ADD COLUMN ilk_okuma timestamptz NOT NULL DEFAULT now();
UPDATE logo_fatura_cari_imleci SET ilk_okuma = son_okuma;
ALTER TABLE logo_fatura_cari_imleci DROP CONSTRAINT logo_fatura_cari_imleci_akis;
ALTER TABLE logo_fatura_cari_imleci ADD CONSTRAINT logo_fatura_cari_imleci_akis
  CHECK (akis IN ('fatura-satis', 'fatura-alis', 'fatura-satis-iade', 'fatura-alis-iade', 'fatura-degisen', 'cari-hareket'));

-- Kaynak başına son okuma başarısızlığı (Risk N5): sağlık ekranında görünür, okuma başarılı olunca silinir.
CREATE TABLE logo_fatura_cari_hata (
  anahtar text PRIMARY KEY CONSTRAINT logo_fatura_cari_hata_anahtar CHECK (btrim(anahtar) <> ''),
  zaman timestamptz NOT NULL,
  ileti text NOT NULL
);
