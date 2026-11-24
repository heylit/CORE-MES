-- Ekran hatası kaydı (kart 3668, dilim C): istemcinin yakaladığı çizim hatası, yakalanmamış hata ve söz reddi; aynı hata tek satırda sayılır (90 gün).
-- Yeni, boş tablo; başka tabloya bağlanmaz (kişi numarası yalnız sayı: kişi silinse de kayıt anlamını korur). Satırı yalnız saglik modülü yazar
-- ve süresi geçeni siler. Sorgu dizgesi ve gövde hiçbir alana girmez.
CREATE TABLE saglik_ekran_hatasi (
  id bigint GENERATED ALWAYS AS IDENTITY CONSTRAINT saglik_ekran_hatasi_pk PRIMARY KEY,
  -- Sayfa + hata iletisi + yığının ilk satırından türeyen parmak izi; aynı hata aynı satıra sayılır.
  parmak_izi text NOT NULL CONSTRAINT saglik_ekran_hatasi_parmak_benzersiz UNIQUE,
  sayfa text NOT NULL CONSTRAINT saglik_ekran_hatasi_sayfa CHECK (length(sayfa) <= 200),
  hata text NOT NULL CONSTRAINT saglik_ekran_hatasi_hata CHECK (length(hata) BETWEEN 1 AND 300),
  yigin text CONSTRAINT saglik_ekran_hatasi_yigin CHECK (yigin IS NULL OR length(yigin) <= 2000),
  surum text CONSTRAINT saglik_ekran_hatasi_surum CHECK (surum IS NULL OR length(surum) <= 64),
  kez integer NOT NULL DEFAULT 1 CONSTRAINT saglik_ekran_hatasi_kez CHECK (kez >= 1),
  -- Hatayı görmüş ayrı kişiler (en çok 50 numara tutulur; sayı bunun uzunluğudur).
  kisiler integer[] NOT NULL DEFAULT '{}' CONSTRAINT saglik_ekran_hatasi_kisiler CHECK (cardinality(kisiler) <= 50),
  son_kisi_id integer,
  ilk_an timestamptz NOT NULL DEFAULT now(),
  son_an timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX saglik_ekran_hatasi_son_an ON saglik_ekran_hatasi (son_an DESC);
