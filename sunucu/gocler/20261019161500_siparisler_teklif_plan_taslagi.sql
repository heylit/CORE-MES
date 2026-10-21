-- Teklif termin ve fiyat denemesi (kullanıcı kararları 44, 49, 59-64, 21.10.2026).
-- 60 a: teklif sürümü termin gününü taşır. Dolu tabloya boş olabilen sütun eklenir; eski sürümlerin termini bilinmiyor (null), teslim_gun kalır.
ALTER TABLE siparisler_teklif_surumu ADD COLUMN termin_tarihi date;

-- Plan taslağı: teklifin plana denenmiş hâli. Deneme taslağı yer tutmaz. Satış taslağı verilen sürümle açılır ve geçerlilik tarihine
-- kadar planda kilitli yer tutar; geçerlilik geçince plandan kalkar, kayıt "satış denemesi" olarak kalır (49). Plancı onayı bekleyen
-- satış taslağı da yer tutar (63 b). Teklif başına yer tutan tek satış taslağı olur; yenisi gelince eskisi kalkar.
CREATE TABLE siparisler_teklif_plan_taslagi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  teklif_id int NOT NULL CONSTRAINT siparisler_teklif_plan_taslagi_teklif REFERENCES siparisler_teklif (id),
  surum_id int CONSTRAINT siparisler_teklif_plan_taslagi_surum REFERENCES siparisler_teklif_surumu (id),
  tur text NOT NULL CONSTRAINT siparisler_teklif_plan_taslagi_tur CHECK (tur IN ('deneme', 'satis')),
  -- kalkti: yerine yenisi geldi ya da teklif bitti; suresi-doldu: geçerliliği geçmişken yerine yenisi geldi.
  durum text NOT NULL CONSTRAINT siparisler_teklif_plan_taslagi_durum CHECK (durum IN ('aktif', 'onay-bekliyor', 'kalkti', 'suresi-doldu')),
  plan_surumu text CONSTRAINT siparisler_teklif_plan_taslagi_plan_surumu CHECK (length(plan_surumu) BETWEEN 1 AND 80),
  gecerlilik date,
  istenen_termin date,
  plan_termini date,
  termin date,
  kar_orani numeric(5,2) NOT NULL CONSTRAINT siparisler_teklif_plan_taslagi_kar CHECK (kar_orani >= 0),
  -- Bilinmeyen maliyet null kalır; sıfır yazılmaz.
  maliyet_toplami numeric(20,2) CONSTRAINT siparisler_teklif_plan_taslagi_maliyet CHECK (maliyet_toplami >= 0),
  -- Denemenin kalemleri (döküm dahil), bitişi değişen siparişler ve satış taslağının planda tuttuğu işlemler.
  kalemler jsonb NOT NULL CONSTRAINT siparisler_teklif_plan_taslagi_kalemler CHECK (jsonb_typeof(kalemler) = 'array'),
  kayanlar jsonb NOT NULL CONSTRAINT siparisler_teklif_plan_taslagi_kayanlar CHECK (jsonb_typeof(kayanlar) = 'array'),
  kilitler jsonb NOT NULL CONSTRAINT siparisler_teklif_plan_taslagi_kilitler CHECK (jsonb_typeof(kilitler) = 'array'),
  onay_gerekli boolean NOT NULL DEFAULT false,
  onaylayan_id int CONSTRAINT siparisler_teklif_plan_taslagi_onaylayan REFERENCES kisi (id),
  onay_ani timestamptz,
  olusturan_id int NOT NULL CONSTRAINT siparisler_teklif_plan_taslagi_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT siparisler_teklif_plan_taslagi_deneme CHECK (tur = 'satis' OR (durum = 'aktif' AND surum_id IS NULL AND NOT onay_gerekli)),
  CONSTRAINT siparisler_teklif_plan_taslagi_satis CHECK (tur = 'deneme' OR (gecerlilik IS NOT NULL AND surum_id IS NOT NULL)),
  CONSTRAINT siparisler_teklif_plan_taslagi_onay CHECK ((onaylayan_id IS NULL) = (onay_ani IS NULL) AND (onay_gerekli OR onaylayan_id IS NULL)),
  CONSTRAINT siparisler_teklif_plan_taslagi_bekleyen CHECK (durum <> 'onay-bekliyor' OR (onay_gerekli AND onaylayan_id IS NULL))
);
CREATE INDEX siparisler_teklif_plan_taslagi_teklif_dizini ON siparisler_teklif_plan_taslagi (teklif_id, id);
CREATE UNIQUE INDEX siparisler_teklif_plan_taslagi_tek_yer ON siparisler_teklif_plan_taslagi (teklif_id)
  WHERE tur = 'satis' AND durum IN ('aktif', 'onay-bekliyor');
CREATE INDEX siparisler_teklif_plan_taslagi_yer_tutan ON siparisler_teklif_plan_taslagi (gecerlilik)
  WHERE tur = 'satis' AND durum IN ('aktif', 'onay-bekliyor');
