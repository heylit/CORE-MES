-- Düzenli ödeme bir ayda bir kez ödenir (denetim S-10, kullanıcı kararı 11.10.2026 "4-a"); iki kişi aynı kirayı aynı ay için "ödendi" diyemez.
-- Var olan çift kayıt silinmez ya da değiştirilmez: varsa göç sayıyı yazıp durur, temizliğe kullanıcı karar verir. İptal edilen belge ayı boşaltır.

DO $$
DECLARE cift bigint;
BEGIN
  SELECT count(*) INTO cift FROM (
    SELECT 1 FROM finans_belge
    WHERE duzenli_odeme_id IS NOT NULL AND durum <> 'iptal'
    GROUP BY duzenli_odeme_id, date_trunc('month', belge_tarihi::timestamp)
    HAVING count(*) > 1) c;
  IF cift > 0 THEN
    RAISE EXCEPTION 'finans_belge: % düzenli ödeme ayında birden çok iptal edilmemiş belge var; göç veri değiştirmeden durdu. Fazla belgeleri iptal edin ya da kullanıcıya sorun.', cift;
  END IF;
  RAISE NOTICE 'finans_belge: düzenli ödemede aynı ay çifti yok; dizin ekleniyor';
END $$;

CREATE UNIQUE INDEX finans_belge_duzenli_donem ON finans_belge (duzenli_odeme_id, date_trunc('month', belge_tarihi::timestamp))
  WHERE duzenli_odeme_id IS NOT NULL AND durum <> 'iptal';
