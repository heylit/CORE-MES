-- 2099-2 c (kart 2099): lotun son kullanma tarihi ayrı tablodadır; dolu ve yalnız eklenen stok_parti tablosuna dokunulmaz. Satır mal
-- kabulde SKT takibi işaretli kartın (malzemeler, 2099-3 b) lotu için yazılır; lot başına tek tarih. Düzeltme yalnız müdürün ayrı işlemiyle
-- (stok.skt-onayla) yapılır ve eski/yeni değer, kişiyle değişiklik defterine düşer (denetim modülünün ortak tetik işlevi). Var olan
-- lotlara satır açılmaz: bugün hiçbir lotun tarihi yoktur, uydurulmaz.
CREATE TABLE stok_parti_son_kullanma (
  parti_id bigint PRIMARY KEY CONSTRAINT stok_parti_son_kullanma_parti_var REFERENCES stok_parti,
  son_kullanma date NOT NULL,
  kisi_id int NOT NULL CONSTRAINT stok_parti_son_kullanma_kisi_var REFERENCES kisi,
  kayit_zamani timestamptz NOT NULL DEFAULT now(),
  guncelleme timestamptz,
  surum integer NOT NULL DEFAULT 1
);
-- Önce bozulan önce çıkar (2099-4 a) ve geçmiş tarih sorgusu tarihe göre okur.
CREATE INDEX stok_parti_son_kullanma_tarih_idx ON stok_parti_son_kullanma (son_kullanma);

CREATE TRIGGER stok_parti_son_kullanma_degisiklik AFTER UPDATE OR DELETE ON stok_parti_son_kullanma
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('parti_id', 'surum');
