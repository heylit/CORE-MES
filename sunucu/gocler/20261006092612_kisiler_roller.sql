-- Onaylı on bir rol ve rol x işlem matrisi; planlamacı rolü "Planlama ve Proje" olur, kişi atamaları rol kimliğiyle korunur.

-- Denetimle yazım arasına başka yazım giremez: açık yazım beklenir ve denetime görünür. Okuma sürer;
-- yalnız anahtarı değişen role (planlama) yapılan atama göç bitene dek bekler, öteki rollere atama beklemez.
LOCK TABLE rol, rol_islemi IN SHARE ROW EXCLUSIVE MODE;

-- Matris baştan yazılıyor: elle açılmış rol ya da elle değiştirilmiş satır varsa üstüne yazılmaz, göç durur.
DO $$
DECLARE
  fark text;
BEGIN
  SELECT string_agg(DISTINCT f.kod, ', ' ORDER BY f.kod) INTO fark
    FROM (
      (SELECT kod, yerlesik, yonetici FROM rol
        EXCEPT
       VALUES ('yonetici', true, true), ('planlamaci', true, false), ('operator', true, false))
      UNION
      (VALUES ('yonetici', true, true), ('planlamaci', true, false), ('operator', true, false)
        EXCEPT
       SELECT kod, yerlesik, yonetici FROM rol)
    ) AS f (kod, yerlesik, yonetici);
  IF fark IS NOT NULL THEN
    RAISE EXCEPTION 'rol tablosu beklenen üç yerleşik rolden (yonetici, planlamaci, operator) farklı: %. Roller elle değiştirilmiş; göç üstüne yazmaz. Önce farkı giderin ya da yeni matrise elle taşıyın, sonra göçü yeniden çalıştırın.', fark;
  END IF;

  WITH tohum (kod, islem) AS (VALUES
    ('planlamaci', 'kisiler.oku'),
    ('planlamaci', 'sayfa.terminal'),
    ('planlamaci', 'sayfa.kuyruk'),
    ('planlamaci', 'sayfa.uretim-emirleri'),
    ('planlamaci', 'sayfa.cizelge'),
    ('planlamaci', 'sayfa.matris'),
    ('planlamaci', 'sayfa.vardiya'),
    ('planlamaci', 'sayfa.mesai'),
    ('planlamaci', 'sayfa.stok'),
    ('planlamaci', 'sayfa.rota'),
    ('planlamaci', 'sayfa.istasyonlar'),
    ('operator', 'sayfa.terminal'),
    ('operator', 'sayfa.kuyruk')
  ), var_olan AS (
    SELECT r.kod, ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
  )
  SELECT string_agg(f.kod || ':' || f.islem, ', ' ORDER BY f.kod, f.islem) INTO fark
    FROM (
      (SELECT kod, islem FROM var_olan EXCEPT SELECT kod, islem FROM tohum)
      UNION
      (SELECT kod, islem FROM tohum EXCEPT SELECT kod, islem FROM var_olan)
    ) AS f;
  IF fark IS NOT NULL THEN
    RAISE EXCEPTION 'rol_islemi tablosu önceki göçün yazdığı satırlardan farklı: %. Matris elle değiştirilmiş; göç üstüne yazmaz. Önce farkı giderin ya da yeni matrise elle taşıyın, sonra göçü yeniden çalıştırın.', fark;
  END IF;
END $$;

-- Satır yerinde güncellenir: rol kimliği değişmez, kisi_rolu atamalarına dokunulmaz.
UPDATE rol SET kod = 'planlama_proje', ad = 'Planlama ve Proje' WHERE kod = 'planlamaci';
-- On bir rolün adı karardır; elle değişmiş ad kalmaz.
UPDATE rol SET ad = 'Yönetici' WHERE kod = 'yonetici';
UPDATE rol SET ad = 'Operatör' WHERE kod = 'operator';

INSERT INTO rol (kod, ad, yerlesik, yonetici) VALUES
  ('mudur', 'Müdür', true, false),
  ('kalite', 'Kalite', true, false),
  ('insan_kaynaklari', 'İnsan Kaynakları', true, false),
  ('satin_alma', 'Satın Alma', true, false),
  ('muhasebe_finans', 'Muhasebe ve Finans', true, false),
  ('idari_isler', 'İdari İşler', true, false),
  ('cam', 'CAM', true, false),
  ('depo', 'Depo', true, false);

DELETE FROM rol_islemi;

-- Depo işi yapan kişiye ek rol olarak verilir; bugün yalnız stok sayfasını açar.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır: yanlış yazılan satır sessizce düşmez.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = m.kod), m.islem
  FROM (VALUES
    ('mudur', 'kisiler.oku'),
    ('mudur', 'denetim.oku'),
    ('mudur', 'sayfa.uretim-emirleri'),
    ('mudur', 'sayfa.terminal'),
    ('mudur', 'sayfa.kuyruk'),
    ('mudur', 'sayfa.cizelge'),
    ('mudur', 'sayfa.matris'),
    ('mudur', 'sayfa.vardiya'),
    ('mudur', 'sayfa.mesai'),
    ('mudur', 'sayfa.stok'),
    ('mudur', 'sayfa.rota'),
    ('mudur', 'sayfa.istasyonlar'),
    ('mudur', 'sayfa.personel'),
    ('kalite', 'sayfa.uretim-emirleri'),
    ('kalite', 'sayfa.terminal'),
    ('kalite', 'sayfa.stok'),
    ('kalite', 'sayfa.rota'),
    ('planlama_proje', 'kisiler.oku'),
    ('planlama_proje', 'sayfa.uretim-emirleri'),
    ('planlama_proje', 'sayfa.terminal'),
    ('planlama_proje', 'sayfa.kuyruk'),
    ('planlama_proje', 'sayfa.cizelge'),
    ('planlama_proje', 'sayfa.matris'),
    ('planlama_proje', 'sayfa.vardiya'),
    ('planlama_proje', 'sayfa.mesai'),
    ('planlama_proje', 'sayfa.stok'),
    ('planlama_proje', 'sayfa.rota'),
    ('planlama_proje', 'sayfa.istasyonlar'),
    ('operator', 'sayfa.terminal'),
    ('operator', 'sayfa.kuyruk'),
    ('insan_kaynaklari', 'kisiler.oku'),
    ('insan_kaynaklari', 'kisiler.yaz'),
    ('insan_kaynaklari', 'sayfa.vardiya'),
    ('insan_kaynaklari', 'sayfa.mesai'),
    ('insan_kaynaklari', 'sayfa.personel'),
    ('satin_alma', 'sayfa.stok'),
    ('muhasebe_finans', 'sayfa.uretim-emirleri'),
    ('muhasebe_finans', 'sayfa.stok'),
    ('idari_isler', 'kisiler.oku'),
    ('idari_isler', 'sayfa.vardiya'),
    ('idari_isler', 'sayfa.mesai'),
    ('idari_isler', 'sayfa.personel'),
    ('cam', 'sayfa.uretim-emirleri'),
    ('cam', 'sayfa.rota'),
    ('cam', 'sayfa.istasyonlar'),
    ('depo', 'sayfa.stok')
  ) AS m (kod, islem);
