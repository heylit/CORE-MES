-- Ortak cihaz (kart #739, karar 738 a): yönetici tesisteki paylaşılan tableti ya da bilgisayarı ortak cihaz olarak kaydeder; cihaz
-- uzun ömürlü bir belirteç çerezi taşır. Kayıtlı cihaz Arkon dosyalarını çıkışta tutar; kayıtsız (kişisel) cihaz kalıcı veri tutmaz.
-- Belirteç saklanmaz, yalnız özeti tutulur (oturum anahtarıyla aynı neden). İptal satırı siler değil kapatır: kim, ne zaman görünür.
CREATE TABLE oturum_ortak_cihaz (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  belirtec_ozeti text NOT NULL CONSTRAINT oturum_ortak_cihaz_belirtec_tekil UNIQUE,
  ad text NOT NULL CONSTRAINT oturum_ortak_cihaz_ad CHECK (btrim(ad) = ad AND length(ad) BETWEEN 1 AND 80),
  kaydeden_kisi_id int NOT NULL CONSTRAINT oturum_ortak_cihaz_kaydeden_fk REFERENCES kisi,
  kaydedildi timestamptz NOT NULL,
  kapandi timestamptz,
  kapatan_kisi_id int CONSTRAINT oturum_ortak_cihaz_kapatan_fk REFERENCES kisi,
  CONSTRAINT oturum_ortak_cihaz_kapanis_butun CHECK ((kapandi IS NULL) = (kapatan_kisi_id IS NULL))
);
-- Açık cihazların adı tekildir: listede iki "Tezgah 3 tableti" ayırt edilemez.
CREATE UNIQUE INDEX oturum_ortak_cihaz_acik_ad ON oturum_ortak_cihaz (lower(ad)) WHERE kapandi IS NULL;
