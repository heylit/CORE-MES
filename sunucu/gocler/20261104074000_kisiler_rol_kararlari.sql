-- 2068-2 teyit (5.6 rol gocu), yalniz ekleme: modul-test K6 a, K9 b, K10 a ve 1706 a.
-- Yonetici Yetkiler ekranindan ayni satiri onceden vermis olabilir; o satir oldugu gibi kalir, goc durmaz.

DO $$
DECLARE satir bigint;
BEGIN
  SELECT count(*) INTO satir FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
   WHERE (r.kod, ri.islem) IN (
     ('kalite', 'sayfa.uretim-terminali'), ('kalite', 'sayfa.musteri-tedarikci'), ('satis', 'musteri-tedarikci.yaz'),
     ('kalite', 'sayfa.geometri'), ('kalite', 'geometri.oku'), ('planlama_proje', 'sayfa.geometri'), ('planlama_proje', 'geometri.oku'),
     ('cam', 'sayfa.geometri'), ('cam', 'geometri.oku'));
  RAISE NOTICE 'rol_islemi: % satır zaten var; göç yalnız satır ekler', satir;
END $$;

INSERT INTO rol_islemi (rol_id, islem)
SELECT r.id, y.islem
  FROM (VALUES
    -- K6 a: kalite terminalden uretim girer (terminal.uret zaten kalitede, 1209 b).
    ('kalite', 'sayfa.uretim-terminali'),
    -- K10 a: kalite yillik karne icin Musteriler ve Tedarikciler sayfasini gorur; karneyi kalite-merkezi.onayla ile yazar.
    ('kalite', 'sayfa.musteri-tedarikci'),
    -- K9 b: satis yeni musteriyi kendisi acar.
    ('satis', 'musteri-tedarikci.yaz'),
    -- 1706 a: 3D Atolyesi okuma; geometri.hesapla yalniz yoneticide kalir.
    ('kalite', 'sayfa.geometri'), ('kalite', 'geometri.oku'),
    ('planlama_proje', 'sayfa.geometri'), ('planlama_proje', 'geometri.oku'),
    ('cam', 'sayfa.geometri'), ('cam', 'geometri.oku')
  ) AS y(rol, islem)
  JOIN rol r ON r.kod = y.rol
ON CONFLICT DO NOTHING;
