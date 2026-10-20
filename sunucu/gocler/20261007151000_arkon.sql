-- Arkon MES'in kendi kayıtları. Arkon değiştirilmeden çalıştığı için belgeler onun biçiminde (jsonb) saklanır;
-- TMI'nin sahip olduğu veri (tesis, kişiler, nedenler, emirler) burada tutulmaz, istekte TMI'den okunur.

-- Belge: Arkon deposu + kimlik. surum milisaniyedir ve her yazımda artar; eşzamanlı yazma bununla yakalanır.
CREATE TABLE arkon_belge (
  depo text NOT NULL CONSTRAINT arkon_belge_depo_degeri
    CHECK (depo IN ('pkgs', 'results', 'requests', 'draws', 'downs', 'maint', 'gauges', 'logi', 'kv')),
  kimlik text NOT NULL CONSTRAINT arkon_belge_kimlik_bicimi CHECK (length(kimlik) BETWEEN 1 AND 200),
  govde jsonb NOT NULL,
  surum bigint NOT NULL CONSTRAINT arkon_belge_surum_pozitif CHECK (surum > 0),
  degistiren_id int NOT NULL REFERENCES kisi,
  degisti timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (depo, kimlik)
);

-- Üretim kayıtları yalnız eklenir. Süzgeç alanları sütundur; satırın tamamı Arkon biçimiyle govde'dedir.
CREATE TABLE arkon_kayit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT arkon_kayit_tur_degeri CHECK (tur IN ('events', 'counts', 'meas', 'calls', 'audit')),
  cid text NOT NULL CONSTRAINT arkon_kayit_cid_bicimi CHECK (length(cid) BETWEEN 1 AND 100),
  zaman timestamptz NOT NULL,
  makine text,
  is_merkezi text,
  emir_no text,
  paket_id text,
  madde_id int,
  govde jsonb NOT NULL,
  kisi_id int NOT NULL REFERENCES kisi,
  CONSTRAINT arkon_kayit_cid_benzersiz UNIQUE (tur, cid)
);
CREATE INDEX arkon_kayit_tur_zaman_idx ON arkon_kayit (tur, zaman);
CREATE TRIGGER arkon_kayit_degismez BEFORE UPDATE OR DELETE ON arkon_kayit
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER arkon_kayit_bosaltilmaz BEFORE TRUNCATE ON arkon_kayit
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Dosya içeriği (PDF, STEP, 3B ağı) içerik özetiyle bir kez saklanır; belgeler özeti anar.
CREATE TABLE arkon_dosya (
  ozet text PRIMARY KEY CONSTRAINT arkon_dosya_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  icerik bytea NOT NULL,
  boyut int NOT NULL CONSTRAINT arkon_dosya_boyut_tutarli CHECK (boyut = length(icerik)),
  yukleyen_id int NOT NULL REFERENCES kisi,
  zaman timestamptz NOT NULL DEFAULT now()
);

-- Yüklenmekte olan dosyanın parçaları; son parça gelince birleşip arkon_dosya'ya geçer ve silinir.
CREATE TABLE arkon_dosya_parcasi (
  ozet text NOT NULL CONSTRAINT arkon_dosya_parcasi_ozet_bicimi CHECK (ozet ~ '^[0-9a-f]{64}$'),
  sira int NOT NULL CONSTRAINT arkon_dosya_parcasi_sira_eksi_degil CHECK (sira >= 0),
  toplam int NOT NULL CONSTRAINT arkon_dosya_parcasi_toplam_pozitif CHECK (toplam > sira),
  icerik bytea NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ozet, sira)
);

-- Anlık iletim: cihazlar kısa aralıkla son gördükleri numaradan sonrasını okur. Eski iletiler yazarken silinir.
CREATE TABLE arkon_ileti (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kaynak text NOT NULL,
  govde jsonb NOT NULL,
  zaman timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX arkon_ileti_zaman_idx ON arkon_ileti (zaman);
