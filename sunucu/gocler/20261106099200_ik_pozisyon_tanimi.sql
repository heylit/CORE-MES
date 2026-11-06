-- İK pozisyon tanımları (kart 2177, kullanıcı kararı 2177-3 a): departmana bağlı unvan listesi. Personelin pozisyon alanı metin
-- olarak kalır; ekran listeden seçtirir, listede olmayan ad da yazılabilir. Tablo boş açılır, listeyi İK ekrandan girer.
-- Sütunlar sema.ts'teki tanımla aynıdır (sema.test.ts); yaka tipi ve kademe seçenekleri personeldekiyle aynıdır.
CREATE TABLE ik_pozisyon_tanimi (
  no int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kimlik text NOT NULL CONSTRAINT ik_pozisyon_tanimi_kimlik_tek UNIQUE
    CONSTRAINT ik_pozisyon_tanimi_kimlik_bicimi CHECK (kimlik ~ '^[A-Za-z0-9_-]{1,80}$'),
  ad text NOT NULL,
  departman_no int REFERENCES ik_departman (no),
  yaka_tipi text,
  kademe text,
  aciklama text,
  surum int NOT NULL DEFAULT 1 CONSTRAINT ik_pozisyon_tanimi_surum_pozitif CHECK (surum > 0),
  iptal boolean NOT NULL DEFAULT false,
  olusturan_kisi_id int NOT NULL REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  guncelleyen_kisi_id int NOT NULL REFERENCES kisi (id),
  guncelleme timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ik_pozisyon_tanimi_ad_bos_degil CHECK (ad <> ''),
  CONSTRAINT ik_pozisyon_tanimi_yaka_tipi_secenek CHECK (yaka_tipi IN ('Beyaz yaka', 'Mavi yaka')),
  CONSTRAINT ik_pozisyon_tanimi_kademe_secenek CHECK (kademe IN ('Üst yönetim', 'Yönetici', 'Takım lideri / şef', 'Uzman', 'Asistan / yardımcı', 'Operasyon / teknik personel', 'Stajyer')),
  CONSTRAINT ik_pozisyon_tanimi_aciklama_bos_degil CHECK (aciklama <> '')
);
CREATE INDEX ik_pozisyon_tanimi_departman ON ik_pozisyon_tanimi (departman_no);

CREATE TRIGGER ik_pozisyon_tanimi_koru BEFORE UPDATE OR DELETE ON ik_pozisyon_tanimi FOR EACH ROW EXECUTE FUNCTION ik_kayit_koru();
CREATE TRIGGER ik_pozisyon_tanimi_bosaltilmaz BEFORE TRUNCATE ON ik_pozisyon_tanimi FOR EACH STATEMENT EXECUTE FUNCTION ik_kayit_koru();

-- Kayıt geçmişi yeni türü de taşır (CHECK genişletme).
ALTER TABLE ik_kayit_gecmisi DROP CONSTRAINT ik_kayit_gecmisi_tur;
ALTER TABLE ik_kayit_gecmisi ADD CONSTRAINT ik_kayit_gecmisi_tur
  CHECK (tur IN ('emp', 'dept', 'title', 'leave', 'att', 'pay', 'perf', 'train', 'job', 'cand', 'intv', 'asset', 'ayarlar'));
