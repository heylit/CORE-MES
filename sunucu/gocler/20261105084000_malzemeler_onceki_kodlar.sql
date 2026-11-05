-- 2116h (kullanıcı onayı 05.11 "EVET"): kodu Logo'da başka bir malzemede kullanılan kart aynı önekte yeni koda geçer; eski kod
-- onceki_kodlar'da kalır (basılı etiket ve eski kayıtlar onu taşır, aramada ve koddan kart çözümünde bulunur). Kart iç numarasıyla
-- bağlı olduğu için başka kayıt değişmez. Taslak dışı kartta sıra yalnız eski kodu onceki_kodlar'a ekleyerek değişir; önek, tür ve
-- Logo kaydı olan kart kilitli kalır. Var olan satırlar boş dizi alır.

ALTER TABLE malzeme_katalog_karti ADD COLUMN onceki_kodlar text[] NOT NULL DEFAULT '{}'
  CONSTRAINT malzeme_katalog_karti_onceki_kodlar_dolu CHECK (array_position(onceki_kodlar, NULL) IS NULL AND cardinality(onceki_kodlar) <= 20);
CREATE INDEX malzeme_katalog_karti_onceki_kodlar ON malzeme_katalog_karti USING gin (onceki_kodlar);
-- Arama (ARAMA_KOSULU) önceki kodları tek metin olarak trigram indeksiyle arar: OR'lu koşulun her kolu indekse düşmezse BitmapOr
-- kurulmaz ve arama tam taramaya döner (arama-indeksi.test.ts). array_to_string STABLE olduğu için text[] için IMMUTABLE sarmalayıcı;
-- text dizisinin metne çevrimi ayara bağlı değildir.
CREATE FUNCTION malzeme_onceki_kodlar_metni(kodlar text[]) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  AS $$ SELECT NULLIF(pg_catalog.array_to_string(kodlar, ' '), '') $$;
CREATE INDEX malzemeler_malzeme_katalog_karti_onceki_kod_trgm ON malzeme_katalog_karti
  USING gin (public.arama_sade(malzeme_onceki_kodlar_metni(onceki_kodlar)) public.gin_trgm_ops);

-- İşlev 20261105080000 (2114b) sürümünün üzerine yazılır; yalnız önceki kod kuralı eklenir, pasife alma bekleyen kartta silme izni korunur.
CREATE OR REPLACE FUNCTION malzeme_katalog_karti_koru() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  yeni_koda_gecis boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.logo_kayit_no IS NOT NULL AND OLD.logo_pasif_durumu IS DISTINCT FROM 'bekliyor' AND OLD.logo_pasif_durumu IS DISTINCT FROM 'hata' THEN
      RAISE EXCEPTION 'Logo''ya gönderilmiş malzeme kartı silinmez (kart %)', OLD.kimlik
        USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_silinmez';
    END IF;
    RETURN OLD;
  END IF;
  IF NEW.acan_kisi_id IS DISTINCT FROM OLD.acan_kisi_id THEN
    RAISE EXCEPTION 'Stok kodu, tür ve açan kişi değişmez (kart %)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_degismez';
  END IF;
  yeni_koda_gecis := NEW.onek = OLD.onek AND NEW.tur = OLD.tur AND NEW.sira_no <> OLD.sira_no AND OLD.logo_kayit_no IS NULL
    AND NEW.onceki_kodlar = OLD.onceki_kodlar || OLD.stok_kodu;
  IF NEW.onceki_kodlar IS DISTINCT FROM OLD.onceki_kodlar AND NOT yeni_koda_gecis THEN
    RAISE EXCEPTION 'Önceki kodlar yalnız yeni koda geçişte eklenir (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_onceki_kodlar';
  END IF;
  IF (OLD.onay_durumu <> 'taslak' OR OLD.aktif_oldu) AND NOT yeni_koda_gecis
     AND (NEW.onek, NEW.sira_no, NEW.tur) IS DISTINCT FROM (OLD.onek, OLD.sira_no, OLD.tur) THEN
    RAISE EXCEPTION 'Stok kodu, tür ve açan kişi değişmez (kart %)', OLD.kimlik USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_degismez';
  END IF;
  IF OLD.logo_kayit_no IS NOT NULL AND (
       (NEW.onek, NEW.sira_no, NEW.tur) IS DISTINCT FROM (OLD.onek, OLD.sira_no, OLD.tur)
       OR NEW.kayit #>> '{com,birim}' IS DISTINCT FROM OLD.kayit #>> '{com,birim}') THEN
    RAISE EXCEPTION 'Logo kaydı olan kartın stok kodu, türü ve birimi değişmez (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_logo_kilidi';
  END IF;
  IF OLD.logo_gonderim_durumu = 'gonderildi' AND (NEW.logo_gonderim_durumu, NEW.logo_kayit_no, NEW.logo_kart_turu, NEW.logo_birim_seti, NEW.logo_gonderim_zamani)
       IS DISTINCT FROM (OLD.logo_gonderim_durumu, OLD.logo_kayit_no, OLD.logo_kart_turu, OLD.logo_birim_seti, OLD.logo_gonderim_zamani) THEN
    RAISE EXCEPTION 'Logo''ya gönderilmiş kartın gönderim kaydı değişmez (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_logo_gonderildi';
  END IF;
  IF OLD.logo_gonderim_durumu IS NOT NULL AND NEW.logo_gonderim_durumu IS NULL THEN
    RAISE EXCEPTION 'Logo gönderim durumu boşaltılmaz (kart %)', OLD.kimlik
      USING ERRCODE = 'check_violation', CONSTRAINT = 'malzeme_katalog_karti_logo_gonderildi';
  END IF;
  IF NOT OLD.aktif_oldu AND NEW.onay_durumu = 'aktif' AND NEW.logo_gonderim_durumu IS NULL THEN
    NEW.logo_gonderim_durumu := 'bekliyor';
  END IF;
  NEW.aktif_oldu := OLD.aktif_oldu OR NEW.onay_durumu IN ('aktif', 'pasif');
  RETURN NEW;
END $$;
