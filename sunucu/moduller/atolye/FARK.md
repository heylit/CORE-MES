# FARK: atolye

Modül yeni: depoda `atolye` yoktu (DOĞRULANDI: taban 426c374'te `sunucu/moduller/atolye` ve `istemci/src/moduller/atolye` yok). Bütün dosyalar yeni; var olan hiçbir dosya değişmedi (çekirdek ve ortak değişiklik istekleri CEKIRDEK-ISTEKLERI.md'de).
Toplam 60 dosya, 14939 satır (DOĞRULANDI: `git diff --shortstat main..atolye`).

## Eklenen dosyalar

### Sözleşme ve göç
| Dosya | Görev |
|---|---|
| `paylasilan/sozlesme/atolye.ts` | Gövde, sorgu ve cevap şemaları (zod), sabitler (raf/alan türleri, sınırlar, kod desenleri), ihlal ve sürüm çakışması ayrıntısı |
| `sunucu/gocler/20261008134000_atolye_kroki.sql` | Kroki: `atolye_kroki` (salon başına tek PDF; boy, parça sayısı, özet, sayfa, hizalama ölçek/dönüş/konum, tamam, sürüm) ve `atolye_kroki_parca` (bytea ≤ 512 KiB); tetikleyiciler: parça yalnız yüklenirken, tamamlamada parça sayısı, boy, özet ve `%PDF-` imzası, tamamlanmış dosya değişmez, sürüm sırası; kısıt: hizalama ya hep boş ya hep dolu, yalnız tamamlanmış krokide |
| `sunucu/gocler/20261008120000_atolye_goz_kalemi.sql` | Göz kalemi: `atolye_goz_kalemi` (göz, kod eşleme anahtarı, kod, ad, doluluk %1–100, kaydeden); göz başına kod tek; ertelenmiş kısıt tetikleyicisi `atolye_goz_dolulugu` (gözün toplamı %100'ü aşmaz) |
| `sunucu/gocler/20261008103000_atolye_kalem_gorunumu.sql` | Parça modeli tablosu kalem görünümüne genişler (yeniden adlandırma, satırlar korunur): model isteğe bağlı, ambalaj, rafta gösterim; kısıtlar `atolye_kalem_gorunumu_model`, `_bos`, `_ambalaj`, `_rafta`, tetikleyici `_tamam` |
| `sunucu/gocler/20261007203000_atolye_parca_modeli.sql` | İşlenen parça modeli: `atolye_parca_modeli` (parça no eşleme anahtarı, model, kaydeden); tetikleyici: yalnız tamamlanmış model |
| `sunucu/gocler/20261007141500_atolye_model.sql` | 3B model kütüphanesi: `atolye_model`, `atolye_model_parca` (bytea parçalar), `atolye_istasyon_yeri.model_id`; tetikleyiciler: parça sırası ve tamamlanmış dosyanın değişmezliği, tamamlamada parça sayısı, boy ve özet denetimi, sürüm sırası, istasyona yalnız tamamlanmış model |
| `sunucu/gocler/20261007112500_atolye_yerlesim.sql` | Tablolar: `atolye_salon`, `atolye_istasyon_yeri`, `atolye_raf`, `atolye_goz`, `atolye_alan`, `atolye_duvar`; CHECK kısıtları; `atolye_salonda` işlevi; ertelenmiş kısıt tetikleyicileri (salon içinde kalma, göz rafta), silinmezlik (raf, salon), sürüm sırası |

### Sunucu (`sunucu/moduller/atolye/`)
| Dosya | Görev |
|---|---|
| `kurallar.ts` | Saf kurallar: yuvarlama, ızgara/hücre adı, döndürülmüş ayak izi (SAT), salon içinde kalma, çakışma, oda duvarı ve kapı, yerleşim denetimi (ihlal/uyarı), sürüm, göz adresi, arama sıralaması, rota (A*, ulaşılabilir hedef, görüş hattı ile yumuşatma) |
| `sorgular.ts` | Bütün SQL: salon, istasyon yeri (upsert), raf, göz eşitleme ve sayfalama, alan, duvar, arama |
| `servis.ts` | Uç işleyicileri: salon listesi/okuma, salon ekleme, yerleşim kaydı (kilit, sürüm 409, kural 422, yazım), göz sayfası, arama, rota; model listesi, yükleme başlat, parça yaz, tamamla, ayarla, sil, parça oku; kalem görünümü listesi, yazma, silme |
| `uclar.ts` | `uc({...})` tanımları: 8 GET (oturum), 9 POST (`atolye.yaz`) |
| `disari.ts` | Boş (`export {}`); bugün kullanan yok |
| `kurallar.test.ts` | Saf testler (22) |
| `atolye.test.ts` | Gerçek PostgreSQL akış ve yetki testleri (20) |
| `NOTLAR.md` | Koddan okunamayan kararlar ve tuzaklar |

### İstemci (`istemci/src/moduller/atolye/`)
| Dosya | Görev |
|---|---|
| `rotalar.tsx` | `/atolye` sayfası |
| `anahtarlar.ts`, `veri.ts` | react-query anahtarları ve okuma kancaları (salon, yerleşim, arama, göz, rota, canlı durum 15 sn) |
| `kurallar.ts` | Gösterim yardımcıları: ölçü/sayı metni, istasyon görünümü ve sahne bilgisi (sayaç, emir, duruş nedeni), özet, ilerleme, tür adları |
| `AtolyeHaritasi.tsx` | Ana ekran: salon seçimi, özet sayılar, arama, araç çubuğu, lejant, sahne, öğe kartı, kuyruk listesi |
| `Sahne3B.tsx` | WebGL varsa 3B sahne (tembel yüklenir), yoksa 2B plan; yürüyüş çubuğu ve dokunmatik kol |
| `sahne/motor.ts` | three.js sahnesi: ışık ve ortam yansıması, bina, istasyon başına birleştirme, andon, makine ekranı, etiket, seçim, akan rota şeridi, yürüyüş ve çarpışma, tema, temizlik |
| `sahne/nesneler.ts` | Malzemeler, geometri önbelleği, istasyon gövdeleri (işleme merkezi, 5 eksen, torna, lazer, CMM, montaj tezgâhı, boya kabini, depo), raflar, palet, duvar, kolon, dokular |
| `sahne/zemin.ts` | Zemin dokusu (beton, derz, boyalı yol/bölge/oda/makine ve raf sınırı, yağ lekesi) ve hücre ızgarası dokusu |
| `sahne/geometri.ts`, `sahne/renkler.ts` | Yerleşimden çizim ölçüsü, oda kapısı; renklerin tasarım değişkenlerinden okunması |
| `OgeKarti.tsx` | Seçilen istasyon / raf (sayfalı göz tablosu) / alan kartı; yakınlaş, girişten yol |
| `SalonPenceresi.tsx` | Salon ekleme penceresi |
| `YerlesimDuzenleyici.tsx`, `duzenleyici-durumu.ts`, `PlanCizimi.tsx`, `OzellikPaneli.tsx` | Tam ekran yerleşim düzenleyici: palet, sürükle/döndür/duvar ucu, geri al/yinele, kaydet; 422 ihlal listesi ve öğe işareti, 409 çakışma penceresi, uyarı bildirimi |
| `ModelKutuphanesi.tsx`, `ModelOnizleme.tsx` | 3B model kütüphanesi (yan pencere): dosya seçimi, tarayıcıda çeviri, önizleme ve gerçek ölçü, ayar (ad, birim, yukarı eksen, dönüş, sığdır), yükleme ilerlemesi, liste, ayar kaydı, silme |
| `model-dosyasi.ts` | Saf yardımcılar: biçim ve varsayılan ayar, parçalama, base64, SHA-256 (güvensiz bağlam için yazılım sürümü) |
| `sahne/model-cevir.ts`, `sahne/step-isci.ts`, `sahne/occt-import-js.d.ts` | STEP (ayrı iş parçacığında occt-import-js), STL, GLTF → GLB çevirisi; üçgen sayısı |
| `sahne/model.ts` | GLB okuma; birim, yukarı eksen, dönüş, ayak izine sığdırma, tabanı zemine oturtma; işlenen parçanın büyütülmüş, ortalanmış önizlemesi |
| `KalemGorunumu.tsx` | Kalem görünümü formu: rafta paketli (ambalaj seçimi) ya da 3B modeliyle, model seçimi; raf kartında gözden, kütüphanede modelden açılır |
| `KrokiPaneli.tsx`, `KrokiKatmani.tsx`, `kroki.ts`, `sahne/kroki-pdf.ts` | Kroki stüdyosu: PDF yükleme ve sayfa seçimi, görünüm (göster, saydamlık, yapışma), hizalama adımları; planda kroki altlığı (sayfa görüntüsü + vektör çizgiler) ve stüdyo işaretleri (yapışma noktası, kılavuz, çizim önizlemesi, ölçü); saf hesaplar (sayfa noktası ↔ salon metresi, ölçek, eksen, köşe, PDF çizgi çıkarma, yapışma); pdf.js okuyucu (ayrı iş parçacığı) |
| `DepoGorunumu.tsx`, `RafCephesi.tsx`, `GozPaneli.tsx` | Depo sekmesi: raf listesi, raf şeridi, bölmenin önden 2B cephesi (doluluk renkli gözler, baskın kalem kodu); göz paneli: kalemler, doluluk düzeltme, kaldırma, kalem koyma, kalem görünümü |
| `ParcaListesi.tsx` | Parçalar sekmesi: kod başına satır (göz kalemi, görünüm, üretim emri birleşimi), nerede durduğu, hangi makinede üretildiği (emirlerden), 3B model önizlemesi, model kütüphanesi |
| `RafOdagi.tsx` | Bölmeye karşıdan bakış çubuğu (raf, bölme, önceki/sonraki, Depoda, Kapat) ve göz paneli; oklar ve Escape |
| `HaritaAraclari.tsx`, `tam-ekran.ts` | Sahne üstü simge araç sütunu; tam ekran (Fullscreen API + sınıf yedeği, ekran uyanık), otomatik tur |
| `plan-simgeleri.tsx` | Plan simgeleri: her makine cinsi, raf türü, alan türü, duvar, giriş ve model rozeti; planda, palette ve öğe kartında aynı çizim |
| `atolye.css` | Modül stilleri (yalnız tasarım değişkenleri) |
| `kurallar.test.ts`, `AtolyeHaritasi.test.tsx`, `kroki.test.ts` | İstemci testleri (14 + 13 + 10) |
| `model-dosyasi.test.ts`, `sahne/model.test.ts`, `plan-simgeleri.test.ts` | SHA-256 ve base64 Node ile aynı, parçalama; model yerleşimi (birim, eksen, dönüş, sığdırma); her öğenin simgesi var, makine cinsi kararı |
| `sahne/nesneler.test.ts` | Gerçeklik denetimi (26; göz ön yüzünün bölmeyi boşluksuz bölmesi dahil): her istasyon ve raf türü, dolu raflar (her yük biçimi) ve andon kolonu kurulur; havada duran parça ya da ayak izinden taşan parça varsa düşer |

## Sahne yenilemesi (kullanıcı geri bildirimi: görüntü, gerçeklik ve akıcılık prototipin gerisinde)

Neden (DOĞRULANDI: prototip kaynağı ve modül kaynağı karşılaştırıldı):
- Işık birimi: prototip three r128 (eski ışık modeli, nokta ışıkta π çarpanı), modül r186 (fiziksel birim). Aynı 2,3 değeri modülde yaklaşık üç kat sönük düşüyordu. Güneş ve gök ışığı π ile çarpıldı; pozlama 0,82.
- Renk uzayı: prototipte malzeme renkleri doğrusal sayılıyordu (r128 davranışı). Modül aynı tonu vermek için 3B malzeme değişkenlerini doğrusal okur (`renkler.ts`).
- Koyu temada zemin ve makine koyulaşıyordu; prototipte nesne rengi temadan bağımsız. 3B malzeme değişkenleri temasız yapıldı (CEKIRDEK-ISTEKLERI 5); tema değişince sahne yeniden kurulmaz, yalnız arka plan değişir.
- Gövdeler kutuydu. Prototipin yordamsal gövdeleri taşındı: içi boş kabin, cam kapı kanatları, iç aydınlatma, iş mili kafası, talaş konveyörü, soğutma tankı, kumanda paneli; torna aynası; lazer portalı ve kıvılcım; CMM köprüsü ve probu; montaj tezgâhı panosu; boya kabini aspiratörü.
- Zemin işaretleri ayrı saydam düzlemlerdi; prototipteki gibi tek zemin dokusuna boyandı (yol çizgisi, ok, lastik izi, bölge taraması ve adı, oda adı, kapı önü yaya geçidi, makine ve raf sınırı, yağ lekesi). Izgara etiketleri DOM yerine zemin dokusunda.
- Bina: sac duvar dokusu (nervür, kaide, seksiyonel kapı girişe en yakın duvarda), pencere bandı, I profil kolon, yangın tüpü, çatı makası ve sarkıt lamba (kuşbakışında gizlenir), kapı önünde çarpma direği.
- Canlılık: andon ışığında hale, makine ekranında durum bandı, emir, parça, sağlam sayaç ve ilerleme (yalnız değişince çizilir), duraklatılan makinede kapı açılır, rota şeridinde akan oklar, kamera uçuşu üstel yumuşatma, yürüyüşte geniş görüş açısı.
- Akıcılık: etiketler yalnız kamera ya da boyut değişince yerleşir (her karede DOM yazımı yok), boyut her karede okunmaz, istasyon gövdeleri kendi içinde birleşir (çizim çağrısı az), bina ve çatı gölge düşürmez.

Taşınmayanlar (bilerek): gerçek makine modelleri depoya girmez (çizim verisi; kırmızı çizgi; sonradan kullanıcı kararıyla veritabanına yüklenir, aşağıda), parça modeli ve etiketteki parça küçük resmi (müşteri parça geometrisi), raf ve paletteki stok yükü (stok modülü yok; uydurma veri olur), AMR (rota ve araç verisi yok), torna G kodu benzetimi, iş mili yükü ve çevrim yüzdesi (makine bağlantısı yok).
VARSAYIM: talaşlı istasyonda gövde biçimi istasyon adından seçilir ("torna" geçiyorsa torna, "5 eksen" geçiyorsa beşikli tabla, yoksa dik işleme merkezi). Yalnız görünümdür; geri alma maliyeti düşük.

## Gerçeklik ve gezinme turu (kullanıcı geri bildirimi: raf kolları bağlı değil, gezinme zor)

Yöntem: her istasyon tipi (dik işleme, 5 eksen, torna, lazer iki ölçüde, CMM, montaj, boya, depo) ve her raf türü kurulup her parçanın zemine ya da zemine bağlı bir parçaya değip değmediği, ayak izinden taşıp taşmadığı ölçüldü (`sahne/nesneler.test.ts`). İlk koşuda 11 durumda kopuk parça çıktı (DOĞRULANDI); hepsi düzeltildi, test 15/15.
- Palet rafı: yan çerçeve çaprazları dikmelere ulaşmıyordu; çapraz boyu ve açısı dikmeden dikmeye hesaplanır, alt ve üst yatay bağ, ayak plakası eklendi.
- Konsol raf: kollar kolonun ön yüzünden başlar, uçta tutucu; kolonlar arkada yatay ve çapraz bağla bağlı; ayak ayak izi içinde.
- İşleme merkezi: iş mili kafası kolona yaslı (havadaydı), kolon iç tabana oturur; kumanda paneli makine yan duvarından kol ve boruyla taşınır; talaş konveyörü ve arabası yerde.
- Torna: fener mili gövdesi, ayna, eğik kızak gövdesi ve taret birbirine bağlı (hepsi havadaydı); kapı ve panel gövdeye değer.
- Lazer: kesim tablası gövdeye oturur, portal iki yan raya biner; kumanda yerden ayaklı.
- CMM ve depo: ekran ayağı; andon köprü kirişinin üstünde. Boya kabini: panel ön yüzde, andon tavanda.
- Bina: kesit görünüm tutarlı hale getirildi. Genel bakışta çatı yoktur (önceden makas ucu havada kalıyordu); yürüyüşte ön ve sağ duvar, ön ve sağ kolonlar, uçtan uca makas, mahya, aşık, tavan ve aşıktan sarkan lambalar açılır. Köşe kolonu duvarın içinde, sol duvarda da kolon, yangın tüpü kolon flanşına asılı.

Gezinme:
- Klavye (haritaya dokunulduktan sonra; yazı alanında ve açık pencerede çalışmaz): oklar ve WASD kaydırır, Q/E döndürür, + / − ve PageUp/PageDown yaklaştırır, Shift hızlandırır, Home tüm atölyeye döner. Yürüyüşte oklar yürür ve döner (artık önce sahneye tıklamak gerekmez).
- Çift tık (dokunmatikte çift dokunuş) makineye, rafa ya da alana götürür; kamera bakış yönünü korur. Yürüyüşte çift tık oraya yürütür; gidilen yol yeşil şerit ve varış halkasıyla görünür.
- Fare: sağ tuş ve iki parmak zemin düzleminde kaydırır, tekerlek imlecin olduğu yere yaklaşır, kamera salonun dışına kaçmaz.
- Çakışan etiketler üst üste binmez (seçili ve istasyon önceliklidir); sahnenin sol altında kısayol ipucu.

## 3B model kütüphanesi ve plan simgeleri (kullanıcı isteği: "2B'de her şeyin ikonu olsun, 3B gerçek modeller yükleyebilelim")

Kullanıcı kararları (soru kartıyla): dosya şirket sunucusunda veritabanında; STEP doğrudan yüklenir (occt-import-js bağımlılığı onaylı); modeller kütüphanede, istasyona seçilerek atanır; yükleme ve atama `atolye.yaz`.
- Yükleme: STEP, STL, GLTF tarayıcıda GLB'ye çevrilir (STEP ayrı iş parçacığında, üçgenleme ayrıntısı seçilir: ince, orta, kaba); yalnız GLB gider. Önizleme modelin gerçek ölçüsünü gösterir; birim (mm, cm, m), yukarı eksen (Y, Z), dönüş ve "ayak izine sığdır" ayarlanır. Dosya 512 KiB parçalarla gönderilir, sunucu tamamlarken sayıyı, boyu, GLB başlığını ve SHA-256 özetini denetler (ATL-25); yarıda kalan yükleme silinir.
- Kütüphane: liste (ad, kaynak, boy, üçgen, kullanım, durum), seçilince önizleme, ayar kaydı (sürüm, 409), silme (kullanılan model silinmez, ATL-27).
- Atama: düzenleyicide istasyon seçilir, "3B model" listesinden model seçilir, yerleşimle kaydedilir (ATL-24). Sahnede model istasyon gövdesinin yerine çizilir, ayak izine sığar, tabanı zemine oturur; andon hücre köşesinde zemine oturan kolonda; seçim kutusu ve etiket model yüksekliğine göre. Model inemezse bildirim çıkar, tipten çizilen gövde kalır. Model dosyası oturum boyunca bellekte tutulur (aynı model birden çok istasyonda tek iner).
- Plan simgeleri: her makine cinsi (dik işleme, 5 eksen, torna, lazer, CMM, montaj, boya, depo), raf türü, alan türü, duvar, cam bölme, giriş ve atanmış model rozeti için kuşbakışı çizim; aynı çizim planda, düzenleyici paletinde ve öğe kartında. Bölge adı ve simgesi köşede (ortadaki istasyon ya da paletin altında kalmaz); sığ istasyonda simge solda; uzun ad kutuya sığacak kadar kısaltılır. Makine cinsi 3B gövdeyle aynı kararla seçilir (`makineCinsi`).
- Deneme: önizlemede uydurma robot modeli (tarayıcıda üretilir) montaj istasyonuna atanmış gelir; occt-import-js paketinin kendi deneme STEP dosyası (CAx-IF montajı) yüklendi, çevrildi, kütüphaneye girdi, istasyona atandı ve sahnede göründü (DOĞRULANDI: önizlemede, tarayıcı içi sahte sunucuyla; gerçek sunucu ve veritabanı yolu `atolye.test.ts` ile). Kullanıcının parça dosyası denemede kullanılmadı.

## İşlenen parça önizlemesi (kullanıcı: "işlenen malzeme makinenin üstünde önizleme olarak dönüyordu")

Prototipte makinenin üstünde işlenen parçanın büyütülmüş modeli dönüyordu (DOĞRULANDI: prototip `engine.js`, `holo`: makine üstü + 0,9 m, 1,2 m kenar, saniyede 0,5 rad, çalışmayan makinede yarı saydam, "Parçalar" düğmesi ya da seçimle görünür, görünürken etiket parçanın üstüne çıkar). Prototipteki parça ağları gerçek parça geometrisiydi; depoya girmez. Burada parça modeli kütüphaneden gelir:
- Model kütüphanesinde seçilen modelin kartında "İşlenen parça olarak" bölümü: parça no yazılıp model bağlanır, bağ kaldırılır (`atolye.yaz`). Parça no üretim emrindeki serbest metinle boşluk ve büyük/küçük harf ayırmadan eşleşir (Türkçe büyük harf; `parcaAnahtari`, sunucu ve istemci aynı işlev). Bir parça numarasının tek modeli vardır; başka modele bağlamak eskisinin yerine geçer (ATL-28). Parçaya bağlı model silinmez (ATL-27 genişledi).
- Sahnede: başlamış emrin parça nosu bir modele bağlıysa model makinenin üstünde döner (kenar 1,5 m, lazerde 1,8 m; altında ışık halkası). Araç çubuğunda "İşlenen parçalar" düğmesi (yalnız eşleşen parça varsa görünür) hepsini açar; kapalıyken yalnız seçili makinede görünür. Çalışmayan makinedeki parça soluk; hareket azaltma tercihinde dönmez. Görünürken etiket parçanın üstüne çıkar; çift tıkla gidişte çerçeve parçayı da kapsar. Öğe kartında "Parça modeli" satırı.
- Önizlemede uydurma flanş (CNC-01, CNC-02), gövde (CNC-04, duran makine, soluk) ve sac (LAZ-01) tarayıcıda üretilir; gerçek parça yok.
- Etiketteki parça küçük resmi (prototipte vardı) bu turda yok.

## Depoda yük ve depoda gezinme (kullanıcı: "depoya örnek malzeme koy, depoda gezelim")

- Raf yükü çizimi: palet rafında her gözde palet ve üstünde yük (koli katmanları dolulukla, ahşap sandık, sac yığını, çubuk demeti); küçük parça rafında önü alçak plastik kutu ve içindeki parça; konsolda kollara binen profil/boru demeti; sac alanında takozlara oturan levha yığını. Her yük rafa ya da zemine oturur, raftan taşmaz (gerçeklik testi, her raf türü dolu: `nesneler.test.ts`). Yük ayrı grupta, raf başına birleşir; stok değişince yalnız o raf yeniden çizilir, sahne kurulmaz. Aynı göz her açılışta aynı görünür (rastgele değil).
- Veri: stok modülü yok. İstemci göz özetini stok modülünün ucundan okur (`GET /stok/goz-ozetleri`, BASKA-MODUL-ISTEKLERI 5) ve yalnız `stok.oku` işlemi varsa sorar (bugün tanımlı değil); istek gitmez, raflar boş. Raf kartındaki göz tablosuna stok varsa "İçerik" sütunu gelir. (Sonraki turda göz kalemleriyle değişti; aşağıda.)
- Depoda gezinme: "Depoya git" artık rafların en kalabalık kümesine gider (önceden bütün rafların ortalaması, raflar salona dağılınca boş bir noktaydı); yürüyüşteyken düğme depoya yürütür. Yürüyüşte 14 m'den uzak etiketler gizlenir (göz hizasında salonun bütün etiketleri üst üste biniyordu).
- Önizleme: salon 52 m'ye genişletildi, sağ uçta ana depo (dört palet rafı sırası, sırt sırta küçük parça rafları, boru konsolu, sac alanı, depo koridorları, ara duvar); giriş deponun yanına alındı. Gözlerin yaklaşık %80'i uydurma stokla dolu. Bunlar yalnız önizleme verisidir.

## Depoda malzeme modeli ve ambalajı; arayüz ve tam ekran (kullanıcı: "malzemeler için 3B yükleyebilelim, paketini seçebilelim, paketli ya da parçanın 3B'siyle rafta görelim"; "yerleşim ve kullanım zayıf, tam ekran modu olsun")

Kalem görünümü (ATL-28 genişledi):
- Parça modeli kalem görünümü oldu: bir kod (parça no ya da malzeme kodu) için model (isteğe bağlı), ambalaj (otomatik, koli, ahşap kasa, plastik kutu, demet, levha yığını) ve rafta gösterim (paketli ya da parçanın 3B modeliyle). Aynı model makinede işlenirken üstünde döner. Göç tabloyu yeniden adlandırır, satır kaybı yok; tablo düşürülmez.
- Rafta "3B modeliyle": model gerçek ölçüsüyle gözün bölgesine ızgara gibi dizilir (palet rafında paletin üstüne, küçük parça rafında rafa, konsolda kollara, sac alanında takozlara); bölgeye sığmayan model küçültülür; adet gözün doluluğundan, göz başına en çok 48. Her ağ tek InstancedMesh (yüz kopya tek çizim çağrısı).
- Seçim: raf kartındaki göz tablosunda bir göze dokununca içindeki kalemin görünüm formu açılır (stok verisi varsa). Model kütüphanesinde modelin kartında "Parça ve malzeme olarak": bağlı kodlar ve yeni bağ.
- Stok göz özetine `malzemeKodu` alanı istendi (BASKA-MODUL-ISTEKLERI 5).

Arayüz:
- Özet artık sayılı çip şeridi (renkli nokta lejant da olur; ayrı lejant kaldırıldı). Arama sahnenin sol üstünde, araçlar sağ kenarda simge sütunu (görünüm, katmanlar, depoya git, düzenle, tam ekran; adlar ipucunda ve ekran okuyucuda). Sahne ekran yüksekliğinin %70'i, istasyon listesi aynı boyda. İki satır büyük düğme ve ayrı arama satırı kalktı.
- Tam ekran (atölye ekranı): harita bütün ekranı kaplar; başlıkta salon, canlı rozeti ve saat; istasyon listesi açılır kapanır (dar ekranda sahnenin üstünde çekmece). Otomatik tur: duran, duraklatılan, çalışan, bekleyen sırasıyla 12 saniyede bir istasyona gider ve kartını açar. Ekranın kararmaması istenir (destekleyen tarayıcıda). Tarayıcı tam ekrana izin vermezse yalnız sınıf uygulanır; Escape iki durumda da çıkar. Düzenleyici açılınca tam ekrandan çıkılır.
- İstasyon listesinden seçim kamerayı istasyona götürür (çift tıkla aynı).
- Önizleme: depodaki uydurma kalemlerin bir kısmı modeliyle (kapak flanşı, döküm gövde, M10 somun), bir kısmı seçilen ambalajla (rulman ahşap kasada) görünür.

## Kroki stüdyosu (kullanıcı: "gerçek 2B kroki üzerinde, gerçek ölçülerde yerleştirme"; "pdf var, kolay ve pratik bir düzenleme stüdyosu olursa altındaki şablona göre yerleştiririz")

Kullanıcı kararları: PDF doğrudan yüklenir (`pdfjs-dist` bağımlılığı onaylandı); PDF'in vektör mü taranmış mı olduğu bilinmiyor, stüdyo ikisini de karşılar.

Veri (ATL-30): salon başına tek kroki (PDF), modeller gibi 512 KiB parçalarla şirket veritabanında; yeni yükleme eskisinin yerine geçer. Hizalama (ölçek metre/punto, dönüş, konum) PDF sayfa noktasını salon metresine çevirir; yalnız tamamlanmış krokiye, sürümle yazılır (eski sürüm 409). Uçlar `/atolye/salonlar/:id/kroki` altında.

Düzenleyicide:
- "Kroki" paneli: PDF seç (çok sayfalıysa sayfa), yükle; göster, saydamlık, "çizgilere yapış"; değiştir, kaldır.
- Kroki planın altında gerçek ölçüyle: sayfa görüntüsü (uzun kenar en çok 4096 px) ve üstünde vektör çizgiler (yakınlaşınca keskin; 60 000 parçadan fazlaysa yalnız görüntü).
- Hizalama dört adım, her biri tıklamayla ve hemen saklanır: 1 Ölçek (ölçüsü bilinen iki nokta, gerçek uzunluk girilir; ilk nokta yerinde kalır), 2 Yön (bir duvarın iki ucu; duvar en yakın eksene en küçük açıyla oturur), 3 Köşe (salonun sol üst iç köşesi), 4 Salon ölçüsü (sağ alt iç köşe; yerleşim taslağına yazılır, "Kaydet" ile saklanır). Ayrıca 90° döndür ve sürükle. Hizalanmamış kroki geçici olarak salona sığdırılır.
- Çizerek ekleme: paletten öğe (raf, bölge, oda, duvar, istasyon) seçilir, krokide köşeden köşeye sürüklenir; ölçü ve yer çizimden. Raf uzun kenarı boyunca yatar (dikeyse 90°), bölme sayısı türün olağan bölme genişliğinden. Raf ve bölge art arda çizilebilir; istasyon bir kez.
- Yapışma: çizim ve ölçü noktası önce çizgi ucuna, yoksa dikey/yatay çizgiye (10 piksel); sürüklenen öğenin kenarı yakındaki paralel çizgiye kayar (ızgaranın önüne geçer), duvar uçları uçlara yapışır. Kılavuz çizgisi ve canlı ölçü gösterilir.
- "Ölç" aracı: iki nokta arası uzunluk, Δx ve Δz.
- Dar ekranda adım başlayınca panel kapanır, adım araç çubuğundan sürer. Escape aracı bırakır.

Doğrulanan (önizleme, 1440 px, uydurma vektör PDF 1:150): ölçek adımı 1:150 verdi, köşe adımından sonra kroki konumu (-5,080; -7,937) m, krokideki CNC-06 sınırına çizilen istasyon 4,00 × 3,50 m ve (16,00; 16,60) m, iki kolon arası 6,50 m. Çizgi çıkarma gerçek pdf.js 6.3 çıktısıyla Node'da denendi. 390 px'te yatay taşma yok.

## Depo, parçalar ve bölmeye karşıdan bakış (kullanıcı: "depodaki parçalar, depo rafları, bunları düzenlediğimiz gördüğümüz bir yer yok, 3B parça ekleyebildiğimiz, hangi makinede hangi parça üretiliyor"; "bir depo raf bölmesini tam karşımıza alıp sayfaya sığdıralım, raflara tıklayarak gezelim, 3B'deki kısımları soyutlayıp tek o raf kısmında çalışıyormuşuz gibi")

Kullanıcı kararları: göz içeriği atölyede "göz ataması + doluluk" (adet ve hareket stok modülünün); makine-parça ilişkisi üretim emirlerinden türetilir, yeni tablo yok.

Veri (ATL-29):
- Yeni tablo `atolye_goz_kalemi`: hangi kalem (parça no, malzeme kodu) hangi gözde, gözün yüzde kaçını dolduruyor. Göz başına kod tek (eşleme kalem görünümüyle aynı: boşluk ve büyük/küçük harf ayırmaz). Gözün toplamı %100'ü aşmaz: servis 422 ve kalan yeri söyler; veritabanı ertelenmiş tetikleyiciyle de reddeder. Pasif rafa kalem konmaz. Kalem konmuş göz raf küçülünce silinmez (ATL-12, 409).
- Uçlar: `GET /atolye/goz-kalemleri?salonId`, `POST /atolye/goz-kalemleri/yaz` (aynı gözde aynı kod güncellenir), `POST /atolye/goz-kalemleri/sil`; göz listesi `?bolme=` ile süzülür.
- Stok modülünü bekleyen yer tutucu (`/stok/goz-ozetleri`, `stok.oku`) kaldırıldı; raflardaki yük artık göz kalemlerinden: gözü en çok dolduran kalemin görünümü (3B modeli ya da ambalajı), yoksa raf türünün olağan yükü; doluluk gözün toplamı.

Ekran:
- Sayfada üç sekme: Harita, Depo, Parçalar (tam ekranda yalnız harita).
- Depo: raf listesi (dolu göz sayısıyla), raf şeridi (bütün bölmeler küçük, doluluk renkli; basınca bölme seçilir), seçili bölmenin önden cephesi (katlar ve gözler; doluluk kademesi boş, %1-60, %61-90, %91-100; baskın kalem kodu ve +n), göze basınca göz paneli: kalemler, doluluk düzeltme, kaldırma, "Kalem koy" (kod, ad, doluluk; boş yer kadar), her kalemin rafta görünümü (paketli ya da 3B modeliyle). "3B karşıdan bak" aynı bölmeyi sahnede açar.
- Parçalar: kod başına satır (göze konmuş, görünümü olan ya da üretim emri olan her kod); ad, rafta görünüm, gözler ve doluluk, makine (süren emir yeşil; yoksa son makineler). Satır seçilince: depodaki gözler ("Rafta göster" depo sekmesinde o gözü açar), üretildiği makineler (emir sayısı, son tarih; "Haritada" kamerayı makineye götürür), 3B model önizlemesi ve görünüm formu. "3B modeller" model kütüphanesini açar (yükleme dahil); "Görünüm ekle" koda model ya da ambalaj bağlar.
- İstasyon kartı: "Bu makinede üretilen parçalar" (emirlerden; süren önce).
- Raf kartı: göz tablosunda İçerik sütunu göz kalemlerinden; göze basınca aynı göz paneli; "Bölmeye karşıdan bak", "Depoda düzenle".
- Bölmeye karşıdan bakış: sahne salonu gizler, yalnız seçili rafı yükleriyle çizer; kamera bölmenin tam önünde, dar açıyla (14°, bozulmasız) bakar ve bölmeyi çubuğun ve panelin örtmediği alana sığdırır (komşu bölmelerden biraz görünür). Gözler tıklanır (komşu bölmenin gözü o bölmeye geçer); göz etiketi baskın kalem ve doluluk, gözün ekrandaki eninden taşmaz; seçili göz çerçeve ve dolguyla vurgulanır. ‹ › ve ← → bölme değiştirir (son bölmeden sonraki rafa geçer), raf seçimi çubukta, Escape önce gözü sonra bakışı kapatır; çıkınca kamera eski yerine döner. WebGL yoksa aynı bakış 2B cepheyle.

Düzeltilen:
- Rota çizimi raf yüklerini siliyordu ("Girişten yol" sonrası raflar boş kalıyordu); yük grubu artık temizlenmez.
- Harita başka sekmenin arkasında gizlenince çizici 1x1'e küçülüyor ve çizim sürüyordu; geri dönünce yazılım GL'de sayfa donuyordu (DOĞRULANDI: önizlemede donma, düzeltmeden sonra yok). Gizliyken çizim durur, ölçü korunur. Gerçek ekran kartında aynı donmanın olup olmadığı BİLMİYORUM.

## Fabrika bölümleri (kullanıcı: "salonları hepsini tek bir sistemde düzenleyemiyoruz, salonu fabrika bölümleri yapalım; 3B haritada tüm salonları birlikte, istersek ayrı ayrı görelim; düzenlerken tek tek de toplu da")

Kullanıcı kararları: tek fabrika koordinatı (her bölüm fabrika planında sol üst köşesi ve dönüşüyle durur); kroki hem fabrika için hem bölüm için olabilir, aynı koordinatta üst üste.

Veri:
- Göç `20261008141000_atolye_fabrika_konumu.sql`: `atolye_salon`'a `fabrika_x`, `fabrika_z`, `fabrika_donus` (kısıtlı); var olan bölümler kod sırasıyla 5 m arayla yan yana dizilir.
- Göç `20261008141100_atolye_kroki_kapsami.sql`: `atolye_kroki` boşluk denetimiyle yeniden kuruldu; `salon_id` boş olabilir (boş = fabrika krokisi), kapsam başına tek kroki (`UNIQUE NULLS NOT DISTINCT`).
- ATL-31: bölümler fabrika planında üst üste binmez (kenar değebilir). ATL-32: istasyon ve raf kayıtta tek bölümde; raf bölüm değiştirebilir, silinmez.
- Uçlar: `GET /atolye/fabrika`, `POST /atolye/fabrika/kaydet` (bütün bölümler tek transaction'da, her bölüm kendi sürümüyle), `/atolye/fabrika/kroki` altında kroki uçları. Yeni bölüm öbürlerinin sağına konur.

Harita:
- "Bölüm" seçici: Tüm fabrika (birden çok bölümde varsayılan) ya da tek bölüm. Fabrikada bütün bölümler yerinde ve dönüşüyle, aralarında saha; bölüm adı etiketine basınca o bölüm açılır.
- Liste, özet, arama, depo sekmesi ve göz kalemleri görünen bütün bölümlerden; depo listesinde rafın bölüm kodu. Kart, rota ve yakınlaşma öğenin kendi bölümünde.
- Yürüyüş yalnız tek bölüm görünümünde (bölümler arası yol yok). WebGL yoksa fabrika planı 2B.

Düzenleyici:
- Tek bölüm (eski akış) ya da "Fabrika planını düzenle": bütün bölümler tek taslakta, geri al/yinele hepsinde.
- Bölüm başlığından sürüklenir; zeminine basınca seçilir. Özellik panelinde kod, ad, ölçü, hücre, X, Z, dönüş; taşınınca ve dönünce içindekiler birlikte gider. 90°/açı adımı düğmesi bölümü ortası çevresinde döndürür.
- Makine, raf, alan, duvar bölümden bölüme sürüklenir; kayıtta ortasının düştüğü bölüme yazılır. Hiçbir bölümün içinde olmayan öğe kaydı durdurur ve işaretlenir. Sunucu bulguları (`salon:<id>/...`, `bolum:<id>`) öğeye ve bölüme eşlenir.
- Kroki: fabrikada fabrika krokisi; 3. adım "Bölüm köşesi" seçili bölümü krokideki köşesine taşır, 4. adım "Bölüm ölçüsü" ölçüsünü krokiden alır. Öbür kapsamın hizalanmış krokileri altta yalnız görüntü olarak (fabrikada bölüm krokileri, bölümde fabrika krokisi).
- Arayüzde "Salon" yerine "Bölüm".

Doğrulanan (önizleme, uydurma 3 bölüm, biri 90° dönük, 1:250 uydurma vaziyet planı): 1440 ve 390 px 2B'de fabrika görünümü, tek bölüm, bölüm adıyla geçiş; fabrika düzenleyicide bölüm başlıktan 4 m sürüklendi, TOR-03 torna bölümünden ana atölyeye sürüklendi (yerel dönüş 90°), tek komutla kaydedildi, liste güncellendi; 390 px'te yatay taşma yok. 3B: üç bölüm kuruldu (çizici var, 3 bölüm etiketi, 3 giriş etiketi), ekran görüntüsü yazılım GL'de zaman aşımına uğradı; 3B görüntü BİLMİYORUM.

## Optimizasyon ve takılma (kullanıcı: "optimizasyon ve takılma sorunlarını incele")

Yöntem: önizlemeye yalnız ölçüm için sarmalayıcı (depoya girmez): çizici bilgisi (çizim çağrısı, üçgen), motor yöntemlerinin süresi, uzun kareler (Long Animation Frames), CPU profili. Yazılım GL'de (SwiftShader) ölçüldü; ekran kartı süreleri gerçek cihazda farklıdır, sayımlar aynıdır.

Bulunan ve düzeltilen:

| Sorun | Önce | Sonra |
|---|---|---|
| Raftaki parça modeli dizileri (göz başına 48 kopya, gerçek model) üçgenlerin %99,5'i | fabrika 40,8 M üçgen, 1390 çağrı; tek bölüm 25,8 M, 938 | fabrika 151 bin, 629; tek bölüm 98 bin, 410 |
| Zemin dokusunda tek tek toz noktası (bölüm başına ~40 bin çizim), her yeniden kurulumda | yeniden kurulum 778 ms | 285 ms (aynı veri; doku saklı) |
| Boşta da saniyede 60 kare | 60 | 30 (dokunurken tam hız) |

- Raf dizileri: her dizinin vekili (modelin kutusu, kopya başına 12 üçgen, gölgeyi o düşürür) ve gerçek modeli var. Gerçek model, dizi ekranda yeterince büyükse (göz yarıçapı yarım ekranın %15'i) ve 1,5 M üçgen bütçesine kadar (bölme bakışında 3 M) çizilir; ekranda en büyük olan önce. Bölme bakışında altı gözün hepsi gerçek modelle (önizlemede görüldü).
- Zemin tozu tek karo (256 px) yinelenir; zemin ve ızgara dokuları içerik imzasıyla saklanır, görünüm değişince ve kayıttan sonra yeniden çizilmez ve ekran kartına yeniden yüklenmez.
- Kare hızı: son dokunuştan 1,5 sn sonra ve kamera durunca 30 kare. Tam hızda 2 sn ortalaması 28 ms'yi aşarsa piksel oranı 0,25 düşer (en az 0,75), üç ölçüm 18 ms'nin altındaysa geri çıkar.
- Kare döngüsünde her karede dizi ve liste araması kaldırıldı.

Ölçülen, sorun olmayan: boşta 35 sn ve seçimde 50 ms'yi aşan kare yok; kamera uçuşunda kare başına JS 0,6 ms (etiketler 0,36 ms); düzenleyicide sürükleme ortalama 16-20 ms/kare, uzun kare yok (kroki açıkken ~4 ms fazla).

İkinci ölçüm turu (kullanıcı: "ölç"; görünüm değişimi ve makinelerin çizim çağrıları; JS süresi, aynı sanal makinede 6 değişimin ortancası):

| Ölçülen | Önce | Sonra |
|---|---|---|
| Her yeniden kurulumda yeniden derlenen gölgelendirici programı | 12'nin 8'i | 0 |
| Fabrika → bölüm geçişi | ~120 ms | ~45 ms |
| Bölüm → fabrika geçişi | ~285 ms | ~88 ms |

- Ana malzemeler renkler değişmedikçe korunur; eski sahne yenisi bir kez çizildikten sonra atılır (yeni malzeme eski programı bulur). Derleme süresi yazılım GL'de ölçülemez; Windows'ta ANGLE ile program derlemesi bilinen bir takılma kaynağıdır (gerçek kartta süresi BİLMİYORUM).
- Aynı raf, aynı ölçü ve aynı yükle raf yükü yeniden kurulmaz (kutular ve parça dizileri taşınır).
- Son iki kurulumda kullanılan dokular saklanır (duvar, çerçeve, granit de saklanıyor): fabrika ↔ bölüm gidip gelişte öbür bölümlerin zeminleri yeniden çizilmez.
- Denenip geri alınan: birleştirmede indeksli geometriyi indeksli bırakmak (ölçüldü: daha yavaş).
- Doğrulama: art arda geçişlerde dizi, vekil, çizim çağrısı ve üçgen sayısı ilk kurulumla aynı; bölme bakışında altı gözün hepsi gerçek modelle; 2B düzenleyici akışı geçti.

Makinelerin çizim çağrısı ölçüldü, değiştirilmedi: çizilen 585 ağın 391'i istasyonlardan (istasyon başına 16-37; gövde birleşik, ayrı kalanlar hareketli parçalar, andon, ekran). Fabrika görünümünde karenin JS çizim süresi bu sanal makinede 8,7 ms (60 karenin bütçesi 16,7 ms); takılma kaynağı değil. Azaltmak için istasyonlar arası birleştirme gerekir; gerçek model atama ve pasif görünümle çakışır.

Kalan: kayıttan sonra değişen bölümler yeniden kurulur (aynı yol, ~45-90 ms).

## Yazı kalabalığı, tur düğmeleri, rafta parçanın yatışı (kullanıcı: "kuş bakışında yazılar engelliyor; fabrika turunda ilerletme ve geri tuşu olsun; büyük parça versem dik koysa yerleşmez")

- Sahne yazıları: istasyon ve raf yazısı kameradan 32 m'den uzakta yalnız koda iner, raf yazısı 55 m'den uzakta gizlenir; üst üste binen düşük öncelikli yazı gizlenir (yaklaşınca açılır), seçili öğe ve bölüm adı kaydırılır. Araç çubuğunda yazıları gizle/göster (gizliyken seçili öğe ve bölüm adları kalır). Önizlemede fabrika kuş bakışında 36 yazıdan 13'ü görünüyor, 8'i kısa.
- Fabrika turu (tam ekran): sahnenin altında önceki / duraklat / sonraki / bitir ve "2 / 14 · MON-01"; elle adımdan sonra süre baştan başlar.
- Rafta parça modeli: model kendi duruşunda göze sığıyorsa öyle kalır; sığmıyorsa altı eksen duruşundan gerçek ölçüyle sığanlar içinde en alçağı (en geniş yüzü altta) seçilir; hiçbiri sığmıyorsa en az küçülen duruş ve bölme bakışında göz yazısı "sığmıyor" (kırmızı). Önizlemede Ø40 x 1100 mm dik çizilmiş mil palet rafında yatırıldı (gerçek ölçü); Ø48 x 3000 mm boru konsol rafta "sığmıyor".

## Raf net ölçüleri ve titreme (kullanıcı: "raf ölçüleri de girebilelim, bu şekilde gerçek sığma veya sığmama açık olur"; "3B hareket ettirirken yanıp sönmeler var, ışık geçişleri gibi")

- Kullanıcı kararları: "Kat kat net olcu (Onerilen)", konsol için "Kol arasi kalsin".
- Göç `20261009090000_atolye_raf_net_olcu.sql`: `atolye_raf`'a boş geçilebilir `kat_yukseklikleri` (dizi), `goz_genisligi`, `goz_derinligi`; iki kısıt. Kural ATL-33 (sunucu `rafNetOlcuIhlalleri`), sözleşmede üç alan (gövdede varsayılan boş).
- Düzenleyici özellik panelinde "Net ölçüler (isteğe bağlı)": göz net genişliği ve derinliği, her kat için bir kutu (türe göre neyin ölçüleceği yazılı); eksik katta uyarı; kat sayısı değişince kutular uzar/kısalır.
- 3B: net ölçü girilen rafta kiriş, tabla ve kollar ölçülen yüksekliklere konur; rafta parçanın bölgesi ölçülen boşluktur, "sığmıyor" bu ölçüyle hesaplanır. Ölçü girilmeyen raf bugünkü gibi çizilir (testle).
- Önizlemede K3 (torna bölümü, konsol) uydurma net ölçülü: kollar 0,7/0,6/0,6/0,5 m aralıkla; Ø40 mil sığıyor, Ø48 x 3000 boru "sığmıyor" kalıyor; 1,7 m göz eni ATL-33 ile reddedildi.
- Titreme (yanıp sönme) için yapılanlar, gerçek ekran kartında doğrulanmadı (yazılım GL'de görülmüyor): kamera yakın düzlemi 0,2 → 0,5 m (yürüyüşte 0,2; uzakta derinlik çözünürlüğü yaklaşık 2,5 kat iyi), zemin izleri polygon offset ile zeminin önünde, beton döşeme 2 cm aşağı; LOD ayrıntı eşiğinde gecikme payı (yakın/uzak sınırda gidip gelmiyor); uyarlanan piksel oranı yalnız kamera dururken değişir ve düştükten sonra yeniden yükselmez; yazı çakışma kararı kamera hareketliyken dondurulur, durunca 200 ms sonra yeniden hesaplanır.

## Konsoldaki X4122 uyarısı (kullanıcı: "düzeldi ama konsolda şöyle bir hata var")

- Kullanıcı titremenin düzeldiğini bildirdi.
- Uyarı Windows'ta WebGL'in Direct3D'ye çevrilmesinde HLSL derleyicisinden geliyor: three'nin gölge paketleme kodundaki `255. / 256.` (0,996094) gibi sabitler; görüntüye etkisi yok, three bilgi günlüğünü uyarı olarak basıyor.
- `sahne/konsol.ts`: three'nin konsol çıkışı süzülür; yalnız X4122 satırlarından oluşan program günlüğü susar, derleme hatası ve başka uyarılar konsola gider (`konsol.test.ts`). Gölge kapatılmadı, three'nin hata denetimi kapatılmadı.

## Önceki ön paketten (ON-PAKET-TOPLU, atölye bölümü) değişen
- Kapsam: "Canlı Harita'nın tamamı" (kullanıcı seçimi); stok, olay akışı ve makine verisi olmadan (ON-PAKET kapsam tablosu).
- Sayfa grubu: Üretim; başlık "Fabrika Haritası".
- Kurallar ATL-18..23 eklendi (giriş noktası, yürüyüş yolu uyarısı, rota, oda kapısı, duvar, denetim kaydı).
- Önceki soruların önerileri uygulandı: raf ve göz atolyede, göz ayrı satır, tek güncel yerleşim + salon sürümü (VARSAYIM; ON-PAKET varsayımlar).

## Bağımsız denetimden (26 bulgu) düzeltilenler
- Rota: büyük salonda ızgara adımı büyür (500 öğede 6,9 sn → sınırlı; saf test), kapalı hedefte ulaşılan en yakın noktada biter, yumuşatma yürüyüş yolunu korur.
- Eşzamanlı yerleştirme: başka salona yazılmayan istasyon yeri sessiz geçmez, yazılan sayı eksikse 409.
- Göz eşitleme yalnız yeni ya da sayısı değişen rafta (gereksiz silme yok).
- Kaydeden kişi bulunmazsa ad `null` (sözleşmede boş geçilebilir).
- 422 ayrıntısı gövdedeki sıraya göre düzenleyici öğesine eşlenir (kayıt anındaki eşleşme saklanır).
- Başka salondaki arama sonucu seçilince salon değişir ve öğe seçilir; arama 250 ms bekler.
- Düzenleyici: Escape ve açılışta odak; sürüklemede geçmiş sınırı; kayıt uyarıları gösterilir.
- GPU temizliği: önbellek dışı geometri ve malzeme bırakılır, bağlam kaybettirilir.
- İstasyon tipi adları sözleşmedeki `istasyonTipi`'ne bağlandı (`Record`); kullanılmayan göz yardımcıları silindi; zemin raf türü "Sac stok alanı".

Kalan bulgular: ON-PAKET açık soruları (1, 4, 5, 6), CEKIRDEK-ISTEKLERI 7 (token eksikleri), varsayımlar (SVG yazı ölçeği, alan kimliği, pasif raf engeli).

## Komut çıktıları (son satırlar; Node 24.21.0, PostgreSQL 16.13; test veritabanı yerel geçici küme, port 5433)
```
npm run kontrol                 → çıkış 0; sunucu ℹ tests 638 / ℹ pass 638 / ℹ fail 0; istemci Test Files 32 passed (32) / Tests 342 passed (342)
npm run sinir -- --modul atolye → Sınır denetimi: 307 dosya, 0 ihlal. / Yol denetimi (atolye, taban main): 0 ihlal. / Göç damgası denetimi (atolye, taban main): 0 ihlal.
node --test sunucu/moduller/atolye/kurallar.test.ts → ℹ tests 27 / ℹ pass 27 / ℹ fail 0
node --import ./araclar/ortam-yukle-goc.ts --test sunucu/moduller/atolye/*.test.ts → ℹ tests 52 / ℹ pass 52 / ℹ fail 0
npx vitest run --config istemci/vite.config.ts src/moduller/atolye → Tests 92 passed (92) (net ölçü ve konsol turu dahil)
npm ls occt-import-js three pdfjs-dist → occt-import-js@0.0.23, three@0.186.1, pdfjs-dist@6.3.289
```
- Test veritabanı: çalışma ortamındaki asıl kümenin kimlik doğrulaması gevşetilmedi; ayrı, geçici bir küme (scram, port 5433) `araclar/vt/kurulum.sql` ile kuruldu, testler `TMIV2_PG_PORT=5433` ile koştu.
- `npm audit` uyarıları tabandaki paketlerde (vitest, vite, esbuild, stylelint, react-router); `three` ve `occt-import-js` listede yok (önceki tur DOĞRULANDI; bu tur yeniden koşulmadı).
- jsdom testlerinde "HTMLCanvasElement.prototype.getContext" uyarısı: WebGL'siz yol (2B plan) denenir, test geçer.
- İstemci testleri `--config istemci/vite.config.ts` ister; akış testi ortamı `araclar/ortam-yukle-goc.ts` ile okur.

## Oturtma (kart #599, dal `599-atolye`)
- Gelen hal tek commit; yalnız modül dosyaları alındı. Dokuz göç damgası main'in son göçünden sonraya, teslim sırasıyla alındı
  (`20261011203001` - `20261011203009`).
- Çekirdek istekleri girdi: `paylasilan/islemler/atolye.ts` ve toplayıcıda tek satır; `paylasilan/sayfalar/atolye.ts` (Üretim grubu, simge `target`)
  ve toplayıcıda iki satır; `paylasilan/atolye-sabitleri.ts` ve lint ZODSUZ listesi; `tokens.css` sahne ve plan renkleri.
- `kisiAdlari` (istek 4) main'de zaten vardı.
- Test kırıkları: istemci istasyon fikstürü güncel sözleşmeye, akış testindeki istasyon güncellemesi sürümle.
- Rol x işlem satırı girmedi (onay yok); ikinci menü yok (UYUM-BORCU 4).

## Demo provası düzeltmeleri (kart #599, dal `599-atolye-duzeltme`)
- Okuma uçları oturumla değil sayfa yetkisiyle açılır: `{ biri: ['sayfa.atolye', 'atolye.yaz'] }`; yazma uçları `atolye.yaz` (değişmedi).
  Sayfası olmayan rol 403 alır (akış testi: geçici "gören" rolü 200, muhasebe 403).
- 360 genişlikte "Parçalar" sekmesi kesilmez: dar ekranda üç bölüm sekmesi genişliği paylaşır (`.tc-atolye-sekmeler`).
  Tarayıcıda ölçüldü: 360'ta sekme şeridi 327/279 piksel taşıyordu, düzeltmeden sonra 279/279.
- Salon dışındaki rota hedefi ya da başlangıcı kenara kadar yürütülmez: 422 ve "… noktası bu bölümün dışında" (`rotaNoktasiIhlali`).

## Kapılar ve bölümler arası geçiş (kart #599, dal `599-atolye-gecisler`)
- Yeni tablo `atolye_gecis` (kullanıcı onayı: "Tablo + kopyala"): bölümün dış kenarında türlü geçiş (kepenk, açık geçiş, kapı, yangın kapısı),
  kenar, kenar ortasından ofset ve genişlikle. Göç her bölümün giriş noktasını en yakın kenarda 4 m kepenk olarak taşır (bugünkü 3B kapı).
  `atolye_salon` değişmedi; giriş noktası rota ve yürüyüş başlangıcı olarak kalır.
- ATL-34: geçiş kenarın içinde; aynı kenardaki geçişler üst üste binmez. Geçiş gönderilmeyen kayıt kayıtlı geçişleri korur ve yine denetler.
- Düzenleyicide "Geçiş" grubu: tür seçilir, geçiş en yakın duvara oturur ve duvar boyunca sürüklenir; panelde tür, duvar, kayma, genişlik.
- 3B: her geçiş türüyle çizilir (kepenk gri panjur ve çarpma direkleri, kapı mavi kanat, yangın kapısı kırmızı kanat ve panik bar, açık geçiş
  duvarda delik ve uyarı bandı); etiket türün adıdır ("Giriş" etiketi kalktı). Ortak duvardaki geçiş komşu bölümün duvarını da açar.
- Fabrika görünümünde yürüyüş açıldı: bölümden bölüme yalnız ortak duvardaki geçişten geçilir; tıklanan yere yol bölümler arası kapı sırasıyla
  kurulur, her bölümün içindeki parça sunucu rotasıdır. İki bölüm ancak duvarları üst üste geliyorsa (25 cm pay) bağlanır.


## Stok rafları haritaya (kart #686 adım 1, dal `686-atolye-stok-raflari`; kullanıcı kararı 12.10.2026 "Tam birleştir")
- Göç `atolye_stok_raflari`: her stok deposu bir bölüm, her stok rafı bir raf, her raf gözü konumu bir göz, kabul, üretim çıkışı, depo zemini ve
  fason konumu bir alan olur. Stok tabloları değişmez. Kaynak kimliği `stok_depo_id`, `stok_raf_id`, `stok_konum_id` sütunlarında; adım 2'de kalkar.
  - Raf kodu: depo kodunun başı + stok raf kodu (ANA, 12 -> A12); çakışırsa baş uzar (AN12). Eski kod raf adında ("Ana depo / 12").
  - Tür: çelik -> küçük parça. Göz sayısı 1. Raf kat sınırı 10 (stokta 10 kat vardı).
  - Ön yüz ve göz yeri korunur: ön yüzü ters stok rafında bölme sırası tersten sayılır. Tek/çift numara sıraya çevrilir; rafa uymayan göz bağlanmaz.
  - Bölüm kutusu bina, raf, kabul ve fason dolabını kapsar; konumu olmayan alanlar üstte 4 m şeride dizilir. Bölüm sağa, 5 m arayla eklenir.
  - Varsayım: stok ile atölye aynı eksende (x sağa, z ileri), ayna yok. Raflar arası çakışma göçte denetlenmez; haritada düzeltilir.
  - Kişi olmayan (yeni kurulum) veritabanında kopya atlanır.
- Alan kimliği artık korunur (stok konumu alana bağlanacak): kayıtta kimlikli alan güncellenir, kimliksiz eklenir, listede olmayan silinir.
  Aynı kimlik iki kez gelirse 422. Fabrika kaydında bölüm değiştiren alan kimliğiyle taşınır.
- Yeni alan türleri: kabul, üretim çıkışı, depo zemini, fason (düzenleyicide "Stok alanı" grubu, planda raf rengi, 3B zeminde işaret).
- Göz adresinde kat iki haneli olabilir (A12-03-10-1).
- `disari.ts`: `gozler`, `gozBul`, `gozAdresi`, `raflar`, `alanlar`.

## Harita gezintisi (kart #725, dal `725-harita-gezinti`)
- Son bakılan yer cihazda (localStorage, bölüm kümesine göre) saklanır: harita açılınca oradan başlar, yürüyüş son yürünen yerden devam eder.
  Depolama kapalıysa genel görünüm (eski davranış). Sunucuya ve paylaşılan koda dokunulmadı.
- Komşusu olmayan geçiş dışarı (avlu) açılır: aralı bölümler arasında dışarıdan yürünür; dış yol bölümlere çarpmadan köşelerden dolaşır.
  Avlu bölümler kutusunun 30 m dışına çıkmaz. Varsayım: bölümlerin arası açık saha (engel yok).
- Sahnenin sağ altında küçük harita: bölümler, geçişler, bakılan yer ve yönü; dokunulan yere yürünür ya da kamera kayar; kapatılabilir.

## Göz panelinde stok (kart #711, dal `711-atolye-goz-stok`)
- Göz panelinde "Stokta: N kalem (ilk: malzeme)" ve stok konumuna bağlantı; stoksuz gözde "Stokta yok".
  Veri stok modülünün `GET /stok/goz-stoklari` ucundan istemcide okunur: atölye sunucusu stok'u ithal edemez (stok atölyeye bağlı, döngü).
- Stok okuma yetkisi (stok sayfası ya da bir `stok.*` işlemi) yoksa istek atılmaz, satır görünmez; uç reddederse satır gizlenir.

## Bölüm krokisi Çizim Merkezi'nden (kart #772, dal `772-atolye-kroki-merkez`; kullanıcı kararı 12.10.2026 "Simdi bagla")
- Bölüm krokisi Çizim Merkezi'ndeki yayında PDF belgeden alınabilir: `GET /atolye/cizim-merkezi/krokiler`, `POST /atolye/salonlar/:id/kroki/merkezden`
  (`atolye.yaz`). Dosya krokiye kopyalanır (çizim harita açılırken merkezden okunmaz), belge bölüme bağlanır (`cizimler_bag`, `atolye`).
- Kroki cevabında `merkez` (belge, ad, harf, ozet): ozet krokininkinden farklıysa merkezde yeni revizyon var; panel "Güncelle" sunar.
  Aynı belgeden güncellemede hizalama korunur (kâğıt ölçüsü değişmediği varsayıldı; panel "hizalamayı kontrol edin" der).
- Elle PDF yükleme ve kaldırma merkez bağını çözer. Fabrika krokisi yerinde kalır (atölye oturumuyla anlaşıldı).
- Çizim Merkezi yalnız `cizimler/disari.ts` ile okunur; cizimler atolye'yi ithal etmez (ADR 0006).

## Kalemin malzeme kartıyla eşleşmesi (kart #1123, dal `1123-harita-kalem-malzeme-esleme`; kullanıcı kararı 13.10.2026 "Serbest kod kalsın")
- Göz kalemi ve kalem görünümü cevaplarına `malzeme` (`no`, `stokKodu`, `ad`) eklendi: kod bir malzeme kartının stok koduyla
  (boşluk ve harf büyüklüğü ayırmadan) eşleşirse dolu, eşleşmezse null (ATL-36). Kod serbest kalır, kayıt engellenmez; şema değişmedi.
- Okuma `malzemeler/disari.ts` `malzemeNoKoddan` ve `malzemeOzetleri` ile; yön atolye -> malzemeler (malzemeler atolye'yi ithal etmez).
- Ekran: göz panelinde ve parça listesinde kart adı (kart varsa elle yazılan adın yerine) ve "Kartta yok" uyarısı; parça listesine "Malzeme kartı" sütunu.
- Makinede işlenen parça: emrin `malzemeNo`'su varsa önce o kartla eşleşen kalemin modeli, yoksa parça no (önceki davranış).

## Makine başına yer ve model (kart #1120, dal `1120-harita-makine-yeri`; kullanıcı kararı 13.10.2026 "Makine başına")
- Haritadaki 3B nesne makinedir: yeni tablo `atolye_makine_yeri` (makine başına yer, ayak izi, 3B model). İstasyon yeri
  silinmez ve değişmez; makinesi yerleşik istasyon haritada kesik çerçeve olur, katı değildir (ATL-37).
- Göç doldurma: yerleşik istasyonun aktif makineleri istasyonun ayak izine, eni boyunca kod sırasıyla yan yana dizilir;
  tek makineli istasyonun modeli makineye geçer. Göçün başında sayım (`RAISE NOTICE`): kaç istasyon yeri, kaç aktif makine.
- Kayıt gövdesine `makineYerleri` (isteğe bağlı: gönderilmezse kayıtlı makine yerleri kalır, boş dizi hepsini kaldırır);
  cevaba `makineYerleri` (makine, bağlı istasyon, kutu, model). Bulgu anahtarı `makine:<makineId>`.
- Düzenleyici: paletin "Makineler" grubu (yerleşmemiş aktif makineler, `/makineler`), plan ve özellik paneli (ayak izi, 3B model).
- Harita: 3B sahne, iki boyutlu plan ve öğe kartı makineyi çizer; canlı durum ve işlenen parça bugün makinenin istasyonundan gelir
  (makine başına durum kart #1121). Listeden, aramadan ve turdan istasyon seçimi istasyonun ilk makinesine gider.
- Çizim Merkezi modeli istasyonda kalır (makinesi yerleşik istasyonda gösterilmez; makineye kütüphane modeli atanır).

## Makine başına durum ve son hareketler (kart #1121 K2, #1122 K3; dal `1121-harita-makine-durumu`)
- Sunucu, şema ve uç değişmedi; yalnız istemci. Dal #1139 (K1) üstündedir; #1139 birleşmeden bu dal birleşmez.
- ATL-38 (K2): canlı durum nesne anahtarıyla (`makine:<id>`, `istasyon:<id>`) gelir. Başlamış emrin çalışan iş emrinin makinesi
  (`canli.isEmri.makineId`) haritadaysa durum o makinededir; değilse istasyonun haritadaki ilk makinesinde (ya da makinesi yerleşmemiş
  istasyonun kendisinde). Aynı istasyonun öbür makinesi bekliyor görünür. Pasif makine ve istasyon yazılmaz.
- Arıza ve bakım istasyonlar `GET /makine-durumlari` ucundan okunur ve çalışan emrin üstündedir (kullanıcı kararı S3 "İkisi"): emir ve iş emri
  kartta kalır, durum "Arıza" (kırmızı) ya da "Bakımda" (ayar rengi) olur, neden açıklamadan gelir. Özet şeridine "Arıza, bakım (makine)" sayısı eklendi.
  Uç istasyonlar sayfası ya da yazma yetkisi ister; yetkisiz (403) kişide harita arızasız açılır ve uç yeniden sorulmaz.
- Makine kartı kendi emrini, iş emrini ("Op 20 · Frezeleme") ve arızasını gösterir. 2B plan da nesne başına renklenir. İstasyon listesi,
  özet sayıları ve otomatik tur istasyon başına kaldı.
- ATL-39 (K3): yan listede "Son hareketler" (saat simgesi): `GET /uretim-emirleri/son-olaylar?sayi=50`, yeniden eskiye, 15 saniyede bir.
  Olaya basınca makinesi (haritadaysa) ya da istasyonun nesnesi seçilir ve kamera gider. Sayım yalnız bu kaynaktan. Yetkisiz (403) kişiye
  "yetkiniz yok" yazılır.
- Atolye sunucusu Arkon'u ithal edemez (arkon -> stok -> atolye zinciri döngü kurar, ADR 0006); Arkon olayları istemciden Arkon'un ucuyla okunur.
- ATL-40 (#1122, dal `1122-harita-arkon-olaylari`): son hareketler `GET /arkon/son-olaylar?sayi=50` (#1160) olaylarını da gösterir. Yalnız emre yansımayanlar
  alınır: ölçüm, çağrı ve emirsiz terminal olayı. Arkon sayımı ve emre bağlı durum olayı üretim emirlerine de yazıldığından alınmaz (çift sayım yok).
  İki kaynak tek zaman çizgisinde, yeniden eskiye, en çok 50. Kaynaklardan biri okunamazsa liste "eksik" uyarısıyla öbürünü gösterir; ikisi de 403 ise
  "yetkiniz yok". İstasyon kodu çözülemeyen Arkon olayı haritada seçilmez.
- Kart #1196: `GET /atolye/cizim-merkezi/modeller` cevabına `istasyonlar` (modeli olan aktif istasyon ve yayındaki modeli) eklendi. Düzenleyicinin
  "Ekle" listesi Çizim Merkezi'nde makineyle eşleştirilmiş istasyonu model işaretiyle başa koyar; yerleşince panel modeli hemen gösterir.
  Bağ Çizim Merkezi'ndedir (CZ-14); atölyenin "Çizim Merkezi modeli" seçicisi aynen kalır.
- Kart #1196, kullanıcı kararı: haritada istasyon kaydı "Makine" adıyla görünür (yan liste, liste düğmesi, Ekle listesi, kart, model kütüphanesi).
  İstasyonun altındaki makine kayıtları (`/makineler`) haritada "Ekipman" adını alır. Yalnız görünen adlar değişti; tablo, uç, işlem ve kod adları aynı.
- Kart #1258, madde 2: `GET /atolye/cizim-merkezi/modeller` cevabına `taslaklar` (yalnız taslak 3B modelle eşleşen istasyon) eklendi. Düzenleyicinin
  "Ekle" paletinde eşleşmiş ama haritada olmayan istasyonlar ayrı "Eklenecek makineler" başlığında durur; taslakta olan "Çizim yayınlanınca
  görünür" notunu taşır. Yerleşim otomatik değil, kullanıcı yapar. İstemci `disari.ts` `useHaritadakiIstasyonlar` Çizim Merkezi eşleştir
  penceresine verilir.
- Kart #1258, madde 3: makinede işlenen parçanın modeli önce emrin malzemesine Çizim Merkezi'nde bağlı yayındaki 3B modeldir
  (`GET /atolye/malzeme-modelleri`, `GET /atolye/malzemeler/:no/merkez-modeli`; yalnız açık emrin malzemesi, `uretim-emirleri` `disari.ts`
  `acikEmirler` ile), yoksa harita kütüphanesinin kalem görünümü. Başlamış emri olmayan istasyonda sıradaki planlı emir (en önce açılan)
  kartta "Sıradaki" satırında ve önizlemede soluk görünür. Göç yok, yeni işlem yok.
- Kart #1284: başlamış emri olan ama fabrikanın hiçbir bölümüne (istasyon ya da ekipmanıyla) yerleşmemiş makine, yan listedeki
  "Makineler" başlığının altında uyarıyla yazılır ("Haritada olmayan makinede çalışan iş"); önce bu iş haritada hiçbir yerde görünmüyordu.
  Arkon Üretim Terminali'nde başlatılıp TMI'ye yazılamayan iş (Hazırlık > TMI'ye yazılamayanlar) TMI'de başlamış sayılmaz, haritada da görünmez.
- Kart #1296: yeni okuma ucu `GET /atolye/yerlesmemis-istasyonlar` (`sayfa.atolye` ya da `atolye.yaz`): aktif ama hiçbir bölüme ne istasyon
  ne ekipmanıyla yerleşmemiş istasyonlar, Çizim Merkezi modeli (yayında ya da taslak) bilgisiyle. Haritanın yan listesinde üçüncü düğme
  "Yerleşmemiş makineler" bu listeyi gösterir; yazabilen seçince düzenleyici açılır. Adres `/atolye?suzgec=yerlesmemis[&istasyon=<id>]`
  süzgeci açar ve istasyonu vurgular (İstasyonlar sayfasının "Haritada göster" bağlantısı). Göç yok, yeni işlem yok.
- Kart #1304: alan türlerine `ara_alan` (bekleme) ve `hurda` eklendi (göç `20261014193500_atolye_alan_hurda_bekleme`, yalnız liste genişler);
  düzenleyici paletinin "Stok alanı" grubunda "Bekleme" ve "Hurda", plan simgeleri kum saati ve çöp kutusu. Stok konumu eşlemesi stok modülündedir.
- Kart #1304 (Stok Merkezi > Depo): istemci `disari.ts` `DepoPaneli` (depo görünümü ve yerleşim düzenleyicisi başka sayfaya gömülür) ve `DepoYazimi` tipi;
  `depo-yazimi.ts` bağlamı verilince göz paneli ve düzenleyici sayfanın kendi uçlarıyla yazar, düzenleyici "depo kipi"ne geçer (yalnız raf eklenir, taşınır,
  düzenlenir; kroki ve 3B model düğmesi yok). Sunucu `disari.ts`: `rafYerlesimiKaydet` (yalnız raflar; bölümün öbür öğeleri kayıtlı haliyle, kurallar ve
  sürüm `yerlesimKaydet` ile aynı), `gozKalemiYaz`, `gozKalemiSil`, `gozKaleminBolumu`. Haritanın uçları ve yetkisi değişmedi; yetkiyi çağıran (stok, DEP-61) denetler.
- Kart #1304 (ortak ızgara): `POST /atolye/salonlar/:id/hucre-ata` (`atolye.yaz`, ATL-41) kareye ("C4") alan türü ya da istasyon atar; karede
  alan varsa türü değişir, yoksa kare boyunda alan açılır; istasyon kareye yerleşir ya da bölüm içinde taşınır. Yerleşimin geri kalanı kayıtlı
  hâliyle yeniden yazılır, bütün kurallar yine denetlenir. `disari.ts` `zemin()` bölümlerin ızgarasını ve karedeki öğeleri (raf, istasyon,
  makine, alan) verir; istemci `disari.ts` `ZeminSimgesi` ve `ALAN_TURU_ADI`'nı açar. Göç ve yeni işlem yok.
- 15.10.2026 (kullanıcı isteği): düzenleyicinin "Ekle" listesinde yalnız Çizim Merkezi'nde eşleşmiş makineler (yayında ya da taslak çizim) ve
  örnek istasyonlar (`ORN-` kodu, "Örnek" etiketiyle, eşleşmesiz de) durur; ayrı "Makineler" grubu kalktı, eşleşmeyenlerin sayısı ve
  Çizim Merkezi'nde "CNC makineleri" bölümüne yönlendiren not yazar. Daha önce yerleşmiş eşleşmesiz istasyon haritada kalır. Kural istemcidedir
  (`kurallar.ts` `eklenebilirIstasyonlar`); sunucu kaydı eşleşme denetlemez. Göç ve yeni işlem yok.

## Tek fabrika zemini dışarıya (kart #114; Soru 106-109, Soru 109 a prototip değişikliği onaylı)
- İstemci `disari.ts`: `FabrikaZemini` (salt okunur): bütün bölümler tek zeminde, fabrikadaki yer, dönüş ve gerçek ölçüyle; raf, alan (stok kutuları,
  fason dahil), istasyon ve makine haritadaki simgesiyle. Seçim kayıtlı anahtarla (`raf:<id>`, `alan:<id>`, `bolum:<salonId>`, `istasyon:`, `makine:`).
  Veri çağırandan gelir (stok kendi ucundan, #115). Yer ve boyut yalnız Fabrika Haritası'nda, `atolye.yaz` ile düzenlenir; yetki değişmedi.
- Sahne3B'nin iki boyutlu planındaki taslak, görünüm kutusu ve anahtar çevirisi `zemin-plani.ts`'e alındı; ikisi aynısını kullanır (davranış aynı).
- Sunucu `disari.ts`: `fabrikaPlani(db)` (GET /atolye/fabrika ile aynı cevap); okuma yetkisini çağıran denetler.
