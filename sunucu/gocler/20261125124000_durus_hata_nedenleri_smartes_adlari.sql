-- Duruş ve hata nedenlerini SmartES listesiyle eşitle (kart 3692, kullanıcı kararı c): eşleştirirken adlar aynı olsun.
-- Kurallar: (1) Kod ve kimlik değişmez, kayıtlar kimlikle bağlıdır; yalnız ad değişir. (2) Ad yalnız hâlâ kurulum adını taşıyan ve SmartES'te
-- aynı kategoride karşılığı olan satırda değişir; yönetici adı değiştirmişse ya da kategori farklıysa satır dokunulmadan pasife alınır (geçmiş
-- süre planlı/plansız sınıfını değiştirmesin). (3) Karşılığı olmayan eski nedenler silinmez, pasife alınır. (4) SmartES adı zaten bir nedende
-- varsa ikinci satır açılmaz. (5) FSN-HURDA ve FSN-GELMEDI sabit kodlardır, dokunulmaz. (6) Fireden "Rework (Yeniden İşleme)" ve
-- "Tezgahın Fazla M30 Yollaması" eklenmez: ikisi SmartES'te yeniden işleme işaretlidir, hurda sayılırsa fire oranı şişer.
-- Geri alma: durus_nedeni_goc_yedek / hurda_nedeni_goc_yedek eski adı, kategoriyi, aktifliği ve çağrıyı tutar (kurulum/devir notu 3692).

CREATE TABLE durus_nedeni_goc_yedek (
  goc text NOT NULL,
  neden_id int NOT NULL REFERENCES durus_nedeni,
  eklendi boolean NOT NULL,
  eski_ad text,
  eski_kategori text,
  eski_aktif boolean,
  eski_cagri_ekibi text,
  eski_cagri_gecikme_dk int,
  eski_surum int,
  PRIMARY KEY (goc, neden_id),
  CONSTRAINT durus_nedeni_goc_yedek_eski_butun CHECK (eklendi = (eski_ad IS NULL))
);

CREATE TABLE hurda_nedeni_goc_yedek (
  goc text NOT NULL,
  neden_id int NOT NULL REFERENCES hurda_nedeni,
  eklendi boolean NOT NULL,
  eski_ad text,
  eski_aktif boolean,
  eski_surum int,
  PRIMARY KEY (goc, neden_id),
  CONSTRAINT hurda_nedeni_goc_yedek_eski_butun CHECK (eklendi = (eski_ad IS NULL))
);

-- SmartES listesi (Arıza/Duruş ve Fire tanım listeleri, 25.11.2026 dışa aktarımı); geçici tablo iznimiz yok, yardımcı tablolar sonda silinir.
CREATE TABLE smartes_durus_liste (sira int, ad text, kategori text, aktif boolean);
INSERT INTO smartes_durus_liste VALUES
  (1, 'Aparat Bekleme (Başka Tezgahtan)', 'plansiz', true),
  (2, 'Aparat Tadilatı', 'plansiz', true),
  (3, 'Bakım', 'planli', true),
  (4, 'Belirsiz Duruş', 'plansiz', true),
  (5, 'CAM Program Bekleme', 'plansiz', true),
  (6, 'Cuma Namazı', 'planli', true),
  (7, 'Çay Molası', 'planli', true),
  (8, 'DOP/NC Eksikliği', 'plansiz', true),
  (9, 'Elektrik Kesintisi', 'plansiz', true),
  (10, 'Gece Tasarımcı Eksikliği', 'plansiz', false),
  (11, 'Hava Kesintisi', 'plansiz', true),
  (12, 'İş Aleti Bekleme', 'plansiz', true),
  (13, 'İş Emri Bekleme', 'plansiz', true),
  (14, 'Kalifiye Operatör Eksikliği', 'plansiz', true),
  (15, 'Kalite Onay Bekleme', 'planli', true),
  (16, 'Kalite Onay Bekleme (Gece Kalite Per. Olmaması)', 'plansiz', false),
  (17, 'Makine Arızası', 'plansiz', true),
  (18, 'Makine Enerji Problemi', 'plansiz', true),
  (19, 'Malzeme Ayarı (FAI / İlk Üretilen Parça)', 'planli', true),
  (20, 'Malzeme Bekleme (Alt Tedarikçiden)', 'plansiz', true),
  (21, 'Malzeme Bekleme (Depodan)', 'plansiz', true),
  (22, 'Malzeme Bekleme (Tesviyeden)', 'plansiz', true),
  (23, 'Malzeme Bekleme (Tezgahtan-Önceki Operasyon)', 'plansiz', true),
  (24, 'Malzeme Sök-Tak', 'plansiz', true),
  (25, 'Mastar Bekleme', 'plansiz', true),
  (26, 'Mastar Deneme-Ölçüm Yapma (Kalite Kontrol)', 'planli', true),
  (27, 'Müşteriden Onay Bekleme (Tasarımcı)', 'plansiz', true),
  (28, 'NC Programda Düzeltme (Operatör)', 'plansiz', true),
  (29, 'Operatör Eksikliği', 'plansiz', true),
  (30, 'Parçada Problem Düzeltme', 'plansiz', true),
  (31, 'Parçadan Talaş Temizleme', 'plansiz', true),
  (32, 'Sonraki Operasyon İçin Makine Bekleme(Kalite Onay)', 'plansiz', true),
  (33, 'Sorunlu Malzeme', 'plansiz', true),
  (34, 'Takım Bekleme', 'plansiz', true),
  (35, 'Takım Uç Değiştirme-Takım Sökme', 'plansiz', true),
  (36, 'Takım Uç Kontrol Etme', 'plansiz', true),
  (37, 'Talaş Arabası Boşaltma', 'plansiz', true),
  (38, 'Temizlik', 'planli', true),
  (39, 'Tezgahtaki Talaşı Temizleme', 'plansiz', true),
  (40, 'Üretim Sırasında Aparatı Ayarlama(Pim-Cıvata vb.)', 'planli', true),
  (41, 'Yemek Molası', 'planli', true);

CREATE TABLE smartes_fire_liste (sira int, ad text);
INSERT INTO smartes_fire_liste VALUES
  (1, 'Ham Malzeme Kaynaklı (Kılcal Çatlak, boşluk vb.)'),
  (2, 'Hatalı Offset Değeri Girme (Operatör)'),
  (3, 'Hatalı Offset Değeri Verme (Kalite Kontrol)'),
  (4, 'Kılavuzun Parça İçerisinde Kırılması'),
  (5, 'Parça Sıfır Alma (Operatör)'),
  (6, 'Parça Sıfır Hazırlama (CAM)'),
  (7, 'Takımın Boyunu Yanlış Ayarlama (CAM)'),
  (8, 'Takımın Boyunu Yanlış Ayarlama (Takımhane)'),
  (9, 'Takımın Boyunu Yanlış Girme (Operatör)'),
  (10, 'Uygun Olmayan Aparat Kullanma'),
  (11, 'Üretim Sırasında Malzemeye Zarar Verme'),
  (12, 'Yanlış Takım Ayarlama (Takımhane)'),
  (13, 'Yanlış Takım Bağlama (Operatör)'),
  (14, 'Yanlış/Hatalı Program Hazırlama (CAM)'),
  (15, 'Yanlış/Hatalı Program Kullanma (Operatör)'),
  (16, 'Yarı Mamül Kaynaklı (Alt Tedarik)(Alt Oper.)'),
  (17, 'Yarı Mamül Kaynaklı (TMI)(Alt Operasyonlar)'),
  (18, 'Yarı Mamülü Aparata Uygunsuz Montaj Yapma');

-- Eski kod -> yeni ad (kurulumdaki ad, SmartES adı).
CREATE TABLE neden_ad_donusumu (tur text, kod text, eski_ad text, yeni_ad text);
INSERT INTO neden_ad_donusumu VALUES
  ('durus', 'D-01', 'Malzeme bekleniyor', 'Malzeme Bekleme (Depodan)'),
  ('durus', 'D-02', 'Mekanik arıza', 'Makine Arızası'),
  ('durus', 'D-03', 'Elektrik / kontrol arızası', 'Elektrik Kesintisi'),
  ('durus', 'D-04', 'Takım / kalıp değişimi', 'Takım Uç Değiştirme-Takım Sökme'),
  ('durus', 'D-05', 'Kalite kontrol bekleniyor', 'Sonraki Operasyon İçin Makine Bekleme(Kalite Onay)'),
  ('durus', 'D-06', 'Program / CNC hatası', 'NC Programda Düzeltme (Operatör)'),
  ('durus', 'D-07', 'Operatör yok', 'Operatör Eksikliği'),
  ('durus', 'D-08', 'Planlı bakım', 'Bakım'),
  ('durus', 'D-09', 'Mola / yemek', 'Yemek Molası'),
  ('durus', 'D-12', 'Deneme / numune üretimi', 'Malzeme Ayarı (FAI / İlk Üretilen Parça)'),
  ('hurda', 'H-03', 'Malzeme hatası', 'Ham Malzeme Kaynaklı (Kılcal Çatlak, boşluk vb.)'),
  ('hurda', 'H-05', 'Takım kırılması', 'Kılavuzun Parça İçerisinde Kırılması');

-- Eşlenmeyen kurulum nedenleri (kurulum adını hâlâ taşıyorsa) pasife alınır.
CREATE TABLE neden_pasif_listesi (tur text, kod text, eski_ad text);
INSERT INTO neden_pasif_listesi VALUES
  ('durus', 'D-10', 'Toplantı / eğitim'),
  ('durus', 'D-11', 'İş emri yok'),
  ('hurda', 'H-01', 'Ölçü dışı'),
  ('hurda', 'H-02', 'Yüzey hatası'),
  ('hurda', 'H-04', 'Ayar parçası'),
  ('hurda', 'H-06', 'Çapak / şekil bozukluğu'),
  ('hurda', 'H-07', 'Diğer');

-- 1) Ad dönüşümü: kod, kurulum adı ve SmartES'teki kategori tutuyorsa; SmartES adı başka satırda yoksa.
INSERT INTO durus_nedeni_goc_yedek (goc, neden_id, eklendi, eski_ad, eski_kategori, eski_aktif, eski_cagri_ekibi, eski_cagri_gecikme_dk, eski_surum)
SELECT '20261125124000', d.id, false, d.ad, d.kategori, d.aktif, d.cagri_ekibi, d.cagri_gecikme_dk, d.surum
  FROM durus_nedeni d
  JOIN neden_ad_donusumu x ON x.tur = 'durus' AND x.kod = d.kod AND x.eski_ad = d.ad
  JOIN smartes_durus_liste s ON s.ad = x.yeni_ad AND s.kategori = d.kategori
 WHERE NOT EXISTS (SELECT 1 FROM durus_nedeni o WHERE lower(o.ad) = lower(x.yeni_ad));

UPDATE durus_nedeni d SET ad = x.yeni_ad, surum = d.surum + 1
  FROM neden_ad_donusumu x
 WHERE x.tur = 'durus' AND x.kod = d.kod AND EXISTS (
   SELECT 1 FROM durus_nedeni_goc_yedek y WHERE y.goc = '20261125124000' AND y.neden_id = d.id);

-- 2) Dönüşmeyen kurulum nedenleri (eşlenmeyenler ve kategorisi SmartES'ten farklı olanlar): ad aynı kalır, pasife alınır.
INSERT INTO durus_nedeni_goc_yedek (goc, neden_id, eklendi, eski_ad, eski_kategori, eski_aktif, eski_cagri_ekibi, eski_cagri_gecikme_dk, eski_surum)
SELECT '20261125124000', d.id, false, d.ad, d.kategori, d.aktif, d.cagri_ekibi, d.cagri_gecikme_dk, d.surum
  FROM durus_nedeni d
 WHERE d.aktif
   AND NOT EXISTS (SELECT 1 FROM durus_nedeni_goc_yedek y WHERE y.goc = '20261125124000' AND y.neden_id = d.id)
   AND ((d.kod, d.ad) IN (SELECT kod, eski_ad FROM neden_pasif_listesi WHERE tur = 'durus')
        OR (d.kod, d.ad) IN (SELECT kod, eski_ad FROM neden_ad_donusumu WHERE tur = 'durus'));
UPDATE durus_nedeni d SET aktif = false, surum = d.surum + 1
 WHERE d.aktif AND EXISTS (SELECT 1 FROM durus_nedeni_goc_yedek y WHERE y.goc = '20261125124000' AND y.neden_id = d.id AND y.eski_ad = d.ad AND y.eski_aktif)
   AND NOT EXISTS (SELECT 1 FROM neden_ad_donusumu x WHERE x.tur = 'durus' AND x.kod = d.kod AND x.yeni_ad = d.ad);

-- 3) SmartES'te olup CORE'da adı bulunmayan nedenler yeni satır olur (D-nn, listenin sonuna, çağrısız).
WITH eksik AS (
  SELECT s.*, row_number() OVER (ORDER BY s.sira) AS n
    FROM smartes_durus_liste s
   WHERE NOT EXISTS (SELECT 1 FROM durus_nedeni d WHERE lower(d.ad) = lower(s.ad))),
temel AS (
  SELECT COALESCE(max(substring(kod FROM '^D-(\d+)$')::int), 0) AS kod_son, COALESCE(max(sira), 0) AS sira_son FROM durus_nedeni),
eklenen AS (
  INSERT INTO durus_nedeni (kod, ad, kategori, aktif, sira)
  SELECT 'D-' || lpad((t.kod_son + e.n)::text, 2, '0'), e.ad, e.kategori, e.aktif, t.sira_son + e.n
    FROM eksik e CROSS JOIN temel t
  RETURNING id)
INSERT INTO durus_nedeni_goc_yedek (goc, neden_id, eklendi) SELECT '20261125124000', id, true FROM eklenen;

-- Hata nedenleri (fire): aynı kurallar.
INSERT INTO hurda_nedeni_goc_yedek (goc, neden_id, eklendi, eski_ad, eski_aktif, eski_surum)
SELECT '20261125124000', h.id, false, h.ad, h.aktif, h.surum
  FROM hurda_nedeni h
  JOIN neden_ad_donusumu x ON x.tur = 'hurda' AND x.kod = h.kod AND x.eski_ad = h.ad
 WHERE NOT EXISTS (SELECT 1 FROM hurda_nedeni o WHERE lower(o.ad) = lower(x.yeni_ad));
UPDATE hurda_nedeni h SET ad = x.yeni_ad, surum = h.surum + 1
  FROM neden_ad_donusumu x
 WHERE x.tur = 'hurda' AND x.kod = h.kod AND EXISTS (
   SELECT 1 FROM hurda_nedeni_goc_yedek y WHERE y.goc = '20261125124000' AND y.neden_id = h.id);

INSERT INTO hurda_nedeni_goc_yedek (goc, neden_id, eklendi, eski_ad, eski_aktif, eski_surum)
SELECT '20261125124000', h.id, false, h.ad, h.aktif, h.surum
  FROM hurda_nedeni h
  JOIN neden_pasif_listesi p ON p.tur = 'hurda' AND p.kod = h.kod AND p.eski_ad = h.ad
 WHERE h.aktif;
UPDATE hurda_nedeni h SET aktif = false, surum = h.surum + 1
 WHERE h.aktif AND EXISTS (SELECT 1 FROM hurda_nedeni_goc_yedek y WHERE y.goc = '20261125124000' AND y.neden_id = h.id AND y.eski_ad = h.ad AND y.eski_aktif);

WITH eksik AS (
  SELECT s.*, row_number() OVER (ORDER BY s.sira) AS n
    FROM smartes_fire_liste s
   WHERE NOT EXISTS (SELECT 1 FROM hurda_nedeni h WHERE lower(h.ad) = lower(s.ad))),
temel AS (
  SELECT COALESCE(max(substring(kod FROM '^H-(\d+)$')::int), 0) AS kod_son, COALESCE(max(sira), 0) AS sira_son FROM hurda_nedeni),
eklenen AS (
  INSERT INTO hurda_nedeni (kod, ad, sira)
  SELECT 'H-' || lpad((t.kod_son + e.n)::text, 2, '0'), e.ad, t.sira_son + e.n
    FROM eksik e CROSS JOIN temel t
  RETURNING id)
INSERT INTO hurda_nedeni_goc_yedek (goc, neden_id, eklendi) SELECT '20261125124000', id, true FROM eklenen;

DO $$
DECLARE
  d_yeni int := (SELECT count(*) FROM durus_nedeni_goc_yedek WHERE goc = '20261125124000' AND eklendi);
  d_eski int := (SELECT count(*) FROM durus_nedeni_goc_yedek WHERE goc = '20261125124000' AND NOT eklendi);
  h_yeni int := (SELECT count(*) FROM hurda_nedeni_goc_yedek WHERE goc = '20261125124000' AND eklendi);
  h_eski int := (SELECT count(*) FROM hurda_nedeni_goc_yedek WHERE goc = '20261125124000' AND NOT eklendi);
BEGIN
  RAISE NOTICE 'durus: % eklendi, % değişti; hata: % eklendi, % değişti', d_yeni, d_eski, h_yeni, h_eski;
END $$;

DROP TABLE smartes_durus_liste, smartes_fire_liste, neden_ad_donusumu, neden_pasif_listesi;
