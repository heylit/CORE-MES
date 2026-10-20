-- Bakım rolü açılır ve Arkon rolleri onaylı dağılımla TMI rollerine verilir; Arkon sayfası yalnız Arkon rolü olan rollerdedir.

-- Denetimle yazım arasına başka yazım giremez: açık yazım beklenir ve denetime görünür. Okuma sürer.
LOCK TABLE rol, rol_islemi IN SHARE ROW EXCLUSIVE MODE;

-- Her role tek Arkon işlemi: kişinin Arkon rolü taşıdığı ilk işlemdir, iki işlem öncelik sırasına düşerdi.
-- Elle girilmiş FARKLI bir Arkon işlemi birincil anahtara takılmaz; bu yüzden önceden aranır ve göç üstüne yazmadan durur.
DO $$
DECLARE
  fark text;
BEGIN
  SELECT string_agg(r.kod || ':' || ri.islem, ', ' ORDER BY r.kod, ri.islem) INTO fark
    FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
   WHERE r.kod IN ('mudur', 'planlama_proje', 'cam', 'kalite', 'operator', 'bakim') AND ri.islem LIKE 'arkon.%';
  IF fark IS NOT NULL THEN
    RAISE EXCEPTION 'Arkon rolü verilecek rollerde elle girilmiş Arkon işlemi var: %. Göç üstüne yazmaz; önce bu satırları kaldırın, sonra göçü yeniden çalıştırın.', fark;
  END IF;
END $$;

-- Aynı kodla elle açılmış rol varsa tekil kısıta takılır ve göç durur: rol sahiplenilmez.
INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES ('bakim', 'Bakım', true, false);

-- Bakım rolü yalnız Arkon'u açar; öteki sayfalar ayrı karardır.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
-- Elle girilmiş Arkon sayfası satırı birincil anahtara takılır ve göç durur: üstüne yazılmaz.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'sayfa.arkon'),
    ('mudur', 'arkon.amir'),
    ('planlama_proje', 'sayfa.arkon'),
    ('planlama_proje', 'arkon.planlama'),
    ('cam', 'sayfa.arkon'),
    ('cam', 'arkon.hazirlik'),
    ('kalite', 'sayfa.arkon'),
    ('kalite', 'arkon.kalite'),
    ('operator', 'sayfa.arkon'),
    ('operator', 'arkon.operator'),
    ('bakim', 'sayfa.arkon'),
    ('bakim', 'arkon.bakim')
  ) AS m (kod, islem);
