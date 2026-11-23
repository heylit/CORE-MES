-- 3574-1: siparişte firma, fiyat, satır termini ve firma başlığı girilir; onaylı tutarı aşan sipariş onay bekler (S1 a).
-- Yalnız ekleyen göç: var olan satırlar varsayılanla dolar (teklif kaynaklı, boş metin, boş termin); veri dönüşmez, silinmez.

-- R2: siparişte açılan firmanın kaydı teklif değildir; teklif sayısına, karşılaştırmaya ve analize girmez.
ALTER TABLE satin_alma_teklif
  ADD COLUMN kaynak text NOT NULL DEFAULT 'teklif' CONSTRAINT satin_alma_teklif_kaynak CHECK (kaynak IN ('teklif', 'siparis'));

-- Firma başlığı: teslim yeri, tedarikçiye not (sipariş metnine girer), iç not (tedarikçiye gitmez).
ALTER TABLE satin_alma_siparis
  ADD COLUMN teslim_yeri text NOT NULL DEFAULT '' CONSTRAINT satin_alma_siparis_teslim_yeri CHECK (length(teslim_yeri) <= 200),
  ADD COLUMN tedarikci_notu text NOT NULL DEFAULT '' CONSTRAINT satin_alma_siparis_tedarikci_notu CHECK (length(tedarikci_notu) <= 2000),
  ADD COLUMN ic_not text NOT NULL DEFAULT '' CONSTRAINT satin_alma_siparis_ic_not CHECK (length(ic_not) <= 2000);

-- Satırın kendi termini: boşsa siparişin beklenen teslimi geçer (plan gelişi ve mal kabul aynı kuralla okur).
ALTER TABLE satin_alma_siparis_satiri
  ADD COLUMN beklenen_teslim date,
  ADD COLUMN notlar text NOT NULL DEFAULT '' CONSTRAINT satin_alma_siparis_satiri_notlar CHECK (length(notlar) <= 500);

-- S1 a, R4: onaya düşen sipariş uygulanmaz, gövdesiyle burada bekler; talep başına tek bekleyen. Onayda gövde yeniden doğrulanıp
-- uygulanır, retle silinir. Talep silinince öneri de gider.
CREATE TABLE satin_alma_siparis_onerisi (
  talep_id uuid PRIMARY KEY CONSTRAINT satin_alma_siparis_onerisi_talep REFERENCES satin_alma_talep (id) ON DELETE CASCADE,
  govde jsonb NOT NULL CONSTRAINT satin_alma_siparis_onerisi_govde CHECK (jsonb_typeof(govde) = 'object'),
  onayli_tutar numeric(18,2),
  yeni_tutar numeric(18,2),
  yeni_firmalar text[] NOT NULL DEFAULT '{}',
  gerekce text NOT NULL CONSTRAINT satin_alma_siparis_onerisi_gerekce CHECK (btrim(gerekce) <> '' AND length(gerekce) <= 500),
  oneren_kisi_id int NOT NULL CONSTRAINT satin_alma_siparis_onerisi_oneren REFERENCES kisi ON DELETE RESTRICT,
  olusturma timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX satin_alma_siparis_onerisi_oneren_fk_idx ON satin_alma_siparis_onerisi (oneren_kisi_id);
