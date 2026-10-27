# Kural -> test (plan)

K: `sunucu/moduller/plan/kurallar.test.ts` (saf), U: `sunucu/moduller/plan/plan-*.test.ts` (gerçek PostgreSQL; ortak kurulum `plan-ortak.test.ts`), E: `istemci/src/moduller/rota/Rotalar.test.tsx`.

| Kural | Madde | Test | Kısıt |
|---|---|---|---|
| PL-01 | Bir makine ya da kişi aynı anda tek iş yapar; çakışan yerleşim reddedilir (409) | K PL-01; U P1, PL-01, PL-02; U P5 ret: çakışma | plan_yerlesimi_tek_kaynak, plan_yerlesimi_zaman (çakışma serviste, P-B5) |
| PL-02 | Bekleyen öncül bitince, akışlı devir kadar sonra, bağımsız hemen başlar. Akışlı devir öncülün devir adedini üretme süresidir (öncülün ayarı ve birim süresi), öncülün takviminde ve veriminde sayılır; akışlı ardıl öncülün bitişinden son devir partisini işleyecek kadar önce bitemez (bölünmüş işte bu bitiş sınırı yok); aykırı elle yerleşim uyarı alır | K PL-02 (üç test); U P1, PL-01, PL-02 | yok |
| P1 | Öner kilitsiz ve başlamamış işleri yerleştirir; sabitler yerinde; adaydan en erken bitiren seçilir; kaynaksız/süresiz iş yerleşmez | K P1; U P1; E P1 | yok |
| P3 | Yerleşimin makine ya da kişisi iş emrine yazılır | U P5 ret (izinli taşıma, iş emrinde makine) | yok |
| P4 | Senaryo canlıyı değiştirmez; canlı değişince canlıya alma onay ister; yetkisiz rol reddedilir | U P4; E P4 | plan_senaryosu_kapanis |
| PL-248 | 248 a: başlamasına 4 saatten az kalan planlı işin önüne iş konamaz; korunan iş canlıdaki yerinden okunur, planda ve aynı kaynakta kalır, önüne canlıda önünde olmayan iş girmez; saat tek başına ölçüt değildir (eskimiş canlı yeniden dizilebilir). Her taslak yazımı (yerleştir, taşı, kaldır, sırala, kuyruk yaz), motor önerisi ve canlıya alma denetlenir; ret 409, taslak değişmez. Yazım yalnız kendi getirdiği ihlalle reddedilir; canlıya alma bütün ihlallere bakar. Motor korunan işi sabit sayar. Arıza denemesi kural dışıdır (954 b), canlıya alınırken denetlenir. Panelde donuk bölge en az 4 sa | `dort-saat.test.ts` (saf ve gerçek PostgreSQL); istemci `motor/atolye/kurallar.test.ts`, `ic/veri/kurallar.test.ts` | yok |
| P5-a | Başlamış ya da bitmiş iş taşınmaz ve kaldırılmaz | U P5 ret: kilitli ve başlamış | yok |
| P5-b | Pasif makine ya da kişiye yerleştirilmez (422) | U P5 ret: pasif makine | yok |
| P5-c | Kilitli yerleşim taşınmaz ve kaldırılmaz; kilit plan.kilitle | U P5 ret: kilitli | yok |
| P5-d | Kapsam dışı istasyonun kaynağı yazılamaz (403) ve listede görünmez | U P5 ret: kapsam | yok |
| P5-e | Eski sürüm 409; yetkisiz rol 403 | U P5 ret: çakışma, eski sürüm, yetkisiz | yok |
| P5-u | Uyarı: teslim gecikmesi, sıraya aykırı başlama, rota dışı kaynak (kayıt geçer) | K P5 uyarı; U kapsam testi (teslim), U P5 (aday dışı) | yok |
| KY-01 | Kuyruk sırası aynı kaynakta arka arkaya dizilir; başka kaynağın işi reddedilir | U kuyruk sırası; E Kanban | yok |
| PL-03, PL-04 | Takvim: iş çalışma aralığında başlar, vardiya bitince ertesi vardiyada sürer; vardiyası tanımlanmamış kaynak sürekli çalışır ve uyarı alır, tatil ve kapalı gün yine düşülür | K PL-04 (iki test); U PL-03, PL-04, PL-09; U PL-04 vardiyasız | yok |
| PL-09 | Personel: iş merkezi başına günlük kişi-saat ihtiyacı (yük x operatör ihtiyacı) ve kapasitesi (çalışma x kişi); kısıt açıkken ihtiyacın kapasiteyi aştığı gün sayılır, kapalıyken 0; kişisi olmayan iş merkezinde veri yok | K PL-09; U PL-03, PL-04, PL-09; E Matris | yok |
| Kapalı gün | Stüdyonun kapalı gün denemesi canlıya alınınca vardiya takvimine kapalı gün yazılır; canlıya alan vardiya.yaz da taşımalı (403) | U P4, P6 stüdyo; U PL-03, PL-04, PL-09 | yok |
| PL-FSN | Fason adım plana iş olarak girmez ve atölye kapasitesi tüketmez; sonraki iç adım öncülün bitişinden (öncül yoksa şimdiden) hemen önündeki bitmemiş fason adımların termin günü toplamı kadar sonra başlar (gönderilmiş fasonda ilk gidişten geçen gün düşülür); bağımsız adım beklemez; emirde içeri ya da fasona alınan adım emrin seçimiyle sayılır | K PL-FSN; uretim-emirleri `uretim-yeri.test.ts` (plan beklemesi); recete-rota `FasonPlan.test.tsx` | yok |
| PL-05 | Ufukta çalışma zamanı bulamayan iş ve ardılı yerleşmez | K PL-05 | yok |
| PL-07 | Sıralama kuralı (öncelik, EDD, SPT, CR), yön ve tampon; ayar taslağa yazılır ve canlıya alınınca canlıya geçer; emir önceliği ve başlangıcı uretim-emirleri'nden; öncelik sınıfı yalnız emrin önceliğinden (1-2, 3, 4; 815); taslak emir ayarla girer | K PL-07 (iki test); K 815 (öncelik sınıfı); U dondurulmuş bölge ve ayar; U emir önceliği ve taslak emir; U 815 (motor sırası, çarpan uçları yok); E PL-07 motor paneli | plan_ayari |
| PL-11 | Darboğaz en dolu istasyondur; makine sayısı doluluğu böler. Doluluk çalışma dakikasıyla: vardiya dışı yük de kapasite de sayılmaz; kapasitesi olmayan sıralanmaz. Önizleme ve senaryo etkisinde kapasite yoksa doluluk null, tek yuvarlama | K PL-11, K PL-04 göstergeler, K Doluluk | yok |
| KY-03 | Elle sırası olan emir kural sırasından önce yerleşir | K KY-03; U kuyruk sırası (KY-03); E Kanban | yok |
| Dondurma | Şimdiden N gün içinde başlayan değişebilir işler donar; başlamış ve sonrakiler donmaz; tek tek ya da toptan çözülür | K Dondurma; U dondurulmuş bölge; E motor paneli | yok |
| Karşılaştır | Her kuralın son bitişi ve başlangıcı değişen emir sayısı | K Seçenekleri karşılaştır; E motor paneli | yok |
| P6 | Canlı plan yalnız taslaktan değişir; canlıda yapılan değişiklik kullanıcının taslağına alınır ve bildirilir | U P1, P6; U P4, P6 stüdyo; E P1, P6 | plan_senaryosu_kapanis |
| ST-01..ST-04 | Senaryo değişiklik defteri, tek değişikliği kaldırma, hızlı deneme canlıya alınmaz, canlı değişince onay | U P4, P6 stüdyo; E P4, P6 | yok |
| A7 | İkinci menü sayaçları (açık revizyon, geciken, açık senaryo, düşük stok); veri yoksa uydurulmaz | U A7 | yok |
| Plan sırasına dön | kuyruğun elle sıraları taslakta silinir, motor kuralına döner; elle sırası olmayan kuyruk 409 | U kuyruk sırası (KY-03); E Kanban: elle sıralı makine kuyruğu | yok |
| Önizleme | Emir önizlemesi yeni emri planla iki kez koşar, hiçbir şey yazmaz; bitiş, önerilen teslim (bitiş + tampon), etkilenen emirler, istasyon yükü, yeni uyarılar; yalnız yürürlükteki rota (422); emre kopyalama ya da plan yazma yetkisi | U emir önizlemesi; E UE-01, P-B21 | yok |
| Bölme ve hurda | Bölme yazıldıktan sonra önceki adım daha az sağlamla bitince parçaların süresi adım adedine oranla hesaplanır; yazılı adetler kalır | U elle bölme sonra hurda | yok |
| 35 b | Bölünen siparişte taban gecikme bedeli emrin satır adedindeki payıyla sayılır; ceza, kâr ve finansman tutar payıyla (225) | K 35 b; U 35 b (`plan-bedel.test.ts`) | yok |
| Verim | İşin süresi yerleştiği makinenin istasyon verimine bölünür (kişide %100); ayarı olmayan istasyon %100; elle yerleştirme ve taşıma hedef kaynağın verimiyle, elle girilen süre olduğu gibi | K Verim; U istasyonlar eki (#439) | yok |
| Makine durumu | Arızalı ya da bakımdaki makine plana iş almaz; var olan yerleşim "kullanımda değil" uyarısı taşır | U istasyonlar eki (#439) | yok |
| S3 | Kişi, rotadaki makinenin istasyonunda yetkin değilse uyarı (kayıt geçer); yetkinliği tanımlanmamış kişide uyarı yok | U istasyonlar eki (#439) | yok |
| PL-ONAY | Canlı plana tek kapı (hedef 23.10.2026): sahip açık taslağını onaya gönderir ve onaydakini çeker (plan.studyo); plan.canliya-al taşıyan onaydakini canlıya alır ya da nedenle geri gönderir; açık taslak canlıya alınmaz; onaydaki taslağa plan yazılmaz; dört göz açıkken (146) son gönderen onaylayamaz, kapalıyken onayı işaretlenir; geçişler yalnız eklenen kayıtta | K PL-ONAY; U PL-ONAY, PL-ONAY ret, 146 (`plan-onay.test.ts`) | plan_senaryosu_durum, plan_senaryosu_kapanis, plan_senaryo_onay_kaydi_neden, plan_senaryo_onay_kaydi_dort_goz, plan_senaryo_onay_kaydi_degismez |
| 147 a | Arkon kuyruk sırası taslağa düşer, onayla canlıya geçer; bekleyen sıra `bekleyenSiralar` ile okunur | U 147 a (`plan-onay.test.ts`); U A4 (`plan-canli.test.ts`) | yok |
| 148 a | Bedel ayarı ve sipariş elle çarpanı taslağa yazılır, taslağın planına girer, canlıya onayla geçer (bedel ayarla tek güncellemede, çarpan yazanıyla geçmişe); değişiklik kaldırılınca taslak canlınınkine döner | U 6a, 6b, 210 a (`plan-bedel.test.ts`); U 148 a (`plan-onay.test.ts`); U 7 (`plan-gecmisi.test.ts`) | plan_senaryo_bedel_ayari_*, plan_senaryo_siparis_carpani_aralik, plan_senaryo_siparis_carpani_gerekce |
| 168 b | Sunucu motoru kayıtlıyken vardiyası tanımsız tezgâhın işi hata değildir: kuyruk yaz onu yazmaz (taslaktaki eski yeri kalkar), plan cevabında yerleşmemiş kalır ("Tezgâhın vardiyası tanımsız."), takvimsiz uyarısı "işleri yerleşmedi" der; canlıya al onu geçirmez | U 168 b (`plan-motoru.test.ts`) | yok |
| TB-01 | Taban plan (33 a): canlıya almayla aynı işlemde adımın ilk canlı yeri yazılır, hiç değişmez; adım başına tek satır; eşzamanlı canlıya almada önce alınanın; yetkisiz ya da vazgeçilen taslak yazmaz | U 33-1..33-5 (`plan-taban.test.ts`) | plan_taban_is_emri_tek, plan_taban_tek_kaynak, plan_taban_sure, plan_taban_degismez, plan_taban_bosaltilmaz |

Bağı ertelenen kural: PL-06 (paralel bölme, P-B18); PL-09'un motoru erteletmesi (P-B19).

Test sayıları (T4, #415): K 12, U 10, E 5 (plan bölümleri).
