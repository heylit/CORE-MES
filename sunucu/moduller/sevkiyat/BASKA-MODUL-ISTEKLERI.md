# BASKA-MODUL-ISTEKLERI: sevkiyat

1. finans: firma adı ve adresi için `disari.ts` okuma işlevi (Aşama 2, UYUM-BORCU 1).
2. stok: sevkiyat işine bağlanacak stok çıkışı ya da irsaliye kimliği (akış C, Aşama 2, UYUM-BORCU 2).
3. stok (E-12): `urunSevkiDinle` olayına dinleyici (`urunSevkiYansit`), bağı `sunucu/kablolama.ts` kurar (fason sevkiyle aynı kalıp). Olay işin
   emir, adet ve müşteri firmasını `onceki` ve `yeni` durumla verir (havuzda, planlandi, yolda, tamamlandi). Stok emrin mamul bakiyesinden
   (lot ve kalite durumu korunarak) çıkışı yazar. Kullanıcı kararı 235 a (19.10.2026): iş yola çıkınca mamul müşterinin Yolda konumuna
   geçer, teslim edilince stoktan çıkar; geri alınan geçiş tersine döner (fason sevkiyle aynı). Kalite durumu red olan parça reddedilmez, uyarıyla çıkar (147 b).
   Dinleyicinin reddi durum komutunu da geri alır.
4. stok (E-12, ileri izlenebilirlik): parti izi (`partiIzi`, `/stok/partiler/:id/iz`) emirlerin sevklerini `emirlerinSevkleri` ile
   okuyup (iş, gün, durum, adet, nokta, müşteri firması) lot -> emir -> sevk -> müşteri zincirini tamamlar; sözleşme alanı Çekirdek'te.
