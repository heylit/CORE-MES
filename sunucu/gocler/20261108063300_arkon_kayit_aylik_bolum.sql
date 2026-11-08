-- Arkon kaydı aylık bölümlenir (1765 teyit): yalnız eklenir ve zamanla sınırsız büyür. Satırlar ve kimlikler değişmez;
-- birincil anahtar (id, zaman) olur.
--
-- Bölümlü tablo tekilliği bölüm sütunu olmadan tutamaz. (tur, cid) tekilliği yinelenen gönderimi eler; (tur, cid, zaman)
-- yetmez: tabletin 12 saatten eski kaydına sunucu saati yazılır (kurallar.ts kayitZamani), yeniden gönderilen aynı kayıt
-- başka zamanla gelir ve iki kez sayılırdı. Tekillik bu yüzden bölümsüz, küçük, yalnız eklenen bir koruma tablosunda durur;
-- kayıt yazımı önce ona ekler (sorgular.ts kayitEkle).
DO $$
DECLARE
  kayit bigint;
  yansima bigint;
BEGIN
  SELECT count(*) INTO kayit FROM arkon_kayit;
  SELECT count(*) INTO yansima FROM arkon_tmi_yansima;
  RAISE NOTICE 'arkon_kayit % satır aylık bölümlere taşınıyor; arkon_tmi_yansima % satıra kayıt zamanı yazılıyor', kayit, yansima;
END $$;

CREATE TABLE arkon_kayit_cid (
  tur text NOT NULL,
  cid text NOT NULL,
  CONSTRAINT arkon_kayit_cid_pkey PRIMARY KEY (tur, cid)
);
CREATE TRIGGER arkon_kayit_cid_degismez BEFORE UPDATE OR DELETE ON arkon_kayit_cid
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER arkon_kayit_cid_bosaltilmaz BEFORE TRUNCATE ON arkon_kayit_cid
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
INSERT INTO arkon_kayit_cid (tur, cid) SELECT tur, cid FROM arkon_kayit;
ALTER TABLE arkon_kayit DROP CONSTRAINT arkon_kayit_cid_benzersiz;

-- Yansımanın kayda bağı bölüm sütununu da taşır (bölümlü tabloya yabancı anahtar tam birincil anahtara bağlanır).
ALTER TABLE arkon_tmi_yansima ADD COLUMN kayit_zaman timestamptz;
UPDATE arkon_tmi_yansima y SET kayit_zaman = k.zaman FROM arkon_kayit k WHERE k.id = y.kayit_id;
ALTER TABLE arkon_tmi_yansima ALTER COLUMN kayit_zaman SET NOT NULL;
ALTER TABLE arkon_tmi_yansima DROP CONSTRAINT arkon_tmi_yansima_kayit_id_fkey;

SELECT cekirdek_aylik_bolume_cevir('arkon_kayit', 'zaman', 6);

-- Kayda cid ile ulaşan okumalar (devralma) eski tekil dizinin yolunu korusun.
CREATE INDEX arkon_kayit_cid_idx ON arkon_kayit (tur, cid);
ALTER TABLE arkon_tmi_yansima ADD CONSTRAINT arkon_tmi_yansima_kayit_baglantisi
  FOREIGN KEY (kayit_id, kayit_zaman) REFERENCES arkon_kayit (id, zaman);
