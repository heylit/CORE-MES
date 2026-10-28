-- 1099 a: teklif satırı kendi iskontosunu, terminini ve en az sipariş miktarını taşır; boş olan teklifin genel değerine düşer.
-- Satır iskontosu genel iskontodan önce uygulanır (satır, sonra genel); termin satırda varsa teklifin termininin yerine geçer.
-- En az miktar, kalem miktarı ondan küçükse alınacak (ve ödenecek) miktardır. Var olan satırlar boş kalır: toplamları değişmez.
ALTER TABLE satin_alma_teklif_satiri
  ADD COLUMN iskonto_yuzdesi numeric(6,3) CONSTRAINT satin_alma_teklif_satiri_iskonto CHECK (iskonto_yuzdesi BETWEEN 0 AND 100),
  ADD COLUMN termin_gun int CONSTRAINT satin_alma_teklif_satiri_termin CHECK (termin_gun BETWEEN 0 AND 3650),
  ADD COLUMN en_az_miktar numeric(18,4) CONSTRAINT satin_alma_teklif_satiri_en_az CHECK (en_az_miktar > 0);

CREATE OR REPLACE FUNCTION satin_alma_teklif_toplami(p_talep uuid, p_teklif uuid) RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT round(
    COALESCE((SELECT sum(s.birim_fiyat * GREATEST(k.miktar, s.en_az_miktar) * (1 - COALESCE(s.iskonto_yuzdesi, 0) / 100))
                FROM satin_alma_teklif_satiri s
                JOIN satin_alma_talep_kalemi k ON k.talep_id = s.talep_id AND k.id = s.kalem_id
               WHERE s.talep_id = q.talep_id AND s.teklif_id = q.id), 0) * (1 - q.iskonto_yuzdesi / 100)
    + CASE WHEN q.nakliye_dahil THEN 0 ELSE q.nakliye END + q.diger_masraf, 4)
  FROM satin_alma_teklif q WHERE q.talep_id = p_talep AND q.id = p_teklif
$$;

-- 1096 a: karar onaya gönderilince kur ve aylık faiz sabitlenir; kilidin zamanı sunucunundur. Kilitten önceki onay siparişe yetmez.
-- Var olan kararların kilidi yoktur: eski akışla (siparişte sabitlenen kur) sürer.
ALTER TABLE satin_alma_karar ADD COLUMN kur_kilidi timestamptz;
ALTER TABLE satin_alma_sabit_kur
  ADD COLUMN aylik_faiz_yuzdesi numeric(6,3) CONSTRAINT satin_alma_sabit_kur_faiz CHECK (aylik_faiz_yuzdesi BETWEEN 0 AND 100);
