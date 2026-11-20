-- 3494-3 a: Üretim Hazırlık'ın iş emrine özel ek maddesi emrin hazırlık listesine (emir_adimi) taşınır; tek liste kalır.
-- Kaldırılan madde iz bırakır: listeye 'kaldir' olayı eklenir (son olay; kaldırılan madde listede, terminalde ve matriste sayılmaz).
-- Arkon tabloları silinmez, salt okunur kalır (yazan kod kalkar). Taşınan madde hazırlık aşamasındadır, kontrolsüzdür (onay); ekleyeni ve
-- zamanı korunur; tamamlanmış maddenin tamamla olayı tamamlayanı ve zamanıyla yazılır ('adim-durumu' kaynağı: ofisten işaretlendi).
-- Kaldırılmış madde taşınmaz. Matrisin "Ek madde" sütunu kapanır: maddeler artık "Hazırlık talimatı" sütununda sayılır.
ALTER TABLE emir_adimi_olayi
  DROP CONSTRAINT emir_adimi_olayi_olay_degeri,
  ADD CONSTRAINT emir_adimi_olayi_olay_degeri CHECK (olay IN ('tamamla', 'geri-al', 'kaldir'));

-- Sıra iş emrinin var olan listesinin sonundan sürer (adım listesinde sıra iş emri içinde tekildir).
WITH kaynak AS (
  SELECT i.uretim_emri_id AS emir_id, m.is_emri_id, m.ad, m.kisi_id, m.zaman, o.olay, o.kisi_id AS olay_kisi, o.zaman AS olay_zaman,
         COALESCE((SELECT max(a.sira) FROM emir_adimi a WHERE a.emir_id = i.uretim_emri_id AND a.is_emri_id = m.is_emri_id), 0)
           + row_number() OVER (PARTITION BY m.is_emri_id ORDER BY m.id) AS sira
    FROM arkon_hazirlik_maddesi m
    JOIN uretim_emirleri_is_emri i ON i.id = m.is_emri_id
    LEFT JOIN LATERAL (SELECT olay, kisi_id, zaman FROM arkon_hazirlik_maddesi_olayi WHERE madde_id = m.id ORDER BY id DESC LIMIT 1) o ON true
   WHERE o.olay IS DISTINCT FROM 'kaldir'
),
eklenen AS (
  INSERT INTO emir_adimi (emir_id, is_emri_id, sira, ad, asama, ekleyen_id, eklenme)
  SELECT emir_id, is_emri_id, sira, ad, 'hazirlik', kisi_id, zaman FROM kaynak
  RETURNING id, is_emri_id, sira
)
INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay, zaman, kaynak)
SELECT e.id, k.olay_kisi, 'tamamla', k.olay_zaman, 'adim-durumu'
  FROM eklenen e JOIN kaynak k ON k.is_emri_id = e.is_emri_id AND k.sira = e.sira
 WHERE k.olay = 'tamamla';

UPDATE uretim_emirleri_hazirlik_maddesi SET acik = false, surum = surum + 1, degisti = now() WHERE kod = 'ek-madde' AND acik;
