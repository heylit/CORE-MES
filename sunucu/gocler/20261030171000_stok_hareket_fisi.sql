-- Hareket fişi (1385 a, kart 1414): her stok hareketi bir fişe bağlıdır; fişsiz hareket yazılamaz. Fiş komut (işlem) başına, hareket
-- türü grubu başına tektir. Logo malzeme fişi, mal kabul ve teslim fişi kendi belgeleri olarak kalır; hareket fişi onların yerine geçmez.
-- Bu göçten önceki hareketler tek "açılış fişi"ne bağlanır; stok_hareketi satırlarına dokunulmaz. Açılış fişinin hareketlerinin
-- akışı bilinmez: elle yazılmış sayılır.
DO $$
DECLARE n bigint;
BEGIN
  SELECT count(*) INTO n FROM stok_hareketi;
  RAISE NOTICE 'stok_hareket_fisi: % hareket acilis fisine baglanir, hareket satirlari degismez.', n;
END $$;

CREATE TABLE stok_hareket_fisi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  no text GENERATED ALWAYS AS ('HF-' || CASE WHEN id < 1000000 THEN lpad(id::text, 6, '0') ELSE id::text END) STORED,
  tur text NOT NULL CONSTRAINT stok_hareket_fisi_tur_degeri CHECK (tur IN ('giris', 'cikis', 'transfer', 'sayim', 'geri_alma', 'acilis')),
  -- Fişi açan işlem: aynı komutun aynı gruptaki hareketleri tek fiştedir. Açılış fişi bir işleme ait değildir.
  islem_kimligi xid8,
  zaman timestamptz NOT NULL DEFAULT now(),
  kisi_id int REFERENCES kisi,
  -- Hareketi yazan akış (1388 a): terminal, fason, sevk, kalite, cnc, emir. Boşsa hareket Stok Merkezi'nde elle yazılmıştır.
  -- Akışın yazdığı hareket Stok Merkezi'nden elle geri alınmaz; yalnız yazan akış geri alır.
  akis text CONSTRAINT stok_hareket_fisi_akis_degeri CHECK (akis IN ('terminal', 'fason', 'sevk', 'kalite', 'cnc', 'emir')),
  CONSTRAINT stok_hareket_fisi_no_tek UNIQUE (no),
  CONSTRAINT stok_hareket_fisi_islem_bagi CHECK ((islem_kimligi IS NULL) = (tur = 'acilis')),
  CONSTRAINT stok_hareket_fisi_kisi_bagi CHECK ((kisi_id IS NULL) = (tur = 'acilis')),
  CONSTRAINT stok_hareket_fisi_acilis_akissiz CHECK (tur <> 'acilis' OR akis IS NULL)
);
CREATE UNIQUE INDEX stok_hareket_fisi_islem_turu_tek ON stok_hareket_fisi (islem_kimligi, tur, (COALESCE(akis, ''))) WHERE islem_kimligi IS NOT NULL;
CREATE UNIQUE INDEX stok_hareket_fisi_acilis_tek ON stok_hareket_fisi (tur) WHERE tur = 'acilis';
CREATE INDEX stok_hareket_fisi_zaman_idx ON stok_hareket_fisi (zaman DESC, id DESC);
CREATE TRIGGER stok_hareket_fisi_degismez BEFORE UPDATE OR DELETE ON stok_hareket_fisi FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_hareket_fisi_bosaltilmaz BEFORE TRUNCATE ON stok_hareket_fisi FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

CREATE TABLE stok_hareket_fisi_satiri (
  hareket_id bigint PRIMARY KEY REFERENCES stok_hareketi,
  fis_id int NOT NULL REFERENCES stok_hareket_fisi
);
CREATE INDEX stok_hareket_fisi_satiri_fis_idx ON stok_hareket_fisi_satiri (fis_id, hareket_id);
CREATE TRIGGER stok_hareket_fisi_satiri_degismez BEFORE UPDATE OR DELETE ON stok_hareket_fisi_satiri FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER stok_hareket_fisi_satiri_bosaltilmaz BEFORE TRUNCATE ON stok_hareket_fisi_satiri FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Açılış fişi yalnız hareket varsa açılır (boş fiş yok).
INSERT INTO stok_hareket_fisi (tur) SELECT 'acilis' WHERE EXISTS (SELECT 1 FROM stok_hareketi);
INSERT INTO stok_hareket_fisi_satiri (hareket_id, fis_id)
SELECT h.id, f.id FROM stok_hareketi h CROSS JOIN stok_hareket_fisi f WHERE f.tur = 'acilis';

-- Fişsiz hareket işlemin sonunda reddedilir: hareket ile fiş satırı aynı işlemde, hangi sırayla yazılırsa yazılsın birlikte girer.
CREATE FUNCTION stok_hareketi_fis_denetle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM stok_hareket_fisi_satiri WHERE hareket_id = NEW.id) THEN
    RAISE EXCEPTION 'Stok hareketi % fişe bağlı değil; fişsiz hareket yazılamaz', NEW.id USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER stok_hareketi_fisli AFTER INSERT ON stok_hareketi
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION stok_hareketi_fis_denetle();
