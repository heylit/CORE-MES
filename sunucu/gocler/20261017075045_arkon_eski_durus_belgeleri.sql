-- Planlı duruşların tek sahibi Vardiya'dır (kart #519); Arkon `downs` deposunu Vardiya kaydından türetir, arkon_belge'deki eski `downs`
-- belgelerini okumaz (kullanıcı kararı 5b: taşınmaz). Kullanıcının yazılı onayıyla (17.10.2026) bu ölü satırlar silinir; geri dönüş yedekten.
DELETE FROM arkon_belge WHERE depo = 'downs';
