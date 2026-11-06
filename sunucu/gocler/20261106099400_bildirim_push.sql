-- ADR 0031: uygulama kapalıyken cihaza içeriksiz Web Push sinyali. Yalnız yeni tablolar; var olan tablolara dokunulmaz.
-- Abonelik: kişinin kendi açtığı cihaz. Uç nokta tarayıcının push servisindeki adrestir; yalnız izin listesindeki ana bilgisayarlar kaydedilir (servis denetler).
CREATE TABLE bildirim_push_abonelik (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kisi_id int NOT NULL CONSTRAINT bildirim_push_abonelik_kisi_fk REFERENCES kisi,
  uc_nokta text NOT NULL CONSTRAINT bildirim_push_abonelik_uc_nokta_tekil UNIQUE
    CONSTRAINT bildirim_push_abonelik_uc_nokta_https CHECK (uc_nokta LIKE 'https://%' AND length(uc_nokta) <= 2048),
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  son_gonderim timestamptz
);
CREATE INDEX bildirim_push_abonelik_kisi ON bildirim_push_abonelik (kisi_id);

-- Kuyruk kişi başına tek satırdır: bekleyen doluysa sinyal gidecek; son gönderim dakikada bir sınırı içindir (birden çok bildirim tek sinyalde).
CREATE TABLE bildirim_push_kuyruk (
  kisi_id int PRIMARY KEY CONSTRAINT bildirim_push_kuyruk_kisi_fk REFERENCES kisi,
  bekleyen timestamptz,
  son_gonderim timestamptz
);
CREATE INDEX bildirim_push_kuyruk_bekleyen ON bildirim_push_kuyruk (bekleyen) WHERE bekleyen IS NOT NULL;

-- Yöneticinin tür bazında açıp kapattığı sinyal; satır yoksa türün varsayılanı (görev, hatırlatma ve acil açık) geçer.
CREATE TABLE bildirim_push_turu (
  tur text PRIMARY KEY,
  acik boolean NOT NULL,
  degistiren_kisi_id int NOT NULL CONSTRAINT bildirim_push_turu_kisi_fk REFERENCES kisi,
  degisti timestamptz NOT NULL DEFAULT now()
);
