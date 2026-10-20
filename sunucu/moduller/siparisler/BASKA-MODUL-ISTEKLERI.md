# Başka modül istekleri: siparisler

1. uretim-emirleri: `uretim_emri.siparis_satiri_id int` boş olabilen, FK `siparisler_siparis_satiri(id)`; doğrulama `siparisler/disari.ts` `siparisSatiriOzetleri(db, idler)` ile (yalnız `siparisDurumu = 'onayli'` satır bağlanır).
2. portal: satış siparişi ve teklif Siparişler'den okunur ve yazılır (148, kullanıcı kuralı "iki taraflı"); bağlamada `disari.ts`'e açılacak komutlar: `teklifEkle`, `surumVer`, `kabulEt`, `notluGecis`, `siparisDonustur` (teklif-servis.ts), `siparisEkle`, `siparisAyrintisi` (servis.ts); imzaları dosyada, `(db, kullanici, ...)`.
3. sevkiyat: sevk satırı sipariş satırına bağlanır (II-4).
