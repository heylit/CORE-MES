-- Arkon üretim kaydının (olay ve sayım) TMI üretim emrine yansıması: kayıt başına tek satır. Arkon kaydı her zaman yazılır; TMI'de geçici hata olursa yansıma "bekliyor" kalır ve yeniden denenir. Geçici olmayan bilinmeyen hata 5 denemeden sonra "hatali" olur. TMI kural reddi nedeniyle saklanır; karşılığı olmayan kayıt "eslenemedi" olur.
CREATE TABLE arkon_tmi_yansima (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kayit_id bigint NOT NULL REFERENCES arkon_kayit (id),
  -- Yabancı anahtar BİLİNÇLİ YOK: uretim_emri'ne anahtar, yansıma satırını yazan işleme emir satırında KEY SHARE kilidi verir; TMI komutunun FOR UPDATE'i bu kilitle çakışır ve iki emirli eşzamanlı isteklerde kilitlenme doğurur.
  emir_id int,
  -- Komutu yapan kişi: kayıt anındaki oturum kişisi; yeniden denemede güncel yetkileriyle çözülür.
  kisi_id int NOT NULL REFERENCES kisi (id),
  sonuc text NOT NULL CONSTRAINT arkon_tmi_yansima_sonuc_degeri CHECK (sonuc IN ('bekliyor', 'yazildi', 'reddedildi', 'eslenemedi', 'hatali')),
  neden text,
  deneme int NOT NULL DEFAULT 0 CONSTRAINT arkon_tmi_yansima_deneme_eksi_degil CHECK (deneme >= 0),
  -- Ayıklanmış hata özeti (SQLSTATE, kısıt/tablo adı, değer taşımayan ileti); reddedilen değer saklanmaz.
  son_hata text,
  son_deneme timestamptz,
  zaman timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT arkon_tmi_yansima_kayit_tekil UNIQUE (kayit_id),
  CONSTRAINT arkon_tmi_yansima_neden_tutarli CHECK ((sonuc IN ('yazildi', 'bekliyor')) = (neden IS NULL)),
  CONSTRAINT arkon_tmi_yansima_bekleyen_emirli CHECK (sonuc <> 'bekliyor' OR emir_id IS NOT NULL)
);
-- Bekleyen sorguları yalnız bekleyen satırlara bakar: sonuçlanmış satırlar çoğaldıkça tablo taranmaz.
CREATE INDEX arkon_tmi_yansima_bekleyen_idx ON arkon_tmi_yansima (emir_id, kayit_id) WHERE sonuc = 'bekliyor';
