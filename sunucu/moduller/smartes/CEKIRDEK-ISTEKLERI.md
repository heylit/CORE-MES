# Çekirdek istekleri: smartes (kart #778)

1. Kırmızı çizgi satırı: öneri metni `belgeler/adr/0013-smartes-dogrudan-baglanti.md` "Kırmızı çizgi için öneri metni" başlığında. Satırı şef değiştirir.
2. `kurumIciMi` ortak parçaya: bugün logo ve smartes aynı işlevi ayrı tutuyor (`logo/ayar.ts`, `smartes/ayar.ts`). Önerilen yer `sunucu/cekirdek/kurum-ici.ts`.
3. Ortam değişkeni okuması çekirdeğe: logo CEKIRDEK-ISTEKLERI 1 ile aynı istek (`Ayar.smartes: SmartesAyari | null`, `IsTanimi.calis(db, baglam)`).
4. KARŞILANDI: Zamanlanmış iş: transaction dışında bekleyen adım (çekirdek `IsTanimi.txDisi`, `cekirdek-is-tx-disi`). SmartES işleri txDisi'ye geçti (borç 405).
5. Yeni işlem `smartes.esleme-yaz` (yalnız yönetici; Aşama 1). Kayıt satırı `paylasilan/islemler.ts` ve `islem-adlari.ts`'te (ayrı commit).
   Rol satırı ve göç YOK. Öneri: `kurulum/yetki-matrisi.md` "Yalnız yöneticide" listesine eklenir (o dosyaya dokunulmadı).
6. Ayar kaydı `smartes.baglanti` (boolean, varsayılan kapalı) ve sayfa kaydı `/smartes` + ikinci menü: kayıt satırları ayrı commit'te.

## Makine bulguları (3192, Arayüz notları)
7. Ortak `CizgiGrafikKarti`: dikey eksenin en alt etiketi (%0) ilk tarih etiketiyle üst üste biniyor (Arayüz N10). Modülde düzeltilmedi (ortak parça).
8. Ortak `YatayCubukKarti`: satır başına ayrı ton yok; "Nedeni girilmemiş" çubuğu öteki duruş nedenleriyle aynı renkte (Arayüz N13 ikinci yarısı).
   İstek: satıra isteğe bağlı `ton` alanı.

## 3760 (ortak dosyalara yazılanlar)
9. `paylasilan/sozlesme/smartes.ts`: `kullanici` türü, `sayim-duzeltme`, onay türleri ve Geçiş şemaları; `paylasilan/sozlesme/istasyonlar.ts`: makine kaydına
   isteğe bağlı `uretimKaynagi`, `uretimKaynagiGecerlilik`; `paylasilan/sayfalar/smartes.ts`: ikinci menüye "Geçiş". Çekirdek (`sunucu/cekirdek`) ve yetki kaydı değişmedi;
   yeni işlem yok (Geçiş yazma `ayarlar.yaz`).
