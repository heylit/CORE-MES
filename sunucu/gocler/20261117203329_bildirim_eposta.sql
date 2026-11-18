-- E-posta kanalı (ADR 0015, 3397): tür başına tetikleyici, konu başına şablon, gönderim kuyruğu ve yalnız eklenen gönderim defteri.
-- Yalnız yeni tablolar; var olan veri değişmez. Satırı olmayan tür ve konu kod varsayılanıyla çalışır.

-- Tür başına e-posta tetikleyicisi. Satır yoksa türün kod varsayılanı (varsayilan.eposta, hemen, tekrar ve kademe yok) geçer.
CREATE TABLE bildirim_eposta_tetikleyici (
  tur text PRIMARY KEY CONSTRAINT bildirim_eposta_tetikleyici_tur_gecerli CHECK (tur ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  eposta boolean NOT NULL,
  zaman text NOT NULL CONSTRAINT bildirim_eposta_tetikleyici_zaman_gecerli CHECK (zaman IN ('hemen', 'ozet')),
  tekrar_gun int CONSTRAINT bildirim_eposta_tetikleyici_tekrar_gun_gecerli CHECK (tekrar_gun BETWEEN 1 AND 60),
  tekrar_en_cok int CONSTRAINT bildirim_eposta_tetikleyici_tekrar_en_cok_gecerli CHECK (tekrar_en_cok BETWEEN 1 AND 10),
  yukselt_gun int CONSTRAINT bildirim_eposta_tetikleyici_yukselt_gun_gecerli CHECK (yukselt_gun BETWEEN 1 AND 60),
  surum int NOT NULL DEFAULT 1 CONSTRAINT bildirim_eposta_tetikleyici_surum_gecerli CHECK (surum >= 1),
  degistiren_kisi_id int CONSTRAINT bildirim_eposta_tetikleyici_degistiren_fk REFERENCES kisi,
  degistirildi timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bildirim_eposta_tetikleyici_tekrar_butun CHECK ((tekrar_gun IS NULL) = (tekrar_en_cok IS NULL))
);
CREATE TABLE bildirim_eposta_yukselt_rolu (
  tur text NOT NULL CONSTRAINT bildirim_eposta_yukselt_rolu_tur_fk REFERENCES bildirim_eposta_tetikleyici ON DELETE CASCADE,
  rol_id int NOT NULL CONSTRAINT bildirim_eposta_yukselt_rolu_rol_fk REFERENCES rol,
  CONSTRAINT bildirim_eposta_yukselt_rolu_pk PRIMARY KEY (tur, rol_id)
);
CREATE TABLE bildirim_eposta_yukselt_kisisi (
  tur text NOT NULL CONSTRAINT bildirim_eposta_yukselt_kisisi_tur_fk REFERENCES bildirim_eposta_tetikleyici ON DELETE CASCADE,
  kisi_id int NOT NULL CONSTRAINT bildirim_eposta_yukselt_kisisi_kisi_fk REFERENCES kisi,
  CONSTRAINT bildirim_eposta_yukselt_kisisi_pk PRIMARY KEY (tur, kisi_id)
);

-- Konu başına şablon. Satır yoksa kod varsayılanı geçer; yer tutucu ve tablo alanı listesi sunucuda sözleşmeden sınanır.
CREATE TABLE bildirim_eposta_sablonu (
  konu text PRIMARY KEY CONSTRAINT bildirim_eposta_sablonu_konu_gecerli CHECK (konu ~ '^[a-z-]+$'),
  simge text NOT NULL CONSTRAINT bildirim_eposta_sablonu_simge_gecerli CHECK (simge ~ '^[a-z-]+$'),
  konu_kalibi text NOT NULL CONSTRAINT bildirim_eposta_sablonu_konu_kalibi_gecerli CHECK (length(btrim(konu_kalibi)) BETWEEN 1 AND 150),
  govde text NOT NULL CONSTRAINT bildirim_eposta_sablonu_govde_gecerli CHECK (length(btrim(govde)) BETWEEN 1 AND 2000),
  tablo_alanlari text[] NOT NULL DEFAULT '{}',
  surum int NOT NULL DEFAULT 1 CONSTRAINT bildirim_eposta_sablonu_surum_gecerli CHECK (surum >= 1),
  degistiren_kisi_id int CONSTRAINT bildirim_eposta_sablonu_degistiren_fk REFERENCES kisi,
  degistirildi timestamptz NOT NULL DEFAULT now()
);

-- Gönderilecek e-postalar. Kaynak bildirim silinirse e-posta da düşer. kisi_id boş satır kademe beklemesidir: zamanı gelince
-- kaynak bildirim hâlâ açıksa türün kademe alıcılarına kişi satırları açılır.
CREATE TABLE bildirim_eposta_kuyrugu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kisi_id int CONSTRAINT bildirim_eposta_kuyrugu_kisi_fk REFERENCES kisi,
  bildirim_id int CONSTRAINT bildirim_eposta_kuyrugu_bildirim_fk REFERENCES bildirim_kaydi ON DELETE CASCADE,
  tur text NOT NULL CONSTRAINT bildirim_eposta_kuyrugu_tur_gecerli CHECK (tur ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  onem text NOT NULL CONSTRAINT bildirim_eposta_kuyrugu_onem_gecerli CHECK (onem IN ('bilgi', 'uyari', 'acil')),
  baslik text NOT NULL CONSTRAINT bildirim_eposta_kuyrugu_baslik_gecerli CHECK (length(btrim(baslik)) BETWEEN 1 AND 200),
  kayit_no text CONSTRAINT bildirim_eposta_kuyrugu_kayit_no_gecerli CHECK (kayit_no IS NULL OR length(kayit_no) <= 100),
  yol text CONSTRAINT bildirim_eposta_kuyrugu_yol_gecerli CHECK (yol IS NULL OR (yol ~ '^/[a-z0-9-]' AND length(yol) <= 300)),
  gecikme_gunu int CONSTRAINT bildirim_eposta_kuyrugu_gecikme_gecerli CHECK (gecikme_gunu IS NULL OR gecikme_gunu >= 0),
  istasyon text CONSTRAINT bildirim_eposta_kuyrugu_istasyon_gecerli CHECK (istasyon IS NULL OR length(istasyon) <= 100),
  olay_zamani timestamptz NOT NULL DEFAULT now(),
  kademe int NOT NULL DEFAULT 0 CONSTRAINT bildirim_eposta_kuyrugu_kademe_gecerli CHECK (kademe IN (0, 1)),
  tekrar_no int NOT NULL DEFAULT 0 CONSTRAINT bildirim_eposta_kuyrugu_tekrar_gecerli CHECK (tekrar_no BETWEEN 0 AND 10),
  ozet boolean NOT NULL DEFAULT false,
  zamani timestamptz NOT NULL DEFAULT now(),
  deneme int NOT NULL DEFAULT 0 CONSTRAINT bildirim_eposta_kuyrugu_deneme_gecerli CHECK (deneme BETWEEN 0 AND 3),
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bildirim_eposta_kuyrugu_kademe_bekleme CHECK (kisi_id IS NOT NULL OR (kademe = 1 AND bildirim_id IS NOT NULL))
);
CREATE INDEX bildirim_eposta_kuyrugu_sira ON bildirim_eposta_kuyrugu (ozet, zamani, id);

-- Her gönderim denemesinin sonucu (ADR 0015 md 6). Hata metni sunucu adresini ve parolayı taşımaz; yalnız eklenir.
CREATE TABLE bildirim_eposta_defteri (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zaman timestamptz NOT NULL DEFAULT now(),
  kisi_id int CONSTRAINT bildirim_eposta_defteri_kisi_fk REFERENCES kisi,
  tur text NOT NULL,
  baslik text NOT NULL,
  kayit_no text,
  sonuc text NOT NULL CONSTRAINT bildirim_eposta_defteri_sonuc_gecerli CHECK (sonuc IN ('gonderildi', 'gonderilemedi', 'atlandi')),
  neden text CONSTRAINT bildirim_eposta_defteri_neden_gecerli CHECK (neden IS NULL OR length(neden) <= 300)
);
CREATE INDEX bildirim_eposta_defteri_liste ON bildirim_eposta_defteri (zaman DESC, id DESC);
CREATE INDEX bildirim_eposta_defteri_kisi_gun ON bildirim_eposta_defteri (kisi_id, zaman) WHERE sonuc = 'gonderildi';
CREATE TRIGGER bildirim_eposta_defteri_yalniz_ekleme BEFORE UPDATE OR DELETE ON bildirim_eposta_defteri
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER bildirim_eposta_defteri_bosaltilmaz BEFORE TRUNCATE ON bildirim_eposta_defteri
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
