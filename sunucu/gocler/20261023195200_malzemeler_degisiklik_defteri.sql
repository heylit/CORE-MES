-- 392 a: malzeme kataloğu kartının her güncellemesi eski ve yeni değeriyle değişiklik defterine düşer (denetim modülünün
-- ortak tetik işlevi); `kayit` alanı üst anahtar düzeyinde ayrılır. Ekleme yazılmaz: yeni kartın kaydı satırın kendisidir.
-- Kart silinmez (malzeme_katalog_karti_koru); silme dalı sözleşmenin kalıbıyla aynı kalsın diye bağlıdır.
-- `surum`, `guncelleme` ve `guncelleyen_kisi_id` her yazımda değişir: kişi defter satırında zaten vardır, ikisi gürültüdür.
CREATE TRIGGER malzeme_katalog_karti_degisiklik AFTER UPDATE OR DELETE ON malzeme_katalog_karti
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('kimlik', 'surum', 'guncelleme', 'guncelleyen_kisi_id');
