# FARK: Arkon, Aşama 1 tur 1 (kart #199, #243)

Taban: main 4a70288. Arkon'un main'deki hali dışarıdaki prototipten oturtulmuştu. Bu tur onaylanan maddeleri yazar
(A2: hepsi, A3: dar kapanış). Ekrana dokunuş en az: yeni bir liste sayfası ve tek bir bildirim.

| Commit | Değişen | Kural |
|---|---|---|
| 3ba665e | `uretim-emirleri-sozlesme.test.ts` | Arkon'un çağırdığı her `uretim-emirleri/disari.ts` fonksiyonu için imza ve davranış testi |
| d6aea54 | `kurallar.ts` `yansimaSirasi`, `servis.ts` | Başlamamış emre gelen sayım reddedilmez, bekler; başlama kaydı öne alınır |
| 7e0401e | `kurallar.ts` `alanYetkisiReddi`, `servis.ts belgeYaz` | Depo başına yetkinin açık bıraktığı dört alan değişikliği 403 |
| 42baff9 | `guvenlik.test.ts` | Makine güncellemesine `surum: 1` (istasyonlar modülünün isteği) |
| d885089 | sözleşme, işlem, sayfa, uç, ekran | #243: TMI'ye yazılamayan Arkon kayıtları listesi, `arkon.yansima-oku` |
| 7e79913 | `arkon/web/src/data/kuyruk.ts`, `store.ts` | Çevrimdışı kuyruk öğesi yalnız onu yazan kişinin oturumunda gönderilir |
| 800024b | `baglanti.ts`, `ArkonCercevesi.tsx` | Sunucu Arkon yazımını reddedince kullanıcıya bildirim |

## Prototipten ayrılan yerler (dışarıdaki Arkon'la aynı davranmayanlar)
1. Planlı emre gelen sayım prototipte TMI'ye gitmiyordu; burada başlama kaydını bekler, sonra yazılır.
2. Amir periyodik bakım planı yazamaz (yalnız "yapıldı" işaretinde `lastAt`). Kalite paket yayınlayamaz ve geri
   çekemez. Hazırlık, planlama ve kalite operatör sonucundaki sayımı değiştiremez. Prototipte ekran izin verirse
   sunucu da veriyordu.
3. Kalitenin geri gönderdiği paket, yeniden onaya gönderilmeden yayınlanamaz. Onay kuralı açıkken onaysız paket de
   yayınlanamaz. Prototipte bu yalnız ekrandaydı.
4. Paylaşılan tablette çevrimdışı kuyruk başka kişinin oturumunda gönderilmez, bekler. Prototip oturumdakiyle gönderiyordu.
5. Sunucu reddi ekranda "Arkon: ... kaydedilmedi" bildirimi olarak görünür. Prototipte sessizdi.
6. "TMI'ye yazılamayanlar" sayfası prototipte yok; TMI kabuğunun Arkon ikinci menüsünde, Takip grubunda.

## A3 kod değerlendirme bulguları (kart #199; dal 199-arkon-a3)

| Commit | Değişen | Kural |
|---|---|---|
| 8088f2c | `servis.ts` `belgelerHam`, `konumGovdesi` | KD-003: açık emrin paketi için emir okunmaz; taslak pakete yazımda kapsam emrin istasyonundan |
| 8088f2c | `servis.ts iletiler`, `sorgular.ts iletiAraligi`, `kurallar.ts iletiKacirildi` | KD-004: budanmış aralıkta yoklama `$reload` döner |
| 8088f2c | göç `20261009170500_arkon_kayit_dizinleri.sql` | KD-005: paket ve emir süzgeçli kayıt okumaları dizinli |
| 8088f2c | `servis.ts korumaliIsle`, `sorgular.ts bekleyenlereNedenYaz` | KD-006: geri alınan işlemenin nedeni bekleyen satırda |
| 8088f2c | `servis.ts kayitEkle`, `bekleyenleriYinele` | KD-007: istek başka emirleri süpürmez; arka plan işi süpürür |
| 8088f2c | `servis.ts konumKimlikleriniCoz` | KD-017: kayıt kimliği kaydın zamanıyla `eskiKoddanKimlikCoz` |
| (bu dal) | `servis.ts belgelerHam` | KD-003 kalanı: kapanmış emirlerin durumu `emirDurumlari` ile tek sorguda |

Bu tur şunları varsaydı:
1. Kaçan iletide tam yeniden yükleme (`$reload`); depo başına yenileme değil.
2. Başka emrin bekleyeni en çok bir arka plan turu (15 sn) gecikir.
3. Farklı zamanlı kodlu satırlar ayrı çözülür (satır başına en çok iki sorgu).
4. Dizin göçü satır değiştirmediği için durmaz; yalnız sayar.

## 3. tur, TD (kart #199; dal 199-arkon-td)

- Köprü (`istemci/src/moduller/arkon/baglanti.ts bagla`): başka kökene fetch 403 ve gönderilmez; olay akışı açılmaz; `arkon:server` her açılışta sanal adres.
- Arkon ekranı (`arkon/web/src/app/giris-ayarlar-spc.ts`): Bağlantı kartı gömülüyken gizli, tek başına açılınca yalnız yöneticide. Yeni `gomulu.ts` (tek işlev). Başka ekran değişikliği yok.
- Testler: istemci `baglanti.test.ts` iki, `gomulu.test.ts` iki.

Bu iş şunları varsaydı:
1. Aynı kökene giden istek (Arkon dosyaları, TMI'nin kendi uçları) serbesttir; yalnız başka köken kesilir.
2. Üst pencereye erişilemiyorsa Arkon gömülü sayılır (kart gizli).
3. Tek başına açılan Arkon'da kart yalnız yöneticidedir (bugün de girişsiz cihaz yönetici sayılıyor: `admin = !me || ...`).

## 3. tur, TA1 ve T1 (kart #199; dal 199-arkon-ta1)

- Neden (tarayıcı denemesi): ekran iş değiştirirken çalışan eski iş için olay göndermiyordu; TMI aynı istasyonda ikinci başlatmayı reddediyordu. Sunucu testi önce eski işi kuyruğa aldığı için geçiyordu.
- Ekran (`arkon/web/src/app/operator.ts isGec`, yeni `arkon/web/src/data/is-gecisi.ts`): iş değiştirmenin dört girişi (QR ile açma, sıradaki iş, iki kuyruk seçimi) çalışan eski işi `paused`'a alır, olayını gönderir ve sonucunu saklar. Arkon'da da iki iş aynı anda çalışmaz (T1).
- Sunucu değişmedi (`paused` zaten duraklatmaya eşleniyor); `kurallar.ts` açıklaması güncellendi.
- UYUM-BORCU: yanlış kapanan sınır (d) düzeltildi; "KAPANDI ancak tarayıcıda ya da uçtan uca testte görüldükten sonra" kuralı başa yazıldı.
- Testler: istemci `is-gecisi.test.ts` iki; `yansima.test.ts` "iş değiştirme (TA1)".

Bu iş şunları varsaydı:
1. Eski işin duraklatma olayı yeni işin olaylarından önce gider (aynı dokunuşta önce çağrılır; yeni işin başlatması operatörün sonraki dokunuşlarıyla gelir). Kuyruk ya da ağ sırası ayrıca zorlanmadı.
2. Çalışmayan iş (kuyrukta, ayarda, duraklamış, durmuş, bitmiş) iş değiştirmede olduğu gibi kalır.
3. Duraklatılan işe dönen operatör "Devam" ile sürdürür (TMI'de devam).

## 3. tur, arka plan yineleyici (kart #299; dal 299-arkon-yineleyici)

- `isler.ts` (yeni): `arkon-yansima-yineleyici`, 15 sn; tur `bekleyenleriYinele` = kayıt isteğindeki süpürmenin aynısı (en eski 10 emir, kilidi tutulan emir atlanır). İstekteki süpürme kalır.
- Davranış değişmedi: sıra, aralık, geçici hata, "hatali" ve yetki kuralları aynı. Z4d gereği yetkisini kaybeden kişinin satırı "reddedildi: yetki" kalır.
- V3 koşulu: her deneme satırda `son_deneme` ve sonuçla iz bırakır; TMI komutu ve iz aynı işlemde, iz yazılamazsa komut geri alınır (test).
- Testler: `yansima.test.ts` dört yeni test. Şema, göç, paket ve ekran değişmedi.

Bu iş şunları varsaydı:
1. "Her yineleme iz bırakır" satır başına denemedir: denenmeyen satır (aralığı dolmamış, kilidi tutulan emir) iz bırakmaz; turun kendisi Sistem durumundaki iş tablosunda görünür.
2. İz yazımının kendisi veritabanı hatasıyla düşerse o tur hiçbir şey yazmaz (komut da geri alınır); satır sonraki turda yeniden denenir.

## 3. tur, AK (kart #199; dal 199-arkon-kisiler-toplu)

- `servis.ts kisiler`: kişi başına `kullaniciYukle` kalktı; roller `kisilerinIslemleri` (kisiler/disari.ts, #297) ile tek sorguda okunuyor. Sonuç aynı: pasif ve girişsiz kişi listede yok.
- İş merkezi kısıtı hâlâ kişi başına (`kisininIzinliIsMerkezleri`); istek BASKA-MODUL-ISTEKLERI madde 8.
- Test: `arkon.test.ts` "pasif ve girişsiz Arkon rollü kişi listede yok". Şema, göç, paket ve ekran değişmedi.

Bu iş şunu varsaydı: kişi sayısı az; iş merkezi okuması kişi başına kalsa da yük kabul edilebilir.

## 3. tur, P1 (kart #199; dal 199-arkon-p1)

Kod değişmedi. `isEvalSupported: false` testle sabitlendi (`istemci/src/moduller/arkon/pdf-guvenlik.test.ts`); UYUM-BORCU'ya P1, yükseltme önerisi, P4, Z4 ve DS6 satırları yazıldı.

Bu konu şunları varsaydı:
1. Arkon pdfjs'i görüntüleyici olmadan kullanır; `enableScripting` yolu derlemeye girmez (`arkon/vite.config.ts:12-13` yalnız `pdf.min.js` ve `pdf.worker.min.js` kopyalar).
2. Arkon PDF'i yalnız `pdfOpen` ile açar (`arkon/web/src` içinde tek `getDocument` çağrısı); test bu işlevin davranışını ölçer.

## 3. tur, N3 (kart #199; dal 199-arkon-n3)

| Commit | Değişen | Kural |
|---|---|---|
| c2c09a1 | `uclar.ts` | 7 okuma ucu `{ biri: ['sayfa.arkon'] }` ister; 6 yazma ucu #223'e dek `oturum` (bilerek karışık) |
| 733fd3c | `servis.ts kisiler` | Arkon kişi listesinin tamamı yalnız `kisiler.oku` olana; öteki yalnız kendi kaydı |

Şema, göç ve paket yok. Arkon ekranına dokunulmadı.

Prototipten ayrılan yerler (N3):
1. Prototipte kişi listesini herkes alırdı; burada yalnız kişi listesini okuyabilen alır.

Bu konu şunları varsaydı:
1. Arkon'un kendi giriş ve kişi değiştirme ekranı TMI içinde kullanılmıyor (tarayıcıda doğrulanacak).
2. Rol çözümü serviste kalır; uç tanımı yalnız "Arkon sayfasını açabilir mi"yi söyler.
3. `kisiler.oku` olup Arkon rolü olmayan kişi listeyi alamaz (403).

## 3. tur, TA2 ve T2 (kart #199; dal 199-arkon-ta2)

| Değişiklik | Yer | Neden |
|---|---|---|
| Gizli yansıma türleri ve tür işlevi | `kurallar.ts GIZLI_YANSIMA_TURLERI`, `gizliYansimaTuru` | Kullanıcı kararı TA2 a: liste müdürün işine yarayan satırlarla dolar |
| Liste sorgusu türü hesaplar, varsayılan gizler, tür başına sayar | `sorgular.ts GIZLI_TUR`, `gizliYansimaSayilari`; `servis.ts yansimaListesi` | Sayfa ve toplam gizlenenlerle tutarlı kalır |
| Sözleşme: `gizlenenler` sorgusu, satırda `gizliTur`, cevapta `gizlenenler` | `paylasilan/sozlesme/arkon.ts` | Ekran türleri tek tek sayısıyla gösterir |
| Ekran: "Gizlenenleri göster" ve tür sayıları | `istemci/src/moduller/arkon/TmiYansimalari.tsx`, `arkon.css` | TMI ekranı (Arkon ekranı değil) |
| Bitmiş emre bitirme "eslenemedi" | `servis.ts tmiKomutuYurut`, `kurallar.ts BITMIS_BITIR` | Kullanıcı kararı T2 a |
| Sıfır sayım nedeni ayrıldı | `kurallar.ts SIFIR_SAYIM` | Sıfır gizlenir, tam sayı olmayan fark görünür kalır |

Şema değişmedi, yeni göç ve paket yok.

Bu tur şunları varsaydı:
1. Bütün "bekliyor" satırları kendiliğinden çözülür (yazılır ya da 5 denemede "hatali" olup görünür olur); bu yüzden hepsi gizlenir.
2. "İş zaten çalışıyor" TMI'nin metniyle tanınır; metin değişirse satır görünür olur.
3. Tür sayıları durum süzgecine ve veri kapsamına uyar, gösterme seçiminden bağımsızdır.

## 3. tur, TBw (kart #199; dal 199-arkon-tbw)

| Değişiklik | Yer | Neden |
|---|---|---|
| STEP okuyucu çalışanı | `arkon/web/calisan/step-calisan.js` (derlemede `vendor/occt/step-calisan.js`'e kopyalanır, `arkon/vite.config.ts CALISANLAR`) | Kullanıcı kararı TBw a: `unsafe-eval` ana sayfaya girmez |
| Sarmalayıcı ve yükleyici | `arkon/web/src/data/step-calisani.ts`, `arkon/web/src/app/yukleyici.ts getOcct`, `model-3b.ts` (iki `await`), `index.html` ARKON_FILES `occtcalisan` | Dosya sürümünde okuyucu çalışanda; tek dosya sürümünde eski yol |
| Yol bazlı zorlayıcı ilke | `arkon/sun.ts CALISAN_ILKESI` | Yalnız çalışan cevabı |

Ekrana dokunan: Arkon ekran kodu (`yukleyici.ts`, `model-3b.ts`, `index.html`); görünüm değişmedi. Şema, göç ve paket yok.

Bu tur şunları varsaydı:
1. Çalışanın ilkesi zorlayıcıdır (yalnız-rapor değil); bugün ilkesiz koşan okuyucudan daha dar, STEP'i durdurmaz (yerel Chromium'da DOĞRULANDI).
2. Okuyucunun sonucu yapılandırılmış kopyayla taşınır; büyük modelde kopya süresi ölçülmedi.

## 3. tur, TB2, T3, T4, T5 (kart #199; dal 199-arkon-tb2)

| Değişiklik | Yer | Neden |
|---|---|---|
| Verisi olmayan örnek düğmesi gizli | `arkon/web/src/data/ornekler.ts`, `yukleyici.ts ornekVerisiVar`, `teknik-resim.ts`, `cizim-studyosu.ts`, `hazirlik.ts` | TB2 a: örnek dosya depoya girmez |
| Teknik resim kartı yalnız `page.draw` olana | `giris-ayarlar-spc.ts` | T3 a |
| "TMI'ye bildirildi" | `operator-parcalar.ts` | T4 a |
| Adımsız yayın reddi | `kurallar.ts yayinEksigi`, `servis.ts belgeYaz`, `hazirlik.ts` (eksik yumuşak değil) | T5 a |

Ekrana dokunan: Arkon ekran kodu (yukarıdaki dört dosya). Şema, göç ve paket yok.

Bu tur şunları varsaydı:
1. Yayında açılan yeni paket de yayın sayılır (adım ister).
2. Yeni sürüm `version` alanının değişmesidir (ekranın yayın düğmesi onu artırır).
3. T3 ve T4 için birim testi yok; ikinci tarayıcı turunda görülür.
4. TMI üretim emrinden gelen taslak paket de yayından önce en az bir adım ister (sunucu reddi 400).

## 3. tur, N2 (kart #243; dal 243-arkon-yeniden-dene)

| Commit | Değişen | Kural |
|---|---|---|
| 530180b | `paylasilan/islemler/arkon.ts`, `sozlesme/arkon.ts`, `uclar.ts`, `servis.ts yansimaYenidenDene`, `sorgular.ts yansimaKilitle`, `kurallar.ts yenidenDenemeReddi` | `hatali` yansıma ayrı işlemle yeniden kuyruğa alınır ve aynı istekte işlenir |
| 144d7fd | `istemci/src/moduller/arkon/TmiYansimalari.tsx` | Hatalı satırda "Yeniden dene" düğmesi, yalnız işlemi olana |

Aynı sayımın iki kez yazılmaması: TMI komutu yansıma sonucuyla aynı veritabanı işleminde, kayıt noktasında yürür; `hatali` olan denemelerin TMI yazımı geri alınmıştır.
Satır FOR UPDATE ile kilitlenir ve yalnız `hatali` iken alınır; eşzamanlı ikinci istek 409 alır. uretim-emirleri'nde değişiklik gerekmedi. Şema, göç ve paket yok. Arkon ekranına dokunulmadı.

Bu tur şunları varsaydı:
1. Yeniden kuyruğa alma aynı istekte bir kez dener; yine geçici olmayan hata olursa satır yeni 5 denemelik sayaçla bekler.
2. Sıra koruması yalnız durum kayıtlarına uygulanır; sayım toplamaya eklenir.
3. Komutu kayıt anındaki kişi yapar (güncel yetkisiyle); yeniden kuyruğa alan kişi yalnız uç denetiminde görünür.
4. Kapsam dışı satır 404 döner (var olduğu söylenmez).
5. Emir kilidi alınamazsa satır `bekliyor` kalır ve sonraki kayıt isteğinde işlenir.

## 3. tur, CSP adım 1 (kart #199; dal 199-arkon-csp)

| Commit | Değişen | Kural |
|---|---|---|
| da125e6 | `arkon/sun.ts icerikIlkesi`, `istemci/src/moduller/arkon/sun.test.ts` | Arkon sayfası yalnız-rapor CSP başlığıyla sunulur; satır içi betikler özetle |

Arkon derlemesi ve ekranı değişmedi; yeni paket yok. İlke: `default-src 'self'`; betik 'self', iki özet, 'wasm-unsafe-eval'; stil 'self' 'unsafe-inline';
resim 'self' blob: data:; yazı tipi 'self' data:; çalışan 'self' blob:; bağlantı 'self'; ortam 'self' blob:; çerçeve 'self'; nesne 'none'; base-uri 'self';
form-action 'none'; frame-ancestors 'self'. Rapor adresi yok (dış çağrı yok).

Bu adım şunları varsaydı:
1. PDF okuyucu çalışan dosyasını ana iş parçacığında yükler; ayrı çalışan açarsa konsol gösterir.
2. OCR ve 3B kütüphanelerinin eval kullanıp kullanmadığı bilinmiyor; kullanıyorsa konsol `unsafe-eval` ihlali gösterir.
3. Üretimde Arkon'u sunan katman belli değil (kart #175); başlık yalnız `arkon/sun.ts` yolunda.

## 2. tur (kart #199, #243; dal 199-arkon-2)

| Değişen | Kural |
|---|---|
| `sorgular.ts` `YANSIMA_SUZGECI`, `servis.ts yansimaListesi`, sözleşme `yansimaSatiri` | #243 listesi kayıt listesinin veri kapsamıyla süzülür; kişi ve iç hata özeti dönmez |
| `servis.ts emrinBekleyenleriniIsle`, `bekleyeniIsle` | Bekleyen sayım ardındaki olayları tıkamaz; başlama yazılınca bekleyen sayımlar kayıt sırasıyla yazılır |
| `kurallar.ts olayKomutu`, `servis.ts tmiKomutuYurut` | Arkon `queued` TMI'de duraklatmadır; çalışmayan emirde "değişiklik yok" |
| `kurallar.ts alanYetkisiReddi` | Numune isteğinde dolu ölçümü yalnız kalite ve yönetici değiştirir ya da siler |
| `servis.ts belgeSil`, `baglanti.ts`, `arkon/web/src/data/store.ts` | Silme son bilinen sürümle; sürümsüz 400, eski 409 |
| `servis.ts arizayiAcanaBagla`, `sorgular.ts cagriAcan` | Çağrıdan açılan arızada açan, çağrıyı açan kişidir |

Prototipten ayrılan yerler (2. tur):
1. Prototipte silme sürümsüz giderdi; burada başka cihazda değişen belge silinmez, tablet güncelini yeniden okur.
2. Prototipte `queued` TMI'ye gitmezdi; burada emir TMI'de duraklar.
3. "TMI'ye yazılamayanlar" listesinde kişi sütunu yok.

## 3. tur, N1 (kart #199; dal 199-arkon-3)

| Commit | Değişen | Kural |
|---|---|---|
| 5565c91 | `BASKA-MODUL-ISTEKLERI.md` | UE5: Arkon paketi iş emrine bağlanır; bugünkü `tmi-ue-<id>` bağı yeni model gelene dek kalır |
| 1a4db36 | `kurallar.ts iletiKonumu`, `servis.ts iletiler`, `iletiGonder` | İletiler kapsamla süzülür; kısıtlı kişi kapsam dışına ileti gönderemez |
| 6fad75c | `cizim-fiksturu.ts GERCEK_FLANS_SVG` | Arkon üretecinin PCD dalı fikstürde; aynen geçer |
| 98975f5 | `kurallar.ts guvensizCizimleriAyikla`, `servis.ts cizimDenetle` | Saklanmış güvensiz çizim okumada dönmez |

Şema değişmedi, yeni göç ve paket yok. Ekrana dokunulmadı.

Prototipten ayrılan yerler (3. tur):
1. Prototipte her ileti herkese giderdi; burada iş merkezi kısıtlı kişi yalnız kendi kapsamındakini alır.
2. Prototip güvensiz hazır sonucu olduğu gibi gösterirdi; burada atılır ve tablet modeli dosyadan yeniden üretir.

Bu tur şunları varsaydı:
1. Kod taşımayan ileti (ayar, günlük, belge değişti, kimliği dışında bilgi taşımayan ileti) herkese gider.
2. Bulunamayan paket başvurusu (silinmiş paket) süzmeye girmez; ileti yalnız kimlik taşır.
3. Kişinin kapsamı her ileti okumasında çözülür (tablet 2 saniyede bir okur).
4. Okumada atılan hazır sonuç tablette yeniden üretilir (koddan; tarayıcıda denenmedi).
5. Okumada temizlenen belge denetim kaydına ayrıca yazılmaz (okuma ucu yazmaz).

## Menü rolleri (#357 `veya`)
İkinci menü maddeleri `sayfa.arkon` yerine sayfayı açabilen Arkon rollerinin işlemleriyle görünür. Sunucu yetkisi ve rol satırları değişmedi.

## Eski derleme (3B açılmıyor)
Depo güncellenip `npm run derle:arkon` koşulmazsa `arkon/sun.ts`'in yeni zorlayıcı ilkesi eski Arkon derlemesine uygulanıyordu; STEP çalışanı öncesi derlemede okuyucu ana sayfada koşar ve ilke onu durdurur (tarayıcıda yeniden üretildi: `EvalError ... 'unsafe-eval'`, 3B boş). Geliştirme sunucusu artık Arkon sayfası istenince kaynağın derlemeden yeni olup olmadığına bakar; eskiyse önce `arkon/dist`'i yeniden derler. `derle:istemci` zaten önce `derle:arkon` koşar.

## Tekrar eden sayfalar temizliği (bagla/tekrar-temizlik-plani.md, varsayılanlar)
- Madde 13: Sunucuya bağlı Arkon'da Ayarlar > Üretim'deki Duruş nedenleri ve Hurda nedenleri bölümleri görünmez; nedenler TMI'nin Duruş ve Hurda Nedenleri sayfasındadır (sunucu bu yazımı zaten reddediyordu). Sunucusuz kipte bölüm kalır. Kurallar bölümü kalır. Tarayıcıda denendi.
- Madde 1: TMI emrinden türeyen taslak paket `partNo` metninin yanında `malzemeNo` taşır (iş emirli emirde ürünün malzeme kartı no, adımsız eski emirde null). Kayıtlı paket alanı istemciden geldiği gibi saklar; ekran bu alanı bugün göstermez.
- Madde 10: Malzeme isteğinin stoka gitmesi için stok `disari.ts` isteği yazıldı (BASKA-MODUL-ISTEKLERI madde 9); uç gelene kadar `logi` değişmedi.

Şema değişmedi, yeni göç ve paket yok.

Bu tur şunları varsaydı:
1. Bölüm gizlemenin ölçütü sunuculu kiptir (`AKStore.status().mode === 'server'`), rol değil.
2. Malzeme no alanının adı `malzemeNo`'dur (TMI kavramı; `material` hammadde metni olarak kalır).
3. Malzeme no açık emir satırından gelir (#468 ile `Emir.malzemeNo`; önce ayrı toplu okumaydı).

## Malzeme isteği stokta (temizlik planı madde 10, #469)
Sunuculu Arkon'da operatörün malzeme isteği malzeme kartı seçiciyle (`GET /arkon/malzemeler`, stoklanan aktif kartlar) ve sayı miktarla açılır. Sunucu `logi` belgesini yazarken aynı işlemde stokta istek açar (`stok/disari.ts malzemeIstegiAc`, kaynak `arkon:logi:<kimlik>`) ve belgeye `stokIstek: { id, no }` yazar. Stok reddederse (yetki: emri yürüten üretim işlemi `terminal.uret`, istasyon kapsamı, kart) Arkon belgesi de yazılmaz. Stoka bağlı istek Arkon'dan değişmez ve silinmez; durumu stoktan okunur (açık, hazırlanıyor, teslim -> tamam, iptal). Depo ekranındaki Hazırlanıyor/Gönderildi ve operatörün Aldım düğmeleri bu isteklerde yoktur. Serbest metinli eski istekler eski akışla kalır. Tarayıcıda denendi (istek stokta açıldı, durum değişikliği listede göründü).

Şema değişmedi, yeni göç ve paket yok.

Bu tur şunları varsaydı:
1. Stok "teslim" Arkon'da "tamam"dır; operatörün ayrıca teslim alması stokta yoktur.
2. Sunuculu kipte yeni malzeme isteği kartsız açılamaz (400); sunucusuz kipte serbest metin kalır.
3. Stoktaki durum değişikliği anlık iletilmez; Arkon listeyi yeniden okuyunca görünür.
4. İstek, paket TMI emrinden geliyorsa (`tmi-ue-<id>`) emre bağlanır; değilse emirsiz açılır.

Yetki uyumu (kurulum/yetki-matrisi.md): `logi.req` taşıyan Arkon rolleri operatör (`operator`), amir (`mudur`) ve yönetici; üçü de `terminal.uret` taşır, malzeme isteği yetkiden reddedilmez.

## Saat dilimi (P-B24, #470)
Planlı duruş günlük satırındaki saat aralığı UTC yerine tesis saatiyle (`paylasilan/zaman.ts tesisSaati`) yazılır.

## Kayıt kaybı ve istek kimliği (sistem denetimi S-06, kart #199)
Sunuculu Arkon belge yazma, silme ve üretim kaydını (`log`) göndermeden önce gönderim kuyruğuna (`outbox`) yazar, sunucu cevap verince siler (`arkon/web/src/data/store.ts gonder`). Bağlantı hatasında öğe kuyrukta kalır, ret alınca silinir. İstek sürerken sekme kapanırsa kayıt sonraki açılışta gönderilir; önceden yalnız bağlantı hatasından sonra kuyruğa yazılıyordu. Yoldaki öğeyi `flush` göndermez ve bekleyen sayısına katmaz. IndexedDB açılamayıp kuyruk bellekte tutulursa (`Status.memory`) ray durum noktası "Kayıt riski" gösterir, sunucu ayar kartında uyarı çıkar. Tarayıcıda denendi (askıda kalan istek kuyrukta kaldı, yeni sekmede gönderildi; IndexedDB kapalıyken uyarı göründü).

Emir açan dört test dosyası (`arkon`, `guvenlik`, `uretim-emirleri-sozlesme`, `yansima`) `POST /uretim-emirleri` isteğine `istek-kimligi` başlığı ekler ve uygulamayı `tekrar: tekrarDeposu` ile kurar; uç tekrar korumalı olunca testler değişmeden geçer.

Şema değişmedi, yeni göç ve paket yok.

Bu tur şunları varsaydı:
1. Kuyruk yazılamazsa istek yine gider; bağlantı hatasında kayıt yalnız cihaz aynasında kalır.
2. Cevap gelip kuyruk öğesi silinmeden sekme kapanırsa kayıt ikinci kez gider: üretim kaydı sunucuda cid ile tekilleşir, belge yeniden yazılır, silme ret alabilir.
3. S-20 (servis.ts emir okuma ve kilit denemesinde yutulan hata) bu turda yok: modül işleyicisine ve zamanlanmış işe günlük verilmiyor, çekirdek isteği gerekir.

## Yutulan hatalar günlükte (sistem denetimi S-20, kart #199)
Kayıt isteğinde TMI emrinin okunamaması (`tmiyeKuyrugaAl`) ve emir kilidinin denenememesi (`emirKilidiniDene`) davranışı değiştirmeden çekirdek günlüğüne (`IsleBaglami.gunluk`, zamanlanmış işte `calis(db, gunluk)`) hata olarak yazılır: satır yine bekliyor kalır, kilit yine alınamamış sayılır. Günlük uçtan (`kayitlar/:tur/ekle`, `yansima/:id/yeniden`) ve arka plan işinden servis fonksiyonlarına parametreyle iner.

Şema değişmedi, yeni göç ve paket yok.

## Yanlış istasyon koruması (kart #199; dal 199-arkon-istasyon-korumasi)
Rotalı (malzeme kartlı) emirde `tmi-ue-<emir>` paketi kaydedildiği istasyonda kalır, emir ise adım adım istasyon değiştirir; TMI komutu sıradaki iş emrine işlediği için eski istasyondaki paketin "başlat"ı sonraki adımı yanlış istasyonda başlatıyordu (bagla/adim1-etki-kontrolu.md, DOĞRULANDI).
- Yansıma (`servis.ts tmiKomutuYurut`, `kurallar.ts paketIstasyonuReddi`): kayıtlı paketin makinesi emrin şimdiki istasyon kodu değilse olay ve sayım TMI'ye işlenmez; sonuç `eslenemedi`, neden "Paket başka istasyonun; emir şu an <kod> istasyonunda." ve "TMI'ye yazılamayanlar"da görünür. Denetim ertelemeden önce yapılır: başka istasyonun sayımı bekletilip sonraki adıma yazılmaz.
- Yazım (`servis.ts belgeYaz`, `tmiMakinesiDegisti`): rotalı emrin paketinde makine ya kayıtlı makinesinde kalır ya da emrin şimdiki istasyonu olur; başka istasyon 400 (`machine`, "Bu paketin istasyonu TMI planından değişir."). Emir sonraki adıma geçince paket Hazırlık'tan şimdiki istasyona alınıp o adım Arkon'dan yürütülebilir.
- Arkon Planlama (`pano-planlama.ts moveTo`): kimliği `tmi-` ile başlayan pakette başka istasyona taşıma (sürükle ve "Taşı") kapalı, ileti "İstasyon TMI planından değişir"; aynı şeritte sıra değiştirme kalır.

Rotasız emir aynen çalışır (paketi taşınabilir, kaydı emre yazılır). Şema, göç, rota, plan ve uretim-emirleri değişmedi; emir `acikEmir` ve `emirOzeti` (disari) ile okunur.

Bu tur şunları varsaydı:
1. Kayıtlı paketi olmayan (taslak) emirde koruma uygulanmaz: taslak her zaman emrin şimdiki istasyonundadır ve operatör yalnız yayındaki paketi görür.
2. Yazımdaki makine kilidi yalnız rotalı emirde; rotasız emrin paketi sunucuda taşınabilir, Planlama ekranında ise bütün TMI paketlerinde taşıma kapalıdır. Hazırlık'taki istasyon seçimi açık kalır; şimdiki istasyon dışı seçim sunucu reddiyle (TMI bildirimi) döner.
3. Açık olmayan (bitmiş, iptal) emirde koruma yok; o emirlere komut zaten TMI kuralıyla sonuçlanır.

## İş emri başına paket (kart #199 adım 1; dal 199-arkon-is-emri-paketi)
Rotalı (malzeme kartlı) emirde Arkon paketi emir başına değil iş emri başınadır: bitmemiş, fason olmayan, kaynağı atanmış her iş emri için `tmi-ie-<iş emri id>` (`kurallar.ts isEmrindenTaslakPaket`, `servis.ts tmiTaslaklari`). Kapsam: bagla/adim1-is-emri-paketi.md, kullanıcı kararı "1 yaz, 2a, 3 kalsın".
- Alanlar TMI'den: emir no, parça, revizyon harfi (rota `revizyonGetir`), "Op <no> · <ad>", istasyon (makine kaynağının istasyonu; kişi kaynağında iş emrinin istasyonu), makine (`mc`), hedef adet, çevrim (birim süre x 60 sn), ayar süresi (`setup`, dk, yeni alan), termin (emir teslimi), öncelik (1 ise acil) ve `tmi { emirId, isEmriId, opNo }`. Süre yoksa `null`.
- TMI alanları (`TMI_PAKET_ALANLARI`) her okumada ve yazımda iş emrinden yazılır, istemciden alınmaz; Hazırlık'ın resim, plan, kural ve adımları kalır. Alanlar değişince okunan sürüm de değişir (`tmiBirlesikSurum`); o sürümle yazım ve silme kayıtlı sürüm sayılır (`tabanCoz`). İş emri kapanmışsa kayıtlı paketin TMI alanları korunur; açık iş emri ya da kaydı olmayan `tmi-ie` yazımı 400.
- Yayın 2a (kullanıcı kararı 1-b ile teyit): aynı malzeme kartı, aynı revizyon harfi ve operasyon numarasının en son yayınlanmış iş emri paketi yeni taslağa şablondur (resim, plan, kural, adım, numune, okuma ayarı, malzeme, not; `sablonPaket`); taslak yayında değildir, Hazırlık tek tıkla yayınlar. Şablon yoksa adımlar rotanın geçerli talimatından satır satır gelir (`gecerliTalimat`, geçici; UYUM-BORCU).
- Yansıma: `tmi-ie` paketinin olay ve sayımı yalnız iş emri emrin sıradaki iş emriyse (`uretimEmriOzeti.siradakiIsEmriId`) işlenir; değilse `eslenemedi` "Paket başka adımın…" (ertelemeden önce). Bitmiş adımın yeniden gelen bitirmesi `BITMIS_BITIR` (gizli tür). Kaydın emri iş emrinden çözülür (`isEmriOzeti`, istek başına iş emri başına bir okuma); bulunamayan iş emri "TMI iş emri bulunamadı".
- Geçiş: kayıtlı `tmi-ue` paketi olan açık rotalı emir kapanana dek eski biçimde (#501 koruması dahil) kalır, ona `tmi-ie` açılmaz. Rotalı emrin `tmi-ue` taslağı artık yok; kayıtsız `tmi-ue` paketinden rotalı emre gelen kayıt `eslenemedi` ("Rotalı emrin kaydı iş emri paketinden gelir").
- Kapsam: `tmi-ie` paketinin kayıt, ileti ve istek kapsamı paketin kimliğinden ve iş emrinin bugünkü yerinden (`isEmriYeri`) çözülür; emir numarasıyla bütün adımların iş merkezi istenmez (aynı emrin adımları farklı iş merkezlerinde olabilir). Plan iş emrini başka istasyona alınca kapsam yeni yere bakar.
- Paket yazımı ve silmesinde de açık iş emri paketinin konumu iş emrinin bugünkü yeridir. İş emri paketinin kaydındaki emir numarası iş emrininki değilse 400 (`isEmriNo`).
- Kayıt isteğinde iş emri okunamazsa Arkon kaydı yine yazılır, yansıma "TMI iş emri okunamadı" nedeniyle eşlenemez ve günlüğe yazılır.
- İptal: kayıtlı `tmi-ie` paketinin emri `tmi.emirId`'den okunur, iptal edilen emrin paketi düşer. Stok isteği `tmi-ie` paketinden açılırsa üretim emri iş emrinden çözülür.
- Hazırlık (`hazirlik.ts`): `tmi-ie` paketinde iş emri no, parça, revizyon, operasyon, istasyon, makine, adet, çevrim, ayar, termin ve öncelik kilitli (başlıkta "TMI planından gelir"); ayar süresi alanı bütün paketlerde. Planlama değişmedi (`tmi-` öneki taşımayı zaten kapatıyor).
- Testler: `arkon.test.ts` rotalı emrin emir başına taslağı testi "taslak yok" olarak değişti; #501 testleri geçiş paketini elle kurar. Yeni: `yansima.test.ts` altı uçtan uca, `kurallar.test.ts` dört birim testi.

Şema, göç, rol ve yetki değişmedi; uretim-emirleri, rota, istasyonlar yalnız `disari` ile okunur. Geri alma tek commit; geri alındıktan sonra `tmi-ie` paketleri bağsız kalır (kayıtları "Emir bağı yok").

Bu tur şunları varsaydı:
1. Makine kaynağının istasyonu makinenin bugünkü istasyonudur (aktif makine listesi); iş emrine yazılmış istasyondan farklıysa paket makinenin istasyonunda görünür. Pasif makinede ve kişi kaynağında iş emrinin istasyonu okunur (iş emri başına bir okuma).
2. Revizyon bulunamazsa harf boş kalır (uydurulmaz); boş revizyonla Hazırlık "bilgiler tam" demez.
3. Talimat metninin her dolu satırı zorunlu olmayan bir adımdır.
4. Şablon yalnız iş emri paketleri arasındadır (eski `tmi-ue` ve elle açılan paket şablon olmaz); "son yayınlanmış" `publishedAt` en büyük olandır, geri çekilmiş paket de sayılır.
5. Şablon için revizyon da aynı olmalı (denetçi önerisi a; revizyonu bilinmeyen emirde şablon yok). Ekrana giden tek okuma ve yazım bütün açık iş emirlerini okur; ilk parça ve istek denetimi kayıtlı satırla yetinir. Kayıtsız iş emri paketinin tek okuması da (bugünkü `tmi-ue` taslağının tek okuması gibi); yük artarsa uretim-emirleri'nden tek iş emri okuması istenir.
6. Paket kimliği taşımayan, yalnız rotalı emrin numarasını taşıyan kayıt (çağrı gibi) kapsamda o emrin kayıtlı bütün adım paketlerinin iş merkezini ister (bugünkü numara kuralı); operatör ekranı iş kaydında paket kimliğini gönderir.
7. Kısıtlı kişinin ileti süzgecinde iş emri paketinin yeri paket başına okunur (iş emri, makine, istasyon); ölçülmedi.

### Operatöre düşme: canlı plan (kart #199, A4; plan #509 sonrası)
Kullanıcı kararları "3-a" ve "1-evet, 2-a"; "plana almadan gitmemeli" (#512 geri alındı, "Plana al" ayrı adım kalır).
- Sunucu (`kurallar.ts planDurumlari`, `servis.ts isEmriTaslaklari`): iş emri paketine `tmi.plan { canli, sira, eslesiyor }` yazılır. Kaynak plan `disari` `canliSira`; bütün açık iş emirleri için tek okuma (tek paket okumasında da), sıra yerleştiği kaynaktaki başlangıç sırasıdır (1'den). `tmi` TMI alanıdır: her okumada yeniden yazılır, plan değişince okunan sürüm de değişir.
- Başlatma (`planBaslatmaReddi`): bekleyen iş emrinin `tmi-ie` paketinden gelen `running` olayı, canlı planda iş emrinin kaynağına yerleşmemişse 400 "Plan canlıya alınmadı…"; Arkon kaydı yazılmaz. Başlamış adımın devamı, öteki olaylar, sayım, rotasız (`tmi-ue`) ve Arkon paketi plana bakmaz. Plan yalnız başlatma olayı varken okunur.
- Operatör (`data/tmi-plan.ts operatoreAcik`, `istasyonPaketleri`, `operator.ts`): paket yayında ve (rotalı işte) canlı planda eşleşiyorsa düşer; düşmeyen paketin yayın bildirimi çalmaz. Pano istasyon kutusu aynı süzgeçle; altında düşmeyen işlerin özeti ("2 iş hazırlık bekliyor · 1 iş planlanmadı", `istasyonPlanOzeti`).
- Hazırlık: kuyrukta "Planlanmadı", "Plan başka kaynakta" ya da "Plan canlı · hazırlık bekliyor" etiketi ve "Plan sırası n"; yayın panelinde plansız işte "operatöre plan canlıya alınınca düşer". Planlama kartında aynı etiket.
- Testler: `yansima.test.ts` fikstür canlı yerleşimi kurar (`rotaliEmirKur` varsayılanı; `plansiz` ile kurmaz); yeni uçtan uca test plansız, başka makine, kişi kaynağı, canlı ve devam durumlarını ölçer. `kurallar.test.ts` iki birim testi, istemci `tmi-plan.test.ts`.

Bu tur şunları varsaydı:
1. "Makine eşleşiyor": canlı yerleşimin makinesi iş emrinin makinesidir (kod ve istasyon ondan gelir). Kişiye yerleşmiş işte istasyon eşleşmesi yeter: paketin istasyonu iş emrininkidir, kaynağı olan her iş emri eşleşir.
2. Taslak emrin paketi yoktur (`acikEmirler` planlı ve başlamış, `planlanacakIsEmirleri` taslaksız); rotasız taslak emir de operatöre düşmez.
3. Plan sırası yalnız açık TMI iş emirleri arasındadır (taslak emrin yerleşimi sayılmaz).
4. Geçiş paketi (rotalı emrin kayıtlı `tmi-ue` paketi) plana bakmaz; emir kapanınca kalkar.
5. Operatör kuyruğunun sırası bugünkü gibi Arkon Planlama sırasıdır; plan sırasının operatöre ve Planlama'ya gelmesi A4'ün sonraki adımıdır.
6. Plan başlatma denetiminde kilitsiz okunur; canlıdan çıkarmayla aynı anda gelen başlatma kabul edilebilir ve bekleyen yansıma sonradan planı yeniden denetlemez (denetçi, düşük).
7. Ret bütün kayıt isteğini 400 ile düşürür (emir numarası reddi gibi); aynı istekteki öteki satırlar da yazılmaz. Plan okunamazsa paket listesi ve başlatma isteği hata döner (güvenli taraf); iş emri okunamazsa ret atlanır, kayıt yazılır ve yansıma "okunamadı" ile eşlenmez.
8. Plan sırası `tmi` alanında olduğundan sıra değişince o kaynaktaki iş emri paketlerinin okunan sürümü değişir; Hazırlık'ta açık düzenlemede çakışma artabilir (ölçülmedi).

### Bitmiş iş emrinde plan etiketi (kart #199, #513 fark denetimi)
Kullanıcı kararı "yaz" (13:13). Liste `bagla/adim1-is-emri-paketi.md` "Düzeltme listesi".
- Sorun: plan canlıya alınmadan yayınlanan paket kayıtlı satırda `tmi.plan { canli:false }` taşır; iş emri bitince TMI alanları yeniden yazılmadığından Pano bitmiş iş için "1 iş planlanmadı", Hazırlık ve Planlama "Planlanmadı" gösteriyordu.
- Sunucu (`kurallar.ts plansizKaynak`, `servis.ts tmiIleBirlestir`, `belge`, `belgeYaz`, `belgeSil`): açık taslağı olmayan `tmi-ie` paketinin okumasında ve yazımında `tmi.plan` düşer; okunan sürüm değişir, yazım ve silme `tabanCoz` ile kayıtlı sürüme eşlenir. İstemcinin gönderdiği plan yazılmaz.
- İstemci (`data/tmi-plan.ts tmiPlani`): planı olmayan iş emri paketi rotasız gibi sayılır (etiket yok, Pano özetine girmez, yayındaysa operatöre düşer; plandan sonra yayınlanıp biten paketle aynı).
- Testler: `yansima.test.ts` önce yayın, sonra canlı plan, sonra bitiş; `kurallar.test.ts` ve `tmi-plan.test.ts` birim.

Bu tur şunları varsaydı:
1. Açık taslağı olmayan iş emri paketi bitmiş sayılır. İş emri açık kalıp plan dışına düşerse (kaynağı kaldırılırsa) paket de etiketsiz kalır ve operatöre düşer; sunucu başlatmayı yine canlı planla denetler.

### Önizleme TMI'ye bağlanır (kart #199)
Kullanıcı "1 YAZ" (13:24). Hazırlık'taki "Operatör gözüyle" ve "Önizle" Arkon'u Arkon'un içinde ikinci çerçevede açar; çerçeve TMI köprüsünü yalnız bir üst pencerede aradığı için bulamıyor, istekler 404 alıyor ve yayınlanan paket yerine örnek ekran açılıyordu.
- `arkon/web/index.html` köprü satırı ve `app/gomulu.ts gomuluMu`: köprü üst pencerelerde en üste kadar aranır; erişilemeyen üst pencerede sessiz kalır.
- Önizleme TMI'yi yalnız okur: köprü (`istemci/src/moduller/arkon/baglanti.ts bagla`) `#onizle:` çerçevesinde GET dışındaki her isteği 403 ile durdurur, TMI'ye göndermez (paket yazımı, silme, sayım, olay, ölçüm, ileti, dosya, plan sırası, giriş). Ekranın kendi kayıtları da önizlemede zaten kapalı (`app/operator.ts`).
- Önizlemede örnek iş emirleri (FLN-120 vb.) paketin altına eklenmez (`data/ornek-isler.ts ornekIslerAcik`): örnek liste yalnız tanıtım modunda, örnek istasyonda ve önizleme dışında.
- Testler: `gomulu.test.ts` iki kat çerçeve; `baglanti.test.ts` önizlemede okuma geçer, her yazma 403 ve TMI'ye istek gitmez, önizleme dışında yazma iletilir; `ornek-isler.test.ts`. `sun.test.ts` köprü satırı metni güncellendi (içerik ilkesi sınaması).
- Kapalı iş emri paketinin silinmesi de okunan sürümle karşılaştırılır; uçtan uca sınandı (eski kodda 409 eskiSurum, mutasyonla doğrulandı).

Bu tur şunları varsaydı:
1. Sayfadaki köprü satırı (`index.html`) `gomuluMu` ile aynı aramayı yapar; satırın kendisi testte çalıştırılmaz (test kaynak dosyasını metin olarak okumaz, kural h). Tarayıcıda denendi (koordinatör, DOĞRULANDI).
2. Açık olduğu halde Arkon taslağı çıkmayan iş emri (kaynağı yok, eski emir paketi kayıtlı ya da istasyonu bulunamadı) de plan durumu taşımaz ve istemcide etiketsiz görünür; başlatmayı sunucu yine canlı plana göre reddeder. Gerçekte oluşup oluşmadığı BİLMİYORUM.

### İş sırası plandan (kart #199, A4 Arkon kısmı)
Kullanıcı kararları "b" (sıra değişikliği taslağa gider, müdür canlıya alınca geçerli) ve "yaz" (13:10). Etki listesi `bagla/a4-sira-senkronu.md` "Arkon kısmı".
- Sunucu: `tmi.plan`'a yerleşimin kaynağı (`kaynak { tur, id }`) eklendi. Yeni komut `POST /arkon/plan-sira/sirala` (`planSirasiYaz`; sözleşme `planSiralaGovdesi`): ekranın gördüğü canlı sıra (`onceki`) ve yeni sıra (`yeni`) bir plan kaynağı için gelir. Görülen sıra canlıdakiyle aynı değilse 409 "Plan değişti", yeni sıra aynı işlerden değilse 400. Sonra plan `disari` `kuyruguSirala` kişinin plan taslağına yazar; plan kuralları (başlamış, kilitli, dondurulmuş, başka kaynak, kapsam, `plan.yaz`) planındır. Arkon rolünde `plan.edit` (`planSiralayabilirMi`) ister; uç `oturum`.
- İstemci (`data/tmi-plan.ts planOnce`, `siralamaIstegi`): Planlama şeridinde, operatör kuyruğunda ve Pano'da canlı planda yerleşmiş TMI işi plan sırasıyla önce gelir; öteki paketler ardından `seq` ve terminle. Planlama'da TMI işini yukarı, aşağı ya da sürükleyerek taşımak `seq` yazmaz; aynı kaynaktaki TMI işlerinin sırasını plana gönderir, "Taslağa yazıldı · canlıya alınınca geçerli" der. Plana yerleşmemiş iş sıralanamaz. Köprü `/api/plan-sira` → `/arkon/plan-sira/sirala` (`baglanti.ts`); `AKStore.Plan.sirala`.
- Testler: `yansima.test.ts` uçtan uca (taslakta yeni sıra, canlı değişmez, aynı taslak yeniden kullanılır; eski ekran 409, geçersiz 400, Arkon operatörü ve `plan.yaz`'sız planlamacı 403), `arkon.test.ts` uç tablosu, `kurallar.test.ts` birim, istemci `tmi-plan.test.ts` ve `baglanti.test.ts`.

Bu tur şunları varsaydı:
1. Şeritte ve operatör kuyruğunda TMI işleri önce, öteki paketler ardından.
2. Aynı istasyonda birden çok makine varsa sıra plan sırası, sonra kaynak kimliğiyle iç içe dizilir; plan kuyruğu kaynak başınadır.
3. Plan sürümü pakete yazılmaz; eski ekranı görülen sıranın canlıdakiyle karşılaştırılması yakalar.
4. Taslağa yazılan sıra Arkon'da gösterilmez, yalnız bildirim çıkar; Arkon canlı sırayı gösterir.
5. Sıralama yalnız sunucu bağlantısıyla (TMI'ye gömülü Arkon) çalışır; yerel modda hata iletisi döner.

Denetim sonrası (aynı kart):
- Yerinden oynamayan iş (`planSirasiTasinacaklar`): plan başlamış (emrin bir adımı başladıysa bütün adımları), bitmiş, kilitli ve dondurulmuş işi sıralamaz. Bu işler ekranın sırasında yerinde kalır, plana yalnız taşınabilenler gider; böylece makinede çalışan iş varken arkasındaki kuyruk sıralanır. Yerinden oynatılırsa 409 "yerinden oynatılamaz"; taşınabilenlerin sırası değişmediyse 400.
- Yukarı/aşağı (`adimIstegi`): iç içe dizilmiş şeritte TMI işi kendi kaynağındaki komşusuyla yer değiştirir. Eşit sırada makine ve aynı kimlikli kişi türle ayrılır (`planOnce`).
- Testler: kilitli iş yerinde kalınca öteki işler taslağa, yerinden oynatılırsa 409; `plan.yaz`'ı olan ama Arkon rolünde `plan.edit` taşımayan amir 403; taslak canlıya alınınca paket sırası değişir (plan ucu `canliya-al`).
6. Başlamış işin önüne geçirme reddedilir (plan başlamış işi taşımaz; araya sokma yerine arkasına sıralama).
7. ~~Canlı kuyruğa ekran açıldıktan sonra giren yeni iş "Plan değişti" ile yakalanmaz.~~ Kapandı (aşağıda).

Sınır düzeltmesi (kullanıcı, 14:44 "sınırları düzeltelim, kontrollü olsun"):
- Ekran açıkken canlıya alınan her değişiklik (kuyruğa giren yeni iş dahil) sıralamayı reddettirir. Planlama yüklenirken canlı plan sürümünü okur (`GET /arkon/plan-sira/surum`, `planSiraSurumu`, okuma yetkisi `sayfa.arkon`); sıralama isteği bu sürümü taşır (`planSiralaGovdesi.planSurumu`), canlıdakiyle aynı değilse 409 "Plan değişti". Ekran açılışta, sürüm okunamadığında ve ret gelince önce sürümü, sonra paketleri okur (`data/tmi-plan.ts siralamayiGonder`, `pano-planlama.ts yenile`): sürüm paketlerden eski kalabilir (ret çıkar, ekran yenilenir), yeni kalamaz.
- Testler: ekranın sürümü okunduktan sonra plan sürümü artınca 409, taslak açılmaz (mutasyonla doğrulandı); köprüde `GET /plan-sira`; uç tablosu; istemcide `siralamayiGonder` (sürümle gider, sürüm yoksa gönderilmez, 409'da yenilenir).
8. Başka makinedeki canlıya alma da ekranın sürümünü eskitir; bu durumda kullanıcı bir kez yeniden dener (ekran kendisi yeniden okur).
9. Açılışta Arkon'un kendi paket okuması (`useDocs`) sürümden önce başlar; ekranın ardından yaptığı ikinci okuma onu geçersiz kılar. İlk okumanın cevabı ikinciden sonra gelirse ekran bir an eski kuyrukla yeni sürümü taşıyabilir (VARSAYIM: çok dar; ekranda denenmedi).

## Arkon'dan emir açılmaz (A5, kart #541)
Kullanıcı kararları (2026-10-11): 15:13 "Arkon'dan emir açılmayacak", 4a (var olan yerel paketler kalır, yenisi açılmaz); 15:18 1a ("Yeni paket" TMI'de "Emir aç"a götürür), 2a (Excel içe aktarma kaldırılır, TMI'ye taşınmaz); 15:46 "yaz". Liste `bagla/a5-arkon-emir-acma-etki.md`.
- Sunucu (`kurallar.ts yerelPaketReddi`, `servis.ts belgeYaz`): kimliği kanonik `tmi-ue-<emir>` ya da `tmi-ie-<iş emri>` olmayan yeni `pkgs` belgesi 403 (`ILETILER.yerelPaket`). Var olan yerel paket okunur, yazılır, silinir.
- Hazırlık "Yeni paket" (`app/hazirlik.ts create`): yerel paket kurmaz; köprü (`istemci/src/moduller/arkon/baglanti.ts` `__tmiGit`, `TMI_HEDEFLERI`) TMI'de Rota > Üretim emirleri sayfasını (`/rota/emirler`) açar. Köprü yoksa ileti gösterir. Emir açılınca paketi Hazırlık'ta kendiliğinden taslak görünür (bugünkü `tmiTaslaklari`).
- Hazırlık paket dosyası (`importPkg`): yeni paket açmaz; seçili TMI paketine yalnız şablon alanlarını uygular (`data/yeni-paket.ts sablonUygula`, sunucunun `SABLON_ALANLARI` ile aynı liste).
- Planlama "İş emri içe aktar" (Excel/CSV, `ImportOv`, `IMP_COLS`, `parseTable`) kaldırıldı.
- Testler: `guvenlik.test.ts` "A5: yeni yerel paket..." (yazan dört rolde 403, var olan yerel paket 200, TMI taslağı ilk kaydı ve "oluşturuldu" günlüğü); `kurallar.test.ts`; istemci `baglanti.test.ts`, `yeni-paket.test.ts`. Kural kapatılınca A5 testi düşüyor (mutasyonla doğrulandı).
- Eski güvenlik testleri yerel paketi API'den kuruyordu: yardımcı `istek` ilk yazımda aynı yerde boş taslak satırı önceden kurar (`yerelPaketKur`); yazım reddedilirse satır geri alınır. İki günlük testi "oluşturuldu" yerine bu durumu bekler; oluşturma satırı TMI taslağında sınanır.

Bu tur şunları varsaydı:
1. "Yeni paket"in götürdüğü yer Rota > Üretim emirleri sayfasıdır (`/rota/emirler`, "Yeni emir" yürürlükteki rotayı emre kopyalar). Ana menüdeki Üretim Emirleri "Emir aç" eski serbest form olduğu için hedef değil (demo bulgusu). Geri alması ucuz (tek satır, `TMI_HEDEFLERI`).
2. "Yeni paket" yetkisi Arkon'daki `pkg.edit` olarak kaldı; emri açabilmek TMI'de `uretim-emirleri.yaz` ister (müdür, planlama), öteki roller sayfada "Emir aç"ı görmez.
3. Yeni pakete otomatik uygulanan varsayılan kurallar (`defaultRulesFor`) TMI taslağında uygulanmıyor; şablon paketten gelir. Gerekirse ayrı iş.
4. Klasör eşitlemesi (`Folder.scan`) ile gelen yerel paket de sunucuda reddedilir; ekran sunucu reddini bildirir.
5. Ekranlar tarayıcıda 360/768/1280 genişlikte denenmedi.

## Vardiyalar TMI'den (A7, kart #517; kullanıcı kararları 1-a, 4-a)

- `kv/shifts` artık TMI ayarıdır (`TMI_AYARLARI`): sunucu belgeyi Vardiya modülünün aktif vardiyalarından üretir (A7-V1, `arkonVardiyalari`), yazma ve silme 403 `tmiYonetir`. Aktif vardiya yoksa belge yoktur; Arkon kendi varsayılan vardiyalarıyla açılır.
- Planlama ve amirin vardiya yazma yetkisi kalktı; `adm.shifts` matriste kalır ve yalnız salt okunur listeyi açar. Değişiklik günlüğündeki "vardiyalar değişti" satırı artık üretilmez.
- Ekran: sunucuya bağlı Arkon'da Ayarlar > Çalışma düzeni salt okunur liste ve "TMI'de Vardiya sayfasından değiştirilir" notu gösterir; sunucusuz kipte düzenleyici aynen kalır.
- Arkon'da girilmiş vardiyalar göç `20261011132800_vardiya_arkon_kopyasi.sql` ile Vardiya modülüne bir kez kopyalanır; Arkon belgesi silinmez.

Bu tur şunları varsaydı:
1. Pasif vardiya Arkon'a gitmez.
2. Kopyada aynı adlı vardiya varsa Vardiya modülündeki kalır; biçimi bozuk vardiya ve mola atlanır.
3. Kopyalanan vardiyalar aktif gelir ve iş merkezi matrisine konmaz (matris Vardiya sayfasında kurulur).

## Ölçü aletleri TMI'den (A7, kart #518; kullanıcı kararları 1-a, 4-a)

- `gauges` deposu artık Kalibrasyon modülünden üretilir (A7-K1, `arkonAletleri`): kimlik `tmi-alet-<id>`, son 40 kalibrasyon kaydı, tarih tesis günü öğlesi. Arkon'da kayıtlı `gauges` satırları okunmaz.
- Yazma ve silme her rolde 403 (`aletTmide`: "Ölçü aletleri ve kalibrasyon TMI'de Kalibrasyon sayfasında yönetilir."). `gauge.edit` matriste kalır ve yalnız listeyi açar. Arkon'un alet günlüğü, alet kişi damgası ve alet biçim denetimi yazım yolu kapandığı için kaldırıldı.
- Ekran: sunucuya bağlı Arkon'da Kalite > Ölçü aletleri salt okunur, "TMI'de Kalibrasyon sayfasından girilir" notuyla; sunucusuz kipte aynen kalır. Ölçümdeki "kalibrasyonu geçmiş" uyarısı (`gaugeWarn`) artık TMI aletlerine bakar.
- Arkon'da girilmiş aletler ve geçmişi göç `20261011134500_kalibrasyon_arkon_kopyasi.sql` ile bir kez kopyalanır; Arkon belgesi silinmez.

Bu tur şunları varsaydı:
1. Kopyada aynı numaralı alet varsa Kalibrasyon'daki kalır ve Arkon geçmişi alınmaz.
2. Bulunmayan tür adı yeni tür olarak eklenir; kaydı yapan kişi adla tek eşleşmezse belgeyi son yazan kişi alınır.
3. Arkon'da elle girilmiş son kalibrasyon tarihi için o gün uygun kayıt yoksa bir uygun kayıt açılır (vade kaybolmasın).
4. Kalite rolü aleti TMI Kalibrasyon sayfasından yazar (`kalibrasyon.yaz` kalite rolünde zaten var, göç 20261008082300).

## Üretim Terminali (kart #199, yol haritası C; kullanıcı kararı "yaz a")

- Ana menüde Üretim grubunda "Üretim Terminali" (`/uretim-terminali`, işlem `sayfa.uretim-terminali`): Arkon'un operatör ekranı, Arkon MES menüsünden geçmeden. Tek maddelik çerçeveli ikinci menüyle açılır: içerik boşluksuz, tam ekran düğmesi var.
- Terminalde adres hep `/uretim-terminali` kalır; Arkon içinde başka sayfaya geçilse de çerçeve yeniden kurulmaz, yarım iş kaybolmaz (`ArkonCercevesi tmiAdresi`). Arkon MES'te adres eskisi gibi `/arkon/<sayfa>` izler.
- Görenler: operatör ve yönetici (kullanıcı kararı "a"). Operatöre işlemi veren göç ve girişte terminale düşme (rol açılış sayfası) Çekirdek'tedir (kart #568), bu PR'dan sonra birleşir; bayraklı yönetici kayıtlı her işlemi aldığı için maddeyi göçten önce de görür (`kisiler/kurallar.ts`).
- "Arkon MES" maddesi öteki roller için yerinde kalır.

## Rol panosu kartları (kart #489)
Kullanıcı "yaz" (15:33). Tablo `ortak-arayuz/rol-panolari.md`; kalıp stok #499.
- Sunucu: `GET /arkon/ozet` (`servis.ts arkonOzeti`, sayfa.arkon ve Arkon rolü). Sayılar Arkon listesiyle aynı okumadan (iş emri taslakları ve kişinin kapsamı dahil) `kurallar.ts` süzgeçleriyle: Hazırlık'ta `status` draft ya da review olan paket (hazirlik.ts `PSTAT`), Kalite'de `status` waiting ya da measuring olan numune isteği (kalite.ts `open`), Bakım'da kapanmamış arıza (bakim-raporlar.ts `open`). Sayı, kartın işlemi (arkon.hazirlik, arkon.kalite, arkon.bakim) ve depoyu okuyan rol yoksa null.
- İstemci (`ana-sayfa.tsx`): üç kart tek istek; bakım "Bana düşen işler", hazırlık ve kalite "Özet"; kart ilgili Arkon sayfasına gider.
- Testler: `arkon.test.ts` uçtan uca sayım ve null (bakım süzgeci mutasyonla doğrulandı), `sayfa.arkon` olup Arkon rolü olmayana 403, uç tablosu; `guvenlik.test.ts` kısıtlı bakımcı yalnız kendi iş merkezinin arızasını sayar (kapsamsız okumayla kırılır); `ana-sayfa.test.tsx`.

Bu tur şunları varsaydı:
1. Kalite kartı yalnız numune isteklerini sayar; paket onayı bekleyenler (`apPending`) ayrı kavramdır, sayılmaz.
2. Hazırlık sayısı yayınlanmış ama güncellemesi bekleyen (`dirty`) paketi saymaz.
3. Kartlar yalnız kendi işlemiyle görünür (Arkon yöneticisi ya da planlama görmez); menüdeki geniş görünürlük kullanılmadı.
4. Sayım bütün listeyi okuyup bellekte süzer; atölye ölçeğinde liste küçüktür.

## Çalışan işin önüne iş alma (kart #199, 3b; kullanıcı kararı 17:08)

- Arkon Planlama sırasında başlamış iş artık sabit değildir: dondurulmamışsa önüne iş alınabilir ve sıra plan taslağına gider. Sabit kalanlar kilitli, dondurulmuş ve plan dışında kalan (bitmiş) işlerdir (`servis.ts planSirasiYaz`).
- Ret iletisi: "Kilitli ya da dondurulmuş iş yerinden oynatılamaz; öteki işleri onun önüne ya da arkasına taşıyın."
- Operatör ekranı: canlı plan çalışan işin önüne iş koyduysa kuyrukta o işte "Öne alındı" etiketi çıkar ve bir kez "Sıradaki iş öne alındı" uyarısı gösterilir (`data/is-gecisi.ts yeniOneAlinan`). Operatör öndeki işe geçince var olan geçiş kuralı çalışan işi duraklatır.
- Başlamış emrin bekleyen adımı için yazılan adım kuralı (demo 2.16, #574) bu bölümle kapsanır ve kaldırıldı: başlamış adım, çalışan ya da bekleyen, sabit değildir.
- Plan payına bağlıdır: plan sıralaması başlamış işi kabul etmezse istek plandan 409 döner; plan düzeltmesi (#562, #565) önce birleşir. Göç yok, yeni işlem yok.

Bu tur şunları varsaydı:
1. Geçiş otomatik değildir; operatör öndeki işe kendisi geçer (geri alma maliyeti düşük).
2. Öne alınmış sayılan iş, sıra değişince çalışan işin üstüne geçen kuyruktaki iştir; operatörün alttaki işi elle seçmesi ve ekranın ilk açılışı uyarı doğurmaz. Uyarı o iş çalışanın üstünde kuyrukta durdukça sürer.

## Planlı duruşun aktifliği korunur (B1 A2, kart #544)
Kullanıcı "yaz" (16:09). Liste `bagla/b-dagitim-1.md` A2.
- Sorun: Arkon'dan yazılan planlı duruş gövdesi `active` taşımadığında (Bakım'daki "planlı duruş ekle", eski form) çevirici kaydı aktif yazıyordu; Vardiya'da pasif yapılmış duruş Arkon'dan güncellenince yeniden devreye giriyordu.
- Sunucu (`kurallar.ts belgedenDurusa`, `servis.ts durusBelgesiYaz`): `active` yoksa kaydın aktifliği kalır, yeni kayıt aktif açılır; `active` açıkça gelirse o yazılır. Kayıt kilitten önce okunur; araya giren yazım kaydın sürümünü değiştirdiğinden yazım çakışma alır.
- Testler: `kurallar.test.ts` birim; `guvenlik.test.ts` Vardiya'da pasif açılan duruş Arkon'dan `active`'siz güncellenince pasif kalır, `active: true` ile etkinleşir (eski kuralla iki test de kırılır, mutasyonla doğrulandı).

Bu tur şunları varsaydı:
1. Mevcut kayıt bütün duruş listesinden bulunur (Vardiya `disari`'da tek kayıt okuması yok); atölye ölçeğinde liste küçüktür.

## Demo bulguları (kart #544, B1)
Demo denemesi (`demo/demo-deneme-listesi.md` 2.11, 2.16) ve koordinatör notu (17:03, 17:06).
- Operatör ekranının istasyonu: cihazda seçilmiş istasyon yoksa ekran listedeki ilk istasyonla açılıyordu. Arkon kişisi artık TMI'deki en yüksek yüzdeli aktif istasyon atamasını taşır (`servis.ts ben`, `kisiler`; istasyonlar `istasyonKisileri`; sözleşme `arkonKisiSemasi.istasyon`). Ekran kayıtlı seçim, yoksa bu istasyon, o da yoksa ilk istasyonla açılır (`data/istasyon-sec.ts`); kişinin istasyonuyla açıldıysa istasyon cihaza yazılır ve sorulmaz (`ilkAcilis`; üretim kaydı, olay ve sayım cihaz istasyonu ister, yazılmasa kayıt düşerdi).
- Boş istasyonda örnek çizim: TMI'ye bağlı Arkon'da iş yokken ya da işin dokümanı yokken prototipin FLN-120 çizimi çizilmez, "İş yok" / "Doküman yok" görünür, örnek ölçü balonları da gelmez (`data/ornekler.ts ornekCizimGorunur`, `teknik-resim.ts`).
- Hazırlık "Hedef makine" istasyon kodu yerine adını gösterir; kod üzerine gelince görünür.
- Windows'ta PDF ve 3B yüklemesi ("Kütüphane bulunamadı: occtwasm"): git `autocrlf` sayfayı CRLF ile çıkarır; tarayıcı satır içi betiğin özetini LF'ye çevrilmiş metinden alır, sunucu CRLF'den alıyordu. Özet tutmayınca `ARKON_FILES` ve TMI köprüsü engelleniyor, kütüphane yolları bulunamıyordu. Özet artık LF'ye çevrilmiş metinden hesaplanır (`arkon/sun.ts icerikIlkesi`).
- Sıra değiştirmede başlamış emrin bekleyen adımı: neden plan modülünde (emir başladıysa her adımı `basladi`); Arkon'da değişiklik yok, plan düzeltmesiyle kalkar.

Bu tur şunları varsaydı:
1. Kişi birden çok istasyona atanmışsa en yüksek yüzdeli olan seçilir (istasyonlar modülünün kendi seçimi; testle).
3. Hazırlık'taki ad satırı ve çizimin ekranda çizilmemesi tarayıcıda denenmedi; testler saf kuralları ölçer (denetim bulgusu, ertelendi).
2. TMI'siz tanıtım kipinde iş yokken örnek çizim kalır.

## Başlamış emrin bekleyen adımı sıralanır (demo 2.16, kart #544)

- Arkon Planlama sırasında sabit küme plandaki kuralla aynıdır (plan #562 `adimDurumuyla`): "başladı" gelen iş emri adımı yalnız kendisi çalışıyorsa sabittir; aynı emrin bekleyen adımı sıralanır ve önüne başka iş alınabilir (`servis.ts planSirasiYaz`, `isEmriOzeti`). Önceden emrin bir adımı çalışınca bütün adımları sabit sayılıp 409 dönüyordu.
- Göç yok, yeni işlem yok. Çalışan adımın önüne iş alma kart #199 3b'dedir (#569).

## Plan Kuyruğu, Üretim Terminali Hazırlık ve ana menüdeki Kuyruk (kart #199)

- Ad değişti: Planlama "Plan Kuyruğu", Hazırlık "Üretim Terminali Hazırlık" oldu (TMI ikinci menüsü `paylasilan/sayfalar/arkon.ts`, Arkon `baslat.ts NAV`, sayfa başlıkları, bağlantı başlıkları, Ayarlar'daki ekran yetkisi etiketi). Adresler (`/arkon/planlama`, `/arkon/hazirlik`) ve yetki anahtarları aynı kaldı.
- Üretim Terminali Hazırlık listesi "Üretim emri | İstasyon" seçeneğiyle gruplanır (varsayılan üretim emri, seçim cihazda kalır: `arkon:prepGrup`). Emir grubunda paketler operasyon sırasıyla dizilir; her pakette emir no, parça, operasyon, istasyon ve adet yazar (`data/paket-grup.ts`).
- Ana menüdeki Kuyruk (`/kuyruk`, `sayfa.kuyruk`) artık yer tutucu değil: Arkon'un `#kuyruk` sayfası (`KuyrukApp`) Plan Kuyruğu'nun iş emirleri panosunu salt okunur açar; sürükleme, sıra okları ve istasyona taşıma görünmez, planlı duruşlar sekmesi yoktur. Çerçeveli tek maddelik ikinci menüyle açılır (`KUYRUK_IKINCI_MENU`); Arkon başka sayfaya geçse de adres `/kuyruk`ta kalır.
- Göç yok, yeni işlem yok.

Bu tur şunları varsaydı:
1. Gruplama seçimi kişiye değil cihaza bağlıdır (ortak tablette son seçim kalır).
2. Kuyruk sayfası salt okunurluğu ekrandadır; sunucudaki yazma yetkisi değişmedi (sıra yazımı zaten `plan.edit` ister).
3. Kuyruk sayfasının ana menü adı "Kuyruk" kaldı (sayfa tanımı çekirdeğin `paylasilan/sayfalar/kuyruk.ts` dosyasındadır).
4. Salt okunur pano ve gruplama tarayıcıda denenmedi; testler gruplama kuralını ve çerçeve adresini ölçer.

## Arkon ayarları Sistem Ayarları'nda (kart #199, madde 8)

- Arkon MES > Ayarlar ekranı Sistem Ayarları'nda da "Arkon MES" başlığıyla açılır (`ayar-ekranlari.tsx`, çekirdek #591 altyapısı). Aynı Arkon ayarlar sayfasıdır, kayıt tek yerdedir; Arkon MES > Ayarlar yerinde kalır.
- Görünürlük Arkon MES > Ayarlar maddesiyle aynıdır (`sayfa.arkon`). Çerçeve sayfanın içinde sabit yükseklikle durur, Arkon'da sayfa değişse de Sistem Ayarları adresi değişmez.
- Göç yok, yeni işlem yok.

Bu tur şunları varsaydı:
1. Bölüm sırası 50 (öteki modüller sırayı kendi dosyasında verir).
2. Gömülü çerçeve tarayıcıda denenmedi; test çerçevenin ayarlar sayfasıyla açıldığını ve adresin yerinde kaldığını ölçer.

## Arkon MES girişi Pano'dan, OEE "<1%" (kart #199, demo provası)

- TMI menüsünden Arkon MES (`/arkon`) Pano'yu görebilen rolde (Pano menü maddesinin işlemleri: yönetici, amir, planlama, hazırlık, kalite, bakım) Pano'yu, ötekinde operatör ekranını açar (`arkonGirisSayfasi`). Yönlendirme yoktur: adres `/arkon` kalır, çerçeve yeniden kurulmaz; Arkon'da sayfa değişince adres `/arkon/<sayfa>` olur. Operatör ekranının adresi `/arkon/operator` oldu (ikinci menüdeki Operatör maddesi de). Operatör rolü Üretim Terminali'nde kalır.
- Pano'da OEE: hesap değişmedi (K x P x Q; K = çalışma süresi / vardiyanın geçen planlı süresi). Vardiyanın küçük bir kısmında çalışıp parça yapan makinede oran yarım yüzdenin altına düşünce "0%" yazılıyordu; artık "<1%" yazılır (`data/yuzde.ts`, bütün Arkon yüzdeleri).
- Göç yok, yeni işlem yok.

Bu tur şunları varsaydı:
1. Demodaki AK-T1 "OEE 0%, İyi 5" hesap hatası değil yuvarlamadır (VARSAYIM: demo verisi okunmadı; P ve Q yoksa OEE "—" yazar, "0%" ancak K x P x Q < %0,5 iken çıkar).

## Hazırlık bekleyen iş kartı "Bana düşen işler"de (kart #199)

- Ana sayfadaki "Hazırlık bekleyen iş" kartı Özet'ten "Bana düşen işler" bölümüne taşındı (`ana-sayfa.tsx`, sıra 310): hazırlıkçının yapacağı iştir. Görünürlük aynı (`arkon.hazirlik`). Göç yok, yeni işlem yok.

## Arkon çerçevesi ortak temayı izler (kart #199)

- TMI'nin tema düğmesi açık Arkon çerçevesini de değiştirir; önce Arkon temayı yalnız açılışta bir kez okuyordu. Çerçeve ortak temayı (`useTema`, kabukla tek depo) izler; tema değişince `temayiUygula` Arkon'un `arkon:theme` anahtarını yazar, çerçevedeki belgenin `data-theme`'ini değiştirir ve `arkon-tema` olayını yollar. Arkon'un `useTheme`'i (`arkon/web/src/app/baslat.ts`) bu olayla temayı yeniden okur. Çerçeve yeniden kurulmaz, yarım iş kaybolmaz.
- Göç yok, yeni yetki yok.

## Operatör Arkon MES'ten Üretim Terminali'ne girer (kart #199)

- TMI menüsünden Arkon MES'i (`/arkon`) açan ve Arkon rolü operatör olan kişi (`arkon.operator`, Pano'yu göremez, `sayfa.uretim-terminali` var) Üretim Terminali'ne (`/uretim-terminali`) yönlenir (`operatorTerminaleGirer`). Pano'yu görebilen roller Pano'da kalır; Üretim Terminali sayfası olmayan kişi önceki gibi Arkon'un operatör ekranını açar. `/arkon/operator` adresi değişmedi.
- Göç yok, yeni işlem yok; rol ve işlem satırlarına dokunulmadı.

## Üretim Terminali hep operatör ekranını açar (kart #199)

- Hata: Arkon MES'in rol giriş sayfası (Pano) Üretim Terminali'ne de uygulanıyordu; Pano'yu görebilen rol (yönetici gibi) Üretim Terminali'ni açınca Pano görüyordu. Giriş sayfası artık yalnız `/arkon` için seçilir; Üretim Terminali her rolde Arkon'un operatör ekranını açar.
- Göç yok, yeni işlem yok.

## Kontrol planından silme, "her N parçada bir", her zaman "Kaliteye gönder" (kart #706)

- Hazırlık > Kontrol planı: her satırda sil düğmesi (ölçülmeyecek ölçü), satır seçip "Seçilenleri sil"; silme "Geri al" bildirimiyle geri alınır. Silinen ölçü numune kurallarından da düşer, listesi boşalan kural silinir (`data/kontrol-plani.ts olculeriSil`).
- Satırdaki sıklık seçiminde (CNC) "Her N parçada bir…": sayı girilince ölçü kalitenin ölçtüğü "her N parça" numune kuralına girer, öteki "her N parça" kurallarından çıkar (`herNParcaYap`, `istasyonlar.ts numunePlaniYaz`). Numune planı olan pakette seçim "Numune sekmesinde düzenle"yi de gösterir.
- Operatör ekranında "Kaliteye gönder" düğmesi her zaman var. Zamanı gelen ölçü yoksa planın bütün ölçüleri (kritikler önde) "Operatör isteği" nedeniyle gider; önceki numune kalitedeyken ikinci istek açılmaz.
- "Numune zamanı gelince otomatik kaliteye gönder" varsayılanı açık (`kurallar.ts RULES0`). Kurallar'da bu ayarı elle kapatmamış bütün paketlere uygulanır.
- Göç yok, yeni işlem yok.

## Terminal halkasında hurda gerçek oranıyla (kart #728)

- `bilesenler.ts` `Dial` hurdayı 8 kat büyüterek çiziyordu (50 parçada 4 hurda halkanın %64'ü). Pay artık `data/sayac-halkasi.ts` `halkaPaylari`: iyi `iyi/hedef`, hurda `hurda/hedef`, ikisi halkayı aşmaz. Görünür kalsın diye en az 4 birimlik yay korunur.

## Terminal açılışı: ayarlar birlikte okunur (kart #728)

- Ölçüm (yerel, boş veritabanı, derlenmiş istemci): Arkon ilk çizimden önce 9 ayarı (`loadCfg`) sırayla bekliyordu ve çizimden hemen sonra aynı 9 okumayı bir kez daha yapıyordu. TMI içinde her okuma ayrı sunucu isteğidir.
- `ortak-ayarlar.ts loadCfg` okumaları birlikte başlatır, sonuçları eski sırayla ve ayrı ayrı uygular (biri hata verirse öteki ayarlar yine yüklenir). `baslat.ts` açılıştaki ikinci okumayı yapmaz; kişi değişince yine okur.
## Okuma uçları terminal ve kuyruk sayfasını da kabul eder (kart #722)

- `ARKON_OKUMA` artık `sayfa.arkon`, `sayfa.uretim-terminali` ya da `sayfa.kuyruk` ister. Üretim Terminali ve Kuyruk Arkon'u ayrı TMI sayfası olarak açar; çekirdek operatörden `sayfa.arkon`'u kaldırınca (#713) operatör veriyi yine okur. Arkon rol denetimi (servis) değişmedi.
## TMI içinde PIN kilidi yok (kart #712)

- TMI içinde (`gomuluMu`) Arkon giriş ekranı, bosta kilidi (30 dk), vardiya kilidi ve "Kişi değiştir" kapalıdır: oturum TMI'nindir ve köprü Arkon girişini reddeder (`baglanti.ts` `cevir`, login 403), açılan PIN ekranı geçilemiyordu.
- Tek başına açılan Arkon'da davranış aynıdır (`pinGirisiVar`).
- TMI oturumu düşünce ne olacağı çekirdek oturum işidir; burada değişmedi.

## Terminal büyük ekranı: saat, malzeme, dönen 3B (kart #733)

- `operator-parcalar.ts AwayView`: üst satırda durum ve süresi, ortada duvar saati (SS:DD), sağda emir no ve gerçek istasyon (önceden sabit "TZG-04" yazıyordu). Sayacın üstünde malzeme ve operasyon (`data/buyuk-ekran.ts isSatiri`).
- 3B: paketin model dosyası (`modelDosyasi`) için hazır 3B veri (paketle gelen ya da önbellekteki) varsa sayacın yanında yavaşça döner (`model-3b.ts Step3D sade`). Büyük ekran modeli hesaplatmaz (`processModel` `yalnizHazir`): geometri çekirdeği ağırdır. Model kaynağı Çizim Merkezi (#721) birleşince bağlanacak.
## Terminal üst şeridinde vardiya özeti (kart #732)

- Üst şeritteki kişi düğmesi "Vardiya özeti" yerine istasyonun bu vardiyadaki iyi parçasını (beklenen adet varsa "312 / 400") ve vardiyanın kalan süresini gösterir (`data/operator-ozeti.ts`); dokununca vardiya özeti açılır. Kayıt okunmadan yazı çıkmaz, beklenen adet uydurulmaz.
- Sıradaki iş solda iş listesinde zaten görünür; şeride eklenmedi. Dar ekranda üst şerit farklıdır, orada değişiklik yok.

## Parti kolu: adım türü, birleşme retleri, katılmış kol (B8, kart #199)

- Adım türü: iş emri paketinin `tmi` alanına rota dışı adımda `tur` (rework, tamir, ek) ve varsa `ekAciklama` yazılır; rota adımında ikisi de yoktur, kayıtlı paketlerin içeriği ve sürümü değişmez. Tür `planlanacakIsEmirleri`nden, açıklama `adimliEmirAyrintisi`nden gelir (yalnız rota dışı adımı olan emir için emir başına bir okuma). Operatör kartında ve kuyruk satırında etiket (`data/adim-turu.ts`), açıklama altında.
- Birleşme retleri: TMI komutu yansımada reddedilince (`KOL_ONCEKI_BITMEDI`, `BIRLESME_BEKLENIYOR`, `BIRLESME_GELMEDI`) metin `arkon_tmi_yansima.neden`e zaten olduğu gibi yazılıyordu ama kayıt cevabı yalnız `{ eklenen }` döndüğü için operatör görmüyordu. Cevaba `reddedilen: [{ cid, ileti }]` eklendi (aynı istekte işlenen yansımalar); köprü bunu TMI bildirimi olarak gösterir. Başka isteğin ya da arka plan turunun işlediği yansımanın reti bu cevapta yoktur (yalnız "TMI'ye yazılamayanlar" listesinde).
- Katılmış kol: kapanan (iptal) kolun kayıtlı paketi AR2 süzgeciyle (`belgelerHam`) zaten listeden ve tek okumadan düşüyordu; kod değişmedi, test eklendi.
- Göç yok, yeni işlem yok.

## Derlenmiş istemci önizlemesinde Arkon (kart #786)

- `arkon/sun.ts arkonuSun` artık `vite preview` ile de çalışır: /arkon-mes/ istemci çıktısındaki kopyadan, geliştirmedeki aynı içerik ilkesi ve STEP çalışanı ilkesiyle sunulur. Önizleme Arkon'u yeniden derlemez (derleme `derle:istemci` içindedir).
- Derlenmiş istemciyi sunma komutu ve kurulum çekirdek işidir; burada yalnız Arkon'un o yolda doğru başlıklarla açılması var.

## Parti kuralı kayıttan önce (B8 devamı, kart #199)

- Terminal kaydı yazılmadan önce iş emri paketindeki başlatma (`running`) ve bitirme (`done`) olayı için uretim-emirleri `partiKomutuReddi` sorulur (`kurallar.ts partiKomutu`). Ret varsa kayıt yazılmaz, 409 kuralın metniyle döner; köprü bunu "kaydedilmedi" bildirimi yapar. Önceden kayıt yazılıyor, yansıma sonradan reddediliyordu.
- Ek adım açıklaması artık planlama listesinden (`PlanIsEmri.ekAciklama`) gelir; kol başına ayrıntı okuması kalktı.
- Cevaptaki `reddedilen` kalır: arka planda ya da başka kuralla reddedilen yansımalar için.
- VARSAYIM: çevrimdışı tabletten toplu gelen kayıtta ret bütün isteği düşürür (plan canlı değil retiyle aynı). Aynı istekte önce üst adımın bitişi, sonra kolun başlangıcı gelirse kol reddedilir; yeniden gönderimde geçer.

## Arkon dosyaları Çizim Merkezi'nden (kart #800)

- Hazırlık (Dokümanlar sekmesi) ve Çizim stüdyosunda "Çizim Merkezi'nden ekle" seçicisi (`app/cizim-merkezi.ts`); yalnız TMI'ye bağlıyken görünür. Arkon'da yüklenen dosya merkeze GİTMEZ; yalnız merkezden alma vardır.
- Uçlar (`uclar.ts`): `GET /arkon/cizim-merkezi/belgeler?ara=` (yayındaki PDF, STEP, IGES, STL; resim biçimleri Arkon paket dosyası olmadığı için gelmez), `POST /arkon/cizim-merkezi/belgeler/:belgeId/ekle`, `GET /arkon/cizim-merkezi/kontrol?dosyalar=<belgeNo>:<özet>,...` (en çok 50 çift). Okuma uçları `ARKON_OKUMA`, ekleme `oturum`; üçünde de servis `pkgs` yazarlarını ister (yönetici, planlama, hazırlık, kalite): operatör rolü ve rolsüz kişi 403 alır.
- Alma, merkezdeki yayındaki dosyayı akıştan okuyup özetini doğrular ve Arkon'un kendi dosya deposuna (`arkon_dosya`, özetle tekil, yerel yüklemenin vardığı yer) yazar; depo kotası aynıdır. Cevabın `kayit` alanı paketin `files` kaydıdır: `{ kind, name, merkez: belgeNo, merkezOzet: özet }`; ekran baytı mevcut blob akışıyla (`/blob/<özet>`) okuyup kaydı kurar, paket her zamanki yoldan yazılır. Belge adı uzantısızsa dosya adına türün uzantısı eklenir (Arkon türü uzantıdan çıkarır).
- "Yeni revizyon var": pakette `merkez` taşıyan her dosya için sunucu, kayıtlı özeti merkezdeki yayındaki özetle karşılaştırır (`guncel`, `yeni-revizyon`, `yayindan-kalkti`). Ekran paket açılınca ve dakikada bir sorar; rozet ve "Güncelle" düğmesi gösterir. Güncelleme aynı `files` kaydının yerine geçer (sıra, ana resim ve kontrol planı korunur; ad değişirse ana resim yeni ada taşınır).
- VARSAYIM: güncellemede kontrol planı (balonlar) sıfırlanmaz; yeni revizyonda balon konumları değişebilir, plan kullanıcıda kalır. Kontrol yalnız özete bakar, revizyon harfi dönmez.
- Göç yok, yeni işlem yok.

## Terminalde hurda kalan adetten düşer (kart #809)

- Kalan adet işlenen parçaya göredir: `hedef - iyi - hurda` (`data/sayac-halkasi.ts kalanAdet`). Terminal halkasındaki "kaldı" ve yüzde, büyük ekranın kalan süresi ve Planlama panosunun kalan süresi buna göre. Önceden yalnız iyi parça sayılıyordu (50'lik işte 40 iyi 4 hurda "10 kaldı").
- Büyük sayı yine iyi parçadır; TMI'ye giden sayım değişmedi.

## Arkon olay akışı çerçeveyle kapanır (kart #862, inceleme Y13)

- Arkon'un olay akışı (EventSource yerine 2 sn'lik `/arkon/iletiler` okuması) TMI penceresinde döner; çerçeve kalkınca durmuyordu. Her Arkon ziyareti bir döngü daha bırakıyor, çıkıştan sonra da 401 alarak sürüyordu.
- `bagla` artık açtığı akışları kapatan işlev döner. `ArkonCercevesi` onu çerçeve kalkınca (başka sayfa, çıkış) ve çerçeve kendi içinde yeniden bağlanınca çağırır.
- Arkon ekranı, sunucu ve sözleşme değişmedi. Göç yok.

## Görünen ad "Üretim Hazırlık" (kart #910)

- Arkon'un ekranda görünen adı "Arkon MES" yerine "Üretim Hazırlık": ana menü, ikinci menü başlığı, Sistem Ayarları bölümü, yetki ekranındaki modül grubu, çerçeve başlığı ve "açılamadı" metni, sunucunun "rolünüz yok" metni, Arkon içindeki sekme başlıkları, rapor başlığı ve ayar ipucu.
- Modül adı, klasörler, `/arkon` yolu, tablolar ve işlem adları (`arkon.*`) aynı kaldı. "Arkon yönetimi" ve "Arkon planlama" işlem etiketleri de "Üretim Hazırlık yönetimi" ve "Üretim Hazırlık planlama" oldu (kullanıcı kararı, #910 yorumu).

## Görünen ad, kalan yerler (kart #910)

- Arkon'un üst çubuğundaki ve mobil menüsündeki marka yazısı, giriş ekranı başlığı ve ölçüm raporu çıktısının başlığı "ARKON MES" yerine "ÜRETİM HAZIRLIK". Yalnız görünen metin değişti.

## Üretim Terminali'nde toplu giriş (kart #1046)

- Operatör ekranında "Toplu giriş" düğmesi ve penceresi: sağlam N ve hurda N bir seferde; hurda varsa neden seçilir. Masaüstü ve mobil yerleşimde "Kaliteye gönder"in üstünde. Kullanıcı kararı: "terminalin kendisi değişmez" yönergesine yalnız bu iş için onaylı istisna.
- Kayıt düzeltme değil olağan sayımdır: sayaçlar artar, sayım satırları her zamanki fark biçimiyle (`kind`, `delta`, hurdada `reason`) gider; TMI'ye var olan eşlemeyle sağlam ve hurda olarak yansır (tek giriş iki satır). Toplu satırda `cycleMs` boştur (birim süre ortalaması bozulmasın).
- Kural (`data/toplu-giris.ts`): adet sıfır ya da eksi olmayan tam sayı; ikisi birden 0 olamaz; hurda varsa neden zorunlu; sağlam, +1 düğmesi gibi hedefi aşamaz (VARSAYIM: kalan = hedef − iyi).
- +1, Hurda +1 ve "sayıyı düzelt" değişmedi. Sunucu, sözleşme ve göç değişmedi.
## Refakat kartı okutma (kart #1062)
- Terminalde `UE:<emir id>` (kart QR) ya da `UE-<rakam>` (elle emir no) okutulunca o emrin bu istasyondaki ilk bekleyen işi açılır; iş başlatılmaz, okutma kayıt yazmaz.
- Emrin bu istasyonda bekleyen işi yoksa uyarı: "Bu emrin bu istasyonda işi yok, sıradaki adım: <istasyon>". Sıradaki adım, emrin bu cihazda bitmemiş ve planı kapanmamış en küçük op no'lu paketidir; yoksa istasyon yazılmaz.
- Mevcut emir no ve parça no eşlemesi diğer kodlar için aynen kalır.
- VARSAYIM: uyarı metni ve "sıradaki adım" seçimi karttaki tariften; geri alması ucuz (tek dosya `arkon/web/src/data/refakat-okut.ts`).
- Kod sözlüğü (`paylasilan/kod-sozlugu.ts`, kart #1059) birleşince ayrıştırma ona geçirilebilir; anlam aynı (`UE:` kimlik, `UE-` emir no).

## Refakat okutmada olmayan emir (kart #1062, demo provası)
- Okutulan emrin bu cihazda ne sırada ne pakette izi yoksa uyarı "Emir bulunamadı: <kod>"; önceden yanlışlıkla "bu istasyonda işi yok" deniyordu.

## Toplu giriş ekranda hep açık (kart #1075)
- Üretim Terminali'nde "Toplu giriş" düğmesi ve penceresi kalktı; sağlam ve hurda alanları sayaçların altında hep açık durur (iki düzende de). Kaydedince alanlar boşalır.
- Hesap ve kayıt aynı (`topluGirisSayilari`, `topluGirisHatasi`, `doToplu`); üretim yetkisi kaydetmede sorulur. İş yokken alanlar kapalıdır.

## Geniş terminal (uzak mod) hizalama ve malzeme satırı (kart #1077)
- Sayaç ekranın tam ortasında durur (3B model sol, "/ hedef" sağ sütunda; model yokken de kaymaz); saat üst satırın ortasında, alt satırda Hurda sol, Kalan orta, Sıradaki kontrol sağ.
- İş satırının altında üretilen malzemenin kodu ve revizyonu yazar (`malzemeSatiri`): malzeme kodu yoksa parça no; kod parça adıyla aynıysa tekrar yazılmaz; paketsiz işte satır çizilmez. Veri iş emri paketinde zaten var, yeni uç yok.
- Dar ekranda üst satır tek sırada kalır.

## Kaliteye numune, Teslim et altında (kart #1083)
- Üretim Terminali'ndeki "Kaliteye gönder" düğmesi kalktı. Numune isteği Malzeme · teslim > Teslim et penceresinde "Kaliteye numune" seçeneğiyle gönderilir; kontrol planı yoksa ya da önceki numune kalitedeyse gönder kapalıdır.
- Gönderince mesaj "Numune isteği kalitede · onay bekleniyor" olur (önceden yeşil "gönderildi" onay sanılıyordu). İstek ve Kalite ekranındaki onay/red aynı.
- Numune zamanı gelince görev kartındaki "Kaliteye gönder" hatırlatması kalır (kullanıcı kararı 13.10, "Kalsın"); basınca numune doğrudan gitmez, Teslim et penceresi Kaliteye numune seçili açılır. İlk parça uyarısındaki "Kaliteye gönder" de aynı pencereyi açar. Otomatik numune isteği (kural açıksa) eskisi gibi kendiliğinden gider.
- Dar düzende Malzeme · teslim çubuğu artık istasyonu biliyor (önceden istasyon bilgisi verilmeden çiziliyordu).

## Toplu giriş tablette ilk açılışta görünür (kart #1113)
- Dar düzende sayaç kadranı küçüldü (telefonda ekran yüksekliğinin %24'ü, 600 px ve üstünde %30'u; önce %30 ve %40). 768x1024 ve 820x1180'de Toplu giriş alanı açılışta alttaki yuvarlak düğmelerin üstünde kalır, kaydırmadan dokunulur.
- Alttaki düğme şeridinin saydam geçiş bölgesi dokunmayı yutmaz; yalnız düğmelerin kendisi dokunma alır.
- 360x640 gibi kısa telefonlarda alan yine kaydırınca görünür.

## Ayarlar > Çalışma kuralları yerleşimi (kart #1088)
- "Dokunulmazsa kilitle" ve "Çağrı yükseltme" satırları anahtar düğmenin `sw` sınıfını da taşıdığı için 46 piksellik kutuya sıkışıp diğer maddelerin üstüne biniyordu; satır yalnız `numrow` sınıfıyla çizilir.

## Tanıtım / gerçek kullanım kartı kalktı (kart #1087)
- Ayarlar > Sistem'deki "Veriler · Tanıtım / gerçek kullanım" kartı (örnek verileri temizle / yeniden aç) kaldırıldı. Proje geneli örnek veri `npm run ornek-veri` ile yüklenir.
- Sunucuya bağlı kurulum her zaman gerçek kullanımdadır: kayıtlı `kv/mode` değeri tanıtımı açamaz. Sunucusuz yerel mod (geliştirme ve deneme) eskisi gibi örnek veriyle açılır.
- Veri silinmez: sunucuda önceden yüklenmiş `seed-` önekli örnek paket varsa yerinde kalır (BİLMİYORUM: kurulu sunucuda var mı); gerekirse Hazırlık'tan silinir. Örnek veri kodu (seedIfEmpty, örnek tesis) yerel mod için duruyor.

## Son olaylar okuması, fabrika haritası için (kart #1122)
- Arkon ilk kez `disari.ts` açar: `sonOlaylar(db, { sonra?, sonraId?, sinir? })` terminal olaylarını (durum, sayım, ölçüm, çağrı; değişiklik günlüğü hariç) en yeni önce verir: kimlik, tür, zaman, istasyon kodu ve kimliği, emir no, kişi.
- DOĞRULANDI: `arkon_kayit.makine` TMI makine kodu değil, istasyon kodudur (`kurallar.ts` "machine istasyon kodudur, mc makine kodudur"; `kayit-kimlik.test.ts` bilinen kodla `istasyon_id` dolu). Dönen alan bu yüzden `istasyonKodu`; haritada makineye gitmek için istasyon kullanılır.
- Yoklama `sonraId` ile yapılmalı: çevrimdışı kuyruktan geç gelen kaydın zamanı eskidir, kimliği yenidir; `sonra` (zaman) bu kaydı kaçırır.
- Yetki ve veri kapsamı çağıran ucundadır; okuma kişiye göre süzmez. Sayımlar uretim-emirleri'ne de yansır: iki kaynak birlikte gösterilirse aynı hareket iki kez görünebilir (VARSAYIM, haritanın birleştirmesi gerekir).
- En çok 200 satır; varsayılan 50.

## Son olaylar okuma ucu, fabrika haritası için (kart #1122, ikinci adım)
- Yeni uç `GET /arkon/son-olaylar?sonraId=<id>&sayi=<1-200, varsayılan 50>`; cevap `{ olaylar: [{ id, tur, zaman, istasyonKodu, istasyonId, emirNo, kisi: { id, ad } }] }` (`paylasilan/sozlesme/arkon.ts` `sonOlaylarSorgusu`, `sonOlaylarCevabi`). Harita istemcisi doğrudan çağırır; atolye sunucusu Arkon'u ithal etmez (arkon -> stok -> atolye döngüsü, ADR 0006).
- Yetki: Arkon okuma işlemlerinden biri ya da `sayfa.atolye` (VARSAYIM: haritayı gören okur; rol x işlem satırı değişmedi). Veri kapsamı serviste: kişi yalnız izinli iş merkezlerinin olaylarını görür; iş merkezi çözülemeyen kayıt herkese görünür (`kapsamdaMi` kuralı).
- `sorgular.sonOlaylar` isteğe bağlı kapsam süzgeci aldı; `disari.ts` davranışı değişmedi (süzgeç yok).

## Üretim anomalisi (kart #1149)
- `GET /arkon/anomaliler` (`arkon.hazirlik`, `arkon.planlama` ya da `arkon.yonetici`'den biri; yeni rol x işlem yok. VARSAYIM: yetki "sayfayı görenler" olarak genişletildi, kullanıcı kararı karta yazıldı; geri alma `uclar.ts ANOMALI_OKUMA` tek satır): canlı plandaki iş emirleri için "plandaki sıraya göre şu ana kadar üretilebilecek adet" (beklenen) ile üretilen adet; istasyon, makine ve kişi satırları, toplam oran. Yalnız okur; veri kapsamı (kişinin iş merkezi kısıtı) istasyon düzeyinde uygulanır.
- Kurallar `kurallar.ts` sonunda, saf: AR-AN-1 giriş yok süresi, AR-AN-2 üretilen < plandaki adet, AR-AN-3 toplam üretilen / toplam plan, AR-AN-4 makine ve kişi bazında üretebilirdi / üretti (`anomali.test.ts`). Akış `servis.ts anomaliler`; Arkon yalnız `plan`, `vardiya`, `rota`, `istasyonlar`, `uretim-emirleri` ve `ik` `disari.ts` dosyalarını okur (döngü yok, ADR 0006).
- Beklenen adet = iş emrinin canlı plandaki yerleşimi ile gün başından şu ana kadarki net aktif sürenin (vardiya; mola ve planlı duruş düşülmüş, kaynak takvimi `calismaTakvimi`) kesişimi / etkin birim süre (`rota adimEtkinSureleri`, yoksa iş emrine kopyalanan süre) x istasyon verimi; iş emrinin adedini aşmaz. Birim süresi ya da takvimi bilinmeyen iş emri toplamı bilinmez yapar (null; sıfır uydurulmaz).
- Üretilen = günün net sağlam sayımı: istasyon ve kişi için `uretim-emirleri/disari.ts aralikAdetleri` (gün başı - ertesi gün başı, düzeltme dahil; kaydı olmayan kimlik 0). AR-AN-1: istasyonun `sonGirisler` zamanından (yoksa gün başından) şu ana kadar, yalnız planlı pencerelerin net aktif dakikası (kaynakların pencereleri birleştirilir). Makinenin üretileni de `aralikAdetleri` (`'makine'` kırılımı, #1182): sayım anında emrin o makinedeki açık kullanımından bulunur. Eşikler Ayarlar'da: `arkon.anomali-giris-yok-dk` (varsayılan 60) ve `arkon.anomali-adet-tolerans-yuzde` (varsayılan 0); boş eşik o kuralı kapatır (`paylasilan/ayarlar/arkon.ts`). Sistem Ayarları'nda Genel'de değil, Modül ayarları > Üretim Hazırlık ekranının başında "Üretim anomalisi" kartında görünür (kart #1193; Arkon ekranını göremeyen kişide Genel'de kalır); anahtar, değer ve yazma yetkisi değişmedi.
- Gösterim: kendi sayfasında, tam genişlikte (`/arkon/anomali`, "Üretim Anomalisi", kart #1193; `app/anomali.ts AnomaliApp`): istasyon, makine ve kişi yan yana, dar ekranda alt alta; dakikada bir ve "Yenile" ile okunur. İkinci menüde Hazırlık'ın altındadır ve aynı roller görür (`arkon.hazirlik`, `arkon.planlama`, `arkon.yonetici`; Arkon içinde `page.prep`); yeni işlem yok. Hazırlık sayfasında anomali yoktur (ne pano ne bağlantı; kullanıcı isteği, kart #1193). Köprü `/anomaliler` isteğini `/arkon/anomaliler`e çevirir.
- Varsayımlar ve eksikler `UYUM-BORCU.md` "Üretim anomalisi" bölümünde.

## Üretim terminali düzeni ve yükleme kaldırma (kart #1167)
- Yalnız istemci: uç, yetki ve veri değişmedi. Operatör terminalinde (`operator.ts`) teknik resim paneli `yuklemeYok` ile açılır: "PDF / STEP yükle" araç düğmesi, Dokümanlar çekmecesindeki yükleme düğmesi, sürükle-bırak ve gizli dosya seçici yoktur. Hazırlık, Çizim Stüdyosu ve Kalite'deki yükleme aynen kalır.
- Toplu giriş (`TopluPanel`) kompakt: küçük başlık satırı, tek satırda Sağlam / Hurda alanları ve Kaydet; hurda nedeni kısa çiplerdir (en çok ~88 px, kaydırılır, açılınca görünür alana gelir). Alanlar, aria-etiketleri, sayım kuralı ve kayıt davranışı aynıdır.
- Mobil terminalde (`html.mob`) eylem şeridi (Ayar / Başlat / Resim) kaydırılan içerikten ayrıldı: toplu girişi örtmez, etiketleri kesilmez; içerik şeridin üstünde kayar. Malzeme · teslim satırı toplu girişin altında, şeridin üstündedir.
- Masaüstü düzeninde orta sütun dar kalınca (≤680 css px) Hurda / Kalan süre ve Son çevrim / Çevrim etiketleri kadranın köşelerine alınır; yanlarda taşıp kesilmez.
- VARSAYIM: ekran görüntüsündeki "Kaliteye gönder" satırı bu sürümde yoktur (kart #1083'te Malzeme · teslim altına taşındı); ayrıca dokunulmadı.

## Terminal: makine seçimi, makine devralma, aynı işe katılım (kart #1148)
- Taban: #1158 (makine kilidi, `makine-devral`) ve #1159 (katılım) üstüne. Yeni göç ve yeni rol x işlem yok.
- Olay kaydı `mcs` (TMI makine kodları) taşır; yoksa iş emrinin atanmış makinesi kullanılır. Ekran: birden çok makineli istasyonda başlatmadan önce makine çipleri (`MakineSecici`, `data/makine-secimi.ts`).
- Makine dolu: `kayitEkleCevabi.reddedilen[].makineDolu` (kim, hangi iş, kullanım kimliği, devralınacak emir). Kabuk "<kişi> <iş> başlattı, önce durdurulmalı" diye sorar; onay `POST /arkon/makine-devral { emirId, kullanimId, cid? }` (oturum + Arkon yazma rolü; yetki, kapsam ve durum kuralı TMI komutunda). Aynı işin aynı makinede yeniden başlatılması devralınamaz, düz hata.
- Aynı işe katılım: insanlı istasyonda çalışan işe başlatma `katil` olur, uyarı `kayitEkleCevabi.uyarilar` ile kabukta bildirilir (ret değil). Başkası çalışırken `paused/queued` kendi katılımını duraklatır, `done` kendi katılımından ayrılır; `stopped` (duruş) reddedilir; katılımsız kişinin duraklat/bitir komutu reddedilir ve ret metni gösterilir. Katılım satırı olmayan (eski) iş eski davranışta kalır.
- `kayitEkleCevabi.uyarilar` zorunlu alan oldu (köprü boşsa göndermez).
- Bu turun varsayımları: (1) bayrak yoksa istasyon makineli sayılır (`kapasite_kaynagi` boşsa); (2) `mc` ekran varsayılanıdır, seçim yalnız `mcs`; (3) `stopped` başkası çalışırken reddedilir; (4) ret sonrası ekran durumu TMI'den ayrışabilir (var olan sınır); (5) devralmada ötekinin ekranı kendiliğinden güncellenmez.

## Üretim Hazırlık: canlı plan ayarı, plan dışı gönderim, rotasız emir (kart #1257)
- Kart #199 A4 kuralı ayardır: `arkon.yalniz-canli-plan` (`paylasilan/ayarlar/arkon.ts`, varsayılan kapalı, kullanıcı kararı 14.10.2026). Sunucu değeri iş emri paketinin `tmi.plan.zorunlu` alanına yazar; ekran süzgeci (`arkon/web/src/data/tmi-plan.ts`) ve sunucunun başlatma denetimi (`planBaslatmaReddi`) aynı ayarı okur. Kapalıyken yayındaki rotalı iş plansız da operatöre düşer ve başlatılır; plan etiketi Hazırlık'ta bilgi olarak kalır.
- "Operatöre gönder": iş canlı planda değilse ya da başka kaynaktaysa pencere açılır (`hazirlik.ts PlanOnayOv`): neden, "Plana git" (`/recete-rota/plan`, köprü hedefi `plan`), "Yine de gönder". Ayar açıksa pencere işin plan canlıya alınana kadar operatörde görünmeyeceğini yazar.
- İstasyonu seçilmemiş TMI işi gönderilemez (kullanıcı kararı): yayın kontrolünde zorunlu satır, sunucuda `yayinEksigi` 400 (`ISTASYONSUZ_YAYIN`, alan `machine`). Arkon'un eski yerel paketi bu kurala girmez.
- Rotasız emir (B13) Hazırlık'a gelir: adımları `uretim-emirleri/disari.ts rotasizIsEmirleri` ile okunur ve iş emri paketi olur; plan durumu yoktur (yayınlanınca düşer, ayar açıkken de başlar). Kaynaksız adım (rotalı ya da rotasız) istasyonsuz paket olarak görünür; istasyon Reçete ve Rota'da adımın makinesi ya da kişisi seçilerek verilir.

## Terminal: başlatma reddi operatöre döner (kart #1285)
- Sırası gelmemiş adımın iş emri paketiyle başlatma (iş emri bekliyor, emrin sıradaki iş emri başka) kayıttan önce 409 döner: "Bu adımın sırası gelmedi: emrin sıradaki adımı Op N <ad>. ..." (`adimSirasiBaslatmaReddi`). Kural değişmedi (UE-04/S2, sıralı adım); önceden kayıt yazılıp sessizce `eslenemedi` (`PAKET_ADIM_SIRASI`) oluyordu, terminal işi çalışıyor gösteriyordu. Sayım ve bitmiş adımın kaydı eskisi gibi yazılır, eşlenmez.
- Terminal (`operator.ts`, `data/biten-is.ts baslatmaGeriAlma`): reddedilen başlatma (409 ya da cevaptaki `reddedilen`) uyarı gösterir, iş üretimsizse kuyruğa, üretimliyse duraklamaya döner; geri dönüş yeni durum kaydı yazmaz. Canlı plan ve parti retleri de böylece görünür olur.
- "TMI'ye yazılamayanlar" (`TmiYansimalari.tsx emirBaglantisi`, kullanıcı kararı): eşlenemeyen "Paket başka adımın" satırında "Sıradaki adımı aç", "Paket başka istasyonun" satırında "Emri aç" bağlantısı emrin sayfasına (`/uretim-emirleri/:id`, adımlarıyla) gider. Bağlantı yalnız `sayfa.uretim-emirleri` olan kişide; İşlem sütunu yeniden deneme ya da bu işlemden biri varsa görünür. Neden metni sunucu sabitinin başıyla eşlenir.

## Terminal: malzeme ve teslim bölümü kaldırıldı (kart #1290)
- Kullanıcı kararı: operatör ekranındaki "Malzeme · teslim" bölümü (Teslim et, Teslim al, Malzeme iste; masaüstünde iş listesinin altı, telefonda üretim sekmesinin altı) kaldırıldı (`LogiBar`, `LogiOv`, `MalzemeSec`, `LOGI`, stiller). Malzeme isteği ve teslim TMI'de Stok'un üst çubuk eyleminden yapılır.
- Kaliteye numune isteği (kart #1083) kendi penceresidir (`NumuneOv`): görev kartındaki hatırlatma ve ilk parça uyarısı açar.
- Kalanlar (dokunulmadı): sunucudaki `logi` deposu ve stok isteği köprüsü (`stokIstegiKaynagi`, `stokIstegiKarari`), Arkon yetki matrisindeki `logi.req` / `logi.handle`. Kaldırılmaları ayrı karardır.

## Kart #1306: anomali gün kaydı, gün/hafta/ay istatistiği, ölçüm düzeltmeleri

Öneri: https://claude.ai/artifact/Lm91aYERFMvNXBDsMTDjvp. Kararlar kartta (kalıcı kayıt, kişi kırılımı yalnız yönetici, performans ölçüsü).

| Değişen | Kural |
|---|---|
| göç `20261014182700_arkon_anomali_gunluk.sql` | iki yeni tablo; kesin gün tetikleyiciyle değişmez (var olan tablo değişmez) |
| `kurallar.ts` | AR-AN-5..8, `kisiBeklenen` makinedeki paya göre, biten iş emrinin kayıtlı beklenen adedi |
| `servis.ts` `anomaliHesapla`, `anomaliGunuKaydet`, `anomaliIstatistigi`; `isler.ts` | gün kaydı işi (15 dk), istatistik okuması; kişiye yerleşen işte istasyon önce iş emrinden; hurda ve kişi performansı |
| `uclar.ts` | `GET /arkon/anomali-istatistik` |
| `paylasilan/islemler/arkon.ts`, `paylasilan/islem-adlari.ts` (ayrı commit) | `arkon.anomali-kisi` |
| sözleşme | hurda, performans; `kisiler` işlemi olmayana null; istatistik cevabı |
| Arkon ekranı, köprü | Bugün / Gün / Hafta / Ay; tarih; günler şeridi; kişi bölümü yalnız işlemi olana |

## Operatör Özetim (kart #1295)
- Yeni okuma ucu `GET /arkon/operator-ozeti?donem=gun|hafta|ay&kisiId=` (öteki okuma uçları gibi sayfa işlemi; serviste `arkon.operator` ya da `arkon.amir` istenir, yeni işlem yok). Kişi verilmezse oturumdaki kişi;
  başkasını yalnız amir, kendi iş merkezi kapsamındaki (istasyon ya da makine ataması kapsamda olan) kişi için ister; aksi 403.
- Sayılar uretim-emirleri sayımından (`aralikAdetleri('kisi')`) ve katılım süresinden (`katilimSureleri`) okunur; Arkon günlüğü kullanılmaz. Veri yoksa alan boş gelir.
- Plana göre başarı her dönem için: bugün Üretim Anomalisi'nin kişi hesabı; geçmiş gün, kişinin o gün çalıştığı iş emirlerinin plan yerleşimi ile
  kaynağın o günkü çalışma takviminin kesişimi (`gecmisBeklenen`, uretim-emirleri `kisininIsEmirleri` ve `isEmriPlanBilgileri`, plan `canliSira`). Yerleşimi
  olmayan iş emri katılım süresi / birim süreyle sayılır ve cevapta söylenir; beklenen adedi bilinmeyen kayıtlı gün hesaba girmez, sayısı söylenir.
- Dönemin işleri (`kisininIsEmirleri`), hurda nedenleri (`kisininHurdaNedenleri`) ve standart süreye göre verim (`standartSureler` / katılım süresi) gelir.
- İsimsiz ekip ortalaması yalnız bugün; ekip, aynı iş merkezine atanmış kişilerdir ve başarısı hesaplanan kişi 3'ten azsa ortalama gelmez. Cevapta başka kişinin adı ve sayısı yoktur (amirin kişi seçicisi hariç). Duruş kişiye yazılmaz.
- Terminalde telefon ilk sekme "Özetim" ile açılır; masaüstünde üst şeritteki kişi simgesi pencerede açar. Sekme Arkon operatörü ve amirinde görünür.

## Kart #1306 devamı: plan dışı sayım ve kalan adet tavanı
- AR-AN-9: iş emrinin bugünkü beklenen tavanı kalan adettir (adet - önceki günlerin sağlamı; uretim-emirleri `aralikAdetleri('is_emri', ..., '-infinity', gunBasi)`).
- AR-AN-10: istasyonun üretileni plandaki iş emirlerinin sayımıdır; plan dışı sayım ayrı alan (`planDisi`) olur, orana ve eksik adet işaretine girmez.
  Planı olmayan ama sayımı olan istasyon da satır alır. Gün kaydına yeni sütun yok: istasyon satırı bütün sayımı, iş emri satırı kendi sayımını tutar.
- Sözleşme: istasyon satırı ve toplamda `planDisi`; istatistikte günler, toplam ve istasyonlarda `planDisi`. Ekranda istasyon satırında "plan dışı" notu ve özet kutusu.

## Operatör Özetim 2. sürüm (kart #1322)
- Ekrandan kalktı: plana göre başarı halkası, standart verim, isimsiz ekip ortalaması, kalite yüzdesi. Sunucu hesabı ve cevap alanları duruyor (`basari`, `verim`, `ekipOrtalamasi`, `kalite`).
- Yeni alanlar: `yetkiler` (istasyonlar `istasyonKisiAtamalari` ve `makineKisiAtamalari`, bugünkü atamalar; pasif düşer), `mesailer` (Vardiya `calismaTakvimi` kişi kaynağı,
  bugünden 7 gün; dün de okunur, gece vardiyası başladığı güne yazılır; iş merkezine bağlanamayan kişide null), `fazlaMesai` (İK `kisininFazlaMesaisi`, bu ay ve takvim yılı
  toplamı, onay bekleyen saat, yıllık sınır; saati girilmemiş satır varsa toplam null), `izinler` (İK `kisininKalanIzni` ve `kisininIzinleri`, bugünden 180 gün; yalnız
  onaylı ve bekleyen). İK kaydı olmayan kişide fazla mesai ve izin null.
- Ortak terminal ayrımı yok (kullanıcı kararı): kişi kendi oturumunda her ekranda görür; amir kapsamındaki kişide salt okur (yetki #1295 ile aynı). İzin talebi bu sayfadan açılmaz.

## Kart #1324: emek verimi (Anomali kişi kırılımı)
- AR-AN-11 `mesaiSaniyesi`, AR-AN-12 `emekVerimi` (kurallar.ts); veri toplayan `emekVerimleri(db, kisiIdleri, bas, bit, simdi)` (servis.ts, dışa açık):
  standart süre uretim-emirleri `standartSureler`, mesai vardiya `calismaTakvimleri` (kişi) ve ik `kisininFazlaMesaisi` (onaylı), izin ik `izinliKisiler`.
  Katılım süresi kullanılmaz.
  Operatör Özetim aynı yardımcıyı çağırır (Arkon yazarı, #1322).
- Sözleşme: kişi satırında ve istatistik kişi satırında `emekVerimi`. Kayda yazılmaz; istatistikte okuma anında dönemin mesaisiyle hesaplanır (tablo değişmez).
- Ekran: kişi satırında "emek verimi" notu (yalnız kişi kırılımını gören yönetici).

## Özetim emek verimi (kart #1324)
- `operator-ozeti` cevabına `emekVerimi` ({ oran, standartSn, mesaiSn }) eklendi; hesap Anomali ile ortak `emekVerimleri` (dönem başından bugüne, şimdiye kadar). Mesai bilinmiyorsa oran boş.
- Yalnız kişinin kendisi; ekip ortalaması yok (koordinatör notu: Özetim karşılaştırma değil teşvik sayfası). Ekranda beşinci gösterge "Emek verimim".

## Yerel dosya yükleme kalktı (Terminal kural 2/5)
- Hazırlık ve Çizim stüdyosunda dosya seçici, sürükle-bırak ve örnek dosya düğmeleri kalktı (kalktı: Terminal kural 2/5); pakete dosya yalnız Çizim Merkezi'nden eklenir, boş alanda "Dosyalar TMI belge merkezinden eklenir" yazar. Stüdyodaki kayıtlı çizimler ve paketteki dosyalar okunur kalır.
- `/arkon/dosyalar/:ozet/parca` ucu kalır: iç eşitleme (16 KB üstü ikili, 3B türev verisi dahil) ve .arkon içe aktarma onu kullanır. Kişi sınırı aşılınca en eski yüklemeyi atan kod kalktı: yeni parça 429 alır, hiçbir yükleme kendiliğinden silinmez.
- Reddedilen belge yazımı (`store.ts`) kayda düşer ve ekranda "Kayıt sunucuya yazılmadı" iletisi çıkar.

## Ekip çağrısı: ayarcı ve TMI bildirimi (298)
- Çağrı ekranına beşinci ekip "Ayarcı" eklendi (prototip değişikliği onaylı, 298 b); tek kalan düğme satırı doldurur.
- Operatörün açtığı çağrı (calls, phase `open`) aynı işlemde TMI bildirim merkezine gider: `bildirim/disari.ts ekipCagrisiBildir`, alıcıyı Sistem Ayarları'ndaki ekip eşlemesi seçer, çağıran almaz. Kabul, yükseltme ve kapatma yeni bildirim açmaz; aynı kayıt (cid) yinelenirse kayıt yazılmadığı için bildirim de yinelenmez.
- Kural `kurallar.ts cagriBildirimi` (tanınmayan ekip, yersiz ya da kimliksiz çağrı bildirilmez); yer makine kodu, yoksa istasyon kodu.
