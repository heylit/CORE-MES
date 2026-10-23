-- Eski/yeni değer defteri (392 a): değişen tablonun satırını kim, ne zaman, hangi alanda neyden neye değiştirdi.
-- Denetim kaydı komutu tutar; bu defter komutun dokunduğu satırın önceki değerini tutar. Yazan uç değil tetiktir:
-- göçle ya da arka işle yapılan değişim de girer, o zaman kişi boştur.
CREATE TABLE denetim_degisiklik (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zaman timestamptz NOT NULL DEFAULT now(),
  kisi_id int REFERENCES kisi,
  tablo text NOT NULL,
  -- Satırın birincil anahtar değerleri: {"id": 5} ya da {"kisi_id": 3, "rol_id": 2}.
  anahtar jsonb NOT NULL,
  islem text NOT NULL CONSTRAINT denetim_degisiklik_islem CHECK (islem IN ('ekle', 'guncelle', 'sil')),
  -- {"alan": {"eski": ..., "yeni": ...}}; jsonb nesne sütununda üst anahtar düzeyinde "sutun.anahtar".
  alanlar jsonb NOT NULL CONSTRAINT denetim_degisiklik_alanlar CHECK (jsonb_typeof(alanlar) = 'object' AND alanlar <> '{}')
);
CREATE INDEX denetim_degisiklik_zaman ON denetim_degisiklik (zaman DESC, id DESC);
CREATE INDEX denetim_degisiklik_tablo ON denetim_degisiklik (tablo, zaman DESC);
CREATE INDEX denetim_degisiklik_kisi ON denetim_degisiklik (kisi_id, zaman DESC);

CREATE TRIGGER denetim_degisiklik_degismez BEFORE UPDATE OR DELETE ON denetim_degisiklik
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER denetim_degisiklik_bosaltilmaz BEFORE TRUNCATE ON denetim_degisiklik
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Modül kendi tablosuna bağlar:
--   CREATE TRIGGER <tablo>_degisiklik AFTER UPDATE OR DELETE ON <tablo>
--     FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum', 'guncelleme');
-- 1. argüman birincil anahtar sütunları (virgülle), sonrakiler deftere girmeyen teknik sütunlar.
-- Kişi, yazma ucunun transaction başında verdiği `tmiv2.kisi_id` oturum değişkenidir; yoksa ya da sayı değilse boş kalır.
-- Eksik alan ile null aynıdır: eklemede ve silmede boş sütun yazılmaz. Hiç alan değişmediyse satır yazılmaz: aynı değerle
-- yapılan güncelleme defteri şişirmez.
CREATE FUNCTION denetim_degisiklik_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  eski jsonb := CASE WHEN TG_OP = 'INSERT' THEN '{}'::jsonb ELSE to_jsonb(OLD) END;
  yeni jsonb := CASE WHEN TG_OP = 'DELETE' THEN '{}'::jsonb ELSE to_jsonb(NEW) END;
  satir jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  anahtar_sutunlari text[] := string_to_array(TG_ARGV[0], ',');
  disarida text[] := COALESCE(TG_ARGV[1:TG_NARGS - 1], '{}');
  anahtar jsonb := '{}'::jsonb;
  alanlar jsonb := '{}'::jsonb;
  kisi_metni text := current_setting('tmiv2.kisi_id', true);
  sutun text;
  ic text;
  e jsonb;
  y jsonb;
BEGIN
  IF TG_NARGS < 1 THEN
    RAISE EXCEPTION 'denetim_degisiklik_yaz: birincil anahtar sütunları verilmedi (%)', TG_TABLE_NAME;
  END IF;
  FOREACH sutun IN ARRAY anahtar_sutunlari LOOP
    IF NOT satir ? sutun THEN
      RAISE EXCEPTION 'denetim_degisiklik_yaz: % tablosunda % sütunu yok', TG_TABLE_NAME, sutun;
    END IF;
    anahtar := anahtar || jsonb_build_object(sutun, satir -> sutun);
  END LOOP;
  FOR sutun IN SELECT k FROM jsonb_object_keys(eski || yeni) AS k LOOP
    CONTINUE WHEN sutun = ANY (disarida);
    e := COALESCE(eski -> sutun, 'null'::jsonb);
    y := COALESCE(yeni -> sutun, 'null'::jsonb);
    IF TG_OP = 'UPDATE' AND jsonb_typeof(e) = 'object' AND jsonb_typeof(y) = 'object' THEN
      FOR ic IN SELECT k FROM jsonb_object_keys(e || y) AS k LOOP
        IF COALESCE(e -> ic, 'null'::jsonb) <> COALESCE(y -> ic, 'null'::jsonb) THEN
          alanlar := alanlar || jsonb_build_object(sutun || '.' || ic,
            jsonb_build_object('eski', COALESCE(e -> ic, 'null'::jsonb), 'yeni', COALESCE(y -> ic, 'null'::jsonb)));
        END IF;
      END LOOP;
    ELSIF e <> y THEN
      alanlar := alanlar || jsonb_build_object(sutun, jsonb_build_object('eski', e, 'yeni', y));
    END IF;
  END LOOP;
  IF alanlar <> '{}'::jsonb THEN
    INSERT INTO denetim_degisiklik (kisi_id, tablo, anahtar, islem, alanlar)
    VALUES (
      CASE WHEN kisi_metni ~ '^[1-9][0-9]{0,8}$' THEN kisi_metni::int END,
      TG_TABLE_NAME, anahtar,
      CASE TG_OP WHEN 'INSERT' THEN 'ekle' WHEN 'UPDATE' THEN 'guncelle' ELSE 'sil' END,
      alanlar
    );
  END IF;
  RETURN NULL;
END $$;
