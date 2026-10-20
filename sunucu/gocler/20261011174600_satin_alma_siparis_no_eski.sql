-- Var olan siparişler numara alır (kullanıcı kararı a, 11.10.2026): yıl sipariş tarihinden, yoksa talebin açılışından
-- (İstanbul); sıra o yıl içinde sipariş tarihi, talep numarası ve teklif kimliği sırasıyla. Sayaç son sıradan devam eder.
WITH sirali AS (
  SELECT p.talep_id, p.teklif_id,
         extract(year FROM coalesce(p.siparis_tarihi, (t.olusturma AT TIME ZONE 'Europe/Istanbul')::date))::smallint AS yil,
         row_number() OVER (
           PARTITION BY extract(year FROM coalesce(p.siparis_tarihi, (t.olusturma AT TIME ZONE 'Europe/Istanbul')::date))
           ORDER BY coalesce(p.siparis_tarihi, (t.olusturma AT TIME ZONE 'Europe/Istanbul')::date), t.yil, t.sira, p.teklif_id) AS sira
    FROM satin_alma_siparis p JOIN satin_alma_talep t ON t.id = p.talep_id
   WHERE p.no IS NULL
)
UPDATE satin_alma_siparis p SET no = 'SP-' || s.yil || '-' || lpad(s.sira::text, 3, '0')
  FROM sirali s WHERE p.talep_id = s.talep_id AND p.teklif_id = s.teklif_id;

INSERT INTO satin_alma_siparis_sayaci (yil, son_sira)
SELECT split_part(no, '-', 2)::smallint, max(split_part(no, '-', 3)::int) FROM satin_alma_siparis WHERE no IS NOT NULL GROUP BY 1
ON CONFLICT (yil) DO UPDATE SET son_sira = GREATEST(satin_alma_siparis_sayaci.son_sira, EXCLUDED.son_sira);
