# recete-rota: sorulacaklar (teslim 20.10.2026)

Cevaplar (20.10.2026, kullanıcı): 353 a (yetki genişletme onaylı), 356 b, 357 a (prototip değişikliği onaylı), 359 a. Açık: 354 (motorun yeri; ölçüm istendi, karar gelene kadar tarayıcıda), 355 b (HiGHS girsin; paket onayı yazılı gelmedi, paket eklenmedi), 358 b (gömülü kütüphaneler çıkarılsın). Sonra: 362 a (dört kütüphane kendi kodumuzla yazıldı, `parca/v-arac.betik`; prototip değişikliği onaylı); 361 b (HiGHS `highs` 1.15.3 paketiyle, planlama çerçevesinde `wasm-unsafe-eval`; paket ve güvenlik gevşetmesi onaylı); 364 c (motor JS kalır, 363 a iptal). Google Fonts satırları dosyadan silindi (öneri a).

Numarasızdır; numarayı koordinatör verir. Her madde cevap gelene kadar öneriyle ilerler; geri alması pahalı olanlar ("sorulur" kademesi) işaretli.
Cevapta doldurulmamış yer tutucu ya da silinmemiş seçenek onay sayılmaz.

## Planlama sayfalarını kim görür (sorulur: yetki modeli)
- Soru: Planlama sayfaları (planlama motoru, atölye, siparişler, maliyetler, genel gider, mesai, fason, malzeme, terminler, termin ve kâr, yıllık, sevkiyat) yalnız yöneticiye mi açılsın?
- Neden: Aşama 1 kuralı "işlemler yalnız yöneticide"; bu teslim maddeleri bugünkü `plan.oku` işlemine bağladı, `plan.oku` sahibi her rol sayfaları görür. Çerçevenin içinde rol her zaman yöneticidir.
- Seçenekler: a) yeni işlem `planlama.oku`, yalnız yönetici (çekirdek şeridi, yetki göçü); b) `plan.oku` kalsın; c) Aşama 2'de ortak yetki matrisiyle karar.
- Öneri: a. Aşama 1 kuralıyla uyumlu; bugün yalnız menü işlemi değişir.

## Sunucu motorunun yeri (sorulur: onaylanmış kararla çelişme olabilir)
- Soru: Planlama motoru (`engine`) tarayıcıda mı kalsın, sunucuya mı taşınsın?
- Neden: Bugün motor tarayıcıda ayrı iş parçacığında koşar; canlı plan yalnız kayda yazılır. Terminal ve Arkon'un okuyacağı plan sunucuda olmalı.
- Seçenekler: a) tarayıcıda kalsın, yalnız "canlıya al" sonucu sunucuya yazılsın; b) motor sunucuya (`plan` modülü ya da yeni modül) taşınsın, tarayıcı yalnız gösterir; c) iki yerde.
- Öneri: a. Motor davranışça aynı kalır; sunucuya yalnız yerleşim gider (uretim-emirleri canlı plan uçları).

## HiGHS (sorulur: yeni bağımlılık)
- Soru: Denemedeki HiGHS (doğrusal programlama çözücüsü, WASM) uygulamaya girsin mi?
- Neden: Pakette yok; planlamada seçilirse çalışmaz. Girmesi yeni bağımlılıktır (npm `highs` 1.15.3; `highs.wasm` 3,5 MB, gömülü ya da paket).
- Seçenekler: a) girmesin, seçenek gizlensin; b) paket olarak girsin; c) sunucu motoruyla sunucuda.
- Öneri: a. Varsayılan motor HiGHS'sız çalışıyor (motor imzaları denemeyle aynı).

## İki motor (sorulur: onaylanmış kararla çelişme)
- Soru: Reçete ve Rota'nın kendi plan hesabı (`planRun`; Plan, Stüdyo, Kanban sekmeleri, 307 a ve 304 a) kalksın mı?
- Neden: İki motor aynı emirler için farklı tarih verir (t163: canlı planla sıra farkı). Bu teslimde o sekmelere menüden gidilmez, yolları planlama çerçevesine gider.
- Seçenekler: a) kalksın, Reçete ve Rota canlı planı yalnız okur; b) kalsın, gizli; c) kalsın, menüde görünsün.
- Öneri: b şimdilik, Aşama 2'de a.

## Tanım bölümlerine planlama alanları (sorulur: onaylanmış prototip değişikliği)
- Soru: Reçete ve Rota prototipine eklenen planlama alanları (makinede verim, operatör oranı, plan ücreti, ışıksız; kişide ayarcı; "Fason ve aparat" alt sekmesi; rota adımında ayar ailesi, aparat, Qmin, kasa, ayar matrisi; ham malzemede tedarik ve muayene günü) kalsın mı?
- Neden: Kullanıcı prototipin "birebir" kalmasını istemişti (13.10); bu alanlar görünümü değiştirir. Planlama bu alanlar olmadan varsayılanla çalışır.
- Seçenekler: a) kalsın; b) planlama sayfasına taşınsın, prototip eski hâline dönsün; c) kalsın ama ayrı bir "Planlama" sekmesinde toplansın.
- Öneri: a. Değer tek yerde (kaydın `plan` alt nesnesi) ve tanımın yanında düzenlenir.

## Tekrar eden tezgâhların teke indirilmesi (onay bekliyor)
- Soru: Aynı adlı tezgâhlar (deneme verisinde T1 ve T2 "CNC torna Ø400") teke indirilsin mi?
- Neden: Koordinatör notu: indirme onay bekliyor. Bu teslim indirmedi. Planlamada iki aynı tezgâh iki paralel kaynaktır; teke inmesi kapasiteyi yarıya düşürür.
- Seçenekler: a) indirilmesin, aynı adlı tezgâhlar ayrı kaynak kalsın; b) teke insin, adet alanıyla (paralel adet) gösterilsin; c) yalnız gerçek veride elle karar.
- Öneri: a. Plan sonucu değişmez; b kapasite modelini değiştirir.

## Malzeme gelmeden başlama (K3)
- Soru: Malzeme kısıtı uyarı kipindeyken iş malzeme gelmeden başlasın mı (planlamada "iş uyarıyla başlar (K3)")?
- Neden: Bugün uyarı kipinde iş başlar, uyarı verilir (`w-v20.betik`, `s-gun.betik`). Katı kipte iş malzemeyi bekler, tarihler kayar.
- Seçenekler: a) uyarı kipi varsayılan; b) katı kip varsayılan; c) sipariş başına seçilsin.
- Öneri: a (denemenin kararı korunur).

## Bekleme maliyetinin bileşenleri (K3-K5, genel gider)
- Soru: Yarı mamul ve mamul bekleme maliyetine alan, elleçleme ve bozulma da girsin mi, yoksa yalnız finansman mı?
- Neden: Bugün yalnız finansman (212 a; 1650 kararı 1 a). Alan ve iç taşıma genel giderde, bozulma hurda payında; bileşenler hesapta var ama "Proje maliyet incelemesindeki K3-K5 cevaplanana kadar" kapalı.
- Seçenekler: a) yalnız finansman kalsın; b) alan ve elleçleme açılsın, genel giderden düşülsün; c) üçü de açılsın.
- Öneri: a. Genel giderle çift sayım olmaz.
- BİLMİYORUM: K3-K5 sorularının tam metni bu teslimde yok.

## Alt iş emri
- Soru: Planlamanın parti bölmesi (Qmin ve kasa kuralıyla) uretim-emirleri'nde alt iş emri olarak mı açılsın?
- Neden: Bugün bölme yalnız planda; Reçete ve Rota emirlerinde ayrı bölme var (`orders[].parentId`, kart #1034), uretim-emirleri'nde `/adimli-emirler/:id/bol`. Üç yer aynı kavramı taşır.
- Seçenekler: a) planlamanın bölmesi plan içi kalsın, emir bölünmesin; b) canlıya alınca alt iş emri açılsın; c) planlamacı onaylayınca açılsın.
- Öneri: a şimdilik; bağlamada c.
- BİLMİYORUM: denemede "alt iş emri" adıyla bir karar metni bulunmadı (aramayla); soru bölme koduna göre kuruldu.

## Ayarı öne alma
- Soru: Planlama ayarı (setup) önceki işin bitmesini beklemeden, tezgâh boşken öne alabilsin mi?
- Neden: Ayarcı ve aile geçişi kısıtı ayarın zamanını belirler; öne alma tezgâh boş süresini azaltır, ayarcıyı erken bağlar.
- Seçenekler: a) hayır, ayar işin hemen önünde; b) evet, ayarcı boşsa; c) adım başına işaret.
- Öneri: a (bugünkü davranış, VARSAYIM: motor kodunda ayrı öne alma seçeneği görülmedi).
- BİLMİYORUM: denemede "ayarı öne alma" adıyla bir karar metni bulunmadı (aramayla).

## Qmin ve kasa
- Soru: Bölünen adımda en küçük parti `max(elle girilen en küçük parti, ayarın iki katı kuralı)`, kasa adedinin katı (son parti hariç) kuralı kalsın mı?
- Neden: Kural `zz14-qmin-kasa.betik`'te; Reçete ve Rota'daki adımın `minLot` alanı aynı değerdir.
- Seçenekler: a) kalsın; b) yalnız elle girilen değer; c) yalnız ayarın iki katı.
- Öneri: a.

## İlk parça onayı
- Soru: İlk parça onayı (ayardan sonra bir parça işlenir, onay süresi beklenir; varsayılan süre `faiSaat`) planlamada kısıt olarak kalsın mı ve onay Kalite Merkezi'nden mi okunsun?
- Neden: Bugün kısıt sabit süreyle hesaplanır (`d-kisitlar.betik` `fai`); gerçek onay olayı okunmaz.
- Seçenekler: a) sabit süre kalsın; b) bağlamada Kalite Merkezi onayı beklensin; c) kısıt kapalı.
- Öneri: a, bağlamada b.

## Tek onay noktası
- Soru: Planın canlıya alınması tek yerden mi olsun?
- Neden: Bugün iki yer var: planlama modülünün "Canlıya al"ı (`tmiCanli`) ve Reçete ve Rota'nın Plan stüdyosu onayı (taslak senaryo -> canlı). İkisi aynı kayda farklı alanlarla yazar.
- Seçenekler: a) yalnız planlama modülü; b) yalnız Reçete ve Rota stüdyosu; c) ikisi, son yazan geçerli.
- Öneri: a. Reçete ve Rota'nın stüdyosu menüden zaten erişilmiyor.
- BİLMİYORUM: denemede "tek onay" adıyla bir karar metni bulunmadı (aramayla).

## Google Fonts bağlantıları
- Soru: Reçete ve Rota prototipindeki Google Fonts bağlantıları (`<link>` 3 satır) dosyadan da silinsin mi?
- Neden: Açılışta zaten çıkarılır (`ReceteRotaCercevesi.tsx` `sayfaKur`), içerik politikası da engeller; dosyada kalması herkese açık depoda dış adres demektir.
- Seçenekler: a) dosyadan silinsin; b) kalsın, açılışta çıkarılsın.
- Öneri: a. Davranış değişmez.

## Gömülü kütüphaneler (KAPANDI: 358 b, 362 a; kendi kodumuz)
- Soru: Planlama sayfasındaki beş gömülü kütüphane (driver, interact, sortable, iki yardımcı) kaynak olarak gömülü kalsın mı?
- Neden: Paket değiller (`package.json`'a girmez), lisansları yanında; ama dışarıdan gelen kod.
- Seçenekler: a) gömülü kalsın; b) paket olarak girsin (yeni bağımlılık); c) çıkarılsın, ilgili özellik (tanıtım, sürükle bırak) kapanır.
- Öneri: a. Dış çağrı yok; içerik politikası bağlantıyı kapatır.
