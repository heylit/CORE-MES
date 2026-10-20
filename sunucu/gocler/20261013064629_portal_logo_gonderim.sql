-- Portal satış teklifi ve siparişinin Logo gönderim sırası (kart #941); prototip belgeyi bütün yeniden yazdığı için sonuç belgede değil burada durur.
CREATE TABLE portal_logo_gonderim (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tur text NOT NULL,
  belge_yol text NOT NULL,
  -- Talep belgesinde teklifin sürüm numarası; siparişten açılan teklifte ve siparişte boş.
  teklif_surumu int,
  -- Siparişin Logo'da açılacağı teklif satırı.
  teklif_id int REFERENCES portal_logo_gonderim,
  durum text NOT NULL DEFAULT 'bekliyor',
  logo_kayit_no text,
  -- Satır no (1'den) -> Logo satır kaydı.
  satir_refleri jsonb NOT NULL DEFAULT '{}'::jsonb,
  hata text,
  olusturuldu timestamptz NOT NULL DEFAULT now(),
  gonderildi timestamptz,
  CONSTRAINT portal_logo_gonderim_tur CHECK (tur IN ('teklif', 'siparis')),
  CONSTRAINT portal_logo_gonderim_yol CHECK (belge_yol ~ '^(requests|orders)/[^/]+$'),
  CONSTRAINT portal_logo_gonderim_surum CHECK (teklif_surumu IS NULL OR (teklif_surumu > 0 AND tur = 'teklif' AND belge_yol LIKE 'requests/%')),
  CONSTRAINT portal_logo_gonderim_siparis_teklifli CHECK ((tur = 'siparis') = (teklif_id IS NOT NULL)),
  CONSTRAINT portal_logo_gonderim_durum CHECK (durum IN ('bekliyor', 'gonderildi', 'hata')),
  CONSTRAINT portal_logo_gonderim_kayitli CHECK ((durum = 'gonderildi') = (logo_kayit_no IS NOT NULL AND gonderildi IS NOT NULL)),
  CONSTRAINT portal_logo_gonderim_hata CHECK ((durum = 'hata') = (hata IS NOT NULL) AND char_length(hata) <= 2000),
  CONSTRAINT portal_logo_gonderim_refler CHECK (jsonb_typeof(satir_refleri) = 'object'),
  CONSTRAINT portal_logo_gonderim_tek UNIQUE NULLS NOT DISTINCT (tur, belge_yol, teklif_surumu)
);
