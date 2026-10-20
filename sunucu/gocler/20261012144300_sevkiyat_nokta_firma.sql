-- Müşteri, tedarikçi ve fason noktası firmaya bağlanır (kart #836): firmanın sahibi finans, adı oradan okunur. Bağsız nokta kalır (kargo, diğer, elle girilen).
ALTER TABLE sevkiyat_noktasi ADD COLUMN firma_id int CONSTRAINT sevkiyat_noktasi_firma REFERENCES finans_firma (id),
  ADD CONSTRAINT sevkiyat_noktasi_firma_turu CHECK (firma_id IS NULL OR tur IN ('musteri', 'tedarikci', 'fason'));
-- Bir firmanın tek aktif noktası olur.
CREATE UNIQUE INDEX sevkiyat_noktasi_firma_tek ON sevkiyat_noktasi (firma_id) WHERE aktif AND firma_id IS NOT NULL;
