-- Reddedilen istek (1363 a): oturumsuz istek, yetki ve kapsam reddi, cihaz profili ve dosya türü reddi, var olmayan adres.
-- Çekirdek olayı bellekte tutar, Güvenlik Merkezi taraması buraya yazar. Satır değişmez; 90 günden genç satır silinmez
-- (süre guvenlik/kurallar.ts RED_SAKLAMA_GUN ile aynıdır; ikisini davranış testi bağlar). Yol, kayıtlı uçta yol kalıbıdır
-- (adresteki kimlik yazılmaz); var olmayan adreste istenen yol sorgu dizgesi olmadan ve kısaltılmış olarak yazılır.
CREATE TABLE guvenlik_red_olayi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  zaman timestamptz NOT NULL,
  neden text NOT NULL CONSTRAINT guvenlik_red_olayi_neden_gecerli
    CHECK (neden IN ('oturum-yok', 'yetki', 'kapsam', 'dis-izleyici', 'cihaz', 'dosya-turu', 'adres-yok')),
  kisi_id int CONSTRAINT guvenlik_red_olayi_kisi_fk REFERENCES kisi,
  yontem text NOT NULL CONSTRAINT guvenlik_red_olayi_yontem_gecerli CHECK (length(yontem) BETWEEN 1 AND 10),
  yol text NOT NULL CONSTRAINT guvenlik_red_olayi_yol_gecerli CHECK (length(yol) BETWEEN 1 AND 200),
  ip text CONSTRAINT guvenlik_red_olayi_ip_gecerli CHECK (length(ip) BETWEEN 1 AND 100),
  -- Kapıda kişi bilinmeyen nedenler kişisizdir; ötekilerde kişi vardır.
  CONSTRAINT guvenlik_red_olayi_kisi_nedene_uygun CHECK ((kisi_id IS NULL) = (neden IN ('oturum-yok', 'adres-yok')))
);
CREATE INDEX guvenlik_red_olayi_zaman ON guvenlik_red_olayi (zaman DESC, id DESC);
CREATE INDEX guvenlik_red_olayi_kisi ON guvenlik_red_olayi (kisi_id, zaman) WHERE kisi_id IS NOT NULL;
CREATE INDEX guvenlik_red_olayi_ip ON guvenlik_red_olayi (ip, zaman) WHERE ip IS NOT NULL;

CREATE FUNCTION guvenlik_red_olayi_eski_silinir() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.zaman < now() - interval '90 days' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'guvenlik_red_olayi: yalnız 90 günden eski satır silinir'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'guvenlik_red_olayi_silinmez';
END $$;

CREATE TRIGGER guvenlik_red_olayi_degismez BEFORE UPDATE ON guvenlik_red_olayi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER guvenlik_red_olayi_genc_silinmez BEFORE DELETE ON guvenlik_red_olayi
  FOR EACH ROW EXECUTE FUNCTION guvenlik_red_olayi_eski_silinir();
CREATE TRIGGER guvenlik_red_olayi_bosaltilmaz BEFORE TRUNCATE ON guvenlik_red_olayi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();

-- 1367 a (teyitli): alarm defterine iki sinyal eklenir; mevcut alarm satırları değişmez. Yetki reddi serisinin kaynağı kişi,
-- adres taramasının kaynağı cihazdır.
ALTER TABLE guvenlik_alarmi DROP CONSTRAINT guvenlik_alarmi_sinyal_gecerli;
ALTER TABLE guvenlik_alarmi ADD CONSTRAINT guvenlik_alarmi_sinyal_gecerli
  CHECK (sinyal IN ('hatali-giris-serisi', 'yayilan-deneme', 'cok-oturum', 'hedefli-hesap', 'hesap-kilidi', 'yetki-reddi-serisi', 'adres-taramasi'));
ALTER TABLE guvenlik_alarmi DROP CONSTRAINT guvenlik_alarmi_kaynak_sinyale_uygun;
ALTER TABLE guvenlik_alarmi ADD CONSTRAINT guvenlik_alarmi_kaynak_sinyale_uygun CHECK (
  (sinyal = 'hatali-giris-serisi' AND kullanici_adi IS NOT NULL)
  OR (sinyal = 'yayilan-deneme' AND ip IS NOT NULL)
  OR (sinyal = 'cok-oturum' AND kisi_id IS NOT NULL)
  OR (sinyal = 'hedefli-hesap' AND kullanici_adi IS NOT NULL)
  OR (sinyal = 'hesap-kilidi' AND kullanici_adi IS NOT NULL)
  OR (sinyal = 'yetki-reddi-serisi' AND kisi_id IS NOT NULL)
  OR (sinyal = 'adres-taramasi' AND ip IS NOT NULL)
);
