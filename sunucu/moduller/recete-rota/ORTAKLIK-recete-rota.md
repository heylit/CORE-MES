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

## Planlama (teslim 20.10.2026)
Ana kayıttaki planlama alanları (`plan` alt nesneleri; Reçete ve Rota'nın tanım bölümlerinde düzenlenir):

| Kavram | Nerede (alan) | Olası sahibi |
|---|---|---|
| makine planlama değerleri | `machines[].plan`: `verim`, `opOran`, `ucret`, `isiksiz` | istasyonlar |
| ayarcı | `people[].plan.ayar` | kisiler |
| fason firma ve kapasitesi | `plan.fasoncular[]`: `id` (FS-...), `ad`, `kapasite`, `sureGun`, `cikisSaat`, `cikisGunleri`; adımda `fasonId` | musteri-tedarikci (firma), planlama (kapasite) |
| aparat | `plan.aparatlar[]`: `id`, `ad`, `adet`; adımda `plan.aparat` | istasyonlar / takım-aparat |
| ayar ailesi ve ayar matrisi | adımda `plan.aile`; `plan.ayarMatrisi[]`: `den`, `ye`, `dk` | rota |
| parti ve kasa | adımda `minLot` (Qmin), `plan.kasa` | rota |
| malzeme tedarik ve muayene süresi | `items[].plan.tedarikGun`, `muayeneGun` | malzemeler / satın alma |
| canlı plan | `tmiCanli`: `{id, surum, ad, kim, zaman, yerlesim}`, yerleşim "emir no\|OP no" -> [{makineId, baslangic}] | uretim-emirleri (canlı plan) |

Ayrı anahtar: `recete-rota-motoru-v1:planlama`, planlama modülünün bütün durumu (senaryolar, siparişler ve çarpanları, maliyet ve gider tabloları, mesai, fason, malzeme ve yıllık plan, kullanıcının çözüm ayarları). Kavramlar orada da tekrar eder: sipariş (müşteri, termin, gelir, ceza), kişi, makine, firma, para birimi (₺). Ölçülen boyut: küçük sette 36 998 bayt, orta sette 87 146 bayt (kanıt `cerceve-dene`); büyük set ölçülmedi.
Cihazda kalanlar (sunucuya gitmez): `recete-rota-motoru-v1:planlama-ui4`, `-mz`, `-tk`, `-br`, `-nb`, `-tema` (ekran tercihleri).
