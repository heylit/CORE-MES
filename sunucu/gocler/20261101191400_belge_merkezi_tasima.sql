-- Çizim Merkezi belge merkezine taşınır (ADR 0026, kararlar 1601 b ve 1631 a). Satır kopyalanmaz: tablolar, kısıtlar, dizinler,
-- diziler ve tetikleyiciler yeniden adlanır, kimlikler aynı kalır; başka tabloların yabancı anahtarları yeni ada kendiliğinden geçer.
-- Sayfa (`sayfa.cizimler`) ve uç yolları ayrı göçle değişir: o adları okuyan rol görünümü başka işin kilidinde.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema() AND c.relkind = 'r' AND c.relname LIKE 'cizimler\_%' LOOP
    EXECUTE format('ALTER TABLE %I RENAME TO %I', r.relname, 'belge_merkezi_' || substr(r.relname, 10));
  END LOOP;
  -- Dizin adı kısıt adıyla aynı olan (birincil ve tekil anahtar) kısıtla birlikte adlanır; önce kısıtlar.
  FOR r IN SELECT con.conname, cl.relname FROM pg_constraint con JOIN pg_class cl ON cl.oid = con.conrelid
             JOIN pg_namespace n ON n.oid = cl.relnamespace
            WHERE n.nspname = current_schema() AND con.conname LIKE 'cizimler\_%' LOOP
    EXECUTE format('ALTER TABLE %I RENAME CONSTRAINT %I TO %I', r.relname, r.conname, 'belge_merkezi_' || substr(r.conname, 10));
  END LOOP;
  FOR r IN SELECT c.relname, c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = current_schema() AND c.relkind IN ('i', 'S') AND c.relname LIKE 'cizimler\_%' LOOP
    EXECUTE format(CASE r.relkind WHEN 'i' THEN 'ALTER INDEX %I RENAME TO %I' ELSE 'ALTER SEQUENCE %I RENAME TO %I' END,
                   r.relname, 'belge_merkezi_' || substr(r.relname, 10));
  END LOOP;
  FOR r IN SELECT t.tgname, cl.relname FROM pg_trigger t JOIN pg_class cl ON cl.oid = t.tgrelid
             JOIN pg_namespace n ON n.oid = cl.relnamespace
            WHERE n.nspname = current_schema() AND NOT t.tgisinternal AND t.tgname LIKE 'cizimler\_%' LOOP
    EXECUTE format('ALTER TRIGGER %I ON %I RENAME TO %I', r.tgname, r.relname, 'belge_merkezi_' || substr(r.tgname, 10));
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
              WHERE n.nspname = current_schema() AND c.relname LIKE 'cizimler\_%') THEN
    RAISE EXCEPTION 'cizimler_ adlı nesne kaldı';
  END IF;
END $$;

-- Tetikleyici işlevi hata kısıt adını gövdesinde taşır; sunucu bu adlardan ileti seçer.
CREATE FUNCTION belge_merkezi_revizyon_degismez() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.durum <> 'taslak' THEN
      RAISE EXCEPTION 'Yayınlanmış revizyon silinmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'belge_merkezi_revizyon_silinmez';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.belge_id <> OLD.belge_id OR NEW.sira <> OLD.sira OR NEW.ozet <> OLD.ozet OR NEW.dosya_turu <> OLD.dosya_turu
      OR NEW."not" IS DISTINCT FROM OLD."not" OR NEW.yukleyen_id <> OLD.yukleyen_id OR NEW.yuklendi <> OLD.yuklendi THEN
    RAISE EXCEPTION 'Revizyonun dosyası değişmez' USING ERRCODE = 'check_violation', CONSTRAINT = 'belge_merkezi_revizyon_degismez';
  END IF;
  IF NOT ((OLD.durum = NEW.durum AND NEW.yayinlayan_id IS NOT DISTINCT FROM OLD.yayinlayan_id AND NEW.yayinlandi IS NOT DISTINCT FROM OLD.yayinlandi)
      OR (OLD.durum IN ('taslak', 'eski') AND NEW.durum = 'yayinda')
      OR (OLD.durum = 'yayinda' AND NEW.durum = 'eski' AND NEW.yayinlayan_id = OLD.yayinlayan_id AND NEW.yayinlandi = OLD.yayinlandi)) THEN
    RAISE EXCEPTION 'Revizyon durumu bu yöne geçmez (% -> %)', OLD.durum, NEW.durum
      USING ERRCODE = 'check_violation', CONSTRAINT = 'belge_merkezi_revizyon_durum_sirasi';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER belge_merkezi_revizyon_degismez ON belge_merkezi_revizyon;
CREATE TRIGGER belge_merkezi_revizyon_degismez BEFORE UPDATE OR DELETE ON belge_merkezi_revizyon
  FOR EACH ROW EXECUTE FUNCTION belge_merkezi_revizyon_degismez();
DROP FUNCTION cizimler_revizyon_degismez();

-- Yetki: işlem adları modülle birlikte değişir; rolün yetkisi aynı kalır. Yeni ad ekrandan önceden verilmiş olabilir: ekleme
-- çakışmada durmaz, eski ad sonra silinir.
INSERT INTO rol_islemi (rol_id, islem)
SELECT rol_id, 'belge-merkezi.' || split_part(islem, '.', 2) FROM rol_islemi
 WHERE islem IN ('cizimler.oku', 'cizimler.yaz', 'cizimler.yayinla')
ON CONFLICT (rol_id, islem) DO NOTHING;
DELETE FROM rol_islemi WHERE islem IN ('cizimler.oku', 'cizimler.yaz', 'cizimler.yayinla');

-- Dosya bağı modül adıyla tutulur (ADR 0009); bağlı dosyalar yeni adla bağlı kalır.
UPDATE dosya_bagi SET modul = 'belge-merkezi' WHERE modul = 'cizimler';

-- Değişiklik yönetimi olay günlüğü yalnız eklenir; eski değerli satır varsa kısıt kurulamaz ve göç durur (satır elle değerlendirilir).
ALTER TABLE degisiklik_yonetimi_olay DROP CONSTRAINT degisiklik_yonetimi_olay_ilgili_degeri;
ALTER TABLE degisiklik_yonetimi_olay ADD CONSTRAINT degisiklik_yonetimi_olay_ilgili_degeri CHECK (
  ilgili IN ('uretim-emirleri', 'rota', 'belge-merkezi', 'malzemeler', 'stok', 'plan', 'kalite-merkezi', 'sevkiyat')
);
