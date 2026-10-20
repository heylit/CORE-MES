-- Arkon kaydı istasyonu ve iş merkezini kodla tutar; kod değişebildiği için yeni yazımlarda kimlik de tutulur (eski satıra dokunulmaz, doldurma yok).
-- İlk adım salt okuma sayımıdır: kodlu satır varsa kullanıcı onayı olmadan ilerlenmez.
DO $$
DECLARE
  kodlu bigint;
  belge_ozeti text;
BEGIN
  SELECT count(*) INTO kodlu FROM arkon_kayit WHERE makine IS NOT NULL OR is_merkezi IS NOT NULL;
  SELECT coalesce(string_agg(depo || '=' || adet, ', ' ORDER BY depo), 'yok') INTO belge_ozeti
    FROM (SELECT depo, count(*) AS adet FROM arkon_belge WHERE depo IN ('pkgs', 'requests', 'maint', 'logi', 'downs') GROUP BY depo) s;
  RAISE NOTICE 'arkon_kayit: istasyon ya da iş merkezi kodu dolu % satır; arkon_belge: %', kodlu, belge_ozeti;
  IF kodlu > 0 THEN
    RAISE EXCEPTION 'arkon_kayit''te kodlu % satır var; kimlik sütunları eklenmeden önce kullanıcı onayı gerekir', kodlu;
  END IF;
END $$;

-- Yabancı anahtar yok: istasyon ve iş merkezi tabloları başka modülün; kod çözülemezse kimlik boş kalır.
ALTER TABLE arkon_kayit ADD COLUMN istasyon_id int;
ALTER TABLE arkon_kayit ADD COLUMN is_merkezi_id int;
