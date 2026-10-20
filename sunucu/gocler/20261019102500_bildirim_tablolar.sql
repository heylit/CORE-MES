-- Bildirim merkezi (221 a, 222 a): kişiye kalıcı bildirim kaydı ve olay başına kanal tercihi. Satır kişinindir; yalnız
-- kişinin kendisi okur, okundu ve arşiv işaretler. Silme yok; arşiv kişinin kaldırdığıdır.
CREATE TABLE bildirim_kaydi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kisi_id int NOT NULL CONSTRAINT bildirim_kaydi_kisi_fk REFERENCES kisi,
  tur text NOT NULL CONSTRAINT bildirim_kaydi_tur_gecerli CHECK (tur ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  onem text NOT NULL CONSTRAINT bildirim_kaydi_onem_gecerli CHECK (onem IN ('bilgi', 'uyari', 'acil')),
  baslik text NOT NULL CONSTRAINT bildirim_kaydi_baslik_gecerli CHECK (length(btrim(baslik)) BETWEEN 1 AND 200),
  metin text CONSTRAINT bildirim_kaydi_metin_gecerli CHECK (metin IS NULL OR length(metin) <= 1000),
  yol text CONSTRAINT bildirim_kaydi_yol_gecerli CHECK (yol IS NULL OR (yol ~ '^/[a-z0-9-]' AND length(yol) <= 300)),
  kaynak_modul text NOT NULL,
  -- Aynı kaynak kaydın aynı olayı okunmamışken yeni satır açmaz, sayacı artırır (tur + kaynak kimliği).
  tekil_anahtar text CONSTRAINT bildirim_kaydi_tekil_gecerli CHECK (tekil_anahtar IS NULL OR length(tekil_anahtar) <= 300),
  tekrar_sayisi int NOT NULL DEFAULT 1 CONSTRAINT bildirim_kaydi_tekrar_gecerli CHECK (tekrar_sayisi >= 1),
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  okundu timestamptz,
  arsivlendi timestamptz,
  CONSTRAINT bildirim_kaydi_arsiv_okunmus CHECK (arsivlendi IS NULL OR okundu IS NOT NULL)
);
-- Zil ve liste: kişinin arşivlenmemiş satırları en yeniden eskiye; arşiv aynı dizinle.
CREATE INDEX bildirim_kaydi_kisi_liste ON bildirim_kaydi (kisi_id, (arsivlendi IS NULL), olusturuldu DESC, id DESC);
CREATE UNIQUE INDEX bildirim_kaydi_tekil_okunmamis ON bildirim_kaydi (kisi_id, tekil_anahtar)
  WHERE tekil_anahtar IS NOT NULL AND okundu IS NULL AND arsivlendi IS NULL;

-- Kişi x olay türü kanal seçimi. Satır yoksa olay türünün kod varsayılanı geçer. Uygulama kanalı kapatılamaz: sütunu yok.
CREATE TABLE bildirim_tercihi (
  kisi_id int NOT NULL CONSTRAINT bildirim_tercihi_kisi_fk REFERENCES kisi,
  tur text NOT NULL CONSTRAINT bildirim_tercihi_tur_gecerli CHECK (tur ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  mesaj boolean NOT NULL,
  eposta boolean NOT NULL,
  guncellendi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bildirim_tercihi_pk PRIMARY KEY (kisi_id, tur)
);
