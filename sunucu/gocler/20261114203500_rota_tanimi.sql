-- Bir ürünün birden çok rotası olur (3247 a): her rotanın adı, kendi revizyonları ve kendi yürürlükteki revizyonu vardır. Ürünün
-- "Standart" rotası türü yazılmamış her emirde kullanılır; öteki rota yalnız kendisine bağlanan emir türlerinde. Var olan revizyonlar
-- ürünün Standart rotasına bağlanır; hiçbir revizyonun durumu ve içeriği değişmez.
CREATE TABLE rota_tanimi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  malzeme_id int NOT NULL REFERENCES malzeme_katalog_karti (no),
  ad text NOT NULL CONSTRAINT rota_tanimi_ad_bicimi CHECK (btrim(ad) = ad AND ad <> '' AND char_length(ad) <= 60),
  standart boolean NOT NULL DEFAULT false,
  surum int NOT NULL DEFAULT 1 CONSTRAINT rota_tanimi_surum_pozitif CHECK (surum > 0),
  acan_kisi_id int NOT NULL REFERENCES kisi,
  acilma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rota_tanimi_ad_tekil UNIQUE (malzeme_id, ad),
  CONSTRAINT rota_tanimi_kimlik_urun UNIQUE (id, malzeme_id)
);
CREATE UNIQUE INDEX rota_tanimi_tek_standart ON rota_tanimi (malzeme_id) WHERE standart;

-- Emir türü listesi uretim_emri.emir_turu ile aynıdır (paylasilan/sozlesme/emir-turleri.ts; testle eşitlenir). Bir tür ürün içinde
-- tek rotaya bağlanır; Standart rotaya tür yazılmaz (eşleşmeyen tür zaten Standart'ı kullanır).
CREATE TABLE rota_tanimi_turu (
  rota_id int NOT NULL,
  malzeme_id int NOT NULL,
  emir_turu text NOT NULL CONSTRAINT rota_tanimi_turu_deger
    CHECK (emir_turu IN ('seri', 'fai', 'numune', 'prototip', 'stok', 'rework', 'bakim_deneme', 'fason')),
  PRIMARY KEY (rota_id, emir_turu),
  CONSTRAINT rota_tanimi_turu_urunde_tek UNIQUE (malzeme_id, emir_turu),
  CONSTRAINT rota_tanimi_turu_rota FOREIGN KEY (rota_id, malzeme_id) REFERENCES rota_tanimi (id, malzeme_id)
);

CREATE FUNCTION rota_tanimi_turu_standart_degil() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM rota_tanimi t WHERE t.id = NEW.rota_id AND t.standart) THEN
    RAISE EXCEPTION 'Standart rotaya emir türü bağlanmaz (rota %)', NEW.rota_id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_tanimi_turu_standart_degil', TABLE = 'rota_tanimi_turu';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rota_tanimi_turu_standart_degil BEFORE INSERT OR UPDATE ON rota_tanimi_turu
  FOR EACH ROW EXECUTE FUNCTION rota_tanimi_turu_standart_degil();

-- Rota silinmez ve Standart işareti değişmez; eşleme değişikliği deftere düşer (kim, eski, yeni).
CREATE FUNCTION rota_tanimi_kilitli() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Rota silinmez (rota %)', OLD.id USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_tanimi_silinmez', TABLE = 'rota_tanimi';
  END IF;
  IF (NEW.malzeme_id, NEW.standart, NEW.acan_kisi_id, NEW.acilma) IS DISTINCT FROM (OLD.malzeme_id, OLD.standart, OLD.acan_kisi_id, OLD.acilma) THEN
    RAISE EXCEPTION 'Rotanın kimlik alanları değişmez (rota %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_tanimi_kimlik_sabit', TABLE = 'rota_tanimi';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rota_tanimi_kilitli BEFORE UPDATE OR DELETE ON rota_tanimi FOR EACH ROW EXECUTE FUNCTION rota_tanimi_kilitli();
CREATE TRIGGER rota_tanimi_degisiklik AFTER INSERT OR UPDATE ON rota_tanimi FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('id', 'surum');
CREATE TRIGGER rota_tanimi_turu_degisiklik AFTER INSERT OR UPDATE OR DELETE ON rota_tanimi_turu
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('rota_id,emir_turu');

ALTER TABLE rota_revizyonu ADD COLUMN rota_id int;

-- Var olan her ürüne Standart rota açılır; açan, ürünün ilk revizyonunu açan kişidir.
INSERT INTO rota_tanimi (malzeme_id, ad, standart, acan_kisi_id, acilma)
SELECT DISTINCT ON (r.malzeme_id) r.malzeme_id, 'Standart', true, r.acan_kisi_id, r.acilma
  FROM rota_revizyonu r ORDER BY r.malzeme_id, r.id;

-- Revizyon kilidi (iptal değişmez, kimlik alanları sabit) yalnız bu ilk dolum için göçün işlemi içinde kapatılıp açılır.
ALTER TABLE rota_revizyonu DISABLE TRIGGER rota_revizyonu_kilitli;
ALTER TABLE rota_revizyonu DISABLE TRIGGER rota_revizyonu_degisiklik;
UPDATE rota_revizyonu r SET rota_id = t.id FROM rota_tanimi t WHERE t.malzeme_id = r.malzeme_id AND t.standart;
ALTER TABLE rota_revizyonu ENABLE TRIGGER rota_revizyonu_degisiklik;
ALTER TABLE rota_revizyonu ENABLE TRIGGER rota_revizyonu_kilitli;

DO $$
DECLARE bos int;
BEGIN
  SELECT count(*) INTO bos FROM rota_revizyonu WHERE rota_id IS NULL;
  IF bos > 0 THEN
    RAISE EXCEPTION 'Rotasız kalan % revizyon var; göç durdu, satır silinmedi.', bos;
  END IF;
END $$;

ALTER TABLE rota_revizyonu ALTER COLUMN rota_id SET NOT NULL;
ALTER TABLE rota_revizyonu ADD CONSTRAINT rota_revizyonu_rota FOREIGN KEY (rota_id, malzeme_id) REFERENCES rota_tanimi (id, malzeme_id);
CREATE INDEX rota_revizyonu_rota_idx ON rota_revizyonu (rota_id, id);

-- Tekillik ürün yerine rota başınadır: ürünün her rotasında tek yürürlükte ve tek açık revizyon; harf rota içinde tekil.
DROP INDEX rota_revizyonu_tek_yururlukte;
DROP INDEX rota_revizyonu_tek_acik;
CREATE UNIQUE INDEX rota_revizyonu_tek_yururlukte ON rota_revizyonu (rota_id) WHERE durum = 'yururlukte';
CREATE UNIQUE INDEX rota_revizyonu_tek_acik ON rota_revizyonu (rota_id) WHERE durum IN ('taslak', 'onay_bekliyor');
ALTER TABLE rota_revizyonu DROP CONSTRAINT rota_revizyonu_harf_tekil;
ALTER TABLE rota_revizyonu ADD CONSTRAINT rota_revizyonu_harf_tekil UNIQUE (rota_id, harf);

-- Rotası verilmeden açılan revizyon ürünün Standart rotasına girer (rotası olmayan üründe Standart rota açılır): bugünkü bütün
-- açma yolları (boş, şablon, kart, başka ürün, Excel) değişmeden çalışır.
CREATE FUNCTION rota_revizyonu_rotasi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.rota_id IS NULL THEN
    SELECT t.id INTO NEW.rota_id FROM rota_tanimi t WHERE t.malzeme_id = NEW.malzeme_id AND t.standart;
    IF NEW.rota_id IS NULL THEN
      INSERT INTO rota_tanimi (malzeme_id, ad, standart, acan_kisi_id) VALUES (NEW.malzeme_id, 'Standart', true, NEW.acan_kisi_id)
        RETURNING id INTO NEW.rota_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER rota_revizyonu_rotasi BEFORE INSERT ON rota_revizyonu FOR EACH ROW EXECUTE FUNCTION rota_revizyonu_rotasi();

-- Revizyonun rotası kimlik alanıdır: sonradan değişmez.
CREATE OR REPLACE FUNCTION rota_revizyon_kilitli() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Rota revizyonu silinmez (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_silinmez', TABLE = 'rota_revizyonu';
  END IF;
  IF OLD.durum = 'iptal' THEN
    RAISE EXCEPTION 'İptal edilen revizyon değişmez (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_iptal_son', TABLE = 'rota_revizyonu';
  END IF;
  IF (NEW.malzeme_id, NEW.harf, NEW.kaynak_revizyon_id, NEW.acan_kisi_id, NEW.acilma, NEW.rota_id)
       IS DISTINCT FROM (OLD.malzeme_id, OLD.harf, OLD.kaynak_revizyon_id, OLD.acan_kisi_id, OLD.acilma, OLD.rota_id) THEN
    RAISE EXCEPTION 'Revizyonun kimlik alanları değişmez (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_kimlik_sabit', TABLE = 'rota_revizyonu';
  END IF;
  IF OLD.durum <> 'taslak' AND NEW.aciklama IS DISTINCT FROM OLD.aciklama THEN
    RAISE EXCEPTION 'Revizyon yalnız taslakta değişir (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_icerik_kilitli', TABLE = 'rota_revizyonu';
  END IF;
  IF NEW.durum <> OLD.durum AND NOT (
       (OLD.durum = 'taslak' AND NEW.durum IN ('onay_bekliyor', 'iptal'))
    OR (OLD.durum = 'onay_bekliyor' AND NEW.durum IN ('taslak', 'onayli', 'yururlukte'))
    OR (OLD.durum = 'onayli' AND NEW.durum = 'yururlukte')
    OR (OLD.durum = 'yururlukte' AND NEW.durum = 'onayli')) THEN
    RAISE EXCEPTION 'Revizyon durumu % durumundan % durumuna geçemez (revizyon %)', OLD.durum, NEW.durum, OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_durum_gecisi', TABLE = 'rota_revizyonu';
  END IF;
  IF NEW.onaylayan_kisi_id IS NOT NULL AND NOT NEW.dort_gozsuz_onay
     AND NEW.onaylayan_kisi_id IS DISTINCT FROM OLD.onaylayan_kisi_id
     AND EXISTS (SELECT 1 FROM rota_revizyonu_duzenleyen d WHERE d.revizyon_id = NEW.id AND d.kisi_id = NEW.onaylayan_kisi_id) THEN
    RAISE EXCEPTION 'Revizyonu düzenleyen kişi onaylayamaz (revizyon %)', OLD.id
      USING ERRCODE = 'check_violation', CONSTRAINT = 'rota_revizyonu_dort_goz', TABLE = 'rota_revizyonu';
  END IF;
  RETURN NEW;
END $$;
