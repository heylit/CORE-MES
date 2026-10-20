# ON-PAKET: sevkiyat

Modül: `sevkiyat` (ad onay bekliyor, açık soru 1). Günün teslimat, alım ve al-bırak işlerini fabrikadan çıkan araçlara
paylaştırır ve sıralar. Ayrıca çevrimdışı harita, saate göre trafik profili, tek araç rotası ve sürücüye Google/Yandex bağlantısı içerir.

**Birleştirmeden önce açık soru 0 cevaplanmalı:** çözücü kodu nereden geldi ve bu şartnameye uyuyor mu.

**Teslim yolu (paket a2f0cd9):**
- Bu ön paket, modülün var olan kartına yorum olarak girer; kart yoksa `tur: karar` kartı açılır. Kart numarası: BİLMİYORUM.
- İşlem listesi ve sayfa kaydı dış dal açılmadan önce ana depoya girer (çekirdek isteği 1 ve 2). Rol x işlem satırları çekirdeğin ayrı göçüdür.
- Katman sırası: önce `paylasilan` (sözleşme ve işlemler), sonra sunucu, sonra istemci. Kart #94 onaylanınca ona göre sıralanır.
- Son commit İngilizce mesajla `Closes #<kart no>` ve `Audit:` satırını taşır. Depo elimde olmadığı için commit atılmadı; bu teslim dosya ağacıdır.

Teslim ağacı:

```
ON-PAKET.md
paylasilan/sozlesme/sevkiyat.ts
paylasilan/islemler/sevkiyat.ts                             modülün işlem listesi (toplayıcıya ekleme çekirdek işi)
sunucu/gocler/20261006110000_sevkiyat_tablolar.sql
sunucu/moduller/sevkiyat/  uclar.ts servis.ts kurallar.ts sorgular.ts disari.ts (boş) NOTLAR.md
                           yol-agi.ts cozucu.ts arama.ts   saf algoritma; kural sabitlerini kurallar.ts'ten alır
                           test-agi.ts                     testler için uydurma ızgara yol ağı
                           kurallar.test.ts yol-agi.test.ts cozucu.test.ts arama.test.ts   saf testler
                           sevkiyat.test.ts                akış testi, gerçek PostgreSQL
                           uclar.test.ts                   uç testi: gerçek giriş, her uçta 401/403/kabul, uçtan uca akış
istemci/src/moduller/sevkiyat/  rotalar.tsx anahtarlar.ts veri.ts bicim.ts rota-duzeni.ts sevkiyat.css
                           SevkiyatPlani.tsx AracRotasi.tsx BekleyenIsler.tsx IsFormu.tsx SurucuBaglantisi.tsx
                           TekRota.tsx Noktalar.tsx Araclar.tsx AdresArama.tsx Harita.tsx HaritaPaneli.tsx SevkiyatGezinti.tsx
                           SevkiyatPlani.test.tsx TekRota.test.tsx Noktalar.test.tsx Araclar.test.tsx
                           test-verisi.ts                  fikstür, gerçek uç cevabından; yalnız harita çizgileri kısaltıldı
```

## 1. İş kuralları

Her madde tek cümledir. Yanındaki test adı maddeyi sınar; kısıt ya da tetikleyici varsa adı yazılı. Her madde "kalsın / gitsin / değişsin" ile cevaplanır.

Test dosyaları: K = `kurallar.test.ts`, C = `cozucu.test.ts`, Y = `yol-agi.test.ts`, A = `arama.test.ts`, S = `sevkiyat.test.ts` (akış).

Sayısal değerlerin hepsi tahmindir ve onay ister (bkz. "Onay bekleyen sayısal varsayımlar"). Kodda `kurallar.ts` başındaki sabitlerdir.

### Noktalar ve araçlar

1. **SVK-1 Tek aktif fabrika.** Aynı anda en çok bir aktif fabrika noktası vardır; rotalar ondan çıkar ve ona döner.
   - Test: S "aktif fabrika tektir…"
   - Kısıt: `sevkiyat_noktasi_tek_fabrika`
2. **SVK-2 Ad ve plaka tekliği.** Aktif nokta adı ve aktif araç adı büyük/küçük harf duyarsız tektir. Aktif araçlarda plaka da tektir.
   - Test: S "aktif nokta ve araç adı tektir; aktif araçta plaka tektir…"
   - Kısıtlar: `sevkiyat_noktasi_ad`, `sevkiyat_araci_ad`, `sevkiyat_araci_plaka`
3. **SVK-3 Noktanın durak süresi.** Noktada yükleme/boşaltma süresi 0-240 dakikadır.
   - Test: S "noktanın durak süresi 0-240 dakikadır"
   - Kısıt: `sevkiyat_noktasi_durak_suresi`
4. **SVK-4 İşteki nokta fabrika olamaz.** İptal edilmemiş bir işte kullanılan nokta fabrika türüne çevrilemez.
   - Test: S "işte kullanılan nokta fabrika yapılamaz"
   - Tetikleyici: `sevkiyat_noktasi_tur_degisimi` (hata adı `sevkiyat_noktasi_iste_kullaniliyor`)
5. **SVK-5 Araç kapasitesi.** Kg kapasitesi sıfırdan büyüktür; palet kapasitesi eksi olmayan tam sayıdır.
   - Test: K "araç: kapasite…"
   - Kısıt: CHECK
6. **SVK-6 Araç müsaitliği.** Müsaitlik bitişi başlangıcından sonradır, aynı gün içinde.
   - Testler: K "araç: …müsaitlik…", S "araç müsaitliği…"
   - Kısıt: `sevkiyat_araci_musaitlik`
7. **SVK-7 Maliyet oranları.** TL/km, sürücü TL/saat ve günlük TL eksi olamaz; boş bırakılırsa araç türünün örnek değeri kullanılır.
   - Testler: K "araç: …maliyet eksi değil", C "maliyet: …girilmeyen oran araç türünden"
8. **SVK-8 Pasifleştirme.** Kayıt silinmez; nokta ve araç pasifleştirilir.
   - Taslak planda pasif araç görünmez, işleri bekleyene düşer.
   - Onaylı planda araç onaydaki rotasıyla görünmeye devam eder.
   - Ayrı testi yok (açık soru 8, 12).

### İşler

9. **SVK-9 Teslimat.** Fabrikadan yüklenip bir noktaya bırakılır: bırakış noktası zorunlu, alış noktası boştur.
   - Test: K "teslimat…"
   - Kısıt: `sevkiyat_isi_noktalar`
10. **SVK-10 Alım.** Bir noktadan alınıp fabrikaya getirilir: alış noktası zorunlu, bırakış noktası boştur.
    - Test: K "alım…"
    - Kısıt: `sevkiyat_isi_noktalar`
11. **SVK-11 Al-bırak.** İki farklı nokta arasındadır ve fabrikaya uğramaz.
    - Test: K "al-bırak iki ayrı nokta…"
    - Kısıt: `sevkiyat_isi_noktalar`
12. **SVK-12 İşin noktası.** Fabrika işin noktası olamaz; yeni ya da değişen nokta aktif olmalıdır.
    - Test: S "iş: fabrika nokta olarak seçilmez…"
    - Tetikleyici: `sevkiyat_isi_noktalari` (hata adları `sevkiyat_isi_fabrika_noktasi`, `sevkiyat_isi_pasif_nokta`)
13. **SVK-13 Yük.** Ağırlık ya da paletten en az biri sıfırdan büyüktür; palet tam sayıdır.
    - Test: K "yük: …"
    - Kısıt: `sevkiyat_isi_yuk`
14. **SVK-14 Zaman aralığı.** İki ucuyla girilir ve başı sonundan öncedir. Teslimatta alış aralığı, alımda bırakış aralığı yoktur.
    - Testler: K "zaman aralığı…", S "iş: …"
    - Kısıtlar: `sevkiyat_isi_alis_araligi`, `sevkiyat_isi_birakis_araligi`, `sevkiyat_isi_alis_araligi_turu`, `sevkiyat_isi_birakis_araligi_turu`
15. **SVK-15 İşin durak süresi.** Boşsa noktanın süresi kullanılır; doluysa 0-240 dakikadır.
    - Test: K "işin durak süresi…"
16. **SVK-16 Sabit araç.** İş bir araca sabitlenebilir; sabit iş otomatik dağıtmada yalnız o araca gider.
    - Test: C "sabit araçlı iş yalnız o araca gider"
17. **SVK-17 İptal.** İş silinmez, iptal edilir. Taslak plandaysa plandan çıkar ve planın sürümü artar.
    - Test: S "gün planı: …iptal"
18. **SVK-18 Taşıma.** Günü ya da türü değişen iş taslak plandan çıkar; plandaki iş değişince planın sürümü artar.
    - Test: S "iş başka güne taşınınca plandan çıkar ve planın sürümü artar"

### Gün planı

19. **SVK-19 Plan ve sürüm.** Her gün için en çok bir plan vardır ve her yazmada sürümü artar. Ekranın gördüğü sürüm güncel değilse yazma reddedilir. İki eşzamanlı ilk kayıttan biri reddedilir.
    - Testler: S "gün planı: …sürüm denetimi…", S "aynı anda iki ilk kayıt…"
    - Kısıt: `sevkiyat_plani.tarih UNIQUE`
20. **SVK-20 Uçların yerleşimi.** İşin her ucu planda en çok bir kez, türüne uygun uçla ve aktif bir araçta yer alır. Türüne uygun uç: teslimatta bırakış, alımda alış, al-bırakta ikisi. İptal edilmiş iş plana giremez.
    - Testler: K "elle plan: …", S "plan ve iş aynı güne aittir…"
    - Kısıt: `sevkiyat_plan_duragi_tek_uc`
    - Tetikleyici: `sevkiyat_plan_duragi_ucu` (hata adları `sevkiyat_plan_duragi_uc_turu`, `sevkiyat_plan_duragi_iptal_is`)
21. **SVK-21 Aynı gün.** Plandaki iş planın gününe aittir.
    - Test: S "plan ve iş aynı güne aittir…"
    - Kısıtlar: `sevkiyat_plan_duragi_is_tarihi`, `sevkiyat_plan_duragi_plan_tarihi`
22. **SVK-22 Eksik uç tamamlanır.** Al-bırak işinin tek ucu verilirse öteki aynı araca eklenir: alış önce, bırakış sonra.
    - Test: K "al-bırak işinin tek ucu verilirse…"
23. **SVK-23 Al-bırak sırası.** Alış ve bırakış aynı araçta, aynı seferde ve alış önce yapılır. Elle bozulursa uyarı verilir.
    - Testler: C "al-bırak işinde…", Y "al-bırak çiftinde…"
24. **SVK-24 Sefer kapasitesi.** Araç bir seferde kg ve palet kapasitesini aşamaz; aşan elle plan uyarı verir.
    - Testler: C "palet kapasitesi de sınırdır…", C "değerlendirme kipi…"
25. **SVK-25 Sefer sayısı.** Araç ara dönüşle fabrikaya dönüp yeni sefere başlayabilir; günde en çok 3 sefer yapar. Dördüncü seferlik iş yerleşemez; elle aşılırsa uyarı verilir.
    - Testler: C "çözücü bir araca günde en çok 3 sefer verir…", C "değerlendirmede en çok sefer aşımı uyarıdır"
26. **SVK-26 Yükleme ve boşaltma.** Teslimat seferinin başında fabrikada 15 dk yükleme, alım dönüşünde 15 dk boşaltma vardır.
    - Testler: C "zaman çizelgesi: …", C "alım dönüşünde fabrikada 15 dk boşaltma vardır…"
27. **SVK-27 Zaman aralığına uyum.** Varış aralığın sonundan sonra olamaz; erken gelen bekler.
    - Testler: C "zaman penceresi…", C "yetişilemeyen pencere atanamaz…"
28. **SVK-28 Müsaitliğe uyum.** Araç müsaitlik bitişinden önce fabrikaya döner.
    - Test: C "araç müsaitlik bitişinden önce fabrikaya döner…"
29. **SVK-29 Kilit ve yerleştirme.** Otomatik dağıtma kilitli aracın rotasına dokunmaz. "Bekleyenleri yerleştir" elle dizilenlere dokunmadan yalnız bekleyen işleri ekler.
    - Testler: C "dağıtım kilitli aracın rotasına dokunmaz…"; S "gün planı: …" (içinde yerleştir adımı)
30. **SVK-30 Dağıtma amaçları.** Dağıtma üç amaçtan biriyle yapılır:
    - En hızlı: sürüş dakikası + 0,3 x bekleme + kullanılan her araç için 45 dk + her ek sefer için 12 dk.
    - En kısa yol: km + her araç için 25 km + her ek sefer için 4 km.
    - En ucuz: km x TL/km + süre x TL/saat + günlük TL.
    - Testler: C "maliyet: …", C "en kısa amacında toplam km…"
    - Araç ve sefer bedelleri tahmindir.
31. **SVK-31 Yerleşemeyen iş.** Hiçbir araca sığmayan, aralığına yetişilemeyen ya da müsaitliğe sığmayan iş bekleyende kalır ve nedeni yazılır.
    - Testler: C "hiçbir aracın kapasitesine…", S "yerleşemeyen iş nedeniyle döner…"
32. **SVK-32 Belirlenimcilik.** Aynı girdi aynı planı verir. Arama tohumludur; yineleme sınırı 1500 + 150 x iş, en çok 4000.
    - Testler: C "çözüm tohumla belirlenimcidir", K "çözücü yineleme bütçesi…"
33. **SVK-33 Onay koşulları.** Onay için aktif fabrika, yüklü yol ağı ve en az bir rota gerekir. Kural ihlali olan rota ya da noktası pasifleşmiş iş onayı engeller.
    - Testler: K "onay: …", S "noktası pasifleşen iş onayı engeller", S "yol ağı yoksa…"
34. **SVK-34 Onay saatleri.** Onay anında her durağın tahmini varış ve ayrılış anı kaydedilir. Onaylı planda bu saatler gösterilir; güncel hesap farklıysa not düşülür.
    - Test: S "gün planı: … onayla …" (kaydedilen saatler geri okunup karşılaştırılır)
    - Ekran testi: "onaylı planda onayda kaydedilen saat gösterilir…"
35. **SVK-35 Onaylı plan kilidi.** Onaylı plan, satırları ve içindeki iş değiştirilemez, iptal edilemez, silinemez; önce onay kaldırılır. İptal ile onay aynı anda gelirse iptal edilen iş onaylı planda kalmaz.
    - Testler: K "onaylı plan…", S "gün planı: …onaylıda değişiklik reddi…", S "iptal ile onay aynı anda…"
    - Tetikleyiciler (hata adı parantezde):
      - `sevkiyat_plani_onayli` (`sevkiyat_onayli_plan_satiri_degismez`)
      - `sevkiyat_plan_araci_onayli` ve `sevkiyat_plan_duragi_onayli` (`sevkiyat_onayli_plan_degismez`)
      - `sevkiyat_isi_onayli_planda` (`sevkiyat_onayli_plandaki_is_degismez`)

### Yol ve süre

36. **SVK-36 Trafik profili.** Gün tipine göre örnek profildir: pazartesi-perşembe, cuma, cumartesi ve pazar ayrıdır; resmi tatil ayrı değildir.
    - Testler: K "gün tipi tarihten çıkar…", Y "trafik seviyesi sabah zirvesinde geceden yüksek…"
37. **SVK-37 Zamana bağlı süre.** Kenar süresi, kenara girilen andaki yoğunlukla hesaplanır.
    - Test: Y "zirve saatinde…"
38. **SVK-38 Araç hızı.** Kamyonet binek hızının %93'ü, kamyon %80'iyle gider.
    - Test: Y "araç hızı: kamyonet … yüzde 93ü, kamyon yüzde 80i…"
39. **SVK-39 Tek yön.** Tek yönlü yol ters yönde kullanılmaz.
    - Test: Y "tek yönlü yol ters yönde kullanılmaz"
40. **SVK-40 Gece yarısı.** Gece yarısını aşan elle rota reddedilmez; uyarıyla gösterilir.
    - Test: S "gece yarısını aşan elle rota uyarıyla döner…"

### Tek rota

41. **SVK-41 Durak sayısı ve sıra.** Tek rota 1-9 kayıtlı noktadan oluşur; 9 durağa kadar en iyi sıra kesin aranır.
    - Testler: K "tek rota: 1-9 durak…", S "tek rota: …"
42. **SVK-42 Al-bırak çifti.** Çiftte bir alış ve bir bırakış vardır ve bırakış alıştan önce gelmez. Sıra elle korunuyorsa ihlal uyarı verir.
    - Testler: K, Y "sıra korunurken…"
43. **SVK-43 Çıkış saati taraması.** Aynı yollarla 05:00-22:00 arası 15 dakikada bir toplam süre hesaplanır.
    - Test: Y "tek rota: …çıkış taraması…"

### Sürücü bağlantısı ve arama

44. **SVK-44 Sürücü bağlantısı.** Sunucu dış servise bağlanmaz; sürücüye yalnız Google/Yandex adres bağlantısı üretir. Google bağlantısı en çok 9 ara durak taşır.
    - Test: Y "Google bağlantısı en çok 9 ara durak taşır"
    - Açık soru 6 cevaplanana kadar özellik geçicidir.
45. **SVK-45 Adres arama.** Arama çevrimdışıdır: kayıtlı noktalar önce gelir, Türkçe harfe duyarsızdır, kısa harita bağlantısı çözülmez.
    - Test: A (6 test)

### Onay bekleyen sayısal varsayımlar

Firmadan gelmedi, tahmindir. Hepsi `kurallar.ts` başında.

| Değer | Nerede | Not |
|---|---|---|
| Serbest akış hızı (otoyol 88, ana yol 66, birincil 50, ikincil 40, üçüncül 32, rampa 38 km/sa) | `SERBEST_HIZ`, `RAMPA_HIZI` | kent içi tahmin |
| Araç hız oranı (kamyonet 0,93, kamyon 0,80) | `ARAC_HIZ_KATSAYISI` | |
| Yükleme 15 dk, boşaltma 15 dk, günde en çok 3 sefer | `YUKLEME_DAKIKA`, `BOSALTMA_DAKIKA`, `EN_COK_SEFER` | |
| Amaç bedelleri (araç 45 dk / 25 km, sefer 12 dk / 4 km, bekleme ağırlığı 0,3) | `ARAC_BEDELI_*`, `SEFER_BEDELI_*`, `BEKLEME_AGIRLIGI` | az araç tercih eder |
| Örnek maliyet oranları (binek 7/330/600, kamyonet 10/330/1000, kamyon 21/400/1800) | `VARSAYILAN_MALIYET` | açık soru 11 |
| Trafik profili (sabah, öğle ve akşam tepeleri) | `yol-agi.ts` `yogunluk` | gerçek değer araç konum kaydından öğrenilmeli |
| Yeni noktanın varsayılan durak süresi 20 dk | göç `DEFAULT 20` | |

## 2. Tablolar

Göç: `sunucu/gocler/20261006110000_sevkiyat_tablolar.sql`. Damga birleştirmede yenilenecek. Başka modülün tablosuna bağ yok, serbest json sütunu yok.

| Tablo | Sütun | Tip | Kısıt |
|---|---|---|---|
| sevkiyat_noktasi | id | int identity | PK |
| | ad | text | boş değil; aktiflerde lower(ad) UNIQUE |
| | tur | text | fabrika, musteri, tedarikci, fason, kargo, diger |
| | enlem, boylam | numeric(9,6) | aralık CHECK |
| | adres | text | null ya da boş değil |
| | durak_suresi_dakika | int | 0-240 (`sevkiyat_noktasi_durak_suresi`), varsayılan 20 |
| | aktif | boolean | tek aktif fabrika: kısmi UNIQUE `sevkiyat_noktasi_tek_fabrika` |
| sevkiyat_araci | id | int identity | PK |
| | ad | text | aktiflerde lower(ad) UNIQUE |
| | tur | text | binek, kamyonet, kamyon |
| | plaka | text | aktiflerde upper(plaka) UNIQUE |
| | kapasite_kilogram | numeric(10,2) | > 0 |
| | kapasite_palet | int | >= 0 |
| | musait_baslangic, musait_bitis | time | bitis > baslangic (açık soru 4) |
| | kilometre_maliyeti, saat_maliyeti, gunluk_maliyet | numeric(10,2) | null ya da >= 0 |
| | aktif | boolean | |
| sevkiyat_isi | id | int identity | PK; (id, tarih) UNIQUE |
| | tarih | date | dizinli |
| | tur | text | teslimat, alim, aktarma |
| | alis_noktasi_id, birakis_noktasi_id | int FK nokta | türe göre zorunlu ya da boş; fabrika ve yeni pasif nokta tetikleyiciyle reddedilir |
| | agirlik_kilogram | numeric(10,2) | >= 0; ağırlık ya da palet > 0 |
| | palet_sayisi | int | >= 0 |
| | durak_suresi_dakika | int | null ya da 0-240 |
| | alis_en_erken, alis_en_gec, birakis_en_erken, birakis_en_gec | time | çiftler birlikte dolu, baş < son, türe uygun (açık soru 4) |
| | belge_no, aciklama | text | null ya da boş değil |
| | sabit_arac_id | int FK araç | |
| | iptal_edildi | timestamptz | null ise geçerli |
| sevkiyat_plani | id | int identity | PK; (id, tarih) UNIQUE |
| | tarih | date | UNIQUE |
| | amac | text | sure, mesafe, maliyet |
| | surum | int | >= 1 |
| | onaylandi | timestamptz | null ise taslak; onaylı satır yalnız onay kaldırmak için güncellenir, silinmez |
| sevkiyat_plan_araci | plan_id, arac_id | int | PK; FK plan (CASCADE), FK araç |
| | kilitli | boolean | |
| sevkiyat_plan_duragi | plan_id, arac_id, sira | int | PK; FK (plan_id, arac_id) |
| | tarih | date | FK (plan_id, tarih) ve FK (is_id, tarih): plan ve iş aynı gün |
| | is_id, alis | int, boolean | ikisi null ise fabrikaya ara dönüş; (plan_id, is_id, alis) UNIQUE; uç türe uygun |
| | tahmini_varis, tahmini_ayrilis | timestamptz | onayda yazılır |

Tetikleyiciler bölüm 1'de: madde 4, 12, 20 ve 35.

## 3. Uçlar

Hepsi `/api` altındadır. Okuma GET ile (salt okunur), yazma POST komutla yapılır. İşlem adı `sevkiyat.<eylem>` biçimindedir.

| Yöntem | Yol | Yetki |
|---|---|---|
| GET | /sevkiyat/noktalar | sevkiyat.oku |
| POST | /sevkiyat/noktalar/ekle · /sevkiyat/noktalar/:id/guncelle · /sevkiyat/noktalar/:id/pasiflestir | sevkiyat.tanim-yaz |
| GET | /sevkiyat/araclar (örnek maliyet oranlarıyla) | sevkiyat.oku |
| POST | /sevkiyat/araclar/ekle · /:id/guncelle · /:id/pasiflestir | sevkiyat.tanim-yaz |
| POST | /sevkiyat/isler/ekle · /sevkiyat/isler/:id/guncelle · /sevkiyat/isler/:id/iptal-et | sevkiyat.is-yaz |
| GET | /sevkiyat/planlar/:tarih | sevkiyat.oku |
| POST | /sevkiyat/planlar/:tarih/dagit · /yerlestir · /kaydet | sevkiyat.plan-yaz |
| POST | /sevkiyat/planlar/:tarih/onayla · /onayi-kaldir | sevkiyat.onayla |
| GET | /sevkiyat/tek-rota?tarih&cikis&arac&amac&fabrikayaDon&siraKorunur&duraklar | sevkiyat.oku |
| GET | /sevkiyat/harita · /sevkiyat/trafik?tarih&dakika · /sevkiyat/arama?metin | sevkiyat.oku |

Önerilen rol x işlem (açık soru 3):

| Rol | İşlemler |
|---|---|
| Planlamacı | oku, is-yaz, plan-yaz |
| Sevkiyat sorumlusu | planlamacının işlemleri + onayla, tanim-yaz |
| Diğer roller | oku |

Bu tablo `uclar.test.ts` içindeki beklenen tabloyla aynıdır. Test her uç için şunu dener (DOĞRULANDI):
- kimliksiz istek 401;
- yalnız `sayfa.sevkiyat` işlemi olan kişi 403;
- öteki dört işlemden birini taşıyan kişi 403;
- doğru işlemi taşıyan kişi 401 ya da 403 almaz.

Kişiler gerçek giriş akışıyla açılır (`yoneticiOlustur`, `rol`, `rol_islemi`, `POST /api/oturum/giris`, çerez).

İstemci rotalarının hepsi `/sevkiyat` sayfasının alt yoludur: `/sevkiyat`, `/sevkiyat/tek-rota`, `/sevkiyat/noktalar`, `/sevkiyat/araclar`.

## 4. Başkasından istenen / başkasına verilen

- **İstenen:** Yok. Modül başka modülün tablosunu okumaz ve başka modülün `disari.ts` dosyasını çağırmaz.
- **Verilen:** Şimdilik yok; `disari.ts` boştur.
  - Aday: `sevkiyatIsiEkle(db, girdi)`. İrsaliye, satınalma ya da fason modülü bununla günün sevkiyat işini aynı transaction içinde açabilir.
  - Tüketici modül belli olunca, zod gövde şemasından geçirilerek eklenecek (açık soru 10).

## 5. Örtüşme

Aşağıdakiler başka modülde de bulunabilir. İkinci kopyası yazılmamalı; karar gelince kimlikle bağlanmalı.

- **`sevkiyat_noktasi`** (müşteri, tedarikçi, fason, kargo türleri)
  - Olası sahibi: cari, müşteri ya da tedarikçi modülü.
  - Ad ve adres burada ikinci kez tutuluyor. Cari modülü varsa nokta yalnız konum ve cari kimliği taşımalı.
- **`sevkiyat_noktasi`, tür fabrika**
  - Olası sahibi: tesis ya da ayarlar.
  - Fabrika konumu tek bir ayar olabilir.
- **`sevkiyat_araci`**
  - Olası sahibi: varlık, demirbaş ya da bakım modülü.
  - Araç kaydı ve plaka. Varlık modülü varsa burada yalnız kapasite, müsaitlik ve oranlar kalmalı.
- **Araç müsaitlik aralığı**
  - Olası sahibi: vardiya ve mesai (`/vardiya`, `/mesai`).
  - Günlük çalışma saati vardiyadan gelebilir.
- **Sürücü** (şimdilik modülde yok)
  - Olası sahibi: personel ya da kişiler modülü.
  - Atama yapılacaksa `kisi` kimliğiyle; burada kişi tablosu açılmamalı.
- **`sevkiyat_isi` kaynağı**
  - Olası sahibi: irsaliye, satınalma, fason emri, üretim emri.
  - İş şimdilik elle giriliyor ve `belge_no` serbest metin.
- **Harita ve adres arama**
  - İleride başka modüller de kullanabilir; ortak arayüze taşınabilir.

## 6. Çekirdek istekleri

1. **İşlem listesi toplayıcıya.** Modülün dosyası teslimde: `paylasilan/islemler/sevkiyat.ts` (`SEVKIYAT_ISLEMLERI`, beş işlem).
   - `paylasilan/islemler.ts` toplayıcısına eklenmeli. Bu, dış dal açılmadan önce ana depoya girmeli; yoksa `uc()` açılışta "kayıtlı olmayan işlem" hatası verir.
   - Rol x işlem satırları (bölüm 3 önerisi, açık soru 3) çekirdeğin ayrı göçüyle girer.
2. **Sayfa kaydı.** Bu da dış dal açılmadan önce girmeli. `paylasilan/sayfalar.ts` içine:
   ```ts
   { yol: '/sevkiyat', islem: 'sayfa.sevkiyat', baslik: 'Sevkiyat', simge: 'truck', grup: 'Planlama' }
   ```
   `truck` simgesi `SIMGELER` içinde var (DOĞRULANDI). Grup adı VARSAYIM.
3. **Ortam değişkeni.** `TMIV2_HARITA_DIZINI` (`harita.json`, `yol.json`, `arama.json`). `.env` örneğine ve kurulum belgesine eklenmeli.
   - Yoksa modül çalışır; saat hesabı, dağıtma ve onay kapalıdır.
   - `yol.json` içindeki `merkez` ve `anaArterler` alanları paket üretiminde yazılır.
   - Değişken şimdilik `uclar.ts` içinde `process.env`'den okunuyor. Çekirdek `Ayar` nesnesinden modül ayarı veriyorsa oradan okunmalı; imzası BİLMİYORUM.
4. **Eksik ortak bileşenler.** Ekranlar artık ortak bileşenleri kullanıyor: `Dugme`, `Girdi`, `Secim`, `IsaretKutusu`, `Tablo`, `Kart`, `Pencere`, `OnayPenceresi`, `Sekmeler`, `useBildirim`, `Rozet`, `DurumKutusu`, `Simge`. Karşılığı olmayan dört öğe modülde kaldı; kopya bileşen yazılmadı, yalnız modül sınıfıyla biçimlendi:
   - **Eylem menüsü:** durak ve bekleyen iş için `<select onChange>` ("Taşı…", "İşlem…"). Önerilen imza: `EylemMenusu({ etiket, eylemler: { anahtar, baslik, tehlikeli? }[], sec })`.
     - Bilinen risk: kapalı select'te ok tuşu bazı tarayıcılarda seçimi hemen uygular. Taşımalar "Geri al" ile döner; iptal ayrıca onay ister.
   - **Düğme görünümlü bağlantı:** sürücüye Google/Yandex bağlantısı yeni sekmede açılır, `Dugme` bağlantı vermiyor. Önerilen: `Dugme` için `href` ya da ayrı `BaglantiDugmesi`.
   - **Kaydırıcı:** tek rotada çıkış saati (`input type=range`). Önerilen: `Kaydirici({ etiket, min, max, adim, deger, degistir, degerMetni })`.
   - **Satır içi küçük sayı alanı:** tek rotada durak süresi (görünür etiketsiz, `aria-label` ile). `Girdi` her zaman görünür etiket yazıyor.
   - Harita (`Harita.tsx`) modüle özgü kaldı; başka modül de kullanacaksa ortak arayüze taşınabilir (bölüm 5).
5. **Kategorik renk değişkenleri** (`--seri-1..6`). Araç renkleri şimdilik durum renklerinden alınıyor. Trafik renkleriyle karışmasın diye gün planında trafik katmanı kapalı başlıyor.
6. **Sıkıştırma.** `/sevkiyat/harita` cevabı yaklaşık 4,5 MB JSON. İstemci bir kez alır ve süresiz önbellekte tutar. Çekirdekte açık değilse gzip ve önbellek başlığı istenir.
7. **İş parçacığı.** Çözücü istek içinde CPU kullanır:
   - dağıt: 10 iş ve 4 araçla 0,45-0,8 sn
   - gün planı okuma: 3 değerlendirme
   - tek rota: 3 amaç ve 69 çıkış saati
   Eşzamanlı kullanımda worker havuzu ya da kuyruk gerekebilir.
8. **Bildirim sağlayıcısı.** Ekranlar `useBildirim` kullanıyor; `BildirimSaglayici`'nın uygulama kökünde (kabukta) olduğu VARSAYIM. Değilse ekranlar açılışta hata verir.
9. **Yeni paket.** Yok. (Önizleme dosyası için PGlite kullanıldı; teslime ve depoya girmez.)

## 7. Açık sorular

Her biri tek soru; tahminle doldurulmadı, önerim sonda.

0. Cozucu ve yol agi kodu, bu oturumlarda ARKON icin yazdigim ayri sevkiyat paketinin (kurulum-modulu/packages/sevkiyat) cevirisidir. Bu kod `Desktop\Planlama` degildir ama sartnamenin "baska yerde yazilmis kod yalniz davranis basvurusudur, kopyalanmaz" maddesine giriyor.
   - Ne yapildi: Turkce adlarla, katmanlara ayrilarak ve kural sabitleri kurallar.ts'e alinarak yeniden yazildi. Algoritma adim adim aynidir; esdegerligi testle dogrulandi.
   - Secenekler:
     - (a) Kendi kodunuz oldugu icin kabul.
     - (b) Cozucu sartnameye gore sifirdan yazilsin.
   - Oneri: (a).
1. Modul adi `sevkiyat` olsun mu?
   - Secenekler: sevkiyat / lojistik / dagitim.
   - Oneri: sevkiyat.
2. Harita veri paketi (OpenStreetMap, ODbL) kim tarafindan ve nerede uretilecek?
   - Secenekler:
     - (a) Mevcut build.py ve ara.py betikleri ayri bir arac deposunda kalir; paket sunucuya elle kopyalanir.
     - (b) Betik `araclar/` altina girer (cekirdek-yazari).
     - (c) Paket yalniz kurulumda verilir.
   - Oneri: (a); depoya veri girmez.
3. Rol x islem satirlari bolum 3'teki gibi olsun mu?
   - Oneri: evet; onayla yalniz sevkiyat sorumlusunda.
4. Is araliklari ve arac musaitligi `time` (gun ici) tutuldu; sema, gece yarisini asan sevkiyat yok cevabina gore yazildi. Gece vardiyasi sevkiyati var mi?
   - Secenekler: yok (oldugu gibi kalir) / var (timestamptz'e gecilir).
   - Var cevabinda geri alma maliyeti orta: gocte 6 sutun ve saat donusumleri degisir.
   - Oneri: yok.
5. Resmi tatil ve arife ayri trafik profili mi olsun?
   - Secenekler: hayir / pazar gibi say / ayri profil.
   - Oneri: simdilik hayir.
6. Surucuye Google/Yandex baglantisi "dis servis cagrisi yok" kuralina uyuyor mu? Sunucu baglanmiyor ama durak koordinatlari surucunun telefonundan Google/Yandex'e gidiyor.
   - Secenekler: kalsin / yalniz Yandex / kaldir.
   - Kaldir cevabinda geri alma maliyeti dusuk: SurucuBaglantisi ve iki alan.
   - Oneri: kalsin.
7. Bekleyen is varken plan onaylanabilir mi? Simdi onaylanabiliyor.
   - Secenekler: izin ver / engelle / uyar.
   - Oneri: uyar.
8. Fabrika noktasi pasiflestirilebilir mi? Simdi pasiflestirilebiliyor; aktif fabrika kalmazsa plan onaylanamaz.
   - Secenekler: izin ver / yeni fabrika olmadan engelle.
   - Oneri: engelle.
9. Surucu atamasi plana girsin mi?
   - Secenekler: hayir / evet, personel modulunun kisi kimligiyle.
   - Oneri: personel modulu birlesince evet.
10. Isin kaynagi elle mi kalacak, yoksa kaynak modul (irsaliye, satinalma, fason) `disari.ts` uzerinden mi acacak?
    - Oneri: ikisi de; kaynak kimligi icin o zaman yeni sutun (ayri goc).
11. Ornek maliyet oranlari ve bolum 1'deki sayisal varsayimlar firmanin degerleri degil. Yerine ne girilsin?
    - Oneri: oranlar arac kaydinda girilsin; hiz, yukleme ve sefer degerleri sizden.
12. Onaylanmis plandaki arac ya da nokta onaydan sonra degistirilebilir ya da pasiflestirilebilir mi? Simdi izin var; onayli plan kaydedilen saatleri gosterir, guncel hesabin farkini not eder.
    - Secenekler: izin ver / engelle.
    - Oneri: engelle (onay kaldirilmadan).

## Doğrulananlar

Hedef depo elimde değildi. Çalıştırma koşulları:

- **Çekirdek dosyaları (paket a2f0cd9):** `uc.ts`, `uygulama.ts`, `test-vt.ts`, `hata.ts`, `oturum` modülü, `oturum` göçü ve ortak arayüz bileşenleri paketten birebir alındı.
  - Paketin vermedikleri için taslak yazıldı: `db.ts`, `goc.ts`, `ayar.ts`, `cerez.ts`, `yetki.ts`, `kisiler` modülü ve göçü, `katman.ts`, `Kabuk.tsx`, bileşen CSS dosyaları, `veri/oturum.ts`, `rota/kesif.ts`.
  - Paketin kendi testleri bu taslaklarla geçti: `arayuz.test.tsx` 10/10, `kisiler/servis.test.ts` 3/3, `oturum/kurallar.test.ts`.
- **Ortam:** Node 22 ve PostgreSQL 16. Node 24 ile denenmedi (BİLMİYORUM).
- **Koşulmayanlar:** `npm run kontrol` ve `sinir`.

Kanıtlar:

- **Tip denetimi:** Sunucu ve istemcide `tsc` (strict, noUncheckedIndexedAccess, verbatimModuleSyntax, erasableSyntaxOnly) hatasız.
- **Sunucu testleri:** modülün 69 testi geçti (66 akış ve kural + 3 uç testi). Akış testi göçü boş şemaya uygular ve adlandırılmış kısıt ile tetikleyici retlerini adıyla yakalar. Yarış testleri gerçek eşzamanlı transaction'larla koşar.
- **İstemci testleri:** vitest 16/16 geçti (gün planı 8, tek rota 3, noktalar 3, araçlar 2).
  - Yeni testler: araç formu yan pencerede, pasifleştirme ve iş iptali onay penceresinden (vazgeç ve Esc yazmaz).
  - Fikstür gerçek uç cevabından üretildi; yalnız harita çizgileri kısaltıldı.
  - Yokluk testleri oturumun gelmesini bekler.
- **Mutasyon:** Sunucu kodu bu turda değişmedi; mutasyon turu yeniden koşulmadı. Bağımsız denetimde sağ kalan 12 mutasyonun 12'si artık en az bir testi düşürüyor:
  - tahmini saat yazımı
  - yükleme ve boşaltma süresi
  - sefer sınırı
  - hız katsayısı
  - nokta durak süresi kısıtı
  - plaka dizini
  - alış aralığı tür kısıtı
  - plandan çıkarma
  - ilk plan yarışı
  - eski matris süresi
  - onaylı plan satırı tetikleyicisi
- **Uç düzeyi:** `uclar.test.ts` gerçek girişle koşar (sahte kimlik yok). `uygulamaKur` modülü klasörden buluyor. Uçtan uca akışta 200, 400, 409 ve 422 cevapları denendi.
- **Davranış eşdeğerliği:** Önceki paketin çözücüsüyle aynı veride sonuçlar birebir aynı. Veri: Ankara yol ağı, 12 iş, 4 araç. Kapsam:
  - 2 gün tipi x 3 amaç, dağıt ve değerlendir
  - tek rota 3 amaç x 2
  - çıkış taraması
  - trafik
- **Tarayıcı (Chromium):** Ortak bileşenlere geçişten sonra dört ekran 360, 768 ve 1280 genişlikte yeniden denendi; yatay taşma 0, konsol hatası 0. Onay ve yeni iş penceresi açıldı. Sürükle bırak bu turda elle yeniden denenmedi.
- **Önizleme:** Ankara haritası ve tarayıcıda PostgreSQL (PGlite) ile tek dosya. Modülün gerçek göçü, sorguları, servisi ve uç tanımları koşar.
  - Uç katmanının yetki ve şema adımları küçük bir yönlendiriciyle taklit edildi.
  - Teslime girmez.
- **Ölçüm:** Ankara verisiyle dağıt 0,45-0,8 sn sürdü.
- **Tarama:** Tanımlayıcılar ASCII (AST taraması). Kodda gerçek yer, müşteri ya da parça adı yok.

## Varsayımlar (geri alma maliyetiyle)

- **Db ve test imzaları.** `Db.sorgu<T>` dizi, `Db.tek<T>` satır ya da null, `testVeritabaniKur(onek)` `Veritabani` döner.
  - Yanlışsa sorgular ve akış testindeki çağrılar değişir. Maliyet: düşük.
- **Saat dilimi.** Tahmini anlar, planın günü ile veritabanı oturumunun saat diliminden kurulur; oturum saat dilimi işletmenin yerel saati sayıldı.
  - Yanlışsa iki sorguya saat dilimi eklenir. Maliyet: düşük.
- **Ondalık şeması.** `ondalikMetinSemasi` numeric metni kabul eder.
  - Yanlışsa sözleşmede 6 alan değişir. Maliyet: düşük.
- **Oturum ve rota imzası.** `useOturum().data` kullanıcıdır; `ModulRotasi` = `{ yol, ekran }`.
  - Maliyet: düşük.
- **Kısa adlar.** Döngü sayaçları ve tek satırlık ok fonksiyonu parametreleri (i, j, a, b, x, v, e) tek harf kaldı. `Harita.tsx` çizim kodunda koordinat kısaltmaları da var (x0, y0, gx, px, dx); AST taraması bunları listeler. Veri paketi dosya alanları da dosya biçimi olarak İngilizce kaldı (bbox, q, edges).
  - Denetçi isterse dil hizmetiyle toplu yeniden adlandırılır. Maliyet: orta.
- **Dosya ayrımı.** Algoritma `yol-agi.ts`, `cozucu.ts` ve `arama.ts` dosyalarında; kural sabitleri ve karar fonksiyonları `kurallar.ts`'te.
  - "Kural yalnız kurallar.ts" algoritmayı da kapsıyorsa üç dosya birleştirilir. Maliyet: düşük, yalnız taşıma.
- **Ortak bileşenlerin görünüşü.** Paket bileşenlerin CSS dosyalarını vermedi; denemede taslak CSS kullanıldı. Ekran düzeni gerçek CSS ile yeniden bakılmalı.
  - Maliyet: düşük.
- **Nokta formu pencerede değil.** Konum haritaya tıklanarak seçildiği için form harita yanında `Kart` içinde açılıyor; araç ve iş formları yan pencerede.
  - Maliyet: düşük.
- **Önceki sürümden alınmayanlar:** ikinci ekranda harita penceresi, zaman şeridi ve kanban düzeni, QR kod, haritadan serbest noktayla tek rota.
  - Maliyet: orta.
