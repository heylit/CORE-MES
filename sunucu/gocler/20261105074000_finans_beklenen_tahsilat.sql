-- Satış siparişinden beklenen tahsilat (kart 2132c, karar 2132-1 teyit): onaylanan sipariş finansa tutar ve vadeyle düşer.
-- Sahibi finanstır; satırları siparişlerin (ve sevkiyatın) ucu finansın komutuyla yazar. Yeni, boş tablodur; dolu tabloya dokunmaz.
-- Vade sevk günü artı vade günüdür: sevk günü önce sipariş termini, sevk planlanınca planlanan gün, sevk erken olursa gerçek gündür.
CREATE TABLE finans_beklenen_tahsilat (
  id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  siparis_id int NOT NULL CONSTRAINT finans_beklenen_tahsilat_siparis REFERENCES siparisler_siparis (id),
  -- Siparişin numarası finans ekranında gösterilmek içindir; her yazımda siparişler yeniden yazar (finans siparişi okuyamaz).
  siparis_no text NOT NULL CONSTRAINT finans_beklenen_tahsilat_siparis_no CHECK (length(siparis_no) BETWEEN 1 AND 40),
  firma_id int NOT NULL CONSTRAINT finans_beklenen_tahsilat_firma REFERENCES musteri_tedarikci_firma (id),
  para_birimi char(3) NOT NULL CONSTRAINT finans_beklenen_tahsilat_para_birimi CHECK (para_birimi ~ '^[A-Z]{3}$'),
  -- KDV dahil sipariş toplamı (faturanın toplamıyla karşılaştırılır).
  tutar numeric(18,2) NOT NULL CONSTRAINT finans_beklenen_tahsilat_tutar CHECK (tutar > 0),
  sevk_tarihi date NOT NULL,
  sevk_kaynagi text NOT NULL CONSTRAINT finans_beklenen_tahsilat_sevk_kaynagi CHECK (sevk_kaynagi IN ('termin', 'plan', 'gercek')),
  vade_gun smallint NOT NULL CONSTRAINT finans_beklenen_tahsilat_vade_gun CHECK (vade_gun BETWEEN 0 AND 365),
  vade date GENERATED ALWAYS AS (sevk_tarihi + vade_gun) STORED,
  yazan_id int NOT NULL CONSTRAINT finans_beklenen_tahsilat_yazan REFERENCES kisi (id),
  zaman timestamptz NOT NULL DEFAULT now(),
  -- Sipariş başına tek satır; kısmi sevk satırları sevkiyat bağlantısıyla ayrı göçte gelir.
  CONSTRAINT finans_beklenen_tahsilat_siparis_tek UNIQUE (siparis_id)
);
CREATE INDEX finans_beklenen_tahsilat_vade_sirasi ON finans_beklenen_tahsilat (vade, id);
CREATE INDEX finans_beklenen_tahsilat_firma_dizini ON finans_beklenen_tahsilat (firma_id);
