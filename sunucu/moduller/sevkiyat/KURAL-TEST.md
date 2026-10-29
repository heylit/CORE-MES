# Kural -> test (sevkiyat)

Kurallar `ON-PAKET-sevkiyat.md` bölüm 1 (SVK-1..SVK-45; test adı kural numarasıyla başlar) ve teslim `FARK.md` kararları. Testler `sevkiyat.test.ts` (gerçek PostgreSQL), `kurallar.test.ts`,
`cozucu.test.ts`, `yol-agi.test.ts`, `arama.test.ts`, `uclar.test.ts`. Kısıtlar `20261011200500_sevkiyat_tablolar.sql` ve `20261011200600_sevkiyat_is_durumu.sql`.

| Kural | Test | Kısıt |
|---|---|---|
| SVK-1 Tek aktif fabrika | aktif fabrika tektir | `sevkiyat_noktasi_tek_fabrika` |
| SVK-2 Ad ve plaka tekliği | aktif nokta ve araç adı tektir | `sevkiyat_noktasi_ad`, `sevkiyat_araci_ad`, `sevkiyat_araci_plaka` |
| SVK-3 Durak süresi | noktanın durak süresi 0-240 dakikadır | `sevkiyat_noktasi_durak_suresi` |
| SVK-4 İşteki nokta fabrika olamaz | işte kullanılan nokta fabrika yapılamaz | tetikleyici |
| SVK-6 Müsaitlik | araç müsaitliği | `sevkiyat_araci_musaitlik` |
| SVK-7 Maliyet oranları | `cozucu.test.ts` maliyet: girilmeyen oran araç türünden; `hesap-kayit.test.ts` araç ihlalleri (eksi maliyet) | `sevkiyat_araci` oran CHECK'leri |
| SVK-8 Pasifleştirme | SVK-1 testi: pasifleşen nokta listede pasif görünür | - |
| SVK-9..14 İş türü, nokta, yük, aralık | iş: fabrika nokta olarak seçilmez | `sevkiyat_isi_noktalar`, `sevkiyat_isi_yuk` |
| SVK-14 Zaman aralığı | `hesap-kayit.test.ts` iş ihlalleri (ters pencere) | `sevkiyat_isi_alis_araligi`, `_birakis_araligi`, `_alis_araligi_turu`, `_birakis_araligi_turu` |
| SVK-23..27 Sefer kuralları | `cozucu.test.ts`: al-bırak aynı araçta, aynı seferde, alış önce; palet kapasitesi ve ara dönüş; günde en çok 3 sefer ve değerlendirmede uyarı; yükleme süresi ve 15 dk boşaltma; zaman penceresi ve yetişilemeyen pencere | - |
| SVK-29..30 Kilit ve amaçlar | `cozucu.test.ts`: dağıtım kilitli aracın rotasına dokunmaz; en kısa amacında km | - |
| SVK-32 Belirlenimcilik | `cozucu.test.ts` çözüm tohumla belirlenimcidir; `hesap-kayit.test.ts` yineleme bütçesi | - |
| SVK-19 Plan ve sürüm | gün planı; aynı anda iki ilk kayıt | `sevkiyat_plani.tarih` UNIQUE |
| SVK-20..21 Uç yerleşimi, gün | ileri tarihli iş bugünün planına konamaz | tetikleyici |
| SVK-31 Yerleşemeyen iş | yerleşemeyen iş nedeniyle döner | - |
| SVK-33 Onay koşulları | noktası pasifleşen iş onayı engeller; yol ağı yoksa | - |
| SVK-35 Onaylı plan kilidi | onaylıda değişiklik reddi; iptal ile onay aynı anda | tetikleyici |
| SVK-36..40 Yol ve süre | `yol-agi.test.ts`; gece yarısını aşan elle rota | - |
| SVK-41..43 Tek rota | tek rota: kayıtlı noktalarla sıra | - |
| SVK-45 Adres arama | `arama.test.ts` | - |
| Açık soru 8, 12 | aktif fabrika pasifleştirilmez; onaylı plandaki araç ve nokta | - |
| Havuz ve durum | havuz; onaylı planda yalnız durağın sonucu yazılır | tetikleyici |
| Rol x işlem | rol x işlem (açık soru 3) | göç `20261011200700_kisiler_sevkiyat_islemleri.sql` |
| E-12 Ürün sevki ve iz | `bekleyen.test.ts` E-12: durum değişimi emir, adet ve müşteriyle bildirilir; dinleyicinin reddi komutu geri alır ve ret iletisi HTTP cevabına geçer (235 a); emirden sevke ve müşteriye iz | - |
| #1310 Bekleme listesi | `bekleyen.test.ts`: biten emir tek satır; fason gidişi iş açar ya da noktasız bekler; dönüş iş açmaz; işe çevirme ve kaldırma | `sevkiyat_bekleyen_urun_tek`, `_fason_tek`, `_is_tek`, `_kaynak_alanlari`, `_kaldirma_butun`, `_kapanis_tek` |
| 261 a Kısmi sevk ve sevk anının müşterisi | `kurallar.test.ts` bolmeIhlali; `bekleyen.test.ts` 261 a: ürün kaydı bölünür, parçalar ayrı işe gider, müşteri teslimde kayda yazılır, emrin sevk yeri geride kalan parçadır; ekranda "Böl" (`BeklemeListesi.test.tsx`) | `sevkiyat_bekleyen_urun_tek` (kök kayıt), `_bolme_urunde`, `_ust` |
| 930 a Fabrika konumu | `sevkiyat.test.ts` 930 a; `uclar.test.ts` ayarsız fabrika GECERSIZ, ayarlı konum ayardan; `Noktalar.test.tsx` fabrikada konum alanı yok | - |
| 932 a Emir no ile sevk araması | `kayit-aramasi.test.ts`: kalemli emir bulunur, kalemsiz ve kaldırılan çıkmaz, en çok 5; `TumIsler.test.tsx` `?ara=&gorunum=` ile açılış | - |
