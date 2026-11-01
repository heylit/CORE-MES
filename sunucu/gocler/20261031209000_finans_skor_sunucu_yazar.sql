-- Günlük sağlık skorunu sunucu zamanlayıcısı yazar (kart #1463, karar 1456 b): satırın kişisi yoktur. Boş kişi "sunucu hesapladı"
-- demektir. Var olan satırlar değişmez; yalnız NOT NULL kısıtı kalkar.
ALTER TABLE finans_skor ALTER COLUMN guncelleyen_id DROP NOT NULL;
