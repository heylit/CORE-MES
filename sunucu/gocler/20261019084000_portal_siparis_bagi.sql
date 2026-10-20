-- Portal satış belgesinin Siparişler'deki karşılığı (soru 148, 162): teklif ve sipariş Siparişler'indir; Portal belgesi yalnız
-- prototipin görünümünü taşır. Satır, Portal talebi açılırken teklifle aynı işlemde yazılır; sipariş dönüşümde eklenir. Siparişler tablolarına yabancı anahtar
-- yok: kayıtlar silinmez (iptal durumdur) ve modüller arası bağ disari.ts üzerindendir.
CREATE TABLE portal_siparis_bagi (
  belge_yol text PRIMARY KEY,
  teklif_id int NOT NULL,
  -- "Siparişe dönüştür" ile Siparişler'de açılan sipariş ve onu taşıyan Portal sipariş belgesi; ikisi birlikte dolar.
  siparis_id int,
  siparis_yol text,
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT portal_siparis_bagi_yol CHECK (belge_yol ~ '^requests/[^/]+$'),
  CONSTRAINT portal_siparis_bagi_siparis CHECK ((siparis_id IS NULL) = (siparis_yol IS NULL) AND (siparis_yol IS NULL OR siparis_yol ~ '^orders/[^/]+$')),
  CONSTRAINT portal_siparis_bagi_teklif UNIQUE (teklif_id),
  CONSTRAINT portal_siparis_bagi_siparis_tek UNIQUE (siparis_id)
);
