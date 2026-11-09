-- Karne hesap sürümü 2 (2456; 2456-2 c, 2456-3 a). Veri silinmez ve dönüştürülmez: yeni tablo, varsayılanlı sütun, boş olabilen sütun.
-- Ağırlıklar sürümlüdür: her değişiklik yeni satırdır, eski satır değişmez; geçerli sürüm en büyük numaradır. Sürüm 1 eski 40/40/20
-- hesabıdır ve satırı yoktur (o dönemin yıllık karnelerinde hesap_surumu boş kalır).
CREATE TABLE musteri_tedarikci_karne_agirlik (
  surum integer PRIMARY KEY CONSTRAINT musteri_tedarikci_karne_agirlik_surum CHECK (surum >= 2),
  lot smallint NOT NULL CHECK (lot BETWEEN 0 AND 100),
  ppm smallint NOT NULL CHECK (ppm BETWEEN 0 AND 100),
  zamaninda smallint NOT NULL CHECK (zamaninda BETWEEN 0 AND 100),
  tam smallint NOT NULL CHECK (tam BETWEEN 0 AND 100),
  teklif smallint NOT NULL CHECK (teklif BETWEEN 0 AND 100),
  satin_alma smallint NOT NULL CHECK (satin_alma BETWEEN 0 AND 100),
  kalite smallint NOT NULL CHECK (kalite BETWEEN 0 AND 100),
  gerekce text NOT NULL CHECK (length(btrim(gerekce)) BETWEEN 1 AND 500),
  degistiren_id integer REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT musteri_tedarikci_karne_agirlik_toplam CHECK (lot + ppm + zamaninda + tam + teklif + satin_alma + kalite = 100),
  -- Yalnız göçün yazdığı başlangıç sürümü kişisizdir; ekrandan gelen her değişiklik kişiyle kaydedilir.
  CONSTRAINT musteri_tedarikci_karne_agirlik_kisili CHECK (surum = 2 OR degistiren_id IS NOT NULL)
);
INSERT INTO musteri_tedarikci_karne_agirlik (surum, lot, ppm, zamaninda, tam, teklif, satin_alma, kalite, gerekce)
VALUES (2, 25, 15, 25, 10, 5, 10, 10, 'Başlangıç ağırlıkları (2456 önizlemesi; 2403 Ek taslağı)');
-- Ağırlık geçmişi iz kaydıdır: değişiklik yeni sürüm olarak eklenir, eski sürüm değiştirilmez ve silinmez (Veri ve Güvenlik ön bakışı).
CREATE TRIGGER musteri_tedarikci_karne_agirlik_yalniz_ekleme BEFORE UPDATE OR DELETE ON musteri_tedarikci_karne_agirlik
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER musteri_tedarikci_karne_agirlik_bosaltma_yok BEFORE TRUNCATE ON musteri_tedarikci_karne_agirlik
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Elle puanın türü: mevcut satırlar satın alma değerlendirmesidir (ucu satin-alma.yaz ister).
ALTER TABLE musteri_tedarikci_hizmet_puani
  ADD COLUMN tur text NOT NULL DEFAULT 'satin-alma' CONSTRAINT musteri_tedarikci_hizmet_puani_tur CHECK (tur IN ('satin-alma', 'kalite'));
CREATE INDEX musteri_tedarikci_hizmet_puani_firma_tur ON musteri_tedarikci_hizmet_puani (firma_id, tur, olusturma);

-- Yıllık karne hangi sürümle ve hangi bileşenlerle hesaplandığını saklar; eski karneler boş kalır ve değişmez.
ALTER TABLE musteri_tedarikci_yillik_karne
  ADD COLUMN hesap_surumu integer CONSTRAINT musteri_tedarikci_yillik_karne_hesap_surumu REFERENCES musteri_tedarikci_karne_agirlik (surum),
  ADD COLUMN bilesenler jsonb CONSTRAINT musteri_tedarikci_yillik_karne_bilesenler CHECK (bilesenler IS NULL OR jsonb_typeof(bilesenler) = 'array'),
  ADD CONSTRAINT musteri_tedarikci_yillik_karne_surumlu CHECK ((hesap_surumu IS NULL) = (bilesenler IS NULL));
