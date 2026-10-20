-- İdari İşler 3: günün yemek sayısı ve "bildirildi" kaydı (171 a). Yeni, boş tablo.
-- Kadro ve izinli sayısı bildirim anında Vardiya ve İK'dan alınır, kayda sayı olarak yazılır: sonradan değişen izin geçmiş bildirimi bozmaz.

CREATE TABLE idari_isler_yemek_bildirimi (
  id int GENERATED ALWAYS AS IDENTITY CONSTRAINT idari_isler_yemek_bildirimi_pk PRIMARY KEY,
  tarih date NOT NULL,
  kadro int NOT NULL CONSTRAINT idari_isler_yemek_bildirimi_kadro CHECK (kadro >= 0),
  izinli int NOT NULL CONSTRAINT idari_isler_yemek_bildirimi_izinli CHECK (izinli >= 0 AND izinli <= kadro),
  fazla_mesai int NOT NULL CONSTRAINT idari_isler_yemek_bildirimi_fazla_mesai CHECK (fazla_mesai BETWEEN 0 AND 999),
  ziyaretci int NOT NULL CONSTRAINT idari_isler_yemek_bildirimi_ziyaretci CHECK (ziyaretci BETWEEN 0 AND 999),
  duzeltme int NOT NULL CONSTRAINT idari_isler_yemek_bildirimi_duzeltme CHECK (duzeltme BETWEEN -999 AND 999),
  duzeltme_nedeni text CONSTRAINT idari_isler_yemek_bildirimi_neden CHECK (
    duzeltme_nedeni IS NULL OR (btrim(duzeltme_nedeni) <> '' AND length(duzeltme_nedeni) <= 200)
  ),
  sayi int NOT NULL CONSTRAINT idari_isler_yemek_bildirimi_sayi CHECK (sayi >= 0),
  bildiren_kisi_id int NOT NULL CONSTRAINT idari_isler_yemek_bildirimi_bildiren REFERENCES kisi (id),
  bildirim timestamptz NOT NULL DEFAULT now(),
  -- IDR-16: sayı hesabın kendisidir; düzeltme gerekçesiz olmaz.
  CONSTRAINT idari_isler_yemek_bildirimi_hesap CHECK (sayi = kadro - izinli + fazla_mesai + ziyaretci + duzeltme),
  CONSTRAINT idari_isler_yemek_bildirimi_gerekce CHECK (duzeltme = 0 OR duzeltme_nedeni IS NOT NULL)
);
-- Günün geçerli bildirimi en son kayıttır; yanlış bildirim yeni kayıtla düzeltilir.
CREATE INDEX idari_isler_yemek_bildirimi_tarih ON idari_isler_yemek_bildirimi (tarih, id);
CREATE TRIGGER idari_isler_yemek_bildirimi_yalniz_ekleme BEFORE UPDATE OR DELETE ON idari_isler_yemek_bildirimi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
CREATE TRIGGER idari_isler_yemek_bildirimi_bosaltma_yok BEFORE TRUNCATE ON idari_isler_yemek_bildirimi
  FOR EACH STATEMENT EXECUTE FUNCTION yalniz_ekleme();
