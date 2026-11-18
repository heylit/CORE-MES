-- 3427-4 a: onaylı sipariş yeni sürümle düzenlenir; her sürüm kim, ne zaman, neden ve ne değişti ile yalnız eklenir. Yeni tablo; veri değişmez.
CREATE TABLE siparisler_siparis_revizyonu (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  siparis_id int NOT NULL CONSTRAINT siparisler_siparis_revizyonu_siparis REFERENCES siparisler_siparis (id),
  rev_no smallint NOT NULL CONSTRAINT siparisler_siparis_revizyonu_no CHECK (rev_no BETWEEN 1 AND 999),
  gerekce text NOT NULL CONSTRAINT siparisler_siparis_revizyonu_gerekce CHECK (char_length(btrim(gerekce)) BETWEEN 3 AND 500),
  kisi_id int NOT NULL CONSTRAINT siparisler_siparis_revizyonu_kisi REFERENCES kisi (id),
  an timestamptz NOT NULL DEFAULT now(),
  -- Değişiklikten önceki başlık ve kalemler (salt okunur görüntü) ve alan alan değişiklik listesi.
  onceki jsonb NOT NULL CONSTRAINT siparisler_siparis_revizyonu_onceki CHECK (jsonb_typeof(onceki) = 'object'),
  degisiklikler jsonb NOT NULL CONSTRAINT siparisler_siparis_revizyonu_degisiklik CHECK (jsonb_typeof(degisiklikler) = 'array' AND jsonb_array_length(degisiklikler) > 0),
  -- Sürüm verildiğinde sipariş Logo'ya gitmişti: Logo'daki kayıt elle güncellenir (yeniden gönderilmez).
  logo_gitmisti boolean NOT NULL,
  CONSTRAINT siparisler_siparis_revizyonu_tek UNIQUE (siparis_id, rev_no)
);

CREATE TRIGGER siparisler_siparis_revizyonu_yalniz_ekleme BEFORE UPDATE OR DELETE ON siparisler_siparis_revizyonu
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
