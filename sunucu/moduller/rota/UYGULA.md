# Uygula (rota, taban c2c9871)

1. Önce: BASKA-MODUL-ISTEKLERI'ndeki istasyonlar (operasyon tipi kataloğu, istasyondaki kişiler), malzemeler (`malzemeAra`) ve
   uretim-emirleri (`uretimEmriAc`) fonksiyonları ile CEKIRDEK-ISTEKLERI 1-3 (toplayıcılar). Bunlar olmadan rota sunucusu derlenmez.
2. Zipteki dosyaları depo yollarıyla kopyala: `sunucu/gocler/20261008090000_rota_tablolar.sql`, `sunucu/moduller/rota/*`,
   `istemci/src/moduller/rota/**`, `paylasilan/sozlesme/rota.ts`, `paylasilan/islemler/rota.ts`, `paylasilan/ayarlar/rota.ts`,
   `paylasilan/sayfalar/rota.ts` (var olanın yerine; sayfa tanımı aynı, ikinci menü eklendi).
3. Rol x işlem göçü kullanıcı onayıyla (CEKIRDEK-ISTEKLERI 4); kilitli iki testin satırları aynı değişiklikte.
4. Koş: `npm run tip`, `npm run lint`, `npm run sinir -- --modul rota`,
   `node --import ./araclar/ortam-yukle-goc.ts --test "sunucu/moduller/rota/**/*.test.ts"`,
   `npx vitest run --config istemci/vite.config.ts istemci/src/moduller/rota`, `CI=true npm run kontrol`.

Çalışma kopyasında (geçici karşılıklarla) alınan sonuçlar FARK.md'de.
