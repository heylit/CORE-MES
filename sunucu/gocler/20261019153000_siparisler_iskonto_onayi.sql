-- Eşiği aşan teklif iskontosu müdür onayı bekler (291 a): teklif durumuna 'onay-bekliyor' eklenir, onay yeni tabloda tutulur.
ALTER TABLE siparisler_teklif DROP CONSTRAINT siparisler_teklif_durum;
ALTER TABLE siparisler_teklif ADD CONSTRAINT siparisler_teklif_durum
  CHECK (durum IN ('yeni', 'onay-bekliyor', 'verildi', 'revizyon', 'kabul', 'red', 'siparis'));

-- Sürüm başına en çok bir onay; verilen onay değişmez.
CREATE TABLE siparisler_teklif_iskonto_onayi (
  surum_id int PRIMARY KEY CONSTRAINT siparisler_teklif_iskonto_onayi_surum REFERENCES siparisler_teklif_surumu (id),
  onaylayan_id int NOT NULL CONSTRAINT siparisler_teklif_iskonto_onayi_onaylayan REFERENCES kisi (id),
  an timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER siparisler_teklif_iskonto_onayi_yalniz_ekleme BEFORE UPDATE OR DELETE ON siparisler_teklif_iskonto_onayi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
