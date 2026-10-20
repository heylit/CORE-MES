-- Dosya saklama (kart #82, ADR 0009): içerik özetle tekil, parça parça; dosyayı kullanan kayıt bağ satırıyla tutar.

-- Dosyanın kendisi adsızdır; ad bağdadır. Bağı kalmayan dosya `bagsiz_zaman`dan 7 gün sonra silinir.
CREATE TABLE dosya (
  ozet text PRIMARY KEY CONSTRAINT dosya_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  boyut bigint NOT NULL CONSTRAINT dosya_boyut_pozitif CHECK (boyut > 0),
  tur text NOT NULL CONSTRAINT dosya_tur_degeri CHECK (tur IN ('pdf', 'png', 'jpeg', 'webp', 'step', 'stl', 'iges')),
  ilk_yukleyen_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  bagsiz_zaman timestamptz DEFAULT now()
);

-- İçeriği kendisi gönderip özetini doğrulatan her kişi. Bağlamayı ve bağsız dosyayı okumayı yalnız onlar yapar: özeti bilmek yetmez.
CREATE TABLE dosya_yukleyeni (
  ozet text NOT NULL REFERENCES dosya ON DELETE CASCADE,
  kisi_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ozet, kisi_id)
);
CREATE INDEX dosya_yukleyeni_kisi_idx ON dosya_yukleyeni (kisi_id);

CREATE TABLE dosya_icerigi (
  ozet text NOT NULL REFERENCES dosya ON DELETE CASCADE,
  sira int NOT NULL CONSTRAINT dosya_icerigi_sira_eksi_degil CHECK (sira >= 0),
  icerik bytea NOT NULL CONSTRAINT dosya_icerigi_parca_boyutu CHECK (length(icerik) BETWEEN 1 AND 1048576),
  PRIMARY KEY (ozet, sira)
);

-- Bağı olan dosya silinemez (yabancı anahtar cascade değildir). Modül ve kayıt bağlayan modülün kendi anahtarıdır.
CREATE TABLE dosya_bagi (
  ozet text NOT NULL REFERENCES dosya,
  modul text NOT NULL CONSTRAINT dosya_bagi_modul_bicimi CHECK (modul ~ '^[a-z][a-z0-9-]{0,39}$'),
  kayit text NOT NULL CONSTRAINT dosya_bagi_kayit_uzunlugu CHECK (char_length(kayit) BETWEEN 1 AND 200),
  ad text NOT NULL CONSTRAINT dosya_bagi_ad_uzunlugu CHECK (char_length(btrim(ad)) BETWEEN 1 AND 120),
  belge_turu text CONSTRAINT dosya_bagi_belge_turu_uzunlugu CHECK (char_length(belge_turu) BETWEEN 1 AND 60),
  ekleyen_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ozet, modul, kayit)
);
CREATE INDEX dosya_bagi_kayit_idx ON dosya_bagi (modul, kayit);

-- Yükleme kişi başına şerittir (özet, yükleyen, sıra): kimse başkasının aynı özetli yüklemesini engelleyemez.
CREATE TABLE dosya_yuklemesi (
  ozet text NOT NULL CONSTRAINT dosya_yuklemesi_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  yukleyen_id int NOT NULL REFERENCES kisi,
  sira int NOT NULL CONSTRAINT dosya_yuklemesi_sira_eksi_degil CHECK (sira >= 0),
  toplam int NOT NULL CONSTRAINT dosya_yuklemesi_toplam_sirayi_asar CHECK (toplam > sira),
  icerik bytea NOT NULL CONSTRAINT dosya_yuklemesi_parca_boyutu CHECK (length(icerik) BETWEEN 1 AND 1048576),
  zaman timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ozet, yukleyen_id, sira)
);
