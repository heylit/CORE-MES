# Uyum borcu (plan) - bağlamada kapanacak

| No | Borç | Kapanış |
|---|---|---|
| P-B1 | KAPANDI (T4 B, #415): `planlanacakIsEmirleri` ve `isEmriKaynagiYaz` uretim-emirleri `disari.ts`'inden; `baglanti.ts` yalnız P-B4'ü taşır | - |
| P-B2 | KAPANDI (279 a, `20261019145500_plan_is_emri_bagi.sql`): `plan_yerlesimi` ve `plan_yerlesim_parcasi` iş emrine bağlı (silinince satır gider). Senaryo tabloları bağsız kalır: eksi kimlik deneme emridir, iş emri değil (göç satır 5). `plan_taban` geçmiş kaydıdır, bağsız | - |
| P-B3 | KAPANDI (#441, B-2483-5/-6): motor vardiya modülünün çalışma takvimiyle yerleştirir (`calismaTakvimleri`). Vardiyası tanımlanmamış kaynak (takvimi yok ya da iş merkezinin matrisinde aktif vardiya yok, `vardiyaTanimli`) plan uyarısı alır; sunucu motoru kayıtlıyken tanımsız makinenin çalışma zamanı yoktur (168 b: iş dizilmez, istasyon kapasitesi 0, elle yerleştirme reddedilir); kişi ve motorsuz kurulumda sürekli çalışır, tatil ve kapalı günü düşülür. Tanımlı ama 0 dakikalı kaynak (izin, ayrılma, vardiyası o günlerde yok) tanımsız değildir, kapasitesi 0'dır (`vardiyasiTanimsiz`) | - |
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
| P-B16 | KAPANDI (922 b, 27.10.2026): acil sipariş, arıza ve öncelik denemeleri senaryoda kalır; canlıya yazılmaz, karar böyle. Önceki metin: Kısmen kapandı (#441): kapalı gün denemesi canlıya alınınca vardiya takvimine kapalı gün yazılır (canlıya alan vardiya yazma yetkisi de taşımalı). Kalan: acil sipariş, arıza ve öncelik denemeleri yalnız senaryoda, "bekleyenler" listesinde | Evet | Sahibi modüllerin komutları (uretim-emirleri, istasyonlar makine durumu) gelince |
| P-B17 | KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz; karar 41, #1645): eski rota tanım adresleri ve ana sayfa kartları Reçete ve Rota'ya gider; madde eski ekranın. Emir komutları Reçete ve Rota'da, taslak emir desteğiyle (`recete-rota/emir-komutlari.ts`). Eski metin: Üretim emirleri bölümündeki komutlar (plana al, iptal, adım kaynağı) canlıya doğrudan yazar; P6 taslağına girmez | Evet | uretim-emirleri taslak desteği ya da kullanıcı kararı |
| P-B18 | KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): parti böl ve birleştir Reçete ve Rota'da (`istemci/src/moduller/recete-rota/emir-komutlari.ts` "Parti bölme ... kolN/kolM", `'emir-birlestir'` -> `/adimli-emirler/:id/birlestir`); elle bölme göç `20261016132645_plan_yerlesim_parcasi.sql` (kart #1572). Operasyon kartında "Partiyi böl", "Parçaları birleştir", "Emri aç" yok (PL-06 paralel bölme dahil); "Plan sırasına dön" kart #262 ile geldi (kuyruk başlığında) | Evet | Bölme modeli kararı (kart #262) ve uretim-emirleri bölme komutu |
| P-B19 | KAPANDI (923 a, 27.10.2026): personel kısıtı yalnız sayar ve gösterir; motor işi personel yüzünden ertelemez, karar böyle. Önceki metin: Kısmen kapandı (#441): personel matrisi (iş merkezi başına günlük kişi-saat ihtiyacı ve kapasitesi) ve "personelin sınırladığı gün" göstergesi bağlandı. Kalan: kısıt açıkken motor işi personel yetmediği için ertelemez, yalnız sayar (ilk sistemdeki gibi) | Evet | Aşama 2, plan akışı (kabulde sorulur) |
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
| P-B27 | KAPANDI (627 a, kart 625h): `sunucu/kablolama.ts` `bag('plan motoru -> plan', planMotoruCozucusu, receteRota.sunucuPlanCozucusu)`; canlıya almada ve kuyruk yazımında makine kuyrukları ortak motorla yeniden dizilir. `/plan/oner` ve `/plan/karsilastir` kalktı (625n; testler, akış sağlığı ve robot Planı kur'a, yani kuyruk yazımına geçti). Sıralama kuralları sayfanın (687 a); ek adım emrin kendi adımı olarak motora gider (686 a; 689 a ara yolu kalktı). Motor A kalktı (625m, 1381 a, kart 1408): 220 a motor yerleşimi, emir önizleme ve hızlı deneme çözücüyü 'yeni' kipte çağırır (deneme değişiklikleri: sanal emir, öncelik ve teslim, arızalı makine, kapalı gün); çalışma kaydı yoksa çözücü sayfanın boş çalışmasıyla bellekte çözer, 409 yok. Plan ayarındaki `kural` motoru etkilemez; sıra motor ayarının kuralındandır | - |
| P-B28 | KAPANDI (1408, 1409 a varsayımıyla): parçalı, kişi kaynaklı ve elle sıralı kuyruk işi motorsuz yazılır (ekran sırası, takvimle), makine işleri çözücüye sabit olarak gider; canlıya almada bölünmüş ve kişi kaynaklı iş sabit kalır. 1409 cevabı başka çıkarsa yeniden açılır | - |

## Ekranı olmayan uçlar (kullanıcı kararı 139 a, 23.10.2026) - bağlamada kapanacak
- Uçlar kalır, bağlamada ekrana bağlanır. Hiçbir ekran çağırmıyor (DOĞRULANDI, `degerlendirme/sistem-uyum/rapor.md` bulgu 8): `GET /plan/canli-yerlesim`, `POST /plan/senaryolar/:id/{canliyi-al, cogalt, degisiklikleri-at}`. Senaryo uçları plan stüdyosunun sunucu yarısıdır; stüdyo bugün sunucuya bağlı değil (`degerlendirme/sistem-uyum/plan-akisi.md`).

## Plan akışı bağlaması (kart 625, 26.10.2026)
- Bağlama planı ve açık sorular kartta (625; sorular 626-631). Bu dosyada açık kalanlar: P-B5 (631), P-B16, P-B19, P-B21, ekranı olmayan uçlar.

## Planlamanın plan modülüne taşınması (658 c, 26.10.2026)
- P-B29 kapandı (815, 699/3 a): plan sırasına yalnız üretim emrinin önceliği girer (1-2 Yüksek, 3 Normal, 4 Düşük); sipariş tutarı, gecikme cezası,
  müşteri sınıfı ve elle çarpan sıraya ve atölye motorunun ağırlığına girmez. Kalan ölü parçalar (plan-olu-kod işine): bedel ayarındaki sınıf
  çarpanları ve yüksek/düşük eşikleri okunur ama kullanılmaz; atölye motorundaki bedel kipi kodu (agOncHesap, agOncYaz, ELLE_ONC) ve
  istemcideki `dengeEtkin`, `agBedel` çağrılmaz olur; musteri-tedarikci `gorunum.ts` sınıf yorumu eski. Sipariş çarpanı tabloları silinmedi, yazılmaz.
- P-B35: `planMotoruCozucusu` kaydı ve kablolama bağı ADR 0020'den sonra aynı modülün iki ucunu bağlar (çözücü de plan modülünde); kayıt
  kalkıp plan servisi `sunucuPlanCozucusu`'nu doğrudan çağırabilir. 625n'in davranışına dokunulmadı.
- P-B30: KAPANDI (925 a, 2503): sunucuda planlama çalışmasını yazmak, silmek ve boş çalışmayı açmak yalnız `plan.yaz` ister; öteki anahtarlar `recete-rota.yaz` ile kalır (`planlamaYazmaDenetimi`, testler PY-05b, PC-06). İstemci `planlama/yetki.ts` `calismaYazabilir` yalnız `plan.yaz` arar (`yetki.test.ts`).
- P-B31: Reçete ve Rota'nın bazı sunucu testleri (RR-11, RR-18/19, EMR) birleşik durumu ve kapasiteyi plan uçlarından okur; testler modül
  sınırına göre ayrılınca plan modülüne geçer.
- P-B32: eski planlama çerçevesinin derlemesi (`istemci/.../recete-rota/planlama-derle.ts`) motoru bu modülün klasöründen gömer; çerçeve
  kalkınca kalkar.
- P-B33: Reçete ve Rota ana kaydında plan ayarı alanları (settings) durur; plan bunları `planlama-kaynagi` ile okur. Ayarın sahibi bağlamada
  plan modülüne geçer.
- P-B34: `siparisler/disari.ts` yorumu motoru hâlâ Reçete ve Rota'ya yazar; siparişler modülüne dokunulmadı, yorum o modülün sırasında düzelir.
- P-B35: Plan ihtiyacı (898 a) yalnız canlıya almada yeniden hesaplanır; arada gelen mal kabulü, sarf ya da kapanan emir satın almadaki listeyi
  bir sonraki canlıya almaya kadar değiştirmez (satın alma okurken açık sipariş ve talebi yine düşer). Olay anında yenileme bağlamada sorulur.
- P-B36 (1329): planın malzeme fiyatı Satın Alma'nın bütün teslimlerinin ortalamasıdır; 1291 a'daki 12 aylık ağırlıklı ortalama Satın Alma'dan
  okunur olunca ona geçer. Sunucu plan motoru (iç okuyucu) finans.maliyet-oku taşımaz, fiyatı null alır: malzeme fiyatı yalnız tutarı etkiler,
  sırayı etkilemez (ağırlık kipi öncelik, 815). Motorun tutar raporu gerekirse bağlamada sorulur.

## Bağlamada kapanacak: tek birincil düğme (kart 2155, karar 2155-9 a, 06.11.2026)
Kural: sayfada en çok bir birincil (sarı) düğme; ikincisi çizgili olur, izleme sayfası birincil taşımaz. Ekran teslim olduğu gibi bırakıldı; sayılar
`ekran-testleri/tek-birincil.spec.ts` BORC listesindedir ve yalnız düşebilir. Hangi düğmenin birincil kalacağı bağlamada kullanıcıya sorulur.
- `/plan`: birincil 3: "Planlama çalışmasını aç", "Planı kur" (iki kez) (yönetici, 1280 ve 360, DOĞRULANDI 06.11.2026 ölçümü).
- `/recete-rota/plan`: birincil 3: aynı Planlama ekranı (eski adres yönlenir) (yönetici, 1280 ve 360, DOĞRULANDI 06.11.2026 ölçümü).

## Reçete ve Rota'dan taşınanlar (B-2484-R1, 09.11.2026)
Aşağıdaki maddeler `sunucu/moduller/recete-rota/UYUM-BORCU.md`'den olduğu gibi taşındı; planlama artık plan modülünün sayfalarıdır. Metin taşındığı günkü haliyle durur;
çoğu madde eski planlama çerçevesine aittir ve 2484 ölçümüne göre kapanmış ya da geçersizdir (`.betik` ve `.stil` dosyası yok, `planRun` yalnız yorumda); kapanış ve güncel durum 2483 doğrulamasıyla yazılır.
Kalan iddia ölçümü (2484, B-2484-R1): HiGHS paketi `package.json`'da duruyor; fason adı kapandı; başlamış adım, adım adedi, şimdi ve fasoncu maddeleri plan modülünündür.

### Bağlamada kapanacak: planlama (teslim 20.10.2026)
| Kural / konu | İstisna | Nasıl uyumlanır |
|---|---|---|
| Rol ve yetki | Planlama çerçevesinde rol her zaman yönetici (`u5`, `zz31-tmi.betik`); denemenin rol seçicisi ve kendi yan menüsü görünür. Planlama sayfaları `recete-rota.planlama-oku` ile görünür ve açılır (353 a; işlem göçle hiçbir role verilmez, yalnız yönetici); eskiden `plan.oku` ile Plan sekmesini gören roller (planlama, müdür, vardiya sorumlusu, CAM, kalite, bakım) Aşama 1'de planı görmez. Denetim yalnız istemcidedir: kayıt okuma ucu (`GET /recete-rota/kayitlar`) `:planlama` anahtarını da `recete-rota.oku` ile verir. | Aşama 2: rol ortak yetki matrisinden; çerçevenin rol seçicisi kalkar; `:planlama` anahtarının okuması ve yazması sunucuda planlama işlemini ister. |
| Deneme metni | Alt bilgi "Deneme sayfası ... bütün veri uydurmadır" uygulamada da görünür; uygulamada veri kayıttandır. | Görünüm: metin TMI içinde gizlenir ya da değişir. |
| Canlı plan yalnız kayıtta | Planlama sayfasının "Onaya gönder" ve "Onayla, canlıya al"ı yalnız kayda yazar (`st.senaryolar`, `st.tmiCanli`); sunucu planı, Arkon ve terminal güncellenmez. GÜNCELLENDİ 23.10.2026 (DOĞRULANDI: `planlama-modulu.html`de `plan-canliya-al` yok, `parca/u-bugun.betik` `bg-onaya`, `bg-yayinla`): onay adımı da yalnız kayıttadır. Reçete ve Rota köprüsünde plan yazma komutu yoktur (2317, 2303-2 a): plan yalnız Planlama sayfasından yazılır. | Aşama 2: uretim-emirleri canlı plan uçları (BASKA-MODUL-ISTEKLERI). Canlıya alma 391 cevabı gelmeden yapılmaz: sunucu motoru çalışan adımın kalanını kalan adetten (`plan/servis.ts` `gerceklesenler`), çerçeve motoru geçen süreden (`engine.betik` sabitler) hesaplar; çerçeve planı sunucu planı olursa adet tabanlıdan süre tabanlıya geri düşülür. |
| İki motor | Reçete ve Rota'nın kendi plan hesabı (`planRun`) ve planlama motoru (`engine`) ayrı; Reçete ve Rota'nın emir tarihleri canlı plandan farklı (t163). Reçete ve Rota'nın Plan, Stüdyo, Kanban sekmelerine menüden gidilmez; 307 a ve 304 a o sekmelerde kaldı. Karar 356 b: eski motor gizli kalır. | Aşama 2: eski motor kalkar, Reçete ve Rota canlı planı okur (356 b). |
| Çözücüler | HiGHS: 361 b ile girdi (`highs` 1.15.3 paketi; kabuk istek üzerine verir, `wasm-unsafe-eval` yalnız planlama çerçevesinde). CP-SAT yok; seçilirse çalışmaz. Denemenin yerel çözücü servisi yoklaması (`h-cozuculer`) çerçevede bağlantı kapalı olduğundan sonuçsuz. | HiGHS kararı (SORULACAKLAR); sunucu motoru kararıyla birlikte. |
| Planlama takvimi ve kaynakları | Tezgâh, istasyon, personel, vardiya, çalışma günü ve tatil planlama sayfasına da kaynak okumasıyla gelir (`zz31-tmi.betik` `tmiKaynakIle`, Reçete ve Rota çerçevesiyle aynı okuma); kayda yine yazılmaz. Kalan: (1) sayfanın tek takvimi vardır, çalışma günü aktif iş merkezlerinin haftalarının birleşimidir, tezgâh kendi iş merkezinin haftasıyla değil bütün vardiyalarla çalışır sayılır; (2) plan kapasitesi eki (onaylı izin, planlı fazla mesai, atama payı) ve makine durumu (bakım, arıza) motora geçmez; (3) tezgâhın motor ayarı (verim, ücret) yalnız ilk okumada istasyondan alınır, sonra sayfadaki değer kalır. Kayıtta plan başlangıcı yoksa plan bugünden başlar (`tmiTabanKur`). Örnek veride Reçete ve Rota kaydının rotaları kendi örnek tezgâhlarına bağlıdır, İstasyonlar örneğinin makineleriyle eşleşmez. | Aşama 2: tezgâh takvimi iş merkezinden, kapasite eki ve makine durumu motora; örnek verilerin eşlenmesi. |
| Çerçeve geçişi | Reçete ve Rota bölümü ile planlama sayfası arasında geçişte bekleme (bekleme süresi + 1,5 sn) ve 2,3 MB sayfanın yeniden kurulması. | Tek çerçeve ya da sunucu motoru ile kalkar. |
| Kayıt boyutu | Planlama durumu ayrı anahtarda; büyük set ölçülmedi. 1 MB uyarısı yalıtılmış çerçevede görünür mü denenmedi (VARSAYIM: görünmez). | Ölçülür; aşarsa alan başına kayıt. |
| Tanıtım ve kılavuz anahtarları | Denemenin kılavuz tercihi önek dışı anahtarda (`pm-at-kilavuz-v1`): köprü onları yazmaz, sayfa yenilenince yeniden görünür. | Önekli anahtara alınır. |
| Kendi renkleri | `modul.stil`'de 30 onaltılık renk (`--is-*` iş renkleri dahil). | Ortak seri renkleri (CEKIRDEK-ISTEKLERI 4). |
| Satır içi stil | Reçete ve Rota'ya eklenen planlama alanlarında satır içi stil: `margin-top:8px` (2), `min-height:0` (2), prototipin kendi kalıbıyla. | Sınıfa çevrilir. |
| Gömülü kütüphaneler | KAPANDI (362 a, 20.10.2026): beş gömülü kütüphane çıkarıldı; tur, ipucu konumu, Gantt sürüklemesi ve sıralama kendi kodumuz (`parca/v-arac.betik`). | - |
| Uzantılar | `.betik`, `.stil` teslim izin listesinde yok. | CEKIRDEK-ISTEKLERI 2. |
| Fason firma adı | "Fason firma #FS-..." | musteri-tedarikci bağlantısı. |
| Planlama başlamış adım (391 a, madde 9) | Kalan sunucudan (`calisanAdimlar`), terminalin gerçek saatleriyle (sayım anından, yoksa başlamadan) yürür. Sayfanın "şimdi"si yalnız yeniden planlamada gerçek saate geçer (31 a); ondan önce plan öteki işleri eski şimdiden dizer, başlamış adım sonradaysa tezgâhtaki çakışma sapma uyarısıyla görünür. Sunucu artık başlamış demeyen adımın kaydı silinir; biten adımın gerçek bitişi okunmaz, iş plandaki yerine döner. Sapma rozeti (prototipte stüdyo üst çubuğunda) yok: uyarı gerçekleşen formunda ve bildirimde. Yenileme açılışta ve sayfaya dönülünce. Emirde değişen adım (opYer, rotasız emir) eşlenmez. | Sayfa saati gerçek saate geçerse ve stüdyo (madde 1-6) gelirse kapanır. |
| Planlamada adımın adedi (24 a, madde 10) | Bitmemiş adımın adedi uretim-emirleri `adimAdedi`'nden (önceki biten adımın hurdası düşülmüş; `planlanacakIsEmirleri`, durum `adimAdetleri`); motor süreyi bu adetle hesaplar. Malzeme ihtiyacı ve fason fiyatı sipariş adediyle kalır; çalışan adımın hurdası (bitmeden) sonraki adıma düşmez. Rotasız ve emirde değişen adım eşlenmez. | Aşama 2: plan modülü aynı adımı sunucuda yerleştirirken (ADR 0018) çerçeveyle aynı adedi kullanır; uretim-emirleri dilimi `adimAdedi` taşırsa ikinci okuma kalkar. |
| Planlama şimdisi (31 a) | "Şimdi" yalnız yeniden planlamada (Çöz, her kip) gerçek saate, çeyrek saate yuvarlanarak geçer (`S.simdi`, planla yazılır); açılışta ve çizimde değişmez. Planın başlangıç günü ötelenmez: kayıtlı plan, kilit, arıza ve gerçekleşen saatleri ona bağlı. Motor ufku başlangıçtan 63 gün; son 14 günde uyarı verilir, ufuk aşılırsa plan kurulamaz. Öneri ve onarım gibi öteki çözücüler şimdiyi ilerletmez. | Başlangıcı öteleyen (bütün saatleri kaydıran) ayrı iş ya da sunucu planına geçiş (Aşama 2). |
| Planlama fasoncuları (23 a) | Aktif fason firmalar fasoncu olur; süre firmanın rota adımlarındaki en büyük termin günü (yoksa 1), çıkış günleri takvimin çalışma günleri, aynı anda iş sınırı yok (999). Sayfada değişen ayar aynı kimlikte kalır, sonraki rota süresi değişikliği ona geçmez. Emirde fasona alınan adımın (opYer) süresi okunmaz. | Firma kapasitesi ve çıkış günü sahibinde tutulursa oradan; adım başına süre motor değişikliği ister. |
| İkinci menü | KAPANDI (20.10.2026): çekirdek yaması menüyü `ONERILEN_IKINCI_MENU` ile aynı yapar (`planlama-derle.test.ts` denetler). | - |
| KAPANDI (359 a): aynı adlı tezgâhlar ayrı kaynak kalır, teke indirilmez. Tekrar eden tezgâhlar | Deneme verisinde T1 ve T2 aynı adlı ("CNC torna Ø400"). Paket yalnız kanıt tohumunda bu veriyi taşır, uygulama sayfasında veri yok. | Kalır. |

### Bağlamada kapanacak: plan motoru sunucuda (ADR 0018)
- Kıyas yapıldı (plan `plan-kiyas.test.ts`, uydurma veri): vardiyalı senaryoda 8 işin 8'i iki motorda aynı (168 b ile motor vardiya molasını düşer). Kalan farklar:
  (1) vardiyası tanımsız tezgâhın işi çözücüde `vardiyasiz` listesinde döner; plan bu alanı okumaz, iş eksik sayılır ve komut 409 olur;
  (2) sunucu iş merkezi haftasını ve kişi vardiyasını okumaz (takvim eki null): çalışma günleri sayfanın tek takviminden; 159 b ile ayarcı sınırı sunucuda uygulanmaz, uyarı plana gelmez.
- Çözücü varsayımları: eski revizyonla açılmış ya da rotasız emrin farklı adımı yerleşmez; istekte geçmeyen adım "şimdi bitmiş" sayılır (625o'dan beri fason adım hariç: termin günü kadar sonra döner); motorda karşılığı olmayan
  sabit iş tezgâhı o aralıkta kapatır; açık çalışmanın deneme parçaları (kilit, olay, elle gerçekleşen) asıl plana girmez, kısıt gevşetmeleri girer.
- Nasıl uyumlanır: plan `vardiyasiz`ı okur (168 b plan yaması), sonra bağ `bag('plan motoru -> plan', ...)` kurulur ve plan testlerinin saat beklentileri güncellenir;
  takvim eki sunucuda okunur.
- Sunucu motoru HiGHS kullanmıyor; gerekirse `highs`'ın dependencies'e alınması sorulur.

### Bağlamada kapanacak: planlama değerlendirmesi (Soru 357 a)
- KAPANDI (458 a, kart #591): sunucunun `planCoz`, `motorYukle` ve teklif denemesi de sayfanın motor kancalarıyla (`kancalar.betik`) koşar.
- Çalışma kaydı (`:planlama`) sipariş geliri ve fiyatı taşır; `planlama-oku` taşıyan bu alanları çalışma ucundan okur. Değerlendirme ucunun
  döndürdüğü opak plan ve sipariş kayıtları da çalışmaya geri yazıldığı için tutardan arındırılmaz.
- Termin uzatma, bölme ve fiyat önerisinin uygulanması kaynak sahibinin alanını değiştirir (222 a ile çelişki); uygulama komutu bağlamada sahibinde.
- Sayfanın kartları henüz bu uca bağlı değil; yeni Planlama ekranı (motor tarayıcıda yok) bağlanınca eski tarayıcı yolu kalkar.
- KAPANDI (463 a, kart #614): değerlendirme iki adımlı; hesap uç transaction'ını beklemez, sınır 60 s. 60 emir / 180 adımlık uydurma veride plan
  seçenekleri 10 s sürdü (ölçüldü); gerçek boyutta ölçülmedi.

### Bağlamada kapanacak: bitiş tarihi akışı (455/2 a)
- Akış yalnız `yaz` ucundan kaydedilen planda düşer. Plan başka yoldan kaydedilirse (sunucu çözücüsü, P5) o yol da `bitisAkisiEkle`yi çağırmalı.
- Eski sayfanın `svKaydet`i (zx-sevkiyat) yeni ekran gelince kalkar; o zamana kadar ikisi aynı kuralla yazar.

### Bağlamada kapanacak: yeni Planlama ekranı "Veri ve kısıtlar" (577b)
- Sahiplik denetimi (575 a, "hepsi gelsin, sahiplerini kontrol ederiz sonra"): bugünkü sayfanın bütün iç görünümleri yeni ekrana aynen geldi. Kaynak alanlar
  (tezgâh, personel, vardiya, çalışma günü, tatil, ürün ve rota, malzeme, sipariş, fasoncu, devamsızlık, satın alma) 222 a ile sahibinden okunur, ekranda düzenleme
  düğmesi pasif kalır. Planlamaya özgü kalanlar çalışma komutuyla ve `plan.yaz` ile yazılır: kısıt açma ve parametreleri, `D.ayarlar`, ayar matrisi, arıza ve ek mesai,
  tedarikçi listesi, aparat listesi. Tedarikçi (musteri-tedarikci) ve aparat (istasyonlar ya da takım) sahibi başka modül olabilecek kavramlardır; planlamada ikinci kopya olarak tutulur.
- Nasıl uyumlanır: Aşama 2 sahiplik listesinde tedarikçi ve aparat için sahip sorulur; sahip belli olunca liste kaynak alana geçer, ekrandaki düzenleme pasifleşir.

### Bağlamada kapanacak: tezgâh takvimi ve otomatik arıza (650 a, 651 a; kart 625g)
- Sayfada duruş satırı yalnız silinip yeniden eklenerek değişir (bitiş saati yerinde düzenlenmez). Satırın nedeni ve oto işareti sayfanın tablolarında gösterilmez.

### Bilgi (borç değil): plan motoru sunucuda (ADR 0018)

- Çevirici sunucuda (DOĞRULANDI 23.10.2026: `plan-cozucusu.ts` `sunucuPlanCozucusu`, `motor/emirler.betik` `sunucuCozumGirdisi`, `disari.ts`ten verilir). Girdi planlama
  sayfasının çalışması, kayıt ve kaynak okumasıdır; çalışma kaydı yoksa çözücü 409 verir. Bağ `sunucu/kablolama.ts`'te yok: plan bugünkü `oner` yolundadır.
  Çalışan adımlar çerçeveye bağlandı (DOĞRULANDI: `servis.ts` `durum` cevabında `calisanAdimlar`, çerçevede `zz31-tmi.betik` `calisanUygula`).
