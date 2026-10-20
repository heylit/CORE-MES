-- yalniz_ekleme() her modülün defterine bağlanan ortak tetikleyicidir; sahibi oturum göçü değil çekirdektir.
-- Davranış aynıdır; yerinde değiştirme işlevin kimliğini korur, var olan tetikleyiciler bağlı kalır.
CREATE OR REPLACE FUNCTION yalniz_ekleme() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% tablosuna yalnız ekleme yapılır', TG_TABLE_NAME;
END $$;
