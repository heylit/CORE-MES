-- Cihaz profili (kart #1358; kararlar 1339 a, 1341 a, 1347 a, 1356 a). Kişinin yetkisi rolüyle bulunduğu cihazın profilinin
-- kesişimidir; yönetici de dahil. Cihazın türüne istemcinin beyanıyla değil, ortak cihaz kaydının (kart #739) çereziyle karar verilir:
-- kayıtlı cihaz atanmış profilini, kayıtsız cihaz ayardaki profili alır. Kayıtsız cihaz en dar profile düşmezse telefon kayıt olmadan
-- tam erişimle girer (1341 a); geçiş için ayar Tam başlar, ofis bilgisayarları kaydedilince Telefon'a çevrilir.
-- Yalnız yeni tablolar: oturum_ortak_cihaz'a dokunulmaz, profil ataması ayrı tabloda tutulur.
CREATE TABLE oturum_cihaz_profili (
  kod text PRIMARY KEY CONSTRAINT oturum_cihaz_profili_kod CHECK (kod IN ('tam', 'istasyon', 'telefon')),
  -- Profilde açık sayfa işlemleri; null yalnız Tam profilindedir ve sınır yok demektir.
  sayfalar text[] CONSTRAINT oturum_cihaz_profili_sayfalar CHECK (
    (kod = 'tam') = (sayfalar IS NULL) AND (sayfalar IS NULL OR array_position(sayfalar, NULL) IS NULL)
  ),
  surum int NOT NULL DEFAULT 1,
  guncelleyen_kisi_id int CONSTRAINT oturum_cihaz_profili_guncelleyen_fk REFERENCES kisi,
  guncellendi timestamptz
);
INSERT INTO oturum_cihaz_profili (kod, sayfalar) VALUES
  ('tam', NULL),
  ('istasyon', ARRAY['sayfa.uretim-terminali', 'sayfa.kuyruk', 'sayfa.stok']),
  ('telefon', ARRAY['sayfa.uretim-terminali', 'sayfa.kuyruk', 'sayfa.stok']);

-- Kayıtlı cihazın profili. Satırı olmayan kayıtlı cihaz kayıtsız cihaz profilini alır: telefondan kendini kaydeden kişi profil
-- seçemezse dar kalır; profili Tam profilli bir cihazdan atanır.
CREATE TABLE oturum_cihaz_profil_atamasi (
  cihaz_id bigint PRIMARY KEY CONSTRAINT oturum_cihaz_profil_atamasi_cihaz_fk REFERENCES oturum_ortak_cihaz,
  profil text NOT NULL CONSTRAINT oturum_cihaz_profil_atamasi_profil_fk REFERENCES oturum_cihaz_profili,
  atayan_kisi_id int NOT NULL CONSTRAINT oturum_cihaz_profil_atamasi_atayan_fk REFERENCES kisi,
  atandi timestamptz NOT NULL,
  surum int NOT NULL DEFAULT 1
);
-- Bugün kayıtlı açık cihazlar istasyondur (739 a): davranışları değişmesin.
INSERT INTO oturum_cihaz_profil_atamasi (cihaz_id, profil, atayan_kisi_id, atandi)
  SELECT id, 'istasyon', kaydeden_kisi_id, now() FROM oturum_ortak_cihaz WHERE kapandi IS NULL;

-- Tek satırlık ayar: kayıtsız cihazın profili.
CREATE TABLE oturum_cihaz_ayari (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT oturum_cihaz_ayari_tek CHECK (tek),
  kayitsiz_profil text NOT NULL CONSTRAINT oturum_cihaz_ayari_profil_fk REFERENCES oturum_cihaz_profili,
  surum int NOT NULL DEFAULT 1,
  guncelleyen_kisi_id int CONSTRAINT oturum_cihaz_ayari_guncelleyen_fk REFERENCES kisi,
  guncellendi timestamptz
);
INSERT INTO oturum_cihaz_ayari (kayitsiz_profil) VALUES ('tam');
