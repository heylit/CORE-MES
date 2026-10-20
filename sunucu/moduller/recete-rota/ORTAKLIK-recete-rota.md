# recete-rota: ortaklık

Modülün tuttuğu ve başka modülde de olabilecek kavramlar. Hepsi `recete_rota_kayit.deger` (jsonb) içinde, anahtar `recete-rota-motoru-v1`:

| Kavram | Nerede (alan) | Olası sahibi |
|---|---|---|
| malzeme (ham, yarı mamul, mamul) | `items` (kod, ad, tür, birim, maliyet, stok, en az) | malzemeler |
| ürün ağacı ve rota | `routes`, `routeRevs` (revizyon, onay durumu) | rota |
| operasyon tanımı | `opdefs` | istasyonlar (operasyon tipleri) |
| iş merkezi, istasyon | `wcs`, `stations` | istasyonlar |
| makine | `machines` (kod, durum, not) | istasyonlar |
| kişi (personel, yetkinlik, vardiya) | `people` | kisiler / vardiya |
| takvim, vardiya, tatil | `cal` (`shifts`, `holidays`) | vardiya |
| üretim emri | `orders` (no, ürün, adet, teslim, öncelik, durum) | uretim-emirleri |
| üretim emri türü (FAI, Seri, Prototip, Numune) | `orders[].tur`; yoksa Seri | uretim-emirleri (`EMIR_TURLERI`, `emirTuru`) |
| alt emir bağı: parti ve adım kolu | `orders[].parentId`, `orders[].kol` (`n` ayrılma, `m` birleşme adımı) | uretim-emirleri (`/adimli-emirler/:id/bol` ve `/birlestir`) |
| operasyon ilerlemesi, atama, sıra | `opStatus`, `opProg`, `assign`, `qorder`, `frozen`, `splitManual` | uretim-emirleri / terminal |
| stok hareketi ve miktar | `moves`, `items[].stock`, `statusStock` | stok |
| durum listeleri | `statuses`, `statusCards` (operasyon ve stok durumları) | - |
| plan ayarları | `settings` | plan |
| teorik işlem ve değişim süresi (dk/adet) | adım ve operasyonda `proc`, `chg` (`cycle` toplam) | rota (`rota_adimi.islem_suresi_dk`, `degisim_suresi_dk`; `birim_sure_dk` toplam) |
| gerçekleşen süre ve plan tabanı | `gercekSure[adım kimliği]`: `deger`, `kaynak` (`elle`/`kabul`), `terminal` (bekleyen), `taban` | rota (`rota_gerceklesen_sure`: tur hazirlik/islem/degisim, kaynak elle/terminal/kabul) |

Ayrı anahtarlar: `recete-rota-motoru-v1:studio` ve `:studio:<senaryo>` (plan stüdyosu senaryoları, ortak kayıtta). Cihaza özel olanlar (`:op` operatör ekranı seçimi, `:side` yan menü, `:studio:intro`) sunucuya gitmez, tarayıcıda kalır.

Emir türü ve bölme `uretim-emirleri` ile ikinci kopyadır; bağlamada kapanacak (`UYUM-BORCU.md`). Tür dört değeri `uretim-emirleri` `EMIR_TURLERI` ile aynı adlıdır; kalan türler bu ekranda yok.

Ana anahtarda tutulmayanlar (309 b): `wcs`, `stations`, `machines`, `people`, `emirler`, `cal.shifts`, `cal.holidays` ve `settings` içinde `rule`, `dir`, `buffer`, `freezeDays`, `peopleLimit`. Ekran bunları açılışta sahiplerinden okuyup olduğu gibi değiştirir; sunucu yazarken ayıklar. `items`, `routes`, `routeRevs` kalır: kartsız kalem, adımın çıktı kartı ve statüleri, yerel revizyon yalnız burada durur. Senaryo anahtarları olduğu gibi yazılır.

Kişi sütunu: `recete_rota_kayit.guncelleyen_kisi_id`, kisi tablosuna yabancı anahtarla bağlı (312 b; eski satırlar denetlenmez).
