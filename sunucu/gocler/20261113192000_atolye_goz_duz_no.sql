-- 3168: raf kodlaması "raf kodu ve sıra numarası" (A1, A2 ...) seçilebilir. Numara göze bir kez verilir ve saklanır: sonradan
-- eklenen bölme ya da göz sıradaki numarayı alır, var olan gözün kodu kaymaz (eski etiket başka gözü göstermez). Silinen
-- gözün numarası yeniden verilmez; sırayı yeniden kurmak ayrı komuttur (yeniden numarala).
-- Ilk numara bugünkü düzenle verilir: bölmeler soldan sağa, bölmedeki göz sütunları soldan sağa, her sütun aşağıdan yukarı.
-- Yeni sütun boş başlar ve dolduran sorgu her yeni göze numara verir; NOT NULL yazılmadı (2380 a: varsayılansız NOT NULL sorulur).

ALTER TABLE atolye_goz ADD COLUMN duz_no smallint,
  ADD CONSTRAINT atolye_goz_duz_no_araligi CHECK (duz_no BETWEEN 1 AND 9999),
  -- Ertelenmiş: yeniden numaralamada iki göz aynı kayıtta numara değiştirir.
  ADD CONSTRAINT atolye_goz_duz_no_tek UNIQUE (raf_id, duz_no) DEFERRABLE INITIALLY DEFERRED;

-- Rafın verdiği en büyük numara: silinen gözün numarası yeniden verilmesin diye saklanır.
ALTER TABLE atolye_raf ADD COLUMN son_duz_no smallint NOT NULL DEFAULT 0,
  ADD CONSTRAINT atolye_raf_son_duz_no_araligi CHECK (son_duz_no BETWEEN 0 AND 9999);

UPDATE atolye_goz g
   SET duz_no = ((g.bolme - 1) * r.goz_sayisi + (g.goz - 1)) * r.kat_sayisi + g.kat
  FROM atolye_raf r
 WHERE r.id = g.raf_id;

UPDATE atolye_raf r
   SET son_duz_no = COALESCE((SELECT max(g.duz_no) FROM atolye_goz g WHERE g.raf_id = r.id), 0);
