-- Kayda bağlı klasörler (kart 3288; 2067-4 a, ADR 0030 eki): müşteri, sipariş ve proje açılınca klasörü sistem açar.
-- Yalnız ekler: dolu satır değişmez; yeni sütunlar boş ya da varsayılanlıdır, yeni tablolar boştur (şablon sistem sabitidir).

-- kaynak_tur doluysa klasör sistem klasörüdür: adı kayıttan gelir, kişi adını değiştiremez. Kaynak başka modülün tablosudur;
-- yabancı anahtar yoktur (çok kaynaklı alan), bağ kaynak modülün olayıyla kurulur. Kök ve "Firmasız projeler" tektir, kimliksizdir.
ALTER TABLE ortak_dosyalar_klasor
  ADD COLUMN kaynak_tur text CONSTRAINT ortak_dosyalar_klasor_kaynak_tur_degeri
    CHECK (kaynak_tur IN ('kok', 'firmasiz-projeler', 'firma', 'siparissiz-projeler', 'siparis', 'proje')),
  ADD COLUMN kaynak_id int,
  -- Toplu komutla açılan klasörler bu kimlikle tek komutta arşive kaldırılır (Risk K4 d).
  ADD COLUMN toplu_is uuid,
  -- Silme yok (ADR 0030, 6): sipariş iptalinde ya da toplu işin geri alınmasında klasör arşive kalkar; arşivdeki klasör ve altı görünmez.
  ADD COLUMN arsiv boolean NOT NULL DEFAULT false,
  ADD COLUMN arsiv_kisi_id int CONSTRAINT ortak_dosyalar_klasor_arsiv_kisi_fk REFERENCES kisi,
  ADD COLUMN arsiv_zamani timestamptz,
  ADD CONSTRAINT ortak_dosyalar_klasor_kaynak_butun CHECK (
    kaynak_tur IS NULL AND kaynak_id IS NULL
    OR kaynak_tur IN ('kok', 'firmasiz-projeler') AND kaynak_id IS NULL
    OR kaynak_tur IN ('firma', 'siparissiz-projeler', 'siparis', 'proje') AND kaynak_id IS NOT NULL
  ),
  ADD CONSTRAINT ortak_dosyalar_klasor_kok_kaynagi CHECK (kaynak_tur IS DISTINCT FROM 'kok' OR ust_id IS NULL),
  ADD CONSTRAINT ortak_dosyalar_klasor_toplu_is_sistemde CHECK (toplu_is IS NULL OR kaynak_tur IS NOT NULL),
  ADD CONSTRAINT ortak_dosyalar_klasor_arsiv_izi CHECK ((arsiv_kisi_id IS NULL) = (arsiv_zamani IS NULL) AND (NOT arsiv OR arsiv_zamani IS NOT NULL));
-- Bir kayda tek klasör: toplu komut ve olay aynı kaydı ikinci kez açmaz (eşgüçlü).
CREATE UNIQUE INDEX ortak_dosyalar_klasor_kaynak_tekil ON ortak_dosyalar_klasor (kaynak_tur, COALESCE(kaynak_id, 0)) WHERE kaynak_tur IS NOT NULL;
CREATE INDEX ortak_dosyalar_klasor_toplu_is ON ortak_dosyalar_klasor (toplu_is) WHERE toplu_is IS NOT NULL;

-- Sipariş ve proje klasörünün altına açılan alt klasörler; değişiklik yalnız sonra açılanlara uygulanır.
CREATE TABLE ortak_dosyalar_sablon (
  hedef text NOT NULL CONSTRAINT ortak_dosyalar_sablon_hedef_degeri CHECK (hedef IN ('siparis', 'proje')),
  sira int NOT NULL CONSTRAINT ortak_dosyalar_sablon_sira_pozitif CHECK (sira > 0),
  ad text NOT NULL CONSTRAINT ortak_dosyalar_sablon_ad_bicimi CHECK (btrim(ad) = ad AND ad <> '' AND char_length(ad) <= 120),
  ad_anahtari text NOT NULL CONSTRAINT ortak_dosyalar_sablon_anahtar_bicimi CHECK (ad_anahtari <> '' AND char_length(ad_anahtari) <= 120),
  PRIMARY KEY (hedef, sira),
  CONSTRAINT ortak_dosyalar_sablon_ad_tekil UNIQUE (hedef, ad_anahtari)
);
INSERT INTO ortak_dosyalar_sablon (hedef, sira, ad, ad_anahtari) VALUES
  ('siparis', 1, 'Teklif', 'teklif'),
  ('siparis', 2, 'Çizim ve model', 'çizim ve model'),
  ('siparis', 3, 'Kalite', 'kalite'),
  ('siparis', 4, 'Sevkiyat', 'sevkiyat'),
  ('proje', 1, 'Çizim ve model', 'çizim ve model'),
  ('proje', 2, 'Kalite (FAI)', 'kalite (fai)'),
  ('proje', 3, 'Üretim', 'üretim');

-- Açılamayan klasörler (Risk K3): klasör hatası kaydı durdurmaz; satır kaydın kendi işleminde, ara noktaya dönüldükten sonra yazılır.
-- `zincir` yeniden denemenin girdisidir (kayıttaki adlar; yalnız veritabanında durur).
CREATE TABLE ortak_dosyalar_acilamayan (
  kaynak_tur text NOT NULL CONSTRAINT ortak_dosyalar_acilamayan_tur_degeri CHECK (kaynak_tur IN ('firma', 'siparis', 'proje')),
  kaynak_id int NOT NULL,
  neden text NOT NULL CONSTRAINT ortak_dosyalar_acilamayan_neden_bicimi CHECK (neden <> '' AND char_length(neden) <= 500),
  zincir jsonb NOT NULL,
  kisi_id int NOT NULL CONSTRAINT ortak_dosyalar_acilamayan_kisi_fk REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kaynak_tur, kaynak_id)
);
