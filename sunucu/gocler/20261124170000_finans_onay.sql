-- 3673: eşiğin üstündeki ödeme, iptal ve bakiye eşitlemesi ikinci kişinin onayını ister (kullanıcı kararı: işlem başına ayrı eşik).
-- Eşik boşsa (NULL) o işlem için onay istenmez; tutar uydurulmaz, ayarla girilir.
CREATE TABLE finans_onay_ayari (
  id int PRIMARY KEY CONSTRAINT finans_onay_ayari_tek CHECK (id = 1),
  esik_odeme numeric(18,2) CONSTRAINT finans_onay_ayari_odeme CHECK (esik_odeme > 0),
  esik_iptal numeric(18,2) CONSTRAINT finans_onay_ayari_iptal CHECK (esik_iptal > 0),
  esik_esitleme numeric(18,2) CONSTRAINT finans_onay_ayari_esitleme CHECK (esik_esitleme > 0),
  guncelleyen_id int REFERENCES kisi (id),
  guncelleme timestamptz,
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1)
);
INSERT INTO finans_onay_ayari (id) VALUES (1);

-- Onay talebi: komutun kendisi (tür, hedef, gövde özeti) onaylanır; onaylanan talep yalnız bir kez ve yalnız talep eden kişi tarafından aynı komutla kullanılır.
-- İkinci kişi kuralı veritabanında da tutulur: karar veren talep eden olamaz.
CREATE TABLE finans_onay (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT finans_onay_tur CHECK (tur IN ('odeme', 'iptal', 'esitleme')),
  hedef text NOT NULL CONSTRAINT finans_onay_hedef CHECK (length(hedef) BETWEEN 3 AND 40),
  ozet text NOT NULL CONSTRAINT finans_onay_ozet CHECK (ozet ~ '^[0-9a-f]{64}$'),
  govde jsonb NOT NULL,
  tutar_tl numeric(18,2) NOT NULL CONSTRAINT finans_onay_tutar CHECK (tutar_tl >= 0),
  gerekce text CONSTRAINT finans_onay_gerekce CHECK (length(gerekce) <= 300),
  talep_eden_id int NOT NULL REFERENCES kisi (id),
  talep_zamani timestamptz NOT NULL DEFAULT now(),
  durum text NOT NULL DEFAULT 'bekliyor' CONSTRAINT finans_onay_durum CHECK (durum IN ('bekliyor', 'onaylandi', 'reddedildi', 'kullanildi', 'vazgecildi')),
  karar_veren_id int REFERENCES kisi (id),
  karar_zamani timestamptz,
  karar_notu text CONSTRAINT finans_onay_karar_notu CHECK (length(karar_notu) <= 300),
  kullanim_zamani timestamptz,
  surum int NOT NULL DEFAULT 1 CHECK (surum >= 1),
  CONSTRAINT finans_onay_ikinci_kisi CHECK (karar_veren_id IS NULL OR karar_veren_id <> talep_eden_id),
  CONSTRAINT finans_onay_karar_kisisi CHECK (durum NOT IN ('onaylandi', 'reddedildi', 'kullanildi') OR (karar_veren_id IS NOT NULL AND karar_zamani IS NOT NULL)),
  CONSTRAINT finans_onay_red_gerekcesi CHECK (durum <> 'reddedildi' OR length(btrim(karar_notu)) > 0),
  CONSTRAINT finans_onay_kullanim CHECK ((durum = 'kullanildi') = (kullanim_zamani IS NOT NULL))
);
-- Aynı kişi aynı komut için aynı anda tek açık talep tutar.
CREATE UNIQUE INDEX finans_onay_acik_tekil ON finans_onay (talep_eden_id, ozet) WHERE durum IN ('bekliyor', 'onaylandi');
CREATE INDEX finans_onay_durum_sirasi ON finans_onay (durum, id DESC);

CREATE FUNCTION finans_onay_gecisi() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.tur, NEW.hedef, NEW.ozet, NEW.govde, NEW.tutar_tl, NEW.talep_eden_id, NEW.talep_zamani)
     IS DISTINCT FROM (OLD.tur, OLD.hedef, OLD.ozet, OLD.govde, OLD.tutar_tl, OLD.talep_eden_id, OLD.talep_zamani) THEN
    RAISE EXCEPTION 'Onay talebinin komutu değişmez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_onay_degismez';
  END IF;
  IF NEW.durum <> OLD.durum AND NOT (
       (OLD.durum = 'bekliyor' AND NEW.durum IN ('onaylandi', 'reddedildi', 'vazgecildi'))
    OR (OLD.durum = 'onaylandi' AND NEW.durum IN ('kullanildi', 'vazgecildi'))) THEN
    RAISE EXCEPTION 'Onay talebi bu durumdan bu duruma geçemez.' USING ERRCODE = 'check_violation', CONSTRAINT = 'finans_onay_gecis';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER finans_onay_gecisi BEFORE UPDATE ON finans_onay FOR EACH ROW EXECUTE FUNCTION finans_onay_gecisi();
CREATE TRIGGER finans_onay_silinmez BEFORE DELETE ON finans_onay FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();

-- Bakiye eşitlemesi gerekçelidir; eski satırlarda gerekçe yoktur (NULL).
ALTER TABLE finans_bakiye_esitleme ADD COLUMN neden text CONSTRAINT finans_bakiye_esitleme_neden CHECK (length(neden) BETWEEN 3 AND 300);
