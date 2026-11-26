-- 3728: "Sifirdan basla" yalniz kullanicinin gizli anahtariyla imzaladigi izinle calisir. Yeni BOS tablolar ve kurulum kimligi;
-- var olan tablo ve veri degismez, silinmez. Ikisi de sifirlamada kalan listesindedir (ayarlar/kurallar.ts SIFIRLAMA_SISTEM).

-- Kurulum kimligi: izin bu kuruluma baglidir; baska sunucuda ya da baska veritabaninda gecmez. Tek satir.
CREATE TABLE ayarlar_kurulum (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT ayarlar_kurulum_tek CHECK (tek),
  kimlik uuid NOT NULL DEFAULT gen_random_uuid(),
  olusturma timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ayarlar_kurulum DEFAULT VALUES;

-- Imzalanacak istek: sunucu uretir, metni aynen saklar; imza bu metin uzerinden dogrulanir. Bir istek bir kez kullanilir.
CREATE TABLE ayarlar_sifirlama_istegi (
  sayi uuid PRIMARY KEY,
  metin text NOT NULL CONSTRAINT ayarlar_sifirlama_istegi_metin_boyu CHECK (length(metin) BETWEEN 1 AND 1000),
  kisi_id int CONSTRAINT ayarlar_sifirlama_istegi_kisi REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  son timestamptz NOT NULL,
  kullanildi timestamptz,
  CONSTRAINT ayarlar_sifirlama_istegi_sure CHECK (son > olusturma)
);
