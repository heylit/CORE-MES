-- tedarikçiye giden teklif isteme formunun (PDF) şablonu; Sistem Ayarları > Formlar'da düzenlenir, teklif iste penceresi basar.
-- Biçimi uygulama sözleşmesi denetler (paylasilan/sozlesme/satin-alma.ts teklifIstekFormuIcerigi). Antet siparişlerin teklif formundan okunur.
CREATE TABLE satin_alma_teklif_istek_formu (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT satin_alma_teklif_istek_formu_tek CHECK (tek),
  icerik jsonb NOT NULL CONSTRAINT satin_alma_teklif_istek_formu_icerik CHECK (jsonb_typeof(icerik) = 'object'),
  guncelleyen_id int CONSTRAINT satin_alma_teklif_istek_formu_guncelleyen REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CONSTRAINT satin_alma_teklif_istek_formu_surum CHECK (surum >= 1)
);
CREATE TRIGGER satin_alma_teklif_istek_formu_degisiklik AFTER INSERT OR UPDATE OR DELETE ON satin_alma_teklif_istek_formu
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('tek', 'surum', 'guncelleyen_id', 'guncelleme');

-- Hazır metin: teklif iste penceresinin bugünkü metniyle aynı sorular (karşılaştırılabilir cevap için). Değeri olmayan alanın satırı basılmaz.
INSERT INTO satin_alma_teklif_istek_formu (icerik) VALUES (jsonb_build_object(
  'baslik', 'TEKLİF İSTEME FORMU',
  'giris', E'Sayın {YETKILI},\nAşağıdaki kalemler için fiyat teklifinizi rica ederiz.',
  'istenenler', jsonb_build_array(
    'Her kalem için birim fiyat ve para birimi (KDV hariç)',
    'Ödeme şekli: vade (gün), varsa avans oranı; peşin ödemede ek iskonto',
    'Termin: siparişten teslime kaç gün',
    'Teslim şekli ve yeri; nakliyenin fiyata dahil olup olmadığı',
    'Garanti süresi ve teklif geçerlilik tarihi',
    'Teknik şartlardan sapma veya muadil ürün önerisi varsa açıkça'),
  'kapanis', E'Malzemelere en geç {IHTIYAC} tarihinde ihtiyacımız var.\nTekliflerinizi {SON_TARIH} tarihine kadar iletmenizi rica ederiz.\nSaygılarımızla,',
  'imza1', 'Satın alma', 'imza2', '', 'alt', ''));
