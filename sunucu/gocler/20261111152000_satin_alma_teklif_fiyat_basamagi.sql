-- 2975 (2974-1 a, 2974-2 a): tedarikçi adete göre ayrı fiyat verebilir. Taban fiyat teklif satırındaki birim fiyattır ve ilk basamaktır
-- (eşiği en az miktar); bu tablo üst basamakları tutar. Var olan satırlar dönüştürülmez: basamaksız teklifin toplamı aynı kalır.
CREATE TABLE satin_alma_teklif_fiyat_basamagi (
  talep_id uuid NOT NULL,
  teklif_id uuid NOT NULL,
  kalem_id uuid NOT NULL,
  esik numeric(18,4) NOT NULL CONSTRAINT satin_alma_teklif_fiyat_basamagi_esik CHECK (esik > 0),
  birim_fiyat numeric(18,4) NOT NULL CONSTRAINT satin_alma_teklif_fiyat_basamagi_fiyat CHECK (birim_fiyat >= 0),
  CONSTRAINT satin_alma_teklif_fiyat_basamagi_tekil UNIQUE (talep_id, teklif_id, kalem_id, esik),
  CONSTRAINT satin_alma_teklif_fiyat_basamagi_satir FOREIGN KEY (talep_id, teklif_id, kalem_id)
    REFERENCES satin_alma_teklif_satiri ON DELETE CASCADE
);

-- Alınan miktarın düştüğü en yüksek basamağın fiyatı; basamak yoksa ya da miktar ilk üst basamağın altındaysa taban fiyat.
-- Fiyatı okuyan her sorgu bunu kullanır: toplam, sipariş ve analiz aynı fiyatı görür.
CREATE FUNCTION satin_alma_etkin_birim_fiyat(p_talep uuid, p_teklif uuid, p_kalem uuid, p_taban numeric, p_miktar numeric)
RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT b.birim_fiyat FROM satin_alma_teklif_fiyat_basamagi b
      WHERE b.talep_id = p_talep AND b.teklif_id = p_teklif AND b.kalem_id = p_kalem AND b.esik <= p_miktar
      ORDER BY b.esik DESC LIMIT 1),
    p_taban)
$$;

-- Gövde 20261028100000 ile aynıdır; yalnız birim fiyat etkin basamaktan okunur (alınan miktar = GREATEST(kalem miktarı, en az miktar)).
CREATE OR REPLACE FUNCTION satin_alma_teklif_toplami(p_talep uuid, p_teklif uuid) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT round(
    COALESCE((SELECT sum(satin_alma_etkin_birim_fiyat(s.talep_id, s.teklif_id, s.kalem_id, s.birim_fiyat, GREATEST(k.miktar, s.en_az_miktar))
                         * GREATEST(k.miktar, s.en_az_miktar) * (1 - COALESCE(s.iskonto_yuzdesi, 0) / 100))
                FROM satin_alma_teklif_satiri s
                JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
               WHERE s.talep_id = q.talep_id AND s.teklif_id = q.id), 0) * (1 - q.iskonto_yuzdesi / 100)
    + CASE WHEN q.nakliye_dahil THEN 0 ELSE q.nakliye END + q.diger_masraf, 4)
  FROM satin_alma_teklif q WHERE q.talep_id = p_talep AND q.id = p_teklif
$$;
