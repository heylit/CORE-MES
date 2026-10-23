-- 392 a: sistem ayarının ilk yazımı, değişmesi ve varsayılana dönmesi (silme) eski ve yeni değeriyle değişiklik defterine
-- düşer (denetim modülünün ortak tetik işlevi). Ayar bir yetki gibi davranışı açıp kapadığı için ekleme de yazılır.
-- `guncelleme` ve `guncelleyen_kisi_id` her yazımda değişir: kişi defter satırında zaten vardır, ikisi gürültüdür.
CREATE TRIGGER ayar_degisiklik AFTER INSERT OR UPDATE OR DELETE ON ayar
  FOR EACH ROW EXECUTE FUNCTION denetim_degisiklik_yaz('anahtar', 'guncelleme', 'guncelleyen_kisi_id');
