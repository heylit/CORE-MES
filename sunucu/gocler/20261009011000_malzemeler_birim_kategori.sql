-- Ölçü birimi ve kategori listesi sunucuda olsun (kart #163, kullanıcı kararları SH4 a, ML1 a, ML2 b): başka modüller birimi ve kategoriyi
-- buradan okur. Liste prototipin Ayarlar ekranında düzenlenir; ayar kaydı tabloyu aynı işlemde yeniden hesaplar (servis). Kartlara dokunulmaz.

-- Kartta 40 karakteri aşan birim varsa tabloya sığmaz: göç hiçbir şeyi değiştirmeden durur ve birimleri yazar.
DO $$
DECLARE
  sayi int;
  liste text;
BEGIN
  SELECT count(*), string_agg(b, '; ' ORDER BY b) INTO sayi, liste FROM (
    SELECT DISTINCT btrim(kayit -> 'com' ->> 'birim') AS b FROM malzeme_katalog_karti
     WHERE jsonb_typeof(kayit -> 'com') = 'object' AND jsonb_typeof(kayit -> 'com' -> 'birim') = 'string'
  ) x WHERE length(b) > 40;
  IF sayi > 0 THEN
    RAISE EXCEPTION '% kart birimi 40 karakteri aşıyor (%); birim listesi göçü uygulanmadı (kart #163).', sayi, liste;
  END IF;
END $$;

-- yerlesik_listeler: birimin prototipte yerleşik olarak bulunduğu listeler ('birim' genel, 'birim|<tür>' türe göre).
-- aktif: en az bir listede seçilebilir. Kartta geçen ama hiçbir listede olmayan birim pasif satırdır (eski kart okunur, yeni kayıt seçemez).
CREATE TABLE malzeme_birimi (
  kod text PRIMARY KEY CONSTRAINT malzeme_birimi_kod CHECK (btrim(kod) = kod AND kod <> '' AND length(kod) <= 40),
  yerlesik_listeler text[] NOT NULL DEFAULT '{}',
  aktif boolean NOT NULL,
  guncelleme timestamptz NOT NULL DEFAULT now()
);

INSERT INTO malzeme_birimi (kod, yerlesik_listeler, aktif)
SELECT kod, array_agg(liste ORDER BY liste), true FROM (VALUES
  ('adet', 'birim'), ('kg', 'birim'), ('m', 'birim'), ('m²', 'birim'), ('levha', 'birim'), ('rulo', 'birim'), ('torba', 'birim'),
  ('adet', 'birim|yarimamul'), ('takım', 'birim|yarimamul'), ('kg', 'birim|yarimamul'), ('m', 'birim|yarimamul'),
  ('adet', 'birim|mamul'), ('takım', 'birim|mamul'), ('set', 'birim|mamul'), ('kutu', 'birim|mamul'), ('kg', 'birim|mamul'), ('m', 'birim|mamul'),
  ('adet', 'birim|sarf'), ('kutu', 'birim|sarf'), ('paket', 'birim|sarf'), ('kg', 'birim|sarf'), ('L', 'birim|sarf'), ('m', 'birim|sarf'),
  ('makara', 'birim|sarf'), ('rulo', 'birim|sarf'), ('çift', 'birim|sarf'), ('takım', 'birim|sarf'), ('tüp', 'birim|sarf'),
  ('adet', 'birim|demirbas')
) AS y (kod, liste) GROUP BY kod;

-- Ayar kaydında eklenmiş birimler (listeler.<birim...>.ekle) seçilebilir; gizlenenler bir sonraki ayar kaydında hesaplanır.
INSERT INTO malzeme_birimi (kod, aktif)
SELECT DISTINCT btrim(e), true
  FROM malzeme_katalog_ayari a, jsonb_each(CASE WHEN jsonb_typeof(a.deger -> 'listeler') = 'object' THEN a.deger -> 'listeler' ELSE '{}' END) l,
       jsonb_array_elements_text(CASE WHEN jsonb_typeof(l.value -> 'ekle') = 'array' THEN l.value -> 'ekle' ELSE '[]' END) e
 WHERE a.anahtar = 'malzeme' AND (l.key = 'birim' OR l.key LIKE 'birim|%') AND btrim(e) <> '' AND length(btrim(e)) <= 40
ON CONFLICT (kod) DO NOTHING;

INSERT INTO malzeme_birimi (kod, aktif)
SELECT DISTINCT btrim(kayit -> 'com' ->> 'birim'), false FROM malzeme_katalog_karti
 WHERE jsonb_typeof(kayit -> 'com') = 'object' AND jsonb_typeof(kayit -> 'com' -> 'birim') = 'string' AND btrim(kayit -> 'com' ->> 'birim') <> ''
ON CONFLICT (kod) DO NOTHING;

-- Sarf ve demirbaş kategorileri (kartta `kayit.g.kat`). kisa_kod stok kodu grubudur. Kategori Logo'ya gitmez.
CREATE TABLE malzeme_kategorisi (
  tur text NOT NULL CONSTRAINT malzeme_kategorisi_tur CHECK (tur IN ('sarf', 'demirbas')),
  kod text NOT NULL CONSTRAINT malzeme_kategorisi_kod CHECK (btrim(kod) = kod AND kod <> '' AND length(kod) <= 40),
  ad text NOT NULL CONSTRAINT malzeme_kategorisi_ad CHECK (btrim(ad) <> '' AND length(ad) <= 80),
  kisa_kod text CONSTRAINT malzeme_kategorisi_kisa_kod CHECK (kisa_kod IS NULL OR (btrim(kisa_kod) <> '' AND length(kisa_kod) <= 10)),
  yerlesik boolean NOT NULL,
  aktif boolean NOT NULL,
  guncelleme timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tur, kod)
);

INSERT INTO malzeme_kategorisi (tur, kod, ad, kisa_kod, yerlesik, aktif) VALUES
  ('sarf', 'kaynak', 'Kaynak sarfı', 'KYN', true, true), ('sarf', 'takim', 'Kesici takım', 'TKM', true, true),
  ('sarf', 'asindirici', 'Aşındırıcı', 'ASN', true, true), ('sarf', 'kimyasal', 'Yağ ve kimyasal', 'KIM', true, true),
  ('sarf', 'kkd', 'İş güvenliği (KKD)', 'KKD', true, true), ('sarf', 'baglanti', 'Bağlantı elemanı', 'BGL', true, true),
  ('sarf', 'ambalaj', 'Ambalaj malzemesi', 'AMB', true, true), ('sarf', 'genel', 'Diğer sarf', 'GEN', true, true),
  ('demirbas', 'makine', 'Makine ve tezgah', 'MAK', true, true), ('demirbas', 'olcu', 'Ölçü ve test aleti', 'OLC', true, true),
  ('demirbas', 'elaleti', 'El aleti ve elektrikli alet', 'ELA', true, true), ('demirbas', 'kaldirma', 'Kaldırma ve taşıma', 'KLD', true, true),
  ('demirbas', 'kalip', 'Kalıp ve aparat', 'KLP', true, true), ('demirbas', 'bt', 'Bilgisayar ve BT', 'BT', true, true),
  ('demirbas', 'mobilya', 'Mobilya ve ofis', 'MOB', true, true), ('demirbas', 'tasit', 'Taşıt', 'TST', true, true),
  ('demirbas', 'tesis', 'Tesis ekipmanı', 'TES', true, true), ('demirbas', 'diger', 'Diğer demirbaş', 'DGR', true, true);

-- ML1 a: Logo birim karşılığı birim listesindeki bir birime bağlıdır. Listede olmayan karşılık varsa göç hiçbir şeyi değiştirmeden durur.
DO $$
DECLARE
  sayi int;
  liste text;
BEGIN
  SELECT count(*), string_agg(tmi_degeri, '; ' ORDER BY tmi_degeri) INTO sayi, liste
    FROM malzeme_logo_karsiligi k
   WHERE k.cesit = 'birim' AND NOT EXISTS (SELECT 1 FROM malzeme_birimi b WHERE b.kod = k.tmi_degeri);
  IF sayi > 0 THEN
    RAISE EXCEPTION '% Logo birim karşılığı birim listesinde yok (%); birim listesi göçü uygulanmadı (kart #163).', sayi, liste;
  END IF;
END $$;

ALTER TABLE malzeme_logo_karsiligi
  ADD COLUMN birim_kodu text GENERATED ALWAYS AS (CASE WHEN cesit = 'birim' THEN tmi_degeri END) STORED
    CONSTRAINT malzeme_logo_karsiligi_birim REFERENCES malzeme_birimi (kod);
