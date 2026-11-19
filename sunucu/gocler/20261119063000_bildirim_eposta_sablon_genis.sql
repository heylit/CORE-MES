-- 3435-2 a: e-posta şablonunda başlık, düğme yazısı, onay düğmesi, alt bilgi, renk şeridi ve kurum logosu (kart 3435-2 logo a: gömülü,
-- şablon başına, varsayılan kapalı); yönetici yeni şablon açar ve olaya atar.
-- Yalnız ekler: var olan şablon ve tetikleyici satırları değişmez; boş sütun kod varsayılanı demektir.
ALTER TABLE bildirim_eposta_sablonu
  ADD COLUMN baslik_kalibi text CONSTRAINT bildirim_eposta_sablonu_baslik_kalibi_gecerli CHECK (baslik_kalibi IS NULL OR length(btrim(baslik_kalibi)) BETWEEN 1 AND 150),
  ADD COLUMN dugme_yazisi text CONSTRAINT bildirim_eposta_sablonu_dugme_yazisi_gecerli CHECK (dugme_yazisi IS NULL OR length(btrim(dugme_yazisi)) BETWEEN 1 AND 40),
  ADD COLUMN onay_dugmesi boolean,
  ADD COLUMN alt_bilgi text CONSTRAINT bildirim_eposta_sablonu_alt_bilgi_gecerli CHECK (alt_bilgi IS NULL OR length(btrim(alt_bilgi)) BETWEEN 1 AND 300),
  ADD COLUMN serit text CONSTRAINT bildirim_eposta_sablonu_serit_gecerli CHECK (serit IS NULL OR serit ~ '^[a-z]+$'),
  ADD COLUMN logo boolean;

-- Yöneticinin açtığı şablon. Olaya tetikleyicideki sablon_id ile bağlanır; şablon silinirse olay konusunun şablonuna döner.
CREATE TABLE bildirim_eposta_ozel_sablon (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ad text NOT NULL CONSTRAINT bildirim_eposta_ozel_sablon_ad_gecerli CHECK (length(btrim(ad)) BETWEEN 1 AND 80),
  simge text NOT NULL CONSTRAINT bildirim_eposta_ozel_sablon_simge_gecerli CHECK (simge ~ '^[a-z-]+$'),
  konu_kalibi text NOT NULL CONSTRAINT bildirim_eposta_ozel_sablon_konu_kalibi_gecerli CHECK (length(btrim(konu_kalibi)) BETWEEN 1 AND 150),
  baslik_kalibi text CONSTRAINT bildirim_eposta_ozel_sablon_baslik_kalibi_gecerli CHECK (baslik_kalibi IS NULL OR length(btrim(baslik_kalibi)) BETWEEN 1 AND 150),
  govde text NOT NULL CONSTRAINT bildirim_eposta_ozel_sablon_govde_gecerli CHECK (length(btrim(govde)) BETWEEN 1 AND 2000),
  tablo_alanlari text[] NOT NULL DEFAULT '{}',
  dugme_yazisi text CONSTRAINT bildirim_eposta_ozel_sablon_dugme_yazisi_gecerli CHECK (dugme_yazisi IS NULL OR length(btrim(dugme_yazisi)) BETWEEN 1 AND 40),
  onay_dugmesi boolean NOT NULL DEFAULT true,
  alt_bilgi text CONSTRAINT bildirim_eposta_ozel_sablon_alt_bilgi_gecerli CHECK (alt_bilgi IS NULL OR length(btrim(alt_bilgi)) BETWEEN 1 AND 300),
  serit text NOT NULL DEFAULT 'onem' CONSTRAINT bildirim_eposta_ozel_sablon_serit_gecerli CHECK (serit ~ '^[a-z]+$'),
  logo boolean NOT NULL DEFAULT false,
  surum int NOT NULL DEFAULT 1 CONSTRAINT bildirim_eposta_ozel_sablon_surum_gecerli CHECK (surum >= 1),
  degistiren_kisi_id int CONSTRAINT bildirim_eposta_ozel_sablon_degistiren_fk REFERENCES kisi,
  degistirildi timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX bildirim_eposta_ozel_sablon_ad_tekil ON bildirim_eposta_ozel_sablon (lower(btrim(ad)));

ALTER TABLE bildirim_eposta_tetikleyici
  ADD COLUMN sablon_id int CONSTRAINT bildirim_eposta_tetikleyici_sablon_fk REFERENCES bildirim_eposta_ozel_sablon ON DELETE SET NULL;
