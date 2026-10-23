-- Siparişler'in satış teklifi ve tekliften siparişi Logo'ya bu sıradan gider (H10, soru 238): müşteriye verilen her teklif sürümü
-- bir teklif, siparişe dönüşen teklif bir sipariş satırıdır. Logo işi sırayı disari.ts ile okur ve sonucu buraya yazar.
CREATE TABLE siparisler_logo_gonderim (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL CONSTRAINT siparisler_logo_gonderim_tur CHECK (tur IN ('teklif', 'siparis')),
  teklif_id int NOT NULL,
  -- Siparişte kabul edilen sürüm: sipariş Logo'da bu sürümün teklifinden açılır.
  surum_no smallint NOT NULL,
  siparis_id int CONSTRAINT siparisler_logo_gonderim_siparis REFERENCES siparisler_siparis (id),
  durum text NOT NULL DEFAULT 'bekliyor' CONSTRAINT siparisler_logo_gonderim_durum CHECK (durum IN ('bekliyor', 'gonderildi', 'hata')),
  logo_kayit_no text,
  -- Satır kimliği (teklifte teklif satırı, siparişte sipariş satırı) -> Logo satır kaydı.
  satir_refleri jsonb NOT NULL DEFAULT '{}'::jsonb,
  hata text,
  olusturma timestamptz NOT NULL DEFAULT now(),
  gonderildi timestamptz,
  CONSTRAINT siparisler_logo_gonderim_surum FOREIGN KEY (teklif_id, surum_no) REFERENCES siparisler_teklif_surumu (teklif_id, surum_no),
  CONSTRAINT siparisler_logo_gonderim_siparisli CHECK ((tur = 'siparis') = (siparis_id IS NOT NULL)),
  CONSTRAINT siparisler_logo_gonderim_kayitli CHECK ((durum = 'gonderildi') = (logo_kayit_no IS NOT NULL AND gonderildi IS NOT NULL)),
  CONSTRAINT siparisler_logo_gonderim_hata CHECK ((durum = 'hata') = (hata IS NOT NULL) AND char_length(hata) <= 2000),
  CONSTRAINT siparisler_logo_gonderim_refler CHECK (jsonb_typeof(satir_refleri) = 'object'),
  CONSTRAINT siparisler_logo_gonderim_tek UNIQUE (tur, teklif_id, surum_no)
);
CREATE INDEX siparisler_logo_gonderim_bekleyen ON siparisler_logo_gonderim (tur, id) WHERE durum <> 'gonderildi';
