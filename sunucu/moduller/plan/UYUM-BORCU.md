# Uyum borcu (plan) - bağlamada kapanacak

| No | Borç | Kapanış |
|---|---|---|
| P-B1 | KAPANDI (T4 B, #415): `planlanacakIsEmirleri` ve `isEmriKaynagiYaz` uretim-emirleri `disari.ts`'inden; `baglanti.ts` yalnız P-B4'ü taşır | - |
| P-B2 | KAPANDI (279 a, `20261019145500_plan_is_emri_bagi.sql`): `plan_yerlesimi` ve `plan_yerlesim_parcasi` iş emrine bağlı (silinince satır gider). Senaryo tabloları bağsız kalır: eksi kimlik deneme emridir, iş emri değil (göç satır 5). `plan_taban` geçmiş kaydıdır, bağsız | - |
| P-B3 | KAPANDI (#441): motor vardiya modülünün çalışma takvimiyle yerleştirir (`calismaTakvimleri`); vardiyası tanımlanmamış kaynak sürekli çalışır, tatil ve kapalı günü yine düşülür, plan uyarısı alır | - |
| P-B4 | KAPANDI (#439): `istasyonKisileri` istasyonlar `disari.ts`'inden; `baglanti.ts` kalktı | - |
| P-B5 | Çakışma veritabanında dışlama kısıtıyla değil, servis denetimi ve plan sürümü kilidiyle (btrim_gist yok) | btree_gist eklentisi çekirdekçe açılırsa EXCLUDE kısıtı |
| P-B6 | KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): `PLAN_ISLEMLERI` toplayıcıda (`paylasilan/islemler.ts` `...PLAN_ISLEMLERI`), rol satırları göçlerle girdi (`20261011114309_kisiler_planlama_plan_yaz.sql` `plan.yaz`, `20261015180508_kisiler_rota_canli_kalite_merkezi.sql` `('planlama_proje', 'plan.canliya-al')`). Toplayıcı ve eski sayfa kaldırma çekirdekte; rol satırları ayrı göçte | CEKIRDEK-ISTEKLERI |
| P-B7 | KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz; karar 41, #1645): eski rota tanım adresleri ve ana sayfa kartları Reçete ve Rota'ya gider; madde eski ekranın. Plan bölümleri Reçete ve Rota ikinci menüsünde (K2); eski plan ekranları B41 (rota) kontrolünde. Eski metin: Plan ekranları Rota sayfasında (P2, K2; şartnamede her modül kendi sayfasında) | Kullanıcı kararı; borç olarak kayıtlı |
| P-B8 | KAPANDI (T4 B, #415): `plan.test.ts` emirleri rotanın emre kopyalama ucuyla açar; iş emri durumu testte SQL ile değişir (terminal komutu uretim-emirleri'nde) | - |

## Aşama 1 oturtma bulguları (bağlamada kapanacak)

| No | Borç | Ekrana dokunur | Kapanış |
|---|---|---|---|
| P-B9 | KAPANDI (borç temizliği 625a, 26.10.2026): okuma uçları `PLAN_OKUR` (`biri: ['plan.oku', 'plan.yaz']`, `uclar.ts:18`); `plan.oku` rolleri `20261019125000_kisiler_plan_oku.sql`. `oturum`la kalan yalnız `GET /plan/surum` ve `/plan/menu-sayaclari` (sürüm ve sayaç, veri içermez) | Hayır | - |
| P-B10 | KAPANDI (#1749): `plan_senaryo_yerlesimi_tekil` (`20261019064600_plan_anahtar_adlari.sql`, `kisit-adlari.test.ts`). Eski metin: `plan_senaryo_yerlesimi` birincil anahtarı adsız (kısıtlar adlandırılır kuralı) | - | - |
| P-B11 | KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz; karar 41, #1645): eski rota tanım adresleri ve ana sayfa kartları Reçete ve Rota'ya gider; madde eski ekranın. `/cizelge`, `/matris` menüde gizli, `/kuyruk` Arkon kuyruğu; kalan karar B41 (rota) kontrolünde. Eski metin: Depodaki `/cizelge`, `/matris`, `/kuyruk` yer tutucu sayfaları teslimdeki Plan ve Kanban ekranlarıyla aynı işi görür; ikisi birden durur (karar PL1 c) | Evet | Aşama 2'de karar |
| P-B12 | KAPANDI (borç temizliği 625a, 26.10.2026: rol matrisi dağıtıldı, `kurulum/yetki-matrisi.md` satır 28-37; `plan.kilitle`, `plan.studyo`, `plan.canliya-al` müdür ve planlamada, `plan.yaz` müdürde de (524/3 b, `20261025194000_kisiler_mudur_plan_yaz.sql`)). Eski metin: planlamacıda `sayfa.rota`, `plan.yaz` ve `plan.canliya-al` var; `plan.kilitle` ve `plan.studyo` dağıtımı rol matrisinde. Plan sayfası ve işlemleri Aşama 1'de yalnız yöneticide | Hayır | - |

## T4 (kart #415) bulguları

| No | Borç | Ekrana dokunur | Kapanış |
|---|---|---|---|
| P-B13 | KAPANDI (#417 sonrası): öncelik ve emir başlangıcı motora girer; taslak emirler "taslak emirleri de planla" ayarıyla uyarılı yerleşir. Kalan: "en sıkışık emri acile çek" hızlı denemesi canlıya alınamaz (P-B16) | - | - |
| P-B14 | KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): plan sorgusu `baslamis`'ı iş emri durumundan kuruyor (`uretim-emirleri/sorgular.ts` `'baslamis', EXISTS (... b.durum <> 'bekliyor')`). "Başladı" emir düzeyinde (`baslamis`); iş emri düzeyinde başlamış bilgisi `durum` ile gelir, terminal yazana kadar test SQL ile kurar | Hayır | uretim-emirleri iş emri durumunu verince (istek) |
| P-B15 | KAPANDI (#419, karar a): `isEmriKaynagiYaz` `plan.canliya-al` kabul eder; yalnız canlıya alma yetkisi olan müdür taslağı canlıya alır (U P-B15 testi) | Hayır | - |
| P-B16 | Kısmen kapandı (#441): kapalı gün denemesi canlıya alınınca vardiya takvimine kapalı gün yazılır (canlıya alan vardiya yazma yetkisi de taşımalı). Kalan: acil sipariş, arıza ve öncelik denemeleri yalnız senaryoda, "bekleyenler" listesinde | Evet | Sahibi modüllerin komutları (uretim-emirleri, istasyonlar makine durumu) gelince |
| P-B17 | KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz; karar 41, #1645): eski rota tanım adresleri ve ana sayfa kartları Reçete ve Rota'ya gider; madde eski ekranın. Emir komutları Reçete ve Rota'da, taslak emir desteğiyle (`recete-rota/emir-komutlari.ts`). Eski metin: Üretim emirleri bölümündeki komutlar (plana al, iptal, adım kaynağı) canlıya doğrudan yazar; P6 taslağına girmez | Evet | uretim-emirleri taslak desteği ya da kullanıcı kararı |
| P-B18 | KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): parti böl ve birleştir Reçete ve Rota'da (`istemci/src/moduller/recete-rota/emir-komutlari.ts` "Parti bölme ... kolN/kolM", `'emir-birlestir'` -> `/adimli-emirler/:id/birlestir`); elle bölme göç `20261016132645_plan_yerlesim_parcasi.sql` (kart #1572). Operasyon kartında "Partiyi böl", "Parçaları birleştir", "Emri aç" yok (PL-06 paralel bölme dahil); "Plan sırasına dön" kart #262 ile geldi (kuyruk başlığında) | Evet | Bölme modeli kararı (kart #262) ve uretim-emirleri bölme komutu |
| P-B19 | Kısmen kapandı (#441): personel matrisi (iş merkezi başına günlük kişi-saat ihtiyacı ve kapasitesi) ve "personelin sınırladığı gün" göstergesi bağlandı. Kalan: kısıt açıkken motor işi personel yetmediği için ertelemez, yalnız sayar (ilk sistemdeki gibi) | Evet | Aşama 2, plan akışı (kabulde sorulur) |
| P-B20 | KAPANDI (#441): takvim verisi vardiyadan gelir (P-B3) | - | - |
| P-B21 | "Bağlılıkları göster" yok; emir önizlemesi kart #262 ile geldi (`GET /plan/onizle`) | Evet | Aşama 2, plan akışı |
| P-B22 | KAPANDI (#1749): `plan_ayari_tekil`, `plan_ayari_degistiren`, `plan_senaryo_ayari_tekil`, `plan_senaryo_ayari_senaryo`. Eski metin: `plan_ayari` ve `plan_senaryo_ayari` birincil ve yabancı anahtarları adsız (P-B10 ile aynı kural) | - | - |
| P-B23 | KAPANDI (#1758, Reçete ve Rota ekran testleri; bugünkü davranışta hata çıkmadı). Eski metin: Ekran testleri plan düğmelerini yalnız tam yetkiyle sınar; yetkisiz kullanıcıda gizlenme ve Kanban "Öne al", "Dondurmayı kaldır" tıklaması ölçülmez (sunucu reddi `plan.test.ts`'te ölçülür) | - | - |
| P-B24 | KAPANDI (#470 sonrası): plan günü, gün başı, teslim gün sonu, vardiyasız kaynağın kapalı günü, değişiklik defteri saati ve taslak adı tesis saat diliminde (`tesisGunu`, `tesisGunBasi`, `tesisSaati`); `plan.test.ts` 21:30Z anında ölçer. Rota istemcisinin yeni emir günü ve CSV dosya adı da tesis gününden (`#paylasilan/tesis-zamani.ts`) | - | - |

## Fason süresi (CA-2 kullanıcı kararı, bağlamada kapanacak)

| No | Borç | Ekrana dokunur | Kapanış |
|---|---|---|---|
| P-B25 | KAPANDI: emirdeki termini girilmemiş fason adımın süresi satın almanın `fasonSuresiTahminleri` tahmininden, yoksa 7 gün (plan `planlanacakIsEmirleri`'ne toplu tahmin verir). Kalan: emir açılmadan önceki rota önizlemesi (`icAdimlar`) hâlâ 7 gün sayar | Hayır | Önizleme için malzeme ve adet bilinince aynı tahmin verilebilir |
| P-B26 | KAPANDI (kullanıcı kararı "İsteğe bağlı"): emirde fasona almada termin isteğe bağlı (`uretimYeriIhlali`); rota onayı (`onayaHazirMi`) Reçete ve Rota şeridinde | - | - |

## Sunucu motoru (ADR 0018, 391 a)

| No | Borç | Ekrana dokunur | Kapanış |
|---|---|---|---|
| P-B27 | KAPANDI (627 a, kart 625h): `sunucu/kablolama.ts` `bag('plan motoru -> plan', planMotoruCozucusu, receteRota.sunucuPlanCozucusu)`; canlıya almada ve kuyruk yazımında makine kuyrukları ortak motorla yeniden dizilir. `/plan/oner` ve `/plan/karsilastir` kalktı (625n; testler, akış sağlığı ve robot Planı kur'a, yani kuyruk yazımına geçti). Sıralama kuralları sayfanın (687 a); ek adım emrin kendi adımı olarak motora gider (686 a; 689 a ara yolu kalktı). Kalan Motor A kullanımları (220 a motor yerleşimi, emir önizleme, hızlı deneme, parçalı kuyruk yazımı) ayrı kartta (625m). Planlama sayfasının çalışma kaydı yoksa çözücü 409 verir (canlıya alma durur, ileti sayfayı bir kez kaydetmeyi söyler) | Hayır | Kalan Motor A kullanımları 625m'de kalkar |
| P-B28 | Çözücü kayıtlıyken parçalı ya da kişi kaynaklı kuyruk yazımı Motor A yolundan gider (çözücü cevabı parça ve kişi taşımıyor); canlıya almada bölünmüş iş ve kişi kaynaklı iş yeniden dizilmez, sabit kalır | Hayır | Çözücü parça ve kişi kaynağı verince |

## Ekranı olmayan uçlar (kullanıcı kararı 139 a, 23.10.2026) - bağlamada kapanacak
- Uçlar kalır, bağlamada ekrana bağlanır. Hiçbir ekran çağırmıyor (DOĞRULANDI, `degerlendirme/sistem-uyum/rapor.md` bulgu 8): `GET /plan/canli-yerlesim`, `POST /plan/senaryolar/:id/{canliyi-al, cogalt, degisiklikleri-at}`. Senaryo uçları plan stüdyosunun sunucu yarısıdır; stüdyo bugün sunucuya bağlı değil (`degerlendirme/sistem-uyum/plan-akisi.md`).

## Plan akışı bağlaması (kart 625, 26.10.2026)
- Bağlama planı ve açık sorular kartta (625; sorular 626-631). Bu dosyada açık kalanlar: P-B5 (631), P-B16, P-B19, P-B21, P-B27 ve P-B28 (627), ekranı olmayan uçlar.
