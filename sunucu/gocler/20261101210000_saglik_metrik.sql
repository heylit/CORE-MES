-- Sağlık metrikleri (kart 1662, karar 1619 a): dakikalık ölçü 14 gün, saatlik özet 13 ay veritabanında kalır.
-- Yeni, boş iki tablo; başka tabloya bağlanmaz. Satırı yalnız saglik modülünün dakikalık işi yazar ve süresi geçeni siler.
-- Ölçünün biçimi sözleşmedeki dakika (paylasilan/sozlesme/saglik.ts) ve kurallar.ts'teki saat özetidir; alan eklendikçe
-- göç gerekmesin diye jsonb'dir. Sorgu yalnız zamana göre yapılır.
CREATE TABLE saglik_metrik_dakika (
  an timestamptz CONSTRAINT saglik_metrik_dakika_pk PRIMARY KEY,
  veri jsonb NOT NULL CONSTRAINT saglik_metrik_dakika_veri CHECK (jsonb_typeof(veri) = 'object')
);

CREATE TABLE saglik_metrik_saat (
  saat timestamptz CONSTRAINT saglik_metrik_saat_pk PRIMARY KEY
    CONSTRAINT saglik_metrik_saat_basi CHECK (saat = date_trunc('hour', saat, 'UTC')),
  veri jsonb NOT NULL CONSTRAINT saglik_metrik_saat_veri CHECK (jsonb_typeof(veri) = 'object')
);
