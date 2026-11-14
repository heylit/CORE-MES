-- 3245 d: teklif formu şablon kütüphanesi. Şablon metni (başlık, giriş, şartlar, imza, alt bilgi) içerikte durur; biçimi uygulama
-- sözleşmesi denetler (paylasilan/sozlesme/teklif-formu.ts). Teklif penceresi şablonu seçer, seçilmezse varsayılan basılır.
CREATE TABLE siparisler_teklif_formu_sablonu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT siparisler_teklif_formu_sablonu_ad CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 80),
  dil text NOT NULL CONSTRAINT siparisler_teklif_formu_sablonu_dil CHECK (dil IN ('tr', 'en')),
  varsayilan boolean NOT NULL DEFAULT false,
  icerik jsonb NOT NULL CONSTRAINT siparisler_teklif_formu_sablonu_icerik CHECK (jsonb_typeof(icerik) = 'object'),
  -- Kurulumdaki hazır şablonların oluşturanı yoktur.
  olusturan_id int CONSTRAINT siparisler_teklif_formu_sablonu_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_id int CONSTRAINT siparisler_teklif_formu_sablonu_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT siparisler_teklif_formu_sablonu_surum CHECK (surum >= 1),
  CONSTRAINT siparisler_teklif_formu_sablonu_ad_tek UNIQUE (ad)
);
-- En çok bir varsayılan; varsayılanı değiştiren komut eskisini aynı transaction'da kaldırır.
CREATE UNIQUE INDEX siparisler_teklif_formu_sablonu_tek_varsayilan ON siparisler_teklif_formu_sablonu (varsayilan) WHERE varsayilan;

-- Formun antetindeki firma bilgisi bütün şablonlarda ortaktır; tek satır.
CREATE TABLE siparisler_teklif_formu_kurum (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT siparisler_teklif_formu_kurum_tek CHECK (tek),
  icerik jsonb NOT NULL CONSTRAINT siparisler_teklif_formu_kurum_icerik CHECK (jsonb_typeof(icerik) = 'object'),
  guncelleyen_id int CONSTRAINT siparisler_teklif_formu_kurum_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT siparisler_teklif_formu_kurum_surum CHECK (surum >= 1)
);

CREATE TRIGGER siparisler_teklif_formu_sablonu_degisiklik AFTER INSERT OR UPDATE OR DELETE ON siparisler_teklif_formu_sablonu
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum', 'olusturan_id', 'olusturma', 'guncelleyen_id', 'guncelleme');
CREATE TRIGGER siparisler_teklif_formu_kurum_degisiklik AFTER INSERT OR UPDATE OR DELETE ON siparisler_teklif_formu_kurum
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('tek', 'surum', 'guncelleyen_id', 'guncelleme');

-- Hazır şablonlar: firma bilgisi boş başlar, Sistem Ayarları > Formlar'da doldurulur.
INSERT INTO siparisler_teklif_formu_kurum (icerik) VALUES ('{"unvan":"","adres":"","telefon":"","eposta":"","vergi":""}');
INSERT INTO siparisler_teklif_formu_sablonu (ad, dil, varsayilan, icerik) VALUES
  ('Standart teklif', 'tr', true, jsonb_build_object(
    'baslik', 'TEKLİF FORMU',
    'giris', E'Sayın {YETKILI},\nTalebinize istinaden hazırladığımız {TEKLIF_NO} numaralı teklifimiz aşağıdadır. Teklifimiz {GECERLILIK} tarihine kadar geçerlidir.',
    'sartlar', jsonb_build_array('Fiyatlarımıza KDV dahil değildir.', 'Teslim yeri fabrikamızdır (EXW).', 'Teklif geçerlilik tarihine kadar geçerlidir.', 'Genel toleranslar ISO 2768-mK.'),
    'imza1', 'Hazırlayan', 'imza2', 'Müşteri onayı', 'alt', '')),
  ('Quotation (English)', 'en', false, jsonb_build_object(
    'baslik', 'QUOTATION',
    'giris', E'Dear {YETKILI},\nPlease find our quotation {TEKLIF_NO} below. It is valid until {GECERLILIK}.',
    'sartlar', jsonb_build_array('Prices exclude VAT.', 'Delivery EXW our plant.', 'General tolerances ISO 2768-mK.'),
    'imza1', 'Prepared by', 'imza2', 'Customer approval', 'alt', '')),
  ('Kısa form', 'tr', false, jsonb_build_object(
    'baslik', 'TEKLİF FORMU',
    'giris', '',
    'sartlar', jsonb_build_array('Fiyatlarımıza KDV dahil değildir.', 'Teslim yeri fabrikamızdır (EXW).'),
    'imza1', '', 'imza2', '', 'alt', ''));
