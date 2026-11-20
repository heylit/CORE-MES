-- 3478 (3478-1 a, 3478-2 a): olay başına ana anahtar; satırı olmayan olay kapalıdır. Ekip çağrısı ve kademeli uyarı türleri
-- bu tabloya girmez (servis bakar). Varsayılan kapalı canlıda da geçerlidir.
CREATE TABLE bildirim_olay_acik (
  tur text PRIMARY KEY CONSTRAINT bildirim_olay_acik_tur CHECK (tur ~ '^[a-z0-9-]+\.[a-z0-9-]+$'),
  acik boolean NOT NULL,
  surum int NOT NULL DEFAULT 1 CONSTRAINT bildirim_olay_acik_surum CHECK (surum >= 1),
  degistiren_id int CONSTRAINT bildirim_olay_acik_degistiren REFERENCES kisi (id),
  degisti timestamptz NOT NULL DEFAULT now()
);

-- 3478-2 a: kapanıştan önceki kademeli uyarı ayarı saklanır; "Önceki hale dön" bunu geri yazar. Tek satırdır. Olaylar bu göçten
-- önce hep açıktı: geri dönüş bütün anahtarlı olayları açar, ayrıca saklanmaz.
CREATE TABLE bildirim_onceki_hal (
  id smallint PRIMARY KEY CONSTRAINT bildirim_onceki_hal_tek CHECK (id = 1),
  kademe jsonb NOT NULL CONSTRAINT bildirim_onceki_hal_kademe CHECK (jsonb_typeof(kademe) = 'array'),
  alindi timestamptz NOT NULL DEFAULT now(),
  donuldu timestamptz,
  donen_id int CONSTRAINT bildirim_onceki_hal_donen REFERENCES kisi (id)
);

INSERT INTO bildirim_onceki_hal (id, kademe)
SELECT 1, coalesce(jsonb_agg(jsonb_build_object('kaynak', kaynak, 'acik', acik) ORDER BY kaynak), '[]'::jsonb) FROM bildirim_kademe_ayari;

-- Kaydedilmiş açık kademe ayarları kapanır; satırı olmayan kaynak katalog varsayılanıyla (kapalı) gelir.
UPDATE bildirim_kademe_ayari SET acik = false, surum = surum + 1, degisti = now() WHERE acik;
