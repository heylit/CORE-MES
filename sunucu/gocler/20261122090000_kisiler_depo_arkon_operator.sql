-- Kart 3549 (kullanıcı kararı 22.11.2026): depo çalışanı Üretim Terminali'nde Toplama, Mal kabul ve Yükle sekmelerini kullanır.
-- Bunlar Arkon rolü isteyen tam terminal ekranındadır; depoya Arkon operatör rolü verilir. Bu, 20261103183900 göçündeki
-- "Arkon rolü verilmez" sınırını kaldırır.

-- Her role tek Arkon işlemi: elle verilmiş FARKLI bir Arkon işlemi varsa rol iki işlem taşır ve öncelik sırasına düşer; göç durur.
DO $$
DECLARE
  fark text;
BEGIN
  SELECT string_agg(ri.islem, ', ' ORDER BY ri.islem) INTO fark
    FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id
   WHERE r.kod = 'depo' AND ri.islem LIKE 'arkon.%' AND ri.islem <> 'arkon.operator';
  IF fark IS NOT NULL THEN
    RAISE EXCEPTION 'Depo rolünde elle girilmiş başka Arkon işlemi var: %. Göç üstüne yazmaz; önce bu satırı kaldırın, sonra göçü yeniden çalıştırın.', fark;
  END IF;
END $$;

-- Kişi düzeyi: depo rolü taşıyan kişiye Yetkiler ekranından (kisi_islemi) ek Arkon işlemi (amir, kalite, planlama...) verilmiş olabilir.
-- Arkon rolü rolden çözülür, ek işlem yalnız rolde Arkon işlemi yokken sayılır; göçten sonra o kişi sessizce operatöre düşerdi. Göç sayıyla durur
-- (kişi adı yazılmaz); yönetici satırları düzeltir (başka role alır ya da ek işlemi kaldırır) ve göçü yeniden çalıştırır.
DO $$
DECLARE
  sayi int;
BEGIN
  SELECT count(DISTINCT ki.kisi_id) INTO sayi
    FROM kisi_islemi ki
    JOIN kisi_rolu kr ON kr.kisi_id = ki.kisi_id
    JOIN rol r ON r.id = kr.rol_id
   WHERE r.kod = 'depo' AND ki.islem LIKE 'arkon.%' AND ki.islem <> 'arkon.operator';
  IF sayi > 0 THEN
    RAISE EXCEPTION 'Depo rolü taşıyan % kişide kişiye ek verilmiş başka Arkon işlemi var; göçten sonra rolleri operatöre düşerdi. Göç üstüne yazmaz; önce bu kişi satırlarını (kisi_islemi) düzeltin, sonra göçü yeniden çalıştırın.', sayi;
  END IF;
END $$;

-- Yönetici Yetkiler ekranından aynı satırı önceden vermiş olabilir; o satır olduğu gibi kalır, göç durmaz.
-- Bilinmeyen rol kodu boş kimlik üretir ve NOT NULL'a takılır.
-- Karar 3556: depo Toplama sayımı üretim emrine yansır; terminal.uret depoya da verilir (sayım TMI emrine "yetki yok" diye düşmez).
INSERT INTO rol_islemi (rol_id, islem)
SELECT (SELECT id FROM rol WHERE kod = 'depo'), m.islem
  FROM (VALUES ('arkon.operator'), ('terminal.uret')) AS m (islem)
ON CONFLICT DO NOTHING;
