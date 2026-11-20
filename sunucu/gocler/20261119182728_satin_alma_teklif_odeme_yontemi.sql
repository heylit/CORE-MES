-- Karar ve onayda ödemenin nasıl yapılacağı görünsün, sipariş planı tekliften dolsun diye teklif ödeme yöntemini taşır; boş "belirtilmedi"dir.
ALTER TABLE satin_alma_teklif ADD COLUMN odeme_yontemi text
  CONSTRAINT satin_alma_teklif_odeme_yontemi CHECK (odeme_yontemi IN ('nakit', 'banka', 'kredi_karti', 'cek', 'senet'));
