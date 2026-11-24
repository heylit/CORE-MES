-- 3637: teklifin kabul sonrası sürümü siparişe "Siparişe uygula" ile geçince sipariş sürümü hangi teklif sürümünden geldiğini bilir. Boş olabilen yeni sütun; veri değişmez.
ALTER TABLE siparisler_siparis_revizyonu
  ADD COLUMN kaynak_surum_no smallint CONSTRAINT siparisler_siparis_revizyonu_kaynak CHECK (kaynak_surum_no IS NULL OR kaynak_surum_no BETWEEN 1 AND 99);
