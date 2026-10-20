-- Siparişin ödeme planı (kart #1124): satın alma siparişe çevirirken girilen vadeler finansa beklenen ödeme olarak düşer.
-- Sahibi finanstır; satırları satın almanın ucu finansın komutuyla yazar (ADR 0006: satın alma finansın üstündedir).
-- Yeni tablodur, dolu tabloya dokunmaz. Faturası bağlanmış siparişin planı faturanın vadesine devreder (okumada türetilir).
CREATE TABLE finans_siparis_odemesi (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  satin_alma_talep_id uuid NOT NULL,
  satin_alma_teklif_id uuid NOT NULL,
  -- Siparişin numarası finans ekranında gösterilmek içindir; her plan yazımında satın alma yeniden yazar (finans satın almayı okuyamaz).
  siparis_no text NOT NULL CONSTRAINT finans_siparis_odemesi_siparis_no CHECK (length(siparis_no) <= 40),
  sira smallint NOT NULL CONSTRAINT finans_siparis_odemesi_sira CHECK (sira BETWEEN 1 AND 12),
  tur text NOT NULL CONSTRAINT finans_siparis_odemesi_tur CHECK (tur IN ('avans', 'vade')),
  vade date NOT NULL,
  yontem text NOT NULL CONSTRAINT finans_siparis_odemesi_yontem CHECK (yontem IN ('nakit', 'banka', 'kredi_karti', 'cek', 'senet')),
  firma_id int NOT NULL CONSTRAINT finans_siparis_odemesi_firma REFERENCES finans_firma (id),
  para_birimi char(3) NOT NULL CONSTRAINT finans_siparis_odemesi_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  tutar numeric(18,2) NOT NULL CONSTRAINT finans_siparis_odemesi_tutar CHECK (tutar > 0),
  olusturan_id int NOT NULL CONSTRAINT finans_siparis_odemesi_olusturan REFERENCES kisi (id),
  olusturma timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT finans_siparis_odemesi_sira_tek UNIQUE (satin_alma_talep_id, satin_alma_teklif_id, sira),
  -- Sipariş satın almadan çıkarsa planı da gider (beklenen ödeme kalmaz).
  CONSTRAINT finans_siparis_odemesi_siparis FOREIGN KEY (satin_alma_talep_id, satin_alma_teklif_id)
    REFERENCES satin_alma_siparis (talep_id, teklif_id) ON DELETE CASCADE
);
CREATE INDEX finans_siparis_odemesi_vade_sirasi ON finans_siparis_odemesi (vade, id);
