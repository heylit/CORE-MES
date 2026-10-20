-- Genel gider yük oranı (karar 206 a): kira, amortisman, idari gider gibi işe yazılamayan aylık gider aylık makine saatine bölünür ve her makine
-- saatine eklenir. Makine saat maliyeti yalnız doğrudan gideri taşır; amortisman ve kira buradadır (karar 211 a). Tarihli tutulur: yeni satır
-- başlangıç gününden sonrasını etkiler, eski satır değişmez ve silinmez; aynı güne ikinci giriş öncekini düzeltir (sonra girilen geçerlidir).
CREATE TABLE finans_genel_gider_orani (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  gecerlilik_baslangic date NOT NULL,
  aylik_genel_gider numeric(18,2) NOT NULL CONSTRAINT finans_genel_gider_orani_gider CHECK (aylik_genel_gider >= 0),
  aylik_makine_saati numeric(10,2) NOT NULL CONSTRAINT finans_genel_gider_orani_saat CHECK (aylik_makine_saati > 0),
  -- Amortisman finansta ayrıca hesaplanır; gidere dahil olup olmadığı çift sayım olmasın diye her satırda yazılır.
  amortisman_dahil boolean NOT NULL,
  aciklama text CONSTRAINT finans_genel_gider_orani_aciklama CHECK (aciklama IS NULL OR length(aciklama) <= 500),
  olusturan_id int NOT NULL CONSTRAINT finans_genel_gider_orani_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER finans_genel_gider_orani_degismez BEFORE UPDATE OR DELETE ON finans_genel_gider_orani
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER finans_genel_gider_orani_bosaltilmaz BEFORE TRUNCATE ON finans_genel_gider_orani
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
