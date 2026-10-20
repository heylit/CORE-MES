# Çekirdek istekleri: smartes (kart #778)

1. Kırmızı çizgi satırı: öneri metni `belgeler/adr/0013-smartes-dogrudan-baglanti.md` "Kırmızı çizgi için öneri metni" başlığında. Satırı şef değiştirir.
2. `kurumIciMi` ortak parçaya: bugün logo ve smartes aynı işlevi ayrı tutuyor (`logo/ayar.ts`, `smartes/ayar.ts`). Önerilen yer `sunucu/cekirdek/kurum-ici.ts`.
3. Ortam değişkeni okuması çekirdeğe: logo CEKIRDEK-ISTEKLERI 1 ile aynı istek (`Ayar.smartes: SmartesAyari | null`, `IsTanimi.calis(db, baglam)`).
4. KARŞILANDI: Zamanlanmış iş: transaction dışında bekleyen adım (çekirdek `IsTanimi.txDisi`, `cekirdek-is-tx-disi`). SmartES işleri txDisi'ye geçti (borç 405).
5. Yeni işlem `smartes.esleme-yaz` (yalnız yönetici; Aşama 1). Kayıt satırı `paylasilan/islemler.ts` ve `islem-adlari.ts`'te (ayrı commit).
   Rol satırı ve göç YOK. Öneri: `kurulum/yetki-matrisi.md` "Yalnız yöneticide" listesine eklenir (o dosyaya dokunulmadı).
6. Ayar kaydı `smartes.baglanti` (boolean, varsayılan kapalı) ve sayfa kaydı `/smartes` + ikinci menü: kayıt satırları ayrı commit'te.
