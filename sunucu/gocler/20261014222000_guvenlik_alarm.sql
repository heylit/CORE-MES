-- Güvenlik alarm defteri: giriş ve oturum sinyallerinden açılan alarm, onaylanır ve notla kapatılır; kapanan alarm değişmez ve
-- saklama süresi (400 gün) dolmadan silinmez. Süre guvenlik/kurallar.ts SAKLAMA_GUN ile aynıdır; ikisini davranış testi bağlar.
CREATE TABLE guvenlik_alarmi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sinyal text NOT NULL CONSTRAINT guvenlik_alarmi_sinyal_gecerli
    CHECK (sinyal IN ('hatali-giris-serisi', 'yayilan-deneme', 'cok-oturum', 'hedefli-hesap', 'hesap-kilidi')),
  onem text NOT NULL CONSTRAINT guvenlik_alarmi_onem_gecerli CHECK (onem IN ('kritik', 'yuksek', 'orta')),
  kullanici_adi text CONSTRAINT guvenlik_alarmi_kullanici_adi_gecerli CHECK (length(kullanici_adi) BETWEEN 1 AND 80),
  ip text CONSTRAINT guvenlik_alarmi_ip_gecerli CHECK (length(ip) BETWEEN 1 AND 100),
  kisi_id int CONSTRAINT guvenlik_alarmi_kisi_fk REFERENCES kisi,
  gozlenen_sayi int NOT NULL CONSTRAINT guvenlik_alarmi_gozlenen_gecerli CHECK (gozlenen_sayi >= 1),
  tekrar_sayisi int NOT NULL DEFAULT 1 CONSTRAINT guvenlik_alarmi_tekrar_gecerli CHECK (tekrar_sayisi >= 1),
  ilk_goruldu timestamptz NOT NULL DEFAULT now(),
  son_goruldu timestamptz NOT NULL DEFAULT now(),
  durum text NOT NULL DEFAULT 'acik' CONSTRAINT guvenlik_alarmi_durum_gecerli CHECK (durum IN ('acik', 'onaylandi', 'kapandi')),
  onaylayan_kisi_id int CONSTRAINT guvenlik_alarmi_onaylayan_fk REFERENCES kisi,
  onaylandi timestamptz,
  kapatan_kisi_id int CONSTRAINT guvenlik_alarmi_kapatan_fk REFERENCES kisi,
  kapandi timestamptz,
  kapanis_notu text CONSTRAINT guvenlik_alarmi_not_gecerli CHECK (length(btrim(kapanis_notu)) BETWEEN 1 AND 2000),
  surum integer NOT NULL DEFAULT 1,
  CONSTRAINT guvenlik_alarmi_zaman_sirasi CHECK (son_goruldu >= ilk_goruldu),
  -- Kaynak sinyalin baktığı alandır; boş kaynaklı alarm kime bakılacağını söylemez.
  CONSTRAINT guvenlik_alarmi_kaynak_sinyale_uygun CHECK (
    (sinyal = 'hatali-giris-serisi' AND kullanici_adi IS NOT NULL)
    OR (sinyal = 'yayilan-deneme' AND ip IS NOT NULL)
    OR (sinyal = 'cok-oturum' AND kisi_id IS NOT NULL)
    OR (sinyal = 'hedefli-hesap' AND kullanici_adi IS NOT NULL)
    OR (sinyal = 'hesap-kilidi' AND kullanici_adi IS NOT NULL)
  ),
  CONSTRAINT guvenlik_alarmi_onay_butun CHECK ((onaylayan_kisi_id IS NULL) = (onaylandi IS NULL)),
  CONSTRAINT guvenlik_alarmi_kapanis_butun CHECK (
    (kapatan_kisi_id IS NULL AND kapandi IS NULL AND kapanis_notu IS NULL)
    OR (kapatan_kisi_id IS NOT NULL AND kapandi IS NOT NULL AND kapanis_notu IS NOT NULL)
  ),
  CONSTRAINT guvenlik_alarmi_durum_tutarli CHECK (
    (durum = 'acik' AND onaylandi IS NULL AND kapandi IS NULL)
    OR (durum = 'onaylandi' AND onaylandi IS NOT NULL AND kapandi IS NULL)
    OR (durum = 'kapandi' AND kapandi IS NOT NULL)
  )
);

-- Aynı sinyal ve kaynak için kapanmamış en çok bir alarm: eşzamanlı iki tarama ikinci kopyayı açamaz.
CREATE UNIQUE INDEX guvenlik_alarmi_acik_tekil ON guvenlik_alarmi
  (sinyal, coalesce(kullanici_adi, ''), coalesce(ip, ''), coalesce(kisi_id, 0)) WHERE durum <> 'kapandi';
-- Liste durum süzgeciyle, önem ve son görülmeye göre okunur.
CREATE INDEX guvenlik_alarmi_liste ON guvenlik_alarmi (durum, son_goruldu DESC, id DESC);

-- Durum yalnız ileri gider; kapanan alarm değişmez; kaynak ve ilk görülme sonradan değişmez; onay bilgisi bir kez yazılır.
-- Silme yalnız kapanışının üzerinden 400 gün geçmiş alarmda geçer (veritabanı saati: uygulamanın saatine güvenilmez).
CREATE FUNCTION guvenlik_alarmi_koru() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sira CONSTANT text[] := ARRAY['acik', 'onaylandi', 'kapandi'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.durum = 'kapandi' AND OLD.kapandi < now() - interval '400 days' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'guvenlik_alarmi: yalnız kapanışının üzerinden 400 gün geçmiş alarm silinir'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'guvenlik_alarmi_silinmez';
  END IF;
  IF OLD.durum = 'kapandi' THEN
    RAISE EXCEPTION 'guvenlik_alarmi: kapanmış alarm değiştirilemez'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'guvenlik_alarmi_kapanan_degismez';
  END IF;
  IF array_position(sira, NEW.durum) < array_position(sira, OLD.durum) THEN
    RAISE EXCEPTION 'guvenlik_alarmi: durum geri gidemez'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'guvenlik_alarmi_durum_ileri';
  END IF;
  IF NEW.sinyal IS DISTINCT FROM OLD.sinyal OR NEW.onem IS DISTINCT FROM OLD.onem
     OR NEW.kullanici_adi IS DISTINCT FROM OLD.kullanici_adi OR NEW.ip IS DISTINCT FROM OLD.ip
     OR NEW.kisi_id IS DISTINCT FROM OLD.kisi_id OR NEW.ilk_goruldu IS DISTINCT FROM OLD.ilk_goruldu
     OR (OLD.onaylandi IS NOT NULL AND (NEW.onaylandi IS DISTINCT FROM OLD.onaylandi
         OR NEW.onaylayan_kisi_id IS DISTINCT FROM OLD.onaylayan_kisi_id)) THEN
    RAISE EXCEPTION 'guvenlik_alarmi: kaynak, ilk görülme ve onay bilgisi değişmez'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'guvenlik_alarmi_kaynak_degismez';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER guvenlik_alarmi_koruma BEFORE UPDATE OR DELETE ON guvenlik_alarmi
  FOR EACH ROW EXECUTE FUNCTION guvenlik_alarmi_koru();
-- Satır tetikleyicisi TRUNCATE'te çalışmaz.
CREATE TRIGGER guvenlik_alarmi_bosaltilmaz BEFORE TRUNCATE ON guvenlik_alarmi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Yalnız en az bir yeni alarm açan tarama yazılır: her dakikalık boş tur defteri doldurmasın. Satır değişmez; saklama süresi
-- dolunca silinir.
CREATE TABLE guvenlik_taramasi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  calisti timestamptz NOT NULL DEFAULT now(),
  yeni_alarm int NOT NULL CONSTRAINT guvenlik_taramasi_yeni_alarm_gecerli CHECK (yeni_alarm >= 1),
  guncellenen_alarm int NOT NULL CONSTRAINT guvenlik_taramasi_guncellenen_gecerli CHECK (guncellenen_alarm >= 0)
);
CREATE INDEX guvenlik_taramasi_zaman ON guvenlik_taramasi (calisti DESC, id DESC);

CREATE FUNCTION guvenlik_taramasi_eski_silinir() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.calisti < now() - interval '400 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'guvenlik_taramasi: yalnız 400 günden eski satır silinir'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'guvenlik_taramasi_silinmez';
END $$;

CREATE TRIGGER guvenlik_taramasi_degismez BEFORE UPDATE ON guvenlik_taramasi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER guvenlik_taramasi_genc_silinmez BEFORE DELETE ON guvenlik_taramasi
  FOR EACH ROW EXECUTE FUNCTION guvenlik_taramasi_eski_silinir();
CREATE TRIGGER guvenlik_taramasi_bosaltilmaz BEFORE TRUNCATE ON guvenlik_taramasi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- Son taramanın zamanı tek satırda: "tarama durdu" bilgisi buradan çıkar. Tablo birden çok satır taşıyamaz.
CREATE TABLE guvenlik_tarama_durumu (
  tek boolean PRIMARY KEY DEFAULT true CONSTRAINT guvenlik_tarama_durumu_tek CHECK (tek),
  son_tarama timestamptz NOT NULL
);
