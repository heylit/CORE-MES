# Uyum borcu: siparisler

## Bağlamada kapanacak
- Teklif iskonto onayı (Portal'da `discMgr` eşiği ve onay akışı): taşınmadı; bağlamada sorulacak.
- Logo'ya satış siparişi gönderimi bugün `portal_logo_gonderim`'de; bağlamada sipariş kaydına taşınır.
- KAPANDI (bağlama C, 27.10.2026): sevk satırının sipariş satırına bağı ayrı sütun istemiyor. Sevk edilen her ürün bir üretim emrinden gelir (sevkiyat bekleyen kaynakları `urun`, `fason`, `alim`) ve bağ emrin `siparis_satiri_id`'sinden okunur: `sevkiyat/servis.ts` `sevkIsiOzeti` (260 a, fatura) ve `siparisinSevkleri` (302 a). 261 a kısmi sevki ve sevk anının müşterisini getirdi (`sevkiyat/bekleyen.test.ts` "261 a"). VARSAYIM: emirsiz ürün sevki (stoktan ticari mal satışı) yok; gelirse doğrudan bağ yeniden açılır.

## Kapandı
- Rol x işlem (`siparisler.oku`, `.yaz`, `.onayla`) ve `sayfa.siparisler`: `20261019083500_kisiler_rol_matrisi_139.sql`.
- Ekran ve ikinci menü: `istemci/src/moduller/siparisler`, `paylasilan/sayfalar/siparisler.ts`.
- Portal köprüsü: Portal siparişi ve teklifi `disari.ts` ile okur ve yazar (`portal/servis.ts`).
- `uretim_emri.siparis_satiri_id`: `20261019085000_uretim_emirleri_siparis_satiri.sql`.
- Sipariş ve teklif numarası Sistem Ayarları'ndaki ortak sayaçtan (`siparisler.siparis-no`, `siparisler.teklif-no`; 143 a). Var olan numaralar değişmez, dolu numara atlanır. `siparisler_numara_sayaci` ve `siparisler_teklif_sayaci` artık yazılmaz; silinmeleri ayrı karar.
