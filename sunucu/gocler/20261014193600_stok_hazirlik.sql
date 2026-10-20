-- Hazırlık (toplama ve malzeme isteği birleşti): liste bir teslim yerine toplanabilir ve malzeme isteklerini karşılayabilir.
-- Yalnız iki yeni, boş tablo; var olan toplama listeleri ve istekler değişmez (hedefsiz liste eskisi gibi sevk çıkışı yazar).

-- Hedef: toplanan her adım bu konuma taşınır (raf gözü, zemin, kabul ya da istasyonun stok konumu). Satır yoksa sevk çıkışıdır.
CREATE TABLE stok_toplama_hedefi (
  toplama_id int PRIMARY KEY CONSTRAINT stok_toplama_hedefi_liste_var REFERENCES stok_toplama,
  konum_id int NOT NULL CONSTRAINT stok_toplama_hedefi_konum_var REFERENCES stok_konum
);

-- Listenin karşıladığı istekler. Bir istek aynı anda tek listededir; liste iptal edilince bağ silinir, istek yeniden listelenebilir.
CREATE TABLE stok_toplama_istegi (
  istek_id int PRIMARY KEY CONSTRAINT stok_toplama_istegi_istek_var REFERENCES stok_malzeme_istegi,
  toplama_id int NOT NULL CONSTRAINT stok_toplama_istegi_liste_var REFERENCES stok_toplama
);
CREATE INDEX stok_toplama_istegi_liste_idx ON stok_toplama_istegi (toplama_id);
