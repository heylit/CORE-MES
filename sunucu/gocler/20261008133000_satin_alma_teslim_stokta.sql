-- Teslim alma satın almadan stoka geçer (kullanıcı kararı SA3): siparişin teslim sütunları düşer, stokun mal kabulü ve GKK'nın
-- bağlanacağı sipariş satırı açılır. Katalog malzeme katalog kartının sayı kimliğine bağlanır (SA4); yabancı anahtar Aşama 2'de ayrı göçle gelir.
-- Teslim bilgisi taşıyan sipariş ya da eski malzeme bağı taşıyan katalog kaydı sessizce silinmez: göç sayar, sayıyı yazıp durur, hiçbir şey değişmez.

-- Denetimden düşürmeye kadar başka oturum bu tablolara yazamaz; kilit alınamazsa (lock_timeout) göç durur.
LOCK TABLE satin_alma_siparis, satin_alma_katalog IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  sayi bigint;
BEGIN
  SELECT count(*) INTO sayi FROM satin_alma_siparis WHERE teslim_tarihi IS NOT NULL OR kalite IS NOT NULL OR teslim_alan_kisi_id IS NOT NULL;
  IF sayi > 0 THEN
    RAISE EXCEPTION 'satin_alma_siparis: % siparişte teslim bilgisi (teslim_tarihi, kalite, teslim_alan_kisi_id) var; teslim alma stoka geçiyor. Hiçbir şey değişmedi; satırları gözden geçirin, sonra göçü yeniden çalıştırın.', sayi;
  END IF;
  SELECT count(*) INTO sayi FROM satin_alma_katalog WHERE malzeme_id IS NOT NULL;
  IF sayi > 0 THEN
    RAISE EXCEPTION 'satin_alma_katalog: % kayıtta malzeme_id dolu; bağ malzeme_no''ya geçiyor. Hiçbir şey değişmedi; kayıtları gözden geçirin, sonra göçü yeniden çalıştırın.', sayi;
  END IF;
END $$;

ALTER TABLE satin_alma_siparis
  DROP CONSTRAINT satin_alma_siparis_teslim_butun,
  DROP CONSTRAINT satin_alma_siparis_teslim_sonra,
  DROP COLUMN teslim_tarihi,
  DROP COLUMN kalite,
  DROP COLUMN teslim_alan_kisi_id,
  ADD CONSTRAINT satin_alma_siparis_beklenen_sonra CHECK (beklenen_teslim >= siparis_tarihi);

ALTER TABLE satin_alma_katalog DROP COLUMN malzeme_id;
ALTER TABLE satin_alma_katalog ADD COLUMN malzeme_no integer;

-- Sipariş satırı: siparişin kapsadığı her kalem. Stokun mal kabul belgesi ve GKK bu kimliğe bağlanır; kimlik kayıt yeniden
-- yazıldığında değişmez (eşitlenir). Miktar ve birim sipariş anındaki kalemden kopyalanır; fiyat yoktur (depo fiyat görmez).
CREATE TABLE satin_alma_siparis_satiri (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  talep_id uuid NOT NULL,
  teklif_id uuid NOT NULL,
  kalem_id uuid NOT NULL,
  miktar numeric(18,4) NOT NULL CONSTRAINT satin_alma_siparis_satiri_miktar CHECK (miktar > 0),
  birim text NOT NULL CONSTRAINT satin_alma_siparis_satiri_birim CHECK (btrim(birim) <> '' AND length(birim) <= 20),
  CONSTRAINT satin_alma_siparis_satiri_tek UNIQUE (talep_id, teklif_id, kalem_id),
  CONSTRAINT satin_alma_siparis_satiri_siparis FOREIGN KEY (talep_id, teklif_id) REFERENCES satin_alma_siparis ON DELETE CASCADE,
  CONSTRAINT satin_alma_siparis_satiri_kalem FOREIGN KEY (talep_id, kalem_id) REFERENCES satin_alma_talep_kalemi ON DELETE CASCADE
);
