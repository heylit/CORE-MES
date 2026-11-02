-- Sır özeti (pin_ozeti, kart_ozeti, belirtec_ozeti) değişiklik defterine yazılmaz: kısa PIN'in özeti çevrimdışı denenerek
-- çözülür. Kural tetik bağlayan her modülde bağlama argümanına bırakılmaz; adı _ozeti ile biten sütun hiçbir tabloda girmez.
-- Yazılmış satırlar silinemez tabloda kalır; okuma maskesi (denetim kurallar.ts) onları gizler.
CREATE OR REPLACE FUNCTION denetim_degisiklik_yaz() RETURNS trigger LANGUAGE plpgsql AS $$
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
    CONTINUE WHEN sutun = ANY (disarida) OR sutun LIKE '%\_ozeti';
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
