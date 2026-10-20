-- Karar 146 a: yetkinliği kimin, ne zaman, neye dayanarak ve ne zamana kadar verdiği tutulur, geçmişi saklanır; süresi dolan yetkinlikle
-- iş başlamaz. Var olan satırlarda veren ve verilme bilinmez (boş kalır); geçerlilik bitişi boş "süresiz" demektir.
ALTER TABLE istasyonlar_yetkinlik
  ADD COLUMN veren_kisi_id int CONSTRAINT istasyonlar_yetkinlik_veren_fkey REFERENCES kisi,
  ADD COLUMN verilme timestamptz,
  ADD COLUMN gecerlilik_bitis date,
  ADD COLUMN dayanak text CONSTRAINT istasyonlar_yetkinlik_dayanak_dolu CHECK (dayanak IS NULL OR btrim(dayanak) <> ''),
  ADD COLUMN surum integer NOT NULL DEFAULT 1;

-- Yetkinlik defteri: verme, değiştirme ve kaldırma; satır değişmez, silinmez. İstasyon silinebildiği için (yetkinliği onunla gider)
-- istasyona yabancı anahtar yoktur; defter istasyonun o günkü kodunu taşır.
CREATE TABLE istasyonlar_yetkinlik_gecmisi (
  id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT istasyonlar_yetkinlik_gecmisi_pk PRIMARY KEY,
  kisi_id int NOT NULL CONSTRAINT istasyonlar_yetkinlik_gecmisi_kisi_fkey REFERENCES kisi,
  istasyon_id int NOT NULL,
  istasyon_kod text NOT NULL,
  islem text NOT NULL CONSTRAINT istasyonlar_yetkinlik_gecmisi_islem_secenek CHECK (islem IN ('ver', 'degistir', 'kaldir')),
  gecerlilik_bitis date,
  dayanak text,
  degistiren_kisi_id int NOT NULL CONSTRAINT istasyonlar_yetkinlik_gecmisi_degistiren_fkey REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX istasyonlar_yetkinlik_gecmisi_kisi ON istasyonlar_yetkinlik_gecmisi (kisi_id, zaman, id);
CREATE TRIGGER istasyonlar_yetkinlik_gecmisi_yalniz_ekleme BEFORE UPDATE OR DELETE ON istasyonlar_yetkinlik_gecmisi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER istasyonlar_yetkinlik_gecmisi_bosaltma_yok BEFORE TRUNCATE ON istasyonlar_yetkinlik_gecmisi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
