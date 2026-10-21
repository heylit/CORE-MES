# Kural ve test eşlemesi (bu turda yazılanlar)

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| Başlamamış emre sayım bekler, başlayınca yazılır | yansima.test.ts "başlamadan gelen sayım reddedilmez, bekler" | yansima.test.ts "başlamayan emre sayım yazılmaz: başlama kaydı gelmezse bekler" |
| Sıralama saf kuralı | kurallar.test.ts `yansimaSirasi` (öne alma) | aynı test: arada başka olay varsa öne alınmaz |
| Bakım planını yalnız bakım ve yönetici yazar | guvenlik.test.ts "periyodik bakım planını yalnız bakım ve yönetici yazar" (maint 200, amir lastAt 200) | aynı test: amir plan 403, belge değişmez |
| Yayın ve geri çekme yalnız planlama, hazırlık, yönetici | guvenlik.test.ts "paketi yayınlamak ve geri çekmek..." | aynı test: kalite 403 |
| Geri gönderilen ya da onaysız paket yayınlanmaz | guvenlik.test.ts "kalitenin geri gönderdiği paket..." (yeniden onaya gönderince 200) | aynı test: 403 |
| Sonuç sayımı yalnız operatör, amir, yönetici | guvenlik.test.ts "operatör sonucundaki sayım ve durumu..." | aynı test: hazırlık ve kalite 403 |
| AR-BI-1: biten işin (sonuç `state: 'done'`) sayım ve durumu yönetici dahil değişmez (kart #1194) | guvenlik.test.ts "AR-BI-1: ..." (bitmeden sayım değişir; bittikten sonra ölçüm ve not yazılır); istemci biten-is.test.ts (sayaç yalnız biten ve boş işte kapalı) | aynı test: operatör, amir, yönetici için sağlam ±1, hurda ±1, baseGood, durum 403. Mutasyon: `bitmisIsReddi` hep false dönünce test kırmızı (DOĞRULANDI, yerelde) |
| AR-BI-2: TMI'de biten emrin paketi okumada `tmi.bitti` taşır; terminal işi biten işlere alır, sayacı kapatır (kart #1194) | yansima.test.ts "AR-BI-2: ..." (liste ve tek okuma bitti, okunan sürümle yazım yazildi); istemci biten-is.test.ts (tmiBitti, bitenleriAyir) | aynı test: açık emrin paketi bayrak taşımaz |
| Hurda -1 TMI'ye düzeltme olarak yansır (kart #1194) | yansima.test.ts ilk test (hurda 2, sonra nedensiz -1: TMI hurda 1) | uretim-emirleri UE-HD-1 |
| #243 listesi `arkon.yansima-oku` ile | yansima.test.ts "TMI'ye yazılamayanlar listesi" (yönetici 200, süzgeç, sayfa) | aynı test: işlemsiz operatör 403; istemci TmiYansimalari.test.tsx |
| Kuyruk öğesi yalnız sahibinin oturumunda gider | istemci kuyruk.test.ts (aynı kişi, sahipsiz eski öğe) | aynı dosya: başka kişi gönderilmez |
| Sunucu reddi bildirilir | istemci baglanti.test.ts (400/403/413/429 yazımda ileti) | aynı dosya: GET, 401, 404, 409, günlük, oturum susar |
| Sözleşme: `uretim-emirleri/disari.ts` | uretim-emirleri-sozlesme.test.ts (7 test, her fonksiyon izinli) | aynı dosya: YETKI_YOK, kapsam dışı, CAKISMA, DOGRULAMA |
| #243 listesinde veri kapsamı, kişi ve iç hata yok | yansima.test.ts "listesinde veri kapsamı" (kendi iş merkezi görünür, kapsamsız kişi hepsini görür) | aynı test: kapsam dışı ve konumsuz kayıt yok, sayı süzülü, `kisi` ve `sonHata` yok |
| Bekleyen sayım olayları tıkamaz | yansima.test.ts "ertelenen sayım olayları biriktirmez" (başlamadan sonra sayımlar sırayla yazılır) | aynı test: planlı emre duraklatma reddedildi; "başlamayan emre sayım yazılmaz" |
| queued duraklatmadır | yansima.test.ts "kuyruğa alma (queued) duraklatmadır" (duraklar, istasyon yeni emri başlatır) | aynı test: kuyruğa almadan ikinci emir reddedilir; yetkisiz kişinin kuyruğa alması reddedildi |
| Dolu ölçüm yalnız kalite ve yöneticide | guvenlik.test.ts "numune isteğinde operatör ve amir boş ölçüm alanını doldurur" | aynı test: operatör, amir ve hazırlık değiştirme ve silmede 403 |
| Silmede sürüm zorunlu | guvenlik.test.ts "silmede sürüm zorunludur" (doğru sürüm 200); istemci baglanti.test.ts (taban gider) | aynı test: sürümsüz 400, eski sürüm 409 |
| Arızada açan çağrıyı açandır | guvenlik.test.ts "çağrıdan açılan arızada açan" | aynı test: çağrısız ve kaydı olmayan çağrıda yazan kişi |
| İletiler kapsamla süzülür | guvenlik.test.ts "iletiler kapsamla süzülür" (kendi iş merkezi, kod taşımayan ve silinmiş paket iletisi gelir; kapsamsız kişi hepsini alır) | aynı test: başka iş merkezinin çağrısı, numunesi, paketi, iş emri no'su ve tanımsız kod gelmez; kapsam dışına gönderim 403 |
| Gerçek PCD çizimi geçer | guvenlik.test.ts "gerçek flanş çizimi" (paket yazılır, aynen okunur) | aynı test: PCD çemberine `onload` 400 |
| Saklanmış güvensiz çizim okumada dönmez | guvenlik.test.ts "yazım denetiminden önce saklanmış güvensiz çizim" (temiz belge aynen); kurallar.test.ts "okumada güvensiz çizim ayıklanır" | aynı testler: hazır sonuç atılır, öteki svg boş, liste ve çakışma cevabı da süzülü, saklanan satır değişmez |
| Aynı sayım iki kez yazılmaz (yeniden deneme) | yansima.test.ts "aynı satır iki kez denendi, emirde tek sayım var" (yazdıktan sonra hata veren 5 deneme TMI'de iz bırakmaz; yeniden deneme yazar) | aynı test: ikinci yeniden deneme 409; "eşzamanlı iki istekte" biri 409, tek sayım |
| Yalnız `hatali` ve yalnız işlemle yeniden kuyruğa | yansima.test.ts "izni ve ret" (işlemli kişi alır); kurallar.test.ts `yenidenDenemeReddi`; istemci TmiYansimalari.test.tsx (düğme yalnız hatalı satırda) | aynı test: operatör ve hazırlık 403, reddedildi, bekliyor, eşlenemedi 409; istemci: işlemsiz kişide düğme yok |
| Durum kaydında sıra koruması | yansima.test.ts "sıra koruması" (sonrası yazılmamış duraklat yazılır) | aynı test: sonraki durdur yazılmışsa 409, emir durdu kalır |
| Yeniden denemede veri kapsamı | yansima.test.ts "veri kapsamı listedekiyle aynı" (kendi iş merkezi yazılır) | aynı test: başka iş merkezinin satırı 404, satır ve emir değişmez |
| Okuma uçları sayfa.arkon ister | arkon.test.ts "uç tanımı" (7 okuma ucu `biri: sayfa.arkon`); "her uç" rollü kişi 200 | aynı test: sayfası olmayan Arkon rollü kişi 7 okuma ucunda 403 |
| Kişi listesi yalnız kisiler.oku olana | arkon.test.ts "Arkon kişi listesi" (yönetici ve kisiler.oku eklenmiş operatör bütün listeyi alır) | aynı test: operatör yalnız kendini, rolsüz 403 |
| Kişi listesinde pasif ve girişsiz kişi yok (toplu rol okuması) | arkon.test.ts "pasif ve girişsiz" (aktif ve yeniden aktif yapılan kişi listede) | aynı test: pasife alınan ve girişsiz Arkon rollü kişi listede yok |
| Bekleyen yansıma istek olmadan yeniden denenir; her deneme satırda zaman ve sonuç bırakır | yansima.test.ts "arka plan işi: bekleyen satır yeni kayıt gelmeden yazılır", "emir kilidi" (kilit bırakılınca yazılır) | aynı testler: aralığı dolmamış satır ve kilidi tutulan emir denenmez |
| İz bırakmayan TMI yazımı olmaz | yansima.test.ts "iz bırakmayan yazım olmaz" (iz yazılınca komut kalır) | aynı test: iz yazılamazsa (kısıt sınıfı hata) TMI sayımı geri alınır |
| TMI içinde Arkon yalnız TMI'ye bağlanır (TD) | istemci baglanti.test.ts "başka sunucuya istek gitmez" (aynı kökenin dosyası, sanal adres) | aynı test: başka köken 403, gönderilmez; "adres ayarı her açılışta" |
| İş değiştirmede çalışan eski iş duraklatılır (TA1, T1) | istemci is-gecisi.test.ts "çalışan işten başka işe"; yansima.test.ts "iş değiştirme (TA1)" (paused sonra running, ikisi yazıldı) | is-gecisi.test.ts: çalışmayan, aynı ve boş iş duraklatılmaz; yansima.test.ts: duraklatmasız ikinci başlatma reddedilir |
| TMI'ye yazılamayanlar listesinde beklenen türler gizlenir, tür başına sayılır, silinmez (TA2) | yansima.test.ts "ayıklanır (TA2)" (görünür satırlar listede; gösterilince türüyle gelir); istemci TmiYansimalari.test.tsx "gizlenen türler sayısıyla" | aynı testler: gizli satır varsayılan listede yok, tabloda duruyor |
| Bitmiş emre yeniden gelen bitirme ret değildir (T2) | yansima.test.ts "bitmiş emre yeniden gelen bitirme (T2)" | aynı test: planlı emre bitirme "reddedildi", emir değişmez |
| STEP okuyucunun `unsafe-eval` izni yalnız çalışan cevabındadır (TBw) | istemci sun.test.ts "STEP okuyucu çalışanı (TBw)" (kendi zorlayıcı ilkesi); step-calisani.test.ts (istek ve sonuç eşleme) | aynı testler: okuyucu dosyası, başka kütüphane ve sayfa izni almaz; çalışan açılamazsa kurulum düşer |
| Adımı olmayan paket yayınlanamaz (T5) | guvenlik.test.ts "adımı olmayan paket yayınlanamaz (T5)" (adımlı yayınlanır, sürümü değişmeyen düzenleme geçer) | aynı test: taslaktan yayın, yönetici dahil, yeni paket ve adımsız yeni sürüm 400; paket değişmez |
| Örnek düğmesi yalnız verisi sayfada olan örnekte (TB2) | istemci ornekler.test.ts (verisi olan örnek ve yerleşik çizim) | aynı test: verisi olmayan örnek ve eksik ikili örnek yok |
| PDF betik çalıştırmadan açılır (CVE-2024-4367 önlemi) | istemci pdf-guvenlik.test.ts (`pdfOpen` pdfjs'e `isEvalSupported: false` verir) | aynı test: seçenek kalkınca ya da açılınca kırmızı (mutasyonla ölçüldü) |

Mutasyon: sayım ertelemesi satırı silinince 3 test, `alanYetkisiReddi` çağrısı silinince 4 test kırmızı (DOĞRULANDI, yerelde).

2. tur mutasyonları (DOĞRULANDI, yerelde): kapsam izinli koşulu silinince 1, bekleyen sayımda durunca 2, ters sırada yazınca 1, ret türü ayrımı kalkınca 1, dolu ölçüm denetimi kapanınca 1, sürümsüz silme kabul edilince 1, açan çözümü kalkınca 1 test kırmızı.

3. tur mutasyonları (DOĞRULANDI, yerelde): ileti okuma süzgeci kalkınca 1, gönderim denetimi kalkınca 1, kod taşımayan ileti de süzülünce 1, tek okumada çizim denetimi kalkınca 1, hazır sonuç atılmayıp yalnız svg boşalınca 2, ayıklanan gövde kullanılmayınca 1 test kırmızı.

3. tur N2 mutasyonları (DOĞRULANDI, yerelde): `hatali` koşulu (kural ve UPDATE) kalkınca 3, satır kilidi ve UPDATE koşulu kalkınca 1 (eşzamanlı), kapsam kalkınca 1, sıra koruması kalkınca 1, işleme kalkınca 5 test kırmızı; istemcide durum koşulu kalkınca 2, işlem koşulu kalkınca 1 test kırmızı.

3. tur N3 mutasyonları (DOĞRULANDI, yerelde): `kisiler.oku` denetimi kalkınca 1, bir okuma ucu `oturum`a dönünce 1 test kırmızı.

P1 mutasyonu (DOĞRULANDI, yerelde): `pdf.ts`'ten `isEvalSupported: false` silinince 1 test kırmızı.

#299 mutasyonları (DOĞRULANDI, yerelde): iş turu boş bırakılınca 3 test kırmızı; iz yazımı kayıt noktasına alınıp hatası yutulunca "iz bırakmayan yazım olmaz" testi kırmızı.

TD mutasyonları (DOĞRULANDI, yerelde): köken denetimi kalkınca 1, adresin yeniden yazımı kalkınca 1 test kırmızı.

TA1 mutasyonu (DOĞRULANDI, yerelde): `gecisteDuraklatilir` hep false dönünce 1 istemci testi kırmızı.

TA2 ve T2 mutasyonları (DOĞRULANDI, yerelde): gizlenenler hep gösterilince 1, bitmiş emir koşulu kalkınca 2 sunucu testi kırmızı.

TBw mutasyonları (DOĞRULANDI, yerelde): ilke koşulu bütün `.js` cevaplarına genişletilince 1, çalışan hatası yutulunca 1 istemci testi kırmızı.

TB2 ve T5 mutasyonları (DOĞRULANDI, yerelde): yayın reddi çağrısı kalkınca 1 sunucu testi kırmızı. Mevcut yayın testlerinin paketlerine bir adım eklendi (adımsız yayın artık reddedilir).

| Kural (bağımsız denetim, DN1) | İzinli test | Reddedilen test |
|---|---|---|
| B-005 depo okuması rol başınadır | guvenlik.test.ts "depo okuması rol başınadır" (tabloda olan rol 200) | aynı test: maint operatöre, gauges operatör ve bakıma, draws planlama, hazırlık ve yönetici dışına 403, gövde dönmez |

B-005 kırmızı (DOĞRULANDI, yerelde): düzeltmeden önce aynı test "actual 200, expected 403" ile düştü.
| B-006 ilk parça onayı olmadan ilk Başlat yok | guvenlik.test.ts "ilk parça kalite onayı olmadan ilk Başlat reddedilir" (kalite onayından sonra 200, yeniden başlatma 200), "ilk parça kapısı kapalı pakette..." (kapalı kural, montaj, tezgahta ölçüm, paketsiz kayıt); kurallar.test.ts "ilk parça ölçüleri", "ilk parça eksiği" | aynı testler: onaysız 403 ve kayıt yazılmaz, operatörün sonuç belgesine yazdığı ölçüm 403, operatörün onaylı istek yazması 403, son karar red ise eksik |

B-006 ilk parça mutasyonu (DOĞRULANDI, yerelde): kapı çağrısı kapatılınca 2 sunucu testi kırmızı.
| B-006 kritik ölçüde ikinci kontrol | guvenlik.test.ts "kritik ölçüde ikinci kontrol kuralı olan pakette..." (işaretle, kritiksiz istekte, kuralsız pakette ve redde 200); kurallar.test.ts "ikinci kontrol yalnız kurallı pakette" | aynı testler: işaretsiz onay 400 ve belge yazılmaz; işaret `true` değilse eksik |

B-006 ikinci kontrol: test düzeltmeden önce "actual 200, expected 400" ile düştü; denetim kapatılınca yine kırmızı (DOĞRULANDI, yerelde).

| Kural (CSP a) | İzinli test | Reddedilen test |
|---|---|---|
| CSP a: ana sayfa zorlayıcı kipte | istemci sun.test.ts "sayfa cevabı zorlayıcı başlığı taşır" | aynı dosya: yalnız-rapor başlığı yok; "STEP okuyucu çalışanı (TBw)": ana sayfa ve öteki kütüphane `unsafe-eval` almaz |

CSP a kırmızı (DOĞRULANDI, yerelde): test değişikliğinden sonra, kod değişmeden 2 istemci testi kırmızı.

| Kural (ikinci tarayıcı turu, AR2) | İzinli test | Reddedilen test |
|---|---|---|
| Y1 iptal edilen emrin paketi ve kaydı | yansima.test.ts "TMI'de iptal edilen emrin paketi..." (açık emrin paketi listede, olayı yazılır) | aynı test: iptal edilenin paketi listede ve tek okumada yok, yazım 403, olay ve sayım 403 ve kayıt yok; "uretim_emri okuması ... süre aşımına düşerse" (okunamazsa kayıt alınır) |
| Y2 iş değiştirmede çalışan iş duraklar, kaydı ezilmez | istemci is-gecisi.test.ts (etkin olmayan çalışan iş duraklatılır; farklı paketlerin kaydı birbirini iptal etmez) | aynı dosya: hedef iş ve çalışmayan iş duraklatılmaz; aynı pakette son kayıt kalır |

AR2 kırmızı (DOĞRULANDI, yerelde): Y1 testi düzeltmeden önce listede iptal paketiyle düştü; ret kapatılınca yine kırmızı. Y2 testleri yeni dosyalar yokken düştü; her düzeltme geri alınınca 1 istemci testi kırmızı.

| Kural (kod değerlendirme A3) | İzinli test | Reddedilen test |
|---|---|---|
| KD-003 açık emrin paketi için emir okunmaz, kapanmış emirlerin durumu tek sorguda; taslak yazımında açık emirler listelenmez | yansima.test.ts "KD-003" (açık paketler listede, iki kapanmış emir tek toplu sorguda, tek tek okuma yok, kendi taslağına yazım) | aynı test: başka iş merkezinin taslağına yazım 403 |
| KD-004 budanmış aralıkta `$reload` | guvenlik.test.ts "KD-004" (imlecin kendi satırı silinmişse iletiler gelir; yeni imleç döngü yapmaz); kurallar.test.ts "KD-004 kural" | aynı testler: imleçten sonraki satırlar silinmişse yalnız `$reload` |
| KD-005 süzgeçli kayıt okuması dizinli | yansima.test.ts "KD-005" (plan dizini kullanır) | aynı test: tür taraması yok |
| KD-006 geri alınan işlemenin nedeni görünür | yansima.test.ts "KD-006" (hata kalkınca arka plan turu yazar) | aynı test: deneme sayılmaz; erteleme işareti ezilmez |
| KD-007 istek yalnız kendi emrini işler | yansima.test.ts "KD-007" (kendi emri işlenir; arka plan turu başka emri işler) | aynı test: istek başka emrin hazır bekleyenini işlemez |
| KD-017 kayıt zamanıyla eski koddan kimlik | kayit-kimlik.test.ts "istasyon kodu TMI'de değişince" (önceki zamanlı eski kod çözülür, kırpma ve küçük harf) | aynı test: sonraki zamanlı eski kod boş; "kodsuz satır tesis okuması yapmaz" |

A3 kırmızı (DOĞRULANDI, yerelde): her düzeltme tek tek geri alınınca ilgili test kırmızı (KD-003 iki ayrı geri alma, KD-004, KD-005 göç dosyası kaldırılınca, KD-006, KD-007, KD-017).

## Menü rolleri (#357)

| Kural | İzinli | Reddedilen |
|---|---|---|
| Menü maddesi yalnız sayfayı açabilen Arkon rolünde görünür | kurallar.test.ts "ikinci menü" (her Arkon işlemi için görünen maddeler = matristeki page.* anahtarları) | aynı test: eski menüyle (`sayfa.arkon`) kırmızı |

## Vardiyalar TMI'den (A7, #517)

| Kural | İzinli | Reddedilen |
|---|---|---|
| A7-V1: kv/shifts Vardiya modülünün aktif vardiyalarından üretilir | kurallar.test.ts "A7-V1"; arkon.test.ts "A7-V1" (GET) | arkon.test.ts "A7-V1" ve "ayar yazımı" (yazma ve silme 403); kurallar.test.ts "TMI ayarı" (`tmiYonetir`) |

## Ölçü aletleri TMI'den (A7, #518)

| Kural | İzinli | Reddedilen |
|---|---|---|
| A7-K1: gauges Kalibrasyon modülünden üretilir | kurallar.test.ts "A7-K1"; arkon.test.ts "A7-K1" (liste ve tek belge) | arkon.test.ts "A7-K1" (yazma, silme 403; kayıtlı Arkon aleti gelmez); guvenlik.test.ts depo yazımı ve silmesi (her rol 403); kurallar.test.ts "depo yazımı" (`tmiYonetir`) |
| A5: Arkon'dan emir açılmaz; emir dışı yeni paket kaydedilmez (kart #541) | guvenlik.test.ts "A5: yeni yerel paket..." (var olan yerel paket 200, TMI taslağının ilk kaydı 200 ve "oluşturuldu"); kurallar.test.ts "A5 yerel paket" | aynı testler: yazan dört rolde 403 ve belge yok, kanonik olmayan `tmi-ue-0012` 403 |
| A5: köprü yalnız listedeki TMI sayfasını açar | istemci baglanti.test.ts "emir açma hedefi Rota > Üretim emirleri sayfasını açar" | aynı dosya: bilinmeyen hedef, `__proto__`, `toString` false; gezinme yoksa false |
| AR-SO-1: son olaylar yalnız Arkon ya da harita sayfasını görene, kişinin iş merkezi kapsamında (kart #1122) | kayit-kimlik.test.ts "son olaylar ucu" (Arkon ve harita 200, kişi adı) | aynı test: işlemsiz 403, kapsam dışı olay dönmez, sayi=201 400; arkon.test.ts "her uç" |
| 1148-1: operatör yalnız yetkili olduğu iş merkezinin işini görür ve açar | yansima.test.ts "veri kapsamı, Arkon katmanı" (kendi emri yazılır); uretim-emirleri-sozlesme.test.ts "kapsam" | aynı testler: başka iş merkezinin emrine 403, Arkon kaydı yok; guvenlik.test.ts "kayıt eklemede iş merkezi..." |
| 1148-2: makineli istasyonda seçilen makinede başlar, seçmezse atanmış makinede (yoksa istasyon yerinde) | yansima.test.ts "makine seçimi"; kurallar.test.ts "yansıma kararı: çalışmaya geçiş seçilen makineleri taşır"; makine-secimi.test.ts "kayıtta seçim..." | yansima.test.ts "makine seçimi" (bilinmeyen, başka istasyonun, biçimsiz seçim); kurallar.test.ts "makine seçimi: ... geçersiz" |
| 1148-3: dolu makinede ya da o makinede başlamış aynı işte başlatma hata verir, dolu cevap kimin hangi işi başlattığını söyler | yansima.test.ts "dolu makine" (makineDolu ayrıntısı) | aynı test: iş başlamaz, yansıma reddedildi; aynı iş için devralma önerisi yok |
| 1148-4: onaylanırsa öteki iş durur ve onun için başlar (makine-devral) | yansima.test.ts "makine devralma", "devralma reddedilmiş kaydı çözer"; istemci MakineDevralPenceresi.test.tsx (onay); baglanti.test.ts "terminal: makine dolu" | yansima.test.ts "makine devralma": eski kullanım 409, terminal.uret'siz 403, oturumsuz 401; Vazgeç işi başlatmaz (MakineDevralPenceresi.test.tsx); arkon.test.ts "her uç" |
| 1148-5: bir kişi birden çok makine başlatabilir | yansima.test.ts "makine seçimi" (iki makine tek kişide) | aynı test: aynı makinede ikinci iş dolu cevabı |
| 1148-6: insanlı istasyonda başkası çalışırken uyarı, kişinin kendi çalışması başlar; ikinci kişi yalnız uyarı alır | yansima.test.ts "insanlı istasyonda çalışan işe başlatma katılımdır"; kurallar.test.ts "katılım yolu" | aynı testler: ekip dışı reddedilir, aynı kişi ikinci çalışma açamaz, makinelide reddedilir |
| 1148-7: kişi yalnız kendi çalışmasını durdurur ve bitirir | yansima.test.ts "kişi yalnız kendi çalışmasını duraklatır ve bitirir" | aynı test: katılımsız kişi duraklatamaz/durduramaz/bitiremez, başkası çalışırken `stopped` reddedilir |
| 393-1: terminal seçicisi planın makinesini "plan" etiketiyle, başka emre önümüzdeki 4 saatte ayrılmış makineyi kilit, saat ve emir no ile gösterir; kilitli makine seçilemez. Ayrım uretim-emirleri başlatma denetimiyle aynı kuraldan gelir | makine-ayrimi.test.ts "planın makinesi döner..." (boş makinede başlatma 200), "ayrılmış makinenin kendi emri..."; istemci makine-secici.test.tsx, makine-secimi.test.ts "ayrılmış makine kilitlidir..." | makine-ayrimi.test.ts: kilitli makinede başlatma 409; aynı emrin adımı ve boş makine kilitli değil; makine-secici.test.tsx kilitli makineye dokunuş seçmez; makine-secimi.test.ts kilit seçimden ve kayıttan düşer |
| 393-2: ayrım okuması yalnız Arkon rolü ve terminal sayfası olana, yalnız kapsamındaki istasyonun emri için | makine-ayrimi.test.ts "reddedilen..." (kapsamındaki istasyon 200) | aynı test: rolsüz 403, sayfasız 403, oturumsuz 401, kapsam dışı 403, bozuk emir 400 |



## Üretim anomalisi (kart #1149)

| Kural | İzinli | Reddedilen / işaretleyen |
|---|---|---|
| AR-AN-1: eşik boyunca (net aktif dakika) giriş yoksa işaret | anomali.test.ts "AR-AN-1: giriş yok süresi eşiğe varınca işaret..." (eşik dahil); anomali-akis.test.ts "AR-AN-1: son girişten beri planlı net aktif süre..." (gerçek sayım ve plan) | aynı testler: eşiğin altı, planı olmayan kaynak, bilinmeyen süre ya da boş eşik işaret vermez; "öğle molası giriş yok süresine sayılmaz"; dünkü giriş bugünü kısaltmaz, plan henüz başlamadıysa işaret yok; "planlı pencereyle kesilen aralıklar birleşir" |
| AR-AN-2: gün içinde üretilen < plandaki adet ise işaret | anomali.test.ts "AR-AN-2: üretilen plandakinin altındaysa işaret..." (eşit ve üstü normal); anomali-akis.test.ts "AR-AN-2/3: o gün başlayan işin sağlam sayımı...", "istasyon ve makinenin üretileni günün net sayımıdır..." | aynı testler: eksik üretim işaretlenir; tolerans, boş tolerans; dünkü sayım istasyona ve makineye girmez; önceki gün başlamış işte makinenin üretileni açık kullanımından bulunur (#1182) |
| AR-AN-3: oran = toplam üretilen / toplam plan | anomali.test.ts "AR-AN-3: oran ...", "toplam oran yalnız ikisi de bilinen satırlarla kurulur"; anomali-akis.test.ts "AR-AN-3: toplam oran..." | aynı testler: plan sıfır ya da biri bilinmiyorsa oran null |
| Beklenen = net aktif süre kesişimi / birim süre x verim, iş emri adedini aşmaz | anomali.test.ts "beklenen adet: yerleşim ile şu ana kadarki net sürenin kesişimi..."; anomali-akis.test.ts "AR-AN-2/3/4: planlanan sürede hiç üretilmediyse..." (gerçek vardiya ve plan) | anomali.test.ts "birim süre bilinmiyorsa null"; anomali-akis.test.ts "birim süresi bilinmeyen iş emri...", "vardiyası olmayan kaynakta net süre yoktur" |
| AR-AN-4: makine ve kişi bazında üretebilirdi / üretti | anomali.test.ts "AR-AN-4: makine ya da kişi..."; anomali-akis.test.ts "AR-AN-4: çok makineli kişide beklenen..." (kişinin üretileni kendi girdiği günün sayımı: 70, sonra 90 ile normal) | aynı testler: eksik üretim "isaret", kırılımı olmayan "bilinmiyor"; başkasının ve dünkü girişi kişiye sayılmaz |
| AR-AN-4: çok makineli kişide beklenen makinelerinin beklenenleri toplamı (VARSAYIM) | anomali.test.ts "çok makineli kişide beklenen ..."; anomali-akis.test.ts aynı test (60 + 30 = 90) | aynı testler: bir parça bilinmiyorsa kişininki de null |
| İzinli kişi beklenene girmez | anomali-akis.test.ts "...izinli kişi beklenene girmez" (izin iptal edilince yeniden beklenir) | aynı test: izinli kişi beklenen 0 ve "izinli", tek kişili makine istasyon beklenenine girmez; anomali.test.ts "izinli kişi: makineye atananların hepsi izinliyse..." |
| Eşikler Ayarlar'dan, boş eşik kuralı kapatır, sınır dışı değer yazılmaz | anomali-akis.test.ts "eşikler Ayarlar'dan okunur" (varsayılan, değişen, boş) | aynı test: 0 dakika ve %101 400, hazırlık rolü ayar yazamaz 403 |
| `GET /arkon/anomaliler` `arkon.hazirlik`, `arkon.planlama` ya da `arkon.yonetici` ile | anomali-akis.test.ts "uç: yetkili 200..." (yönetici ve hazırlık 200, sözleşmeye uyar), "uç: sayfayı gören üç işlemden biri yeter" (üçü de 200) | aynı testler: Arkon operatörü, kalite, bakım ve yalnız `sayfa.arkon` olan 403, oturumsuz 401; arkon.test.ts "uç tanımı" ve "her uç" bu ucu bilerek dışarıda tutar |
| Veri kapsamı: iş merkezi kısıtlı kişi kapsam dışı istasyon, makine ve kişi satırlarını görmez | anomali-akis.test.ts "veri kapsamı: iş merkezi kısıtlı kişi..." (kapsamdaki satır gelir) | aynı test: kapsam dışı istasyon, makine ve kişi satırı yok, toplam kapsamdaki istasyonla tutar |
| Pano yalnız sayıyı gösterir, bilinmeyen tire | istemci anomali.test.ts "sayılar...", "istasyon işareti...", "işaretli istasyon önce gelir..." | aynı dosya: hüküm yoksa "hepsi normal" denmez (null), "kapalı kural" adıyla söylenir |
| Köprü `/anomaliler` yalnız GET'i TMI ucuna çevirir | istemci anomali.test.ts "köprü: Arkon /anomaliler isteği..." | aynı test: POST 404 |

## Üretim Hazırlık: canlı plan ayarı ve gönderim (kart #1257)

| Kural | Uygulayan test | Çürüten test |
|---|---|---|
| Ayar kapalıyken (varsayılan) plansız iş başlar ve TMI'ye yazılır | yansima.test.ts "canlı plan ayarı kapalıyken (varsayılan)..."; kurallar.test.ts "canlı plan ayarı (kart #1257)..." | yansima.test.ts "iş emri paketi: plan canlı değilse..." (ayar açıkken 400) |
| Ekran süzgeci ayarı plan durumundan okur; etiket bilgi olarak kalır | istemci tmi-plan.test.ts "ayar kapalıyken (kart #1257)..." | aynı test: `zorunlu: true` iken düşmez |
| Plan dışı gönderim nedeni ve "görünmez" notu | istemci tmi-plan.test.ts "gönderim uyarısı..." | aynı test: canlı ve eşleşen işte uyarı yok |
| İstasyonsuz TMI işi yayınlanamaz | kurallar.test.ts "istasyonsuz ve rotasız iş emri paketi..."; yansima.test.ts "rotasız emrin adımları..." (400) | aynı testler: taslak ve eski yerel paket serbest |
| Rotasız emrin adımı paket olur, plan durumu yoktur, ayar açıkken de başlar | yansima.test.ts "rotasız emrin adımları Hazırlık'ta paket olur..."; uretim-emirleri is-emri.test.ts "UE-RA-0..3" (`rotasizIsEmirleri`) | is-emri.test.ts aynı test: plan rotasız adımı almaz |

## Anomali gün kaydı ve dönem istatistiği (kart #1306)

| Kural | İzinli / geçen | Reddedilen / karşı örnek |
|---|---|---|
| AR-AN-5: dönem aralığı (hafta Pazartesi, ay takvim ayı) | anomali.test.ts "AR-AN-5: dönem aralığı..." | aynı test: Pazar önceki haftaya, yıl sınırı, artık yıl |
| AR-AN-6: performans = standart süre / çalışılan süre | anomali.test.ts "AR-AN-6..." | aynı test: çalışılan yok ya da sıfır: null |
| AR-AN-7: açık gün kapanış anından sonra kesinleşir, kesin gün değişmez | anomali.test.ts "AR-AN-7..."; anomali-akis.test.ts "gün kapanışı..." | aynı testler: gecikmeden önce kapanmaz; kesin güne satır yazma, günü değiştirme ve silme reddedilir; bugünkü gün açık kalır |
| AR-AN-8: dönem toplamı Σ üretilen / Σ beklenen | anomali.test.ts "AR-AN-8..."; anomali-akis.test.ts "istatistik: hafta toplamı..." | aynı testler: günlük oranların ortalaması alınmaz; kaydı olmayan gün null |
| AR-AN-9: beklenenin tavanı kalan adettir | anomali.test.ts "AR-AN-9..."; anomali-akis.test.ts "AR-AN-9..." | aynı testler: fazla üretimde kalan 0; kalanı bitiren istasyon eksik sayılmaz |
| AR-AN-10: plan dışı sayım orana girmez | anomali.test.ts "AR-AN-10..."; anomali-akis.test.ts "AR-AN-10..." | aynı testler: plan sayımı toplamı aşmaz; iş emri sayımı bilinmiyorsa plan dışı null; istatistikte kalır |
| AR-AN-11: mesai = vardiya net aralıkları, izinli gün hariç | anomali.test.ts "AR-AN-11..." | aynı test: takvimi bilinmeyen kişide null; bugün şimdiye kadar |
| AR-AN-12: emek verimi = standart süre / mesai | anomali.test.ts "AR-AN-12..."; anomali-akis.test.ts "AR-AN-12..." | aynı testler: mesai 0 ya da izinli gün: null; hazırlık kişi kırılımını görmez |
| Biten iş emrinin beklenen adedi kayıttan kalır | anomali.test.ts "gün kaydı..."; anomali-akis.test.ts "gün kaydı: plandan düşen..." | aynı test: kaydı yoksa düşer |
| Kişinin beklenen adedi makinedeki payıdır | anomali.test.ts "AR-AN-4: kişinin beklenen adedi..."; anomali-akis.test.ts "kişinin beklenen adedi makinedeki payıdır..." | aynı testler: iki makineye bakan tek kişi iki makinenin toplamı |
| Kişi kırılımı yalnız `arkon.anomali-kisi` ile | anomali-akis.test.ts "kişi kırılımı yalnız..." (yönetici ve işlemi verilen kişi görür) | aynı test: hazırlık bugünde ve istatistikte null; operatör 403, oturumsuz 401, bozuk dönem ve tarih 400 |

