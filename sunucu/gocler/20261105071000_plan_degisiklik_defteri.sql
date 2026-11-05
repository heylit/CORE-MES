-- 2129-2 b: planı etkileyen her değişikliğin kalıcı defteri. Çalışmanın içindeki iz en çok 400 satır tutar ve bekleyen değişiklik
-- uygulanınca ya da reddedilince çalışmadan düşer; kimin neyi neden reddettiği sonradan kurulamaz. Satırı sunucu çalışma yazmasında
-- önceki ve yeni bekleyen listesinden çıkarır; kişi ve zaman sunucudandır. Yalnız ekleme: satır değişmez, silinmez. Tablo boş başlar.
CREATE TABLE plan_degisiklik_defteri (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- degisiklik: plan varken girilen değişiklik bekleyene düştü; kaynak: başka sayfanın değişikliği (kişisi bilinmez, kisi_id onu kaydedendir);
  -- uygulandi / reddedildi: karar; geri-alindi: değişiklik karar verilmeden geri alındı.
  olay text NOT NULL CONSTRAINT plan_degisiklik_defteri_olay CHECK (olay IN ('degisiklik', 'kaynak', 'uygulandi', 'reddedildi', 'geri-alindi')),
  bekleyen_id text NOT NULL CONSTRAINT plan_degisiklik_defteri_bekleyen_id CHECK (length(bekleyen_id) BETWEEN 1 AND 200),
  ne text NOT NULL CONSTRAINT plan_degisiklik_defteri_ne CHECK (length(ne) <= 500),
  ayrinti text NOT NULL DEFAULT '' CONSTRAINT plan_degisiklik_defteri_ayrinti CHECK (length(ayrinti) <= 2000),
  -- Etkilenen siparişler; '*' bütün işler.
  isler text[] NOT NULL DEFAULT '{}',
  gerekce text CONSTRAINT plan_degisiklik_defteri_gerekce CHECK (gerekce IS NULL OR (olay = 'reddedildi' AND length(gerekce) BETWEEN 1 AND 500)),
  kisi_id int NOT NULL CONSTRAINT plan_degisiklik_defteri_kisi REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_degisiklik_defteri_bekleyen_idx ON plan_degisiklik_defteri (bekleyen_id, id);
CREATE INDEX plan_degisiklik_defteri_kisi_idx ON plan_degisiklik_defteri (kisi_id);

CREATE TRIGGER plan_degisiklik_defteri_degismez BEFORE UPDATE OR DELETE ON plan_degisiklik_defteri
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER plan_degisiklik_defteri_bosaltilmaz BEFORE TRUNCATE ON plan_degisiklik_defteri
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
