-- 2663 (2661 a, Veri ön bakışı): taban gizli genel gider oranlı ayda alındıysa planı ve genel gider kalemi her okumada gizlidir.
-- Varsayılanlı sütun; eski satırlar gizli değildir (o aylarda gizli oran yoktu), veri dönüşmez.
ALTER TABLE proje_maliyet_taban ADD COLUMN genel_gider_gizli boolean NOT NULL DEFAULT false;
