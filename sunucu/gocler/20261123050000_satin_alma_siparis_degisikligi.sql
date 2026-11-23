-- 3574-2a: verilmiş siparişin değişikliği numaralı (R1, R2) ve izlidir; para artıran değişiklik ikinci kişinin onayına düşer (S1 a, S2 a).
-- Yalnız ekleyen göç: var olan öneriler 'siparis-ver', var olan siparişler değişiklik numarası 0 (R0) olur; veri dönüşmez, silinmez.

-- Bekleyen öneri sipariş verme ya da sipariş değişikliğidir; talep başına tek bekleyen kuralı (birincil anahtar) ikisi için ortaktır (R4).
ALTER TABLE satin_alma_siparis_onerisi
  ADD COLUMN tur text NOT NULL DEFAULT 'siparis-ver'
    CONSTRAINT satin_alma_siparis_onerisi_tur CHECK (tur IN ('siparis-ver', 'siparis-degistir'));

-- "revizyon" adı parça revizyonunundur (satin_alma_siparis_satiri.parca_revizyonu); siparişin kendi sayacı ayrı addadır.
-- Sayaç yalnız uygulanan değişiklikte artar; reddedilen ve geri alınan numara almaz.
ALTER TABLE satin_alma_siparis
  ADD COLUMN degisiklik_no int NOT NULL DEFAULT 0 CONSTRAINT satin_alma_siparis_degisiklik_no CHECK (degisiklik_no >= 0);

-- Sipariş değişikliği geçmişi: her uygulanan, reddedilen ya da geri alınan değişiklik bir satırdır; satır sonradan değişmez.
-- Talep silinince geçmiş de gider (siparişli talep silinmez; servis reddeder). Sipariş kaydına yabancı anahtar yok: sipariş satırı
-- karar kaydında yeniden yazılabilir, geçmiş onunla silinmemeli.
CREATE TABLE satin_alma_siparis_degisikligi (
  id uuid PRIMARY KEY,
  talep_id uuid NOT NULL CONSTRAINT satin_alma_siparis_degisikligi_talep REFERENCES satin_alma_talep (id) ON DELETE CASCADE,
  teklif_id uuid NOT NULL,
  degisiklik_no int CONSTRAINT satin_alma_siparis_degisikligi_no CHECK (degisiklik_no IS NULL OR degisiklik_no > 0),
  sonuc text NOT NULL CONSTRAINT satin_alma_siparis_degisikligi_sonuc CHECK (sonuc IN ('onaysiz', 'onaylandi', 'reddedildi', 'geri-alindi')),
  ozet jsonb NOT NULL CONSTRAINT satin_alma_siparis_degisikligi_ozet CHECK (jsonb_typeof(ozet) = 'array'),
  once_tutar numeric(18,2),
  sonra_tutar numeric(18,2),
  gerekce text NOT NULL CONSTRAINT satin_alma_siparis_degisikligi_gerekce CHECK (btrim(gerekce) <> '' AND length(gerekce) <= 500),
  teyit_kisi text NOT NULL DEFAULT '' CONSTRAINT satin_alma_siparis_degisikligi_teyit CHECK (length(teyit_kisi) <= 200),
  teyit_tarihi date,
  yapan_kisi_id int NOT NULL CONSTRAINT satin_alma_siparis_degisikligi_yapan REFERENCES kisi ON DELETE RESTRICT,
  onaylayan_kisi_id int CONSTRAINT satin_alma_siparis_degisikligi_onaylayan REFERENCES kisi ON DELETE RESTRICT,
  karar_notu text NOT NULL DEFAULT '' CONSTRAINT satin_alma_siparis_degisikligi_karar_notu CHECK (length(karar_notu) <= 500),
  dort_gozsuz boolean NOT NULL DEFAULT false,
  oneri_zamani timestamptz,
  olusturma timestamptz NOT NULL DEFAULT now(),
  -- Numara yalnız uygulanan değişikliğindir; reddedilen ve geri alınan numarasızdır.
  CONSTRAINT satin_alma_siparis_degisikligi_numara CHECK ((degisiklik_no IS NOT NULL) = (sonuc IN ('onaysiz', 'onaylandi'))),
  CONSTRAINT satin_alma_siparis_degisikligi_tek_no UNIQUE (talep_id, teklif_id, degisiklik_no)
);
CREATE INDEX satin_alma_siparis_degisikligi_talep_idx ON satin_alma_siparis_degisikligi (talep_id, olusturma, id);
CREATE INDEX satin_alma_siparis_degisikligi_yapan_fk_idx ON satin_alma_siparis_degisikligi (yapan_kisi_id);
CREATE INDEX satin_alma_siparis_degisikligi_onaylayan_fk_idx ON satin_alma_siparis_degisikligi (onaylayan_kisi_id);
CREATE TRIGGER satin_alma_siparis_degisikligi_yalniz_ekleme BEFORE UPDATE ON satin_alma_siparis_degisikligi
  FOR EACH ROW EXECUTE FUNCTION yalniz_ekleme();
