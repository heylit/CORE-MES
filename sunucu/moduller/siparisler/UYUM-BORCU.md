# Uyum borcu: siparisler

## Bağlamada kapanacak
- Teklif iskonto onayı (Portal'da `discMgr` eşiği ve onay akışı): taşınmadı; bağlamada sorulacak.
- Logo'ya satış siparişi gönderimi bugün `portal_logo_gonderim`'de; bağlamada sipariş kaydına taşınır.
- Sevk satırının sipariş satırına bağı (Sevkiyat, 261 a).

## Kapandı
- Rol x işlem (`siparisler.oku`, `.yaz`, `.onayla`) ve `sayfa.siparisler`: `20261019083500_kisiler_rol_matrisi_139.sql`.
- Ekran ve ikinci menü: `istemci/src/moduller/siparisler`, `paylasilan/sayfalar/siparisler.ts`.
- Portal köprüsü: Portal siparişi ve teklifi `disari.ts` ile okur ve yazar (`portal/servis.ts`).
- `uretim_emri.siparis_satiri_id`: `20261019085000_uretim_emirleri_siparis_satiri.sql`.
