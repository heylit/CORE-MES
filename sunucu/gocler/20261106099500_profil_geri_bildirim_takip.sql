-- Geri Bildirim Merkezi (kart 2192; kararlar 2192-0 a, 2192-1 a, 2192-2 b, 2192-3 a): şikayet, istek ve öneri kaydının durumu,
-- kategorisi, sorumlusu, aynı konudaki ana kaydı, yanıtları ve iç notları. Çalışanın yazdığı satır (profil_geri_bildirim)
-- değişmez ve bu göç ona dokunmaz: takip ayrı tabloda tutulur, takip satırı olmayan kayıt "yeni" sayılır (eski kayıt doldurulmaz).

-- Kategoriyi yanıtlayan seçer; çalışan seçmez. Kategori silinmez, pasife alınır: eski kayıt adını korur (2192-3 a).
CREATE TABLE profil_geri_bildirim_kategori (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT profil_geri_bildirim_kategori_pk PRIMARY KEY,
  ad text NOT NULL CONSTRAINT profil_geri_bildirim_kategori_ad CHECK (btrim(ad) = ad AND length(ad) BETWEEN 2 AND 60),
  -- Kategorinin ait olduğu konu; null ise iki konuda da seçilir.
  konu text CONSTRAINT profil_geri_bildirim_kategori_konu CHECK (konu IS NULL OR konu IN ('sirket', 'uygulama')),
  etkin boolean NOT NULL DEFAULT true,
  surum int NOT NULL DEFAULT 1 CONSTRAINT profil_geri_bildirim_kategori_surum CHECK (surum > 0),
  olusturuldu timestamptz NOT NULL DEFAULT now()
);
-- Aynı ad büyük-küçük harf farkıyla ikinci kez açılmaz.
CREATE UNIQUE INDEX profil_geri_bildirim_kategori_ad_tekil ON profil_geri_bildirim_kategori (lower(ad));

-- Kayıt başına tek takip satırı. Sürümle yazılır; ilk yazımda satır açılır.
CREATE TABLE profil_geri_bildirim_takip (
  geri_bildirim_id int CONSTRAINT profil_geri_bildirim_takip_pk PRIMARY KEY
    CONSTRAINT profil_geri_bildirim_takip_kayit REFERENCES profil_geri_bildirim (id),
  durum text NOT NULL CONSTRAINT profil_geri_bildirim_takip_durum
    CHECK (durum IN ('yeni', 'inceleniyor', 'yanitlandi', 'cozuldu', 'kapandi')),
  kategori_id int CONSTRAINT profil_geri_bildirim_takip_kategori REFERENCES profil_geri_bildirim_kategori (id),
  sorumlu_kisi_id int CONSTRAINT profil_geri_bildirim_takip_sorumlu REFERENCES kisi (id),
  -- Aynı konudaki kayıtlar tek ana kayıtta toplanır; kayıt kendine bağlanmaz (tek kademe kuralı serviste).
  ana_kayit_id int CONSTRAINT profil_geri_bildirim_takip_ana REFERENCES profil_geri_bildirim (id),
  surum int NOT NULL DEFAULT 1 CONSTRAINT profil_geri_bildirim_takip_surum CHECK (surum > 0),
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profil_geri_bildirim_takip_kendine_bagli CHECK (ana_kayit_id IS NULL OR ana_kayit_id <> geri_bildirim_id)
);
CREATE INDEX profil_geri_bildirim_takip_durum ON profil_geri_bildirim_takip (durum);
CREATE INDEX profil_geri_bildirim_takip_kategori_idx ON profil_geri_bildirim_takip (kategori_id) WHERE kategori_id IS NOT NULL;
CREATE INDEX profil_geri_bildirim_takip_ana_idx ON profil_geri_bildirim_takip (ana_kayit_id) WHERE ana_kayit_id IS NOT NULL;

-- Kaydın hareketleri, yalnız ekleme: yanıt yazana görünür; iç not ve durum değişikliği yalnız merkezde.
-- Yanıt çalışana rol adıyla görünür (2192-2 b): imza yazıldığı anda saklanır, yazan kişi kayıtta kalır.
CREATE TABLE profil_geri_bildirim_hareket (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT profil_geri_bildirim_hareket_pk PRIMARY KEY,
  geri_bildirim_id int NOT NULL CONSTRAINT profil_geri_bildirim_hareket_kayit REFERENCES profil_geri_bildirim (id),
  tur text NOT NULL CONSTRAINT profil_geri_bildirim_hareket_tur CHECK (tur IN ('yanit', 'not', 'durum')),
  metin text CONSTRAINT profil_geri_bildirim_hareket_metin CHECK (metin IS NULL OR length(btrim(metin)) BETWEEN 2 AND 2000),
  durum text CONSTRAINT profil_geri_bildirim_hareket_durum
    CHECK (durum IS NULL OR durum IN ('yeni', 'inceleniyor', 'yanitlandi', 'cozuldu', 'kapandi')),
  imza text CONSTRAINT profil_geri_bildirim_hareket_imza CHECK (imza IS NULL OR length(btrim(imza)) BETWEEN 1 AND 120),
  kisi_id int NOT NULL CONSTRAINT profil_geri_bildirim_hareket_kisi REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now(),
  -- Yanıt ve not metinsiz olmaz; yanıt imzasız olmaz; durum satırı yeni durumu taşır.
  CONSTRAINT profil_geri_bildirim_hareket_butun CHECK (
    (tur = 'yanit' AND metin IS NOT NULL AND imza IS NOT NULL AND durum IS NULL)
    OR (tur = 'not' AND metin IS NOT NULL AND imza IS NULL AND durum IS NULL)
    OR (tur = 'durum' AND metin IS NULL AND imza IS NULL AND durum IS NOT NULL)
  )
);
CREATE INDEX profil_geri_bildirim_hareket_kayit_zaman ON profil_geri_bildirim_hareket (geri_bildirim_id, zaman, id);

CREATE TRIGGER profil_geri_bildirim_hareket_degismez BEFORE UPDATE OR DELETE ON profil_geri_bildirim_hareket
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER profil_geri_bildirim_hareket_bosaltilmaz BEFORE TRUNCATE ON profil_geri_bildirim_hareket
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Başlangıç kategorileri (2192-3 a); yetkili ekler ya da pasife alır.
INSERT INTO profil_geri_bildirim_kategori (ad, konu) VALUES
  ('Atölye ve ekipman', 'sirket'),
  ('İş güvenliği', 'sirket'),
  ('Vardiya, mesai, servis', 'sirket'),
  ('Yemek ve sosyal', 'sirket'),
  ('Uygulama hatası', 'uygulama'),
  ('Uygulama isteği', 'uygulama'),
  ('Diğer', NULL);

-- Merkezi okuyanlar yanıtlar ve kategoriyi yönetir (2192-1 a): Müdür, İK, Genel Müdür ve yardımcısı. Okuma işlemi bu rollerde
-- zaten vardır. Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır; Yetkiler ekranından önceden verilmiş satır atlanır.
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = r.kod), i.islem
  FROM (VALUES ('mudur'), ('insan_kaynaklari'), ('genel_mudur'), ('genel_mudur_yardimcisi')) AS r (kod)
  CROSS JOIN (VALUES ('sayfa.geri-bildirim'), ('profil.geri-bildirim-yanitla'), ('profil.geri-bildirim-kategori-yaz')) AS i (islem)
ON CONFLICT (rol_id, islem) DO NOTHING;
