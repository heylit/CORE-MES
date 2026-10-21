# recete-rota: fark

## Teslim 20.10.2026: planlama modülü ve Reçete ve Rota planlama alanları
Taban: `main` b7781052. Kaynak: deneme v89 (planlama modülü ve onun içindeki Reçete ve Rota). Sunucuda, göçte, `paylasilan`'da, `istemci/src/ortak`'ta değişiklik yok; gerekenler `CEKIRDEK-ISTEKLERI.md`'de.

### Eklenen (hepsi `istemci/src/moduller/recete-rota/`)
- `cerceve/planlama/`: planlama modülünün kaynakları. `parca/*.betik` (88 parça; 87'si denemenin parçaları, `zz31-tmi.betik` yeni), `motor/` (`engine`, `kisitlar`, `mip`), `lib/` (driver, fu-core, fu-dom, interact, sortable; lisansları yanında), `stil/modul.stil`.
  Uzantı `.betik`/`.stil`: parçalar tek başına ayrıştırılamaz (eslint), modül stilinde 30 onaltılık renk var (stylelint); derlenmiş sayfa denetlenir.
- `planlama-derle.ts`: kaynakları `cerceve/planlama-modulu.html`'e birleştirir (`node istemci/src/moduller/recete-rota/planlama-derle.ts`). Örnek veri, HiGHS, CP-SAT önerisi ve iç içe Reçete ve Rota girmez.
- `cerceve/planlama-modulu.html` (üretilmiş, 2,29 MB): depoda tutulur; test kaynaklarla aynı olduğunu denetler.
- `planlama-sayfasi.ts`: ortak stil, simgeler ve uygulama yazı tiplerini sayfadaki iki yer tutucuya açılışta koyar.
- `planlama-menusu.ts`: planlama yolları (13 anahtar) ve önerilen ikinci menü (`ONERILEN_IKINCI_MENU`; uygulanması çekirdek isteği).
- `rr-tema.ts`, `cerceve/rr-tema.css`: Reçete ve Rota çerçevesine TMI tasarım değişkenleri ve denemenin teması (prototipin kendi stilinden sonra).
- Testler: `planlama-derle.test.ts`, `PlanlamaCercevesi.test.tsx`.

### Değişen
- `cerceve/recete-rota-motoru.html`: denemedeki hâli (77 satır eklendi, 3 değişti). Tanım bölümlerine planlama alanları: Kaynaklar > Makineler (verim, operatör oranı, ₺/saat plan, ışıksız), Personel (ayarcı), yeni "Fason ve aparat" alt sekmesi, rota adımı paneline "Planlama" bölümü (ayar ailesi, aparat, Qmin, kasa, ayar matrisi), ham malzeme kartına tedarik ve giriş muayenesi günü. Hepsi kaydın `plan` alt nesnelerinde. `curPlan` sunucuya bağlı değilken canlı yerleşimi `st.tmiCanli`'dan okur.
- `ReceteRotaCercevesi.tsx`: iki çerçeve. Planlama yolları planlama çerçevesini, ötekiler Reçete ve Rota çerçevesini açar; ikisinin ortak verisi aynı kayıttır. Geçişte eski çerçeve gizli bekler (bekleme süresi + 1,5 sn ve yoldaki yazma bitene kadar), sonra kayıt yeniden okunur. İçerik politikasına `worker-src blob:` (motor ayrı iş parçacığında; bağlantı yine kapalı).
- `rotalar.tsx`: 13 planlama yolu. `yazi-tipleri.ts`: `veriAdresi` ayrıldı (iki çerçeve kullanır).
- `MotorUyarilari.test.tsx`, `PlanVerisi.test.tsx`: çerçeve başlığı iki çerçeveden biri.

### Prototipe göre (planlama modülü)
- Deneme verisi yok: çalışma `recete-rota-motoru-v1` kaydından kurulur; kayıt yoksa boş kayıttan. Planlama durumu `recete-rota-motoru-v1:planlama` anahtarında (anahtar biçimine uyar, sunucuya yazılır).
- İç içe Reçete ve Rota açılmaz (yalıtılmış çerçevede iç çerçeve ayrı opak kökendir, erişemez; DOĞRULANDI, Chromium denemesi); Reçete ve Rota sayfası istenince kabuk öteki çerçeveyi açar.
- Rol her zaman yönetici (`u5`): Aşama 1'de işlemler yalnız yöneticide; sunucu yazmayı kendi yetkisiyle denetler.
- 1650 kararının varsayılanı (`planDenge` 25) kurulurken konur: açılışta ana tabloya yazılmaz (DOĞRULANDI, kanıt `cerceve-dene`: açılış ve çözüm sonrası kayıt sürümü 1).
- Motor davranışça aynı: depodaki parçalar denemenin `app.js`'ini bayt bayt verir (zz31 ve ANAHTAR satırı hariç); aynı durumda motor imzası denemeninkiyle aynı (küçük 89326187, orta 6d6268bb).

### Bu modül şunları varsaydı
1. Planlama çerçevesinde rol yöneticidir (Aşama 1); bağlamada ortak yetki matrisinden gelir.
2. Planlama sayfaları `plan.oku` işlemiyle görünür; yeni işlem açılmadı (soru SORULACAKLAR'da).
3. Kanban ikinci menüde yok, Plan tahtasına yönlenir.
4. "Canlıya al" yalnız kayda (`tmiCanli`) yazar; sunucu planı, Arkon ve terminal güncellenmez.
5. HiGHS ve CP-SAT yok; seçilirse çalışmaz. Varsayılan motor sayfanın kendi motorudur (`engine`).
6. Planlama ekran tercihleri (`:planlama-ui4`, `-mz`, `-tk`, `-br`, `-nb`, `-tema`) cihazdadır.
7. Denemenin veri araçları (set yükle, içeri al, sıfırla) gizli.
8. Reçete ve Rota'nın kendi Plan, Stüdyo ve Kanban sekmeleri menüden erişilmez; yolları planlama çerçevesine gider.
9. Planlama durumu için şema değişikliği gerekmez (anahtar `recete_rota_kayit`'ta).
10. Tekrar eden tezgâhlar teke indirilmedi (onay bekliyor).

### Planlama alanları (FARK-taslak)
Kayıt, planlama modülünün ana verisidir. Motorun okuduğu ve bu ekranda karşılığı olmayan alanlar kaydın `plan` alt nesnesinde durur. `normalize()` ve `save()` varlık alanlarını silmez; `plan` alt nesnesi korunur (DOĞRULANDI: t161, normalize'dan geçen kayıt kayıpsız döndü).

| Bölüm | Alan | Neden |
|---|---|---|
| Kaynaklar > Makineler | Verim (1 = tam), Operatör oranı, ₺ / saat (plan), Işıksız çalışır (`machine.plan.verim`, `opOran`, `ucret`, `isiksiz`) | Motor makine hızını, gözetimsiz çalışmayı ve personel ihtiyacını bu alanlardan okur. |
| Kaynaklar > Personel | Ayarcı (`person.plan.ayar`) | Ayarı yalnız ayarcı yapar; ayar kısıtı bu işaretle kurulur. |
| Kaynaklar > Fason ve aparat (yeni alt sekme) | Fason kapasite, süre (gün), çıkış saati, çıkış günleri (`st.plan.fasoncular`) ve aparat adedi (`st.plan.aparatlar`) | Fason sevki günlere ve kapasiteye bağlıdır; aparat sayısı aynı anda çalışabilecek adımı sınırlar. |
| Ürün ve rotalar > adım paneli > Planlama (yeni bölüm) | Ayar ailesi, Aparat, En küçük parti (Qmin, adımın `minLot` alanı), Kasa (adet), ayar matrisi bağlantısı | Ayar süresi aile geçişine göre matristen gelir; parti bölme Qmin ve kasaya uyar. |
| Ürün ve rotalar > adım paneli > Önceki adımla ilişki | Anlam: "Örtülü" planlamada örtüşebilir, aktarma adedi `depQty` | Var olan alan kullanıldı; yeni alan açılmadı. |
| Malzemeler > malzeme kartı | Tedarik (gün), Giriş muayenesi (gün) (`item.plan.tedarikGun`, `muayeneGun`) | Malzeme hazır olma tarihi bu iki süreyle hesaplanır. |
| Değişiklik dinleyicisi | `data-s="planp"` girişleri `planpDegisti()` ile `plan` alt nesnesine yazar | Tek giriş noktası; boş bırakılan isteğe bağlı alan çıkar, zorunlu alan boşsa eski değer kalır. |

Varsayımlar (öneriyle ilerlendi): planlama çalışan rotayı (`st.routes`) okur, revizyon onayı planlamayı beklemez (geri alma maliyeti orta, okuma tek fonksiyonda); vardiya molaları planlamaya geçmez; rotanın ilk adımındaki hammadde girdisi bilgi amaçlıdır; makinenin "Durum" alanı ve kişinin "Aktif" işareti planlamaya geçmez.

Fason adım ve canlı plan:
- Fason adım çerçevede istasyonsuz, `fasonId`'li adım olarak kurulur (`fasonId` = fasoncu kodu, `terminGun` = fasoncunun süresi); beş sette "planlanamıyor" adım 0 (t161 imzaları değişmedi).
- Fasoncu adı çerçevede "Fason firma #FS-..." görünür: firma listesi bağlı sunucudan gelir (`BAGLI.durum.fasonFirms`). Bağlamada firma kartına bağlanır.
- Canlıya alınan plan kayda `tmiCanli` olarak yazılır: `{id, surum, ad, kim, zaman, yerlesim}`, yerlesim "emir no|OP no" -> [{makineId, baslangic}]. Reçete ve Rota bunu sunucu yerleşimiyle aynı yoldan okur (`curPlan`). Elle sıra (`qorder`) ve elle makine (`assign`) yazılmaz.
- Yerleşim çerçeve motoru için en erken başlangıçtır; küçük sette 129 işin hepsi canlıdaki makinesinde, bir kısmı canlı saatten sonra başlıyor (sayı koşu saatine bağlı: denemede ve bu teslimde 20.10'da 103), 8 çiftin makine sırası değişiyor (t163). Reçete ve Rota'nın emir tarihleri canlı plandan farklıdır; tek motor kararına kadar böyle kalır.

### Oturtmada korunacak depo farkı (koordinatör notu, 20.10)
ÜE 327 a PR'ı (#2161) girerse `sunucu/moduller/recete-rota/emirler.test.ts` değişir: :16 import'a `kararliSayimiSonuclandir`, :179 sonrasına `await o().vt.tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));`. Neden: sağlam sayım Kalite Merkezi onayına kadar "karar bekliyor". Bu teslim `emirler.test.ts`'ye dokunmaz; oturtulurken o fark ezilmez.

## Önceki teslim (13.10.2026)
Depoda karşılığı olmayan yeni modül; menüde eski Rota'nın yerini alır. Depodaki `rota` modülünün dosyası silinmez; yalnız sayfası menüde gizlenir (`paylasilan/sayfalar/rota.ts`, yamada). Taban: `main` 3cbc270.

## Neden
Depodaki Rota sayfası prototipten React'e yeniden yazılmış ve parçalanmış (DOĞRULANDI, `paylasilan/sayfalar/rota.ts` ve
`istemci/src/moduller/rota/rotalar.tsx`): Üretim emirleri ana menüye taşındı (`/rota/emirler` yönlendirme, kart #651), operasyon
kataloğu İstasyonlar'a taşındı (kart #544), operatör ekranı Üretim Terminali'ne yönleniyor, sahibi başka modül olan bölümler
"modülü bekleniyor" gösteriyor; görünüm TMI tasarım değişkenleriyle yeniden çizildi. Kullanıcı HTML'deki görünüm, kurgu ve kullanımı birebir istedi.

## Eklenen
- `sunucu/gocler/20261013061900_recete_rota_kayit.sql`: `recete_rota_kayit` (anahtar başına kayıt, jsonb), `recete_rota_surum` sayacı.
- `sunucu/moduller/recete-rota/`: `uclar.ts`, `servis.ts`, `sorgular.ts`, `kurallar.ts`, `disari.ts`, testler, `UYGULA.md`, `UYUM-BORCU.md`, `ORTAKLIK-recete-rota.md`.
- `paylasilan/sozlesme/recete-rota.ts`, `paylasilan/islemler/recete-rota.ts`, `paylasilan/sayfalar/recete-rota.ts`.
- `istemci/src/moduller/recete-rota/`: `ReceteRotaCercevesi.tsx`, `cerceve-kopru.ts`, `kopru.ts`, `yazi-tipleri.ts`, `rotalar.tsx`, `recete-rota.css`, testler.
- `istemci/src/moduller/recete-rota/cerceve/recete-rota-motoru.html`: yüklenen "Reçete ve Rota Motoru.html", bayt bayt aynı
  (sha256 `3ae217b34b820aaf55ffb4a3f6e6539f02e5bfcb213de465702287528518a0e4`, 482 460 bayt).
- `istemci/src/moduller/recete-rota/cerceve/yazi/`: Barlow (400-700) ve Chakra Petch (500-700) woff2, latin ve latin-ext; OFL lisans metinleri.

## Prototipe göre
Prototipte tek değişiklik (kullanıcı kararı, 13.10.2026): Operatör ekranı yan menüden çıkarıldı, kayıtlı sekme Plan'a döner (iki satır;
dosya artık yüklenen dosyayla bayt bayt aynı değil, sha256 `9661336e29faaece10eb47b3b5ae443470eb74a16d060a37a5b049213dc37f4c`). Açılışta ayrıca içerik politikası, gömülü yazı tipi stili ve köprü betiği eklenir.
Görünüm, yerleşim, kullanım ve özellikler aynıdır: 9 bölüm (Üretim emirleri, Plan, Plan stüdyosu, Kanban, Stok,
Ürün ve rotalar, Operasyonlar, Malzemeler, Kaynaklar), hızlı git (Ctrl K), hızlı git dahil. Örnek senaryolar, proje yedeği, dışa/içe aktarım, sıfırlama ve kurulum ekranı kaldırıldı (aşağıda).

- Veri: prototip durumunu tarayıcıda `recete-rota-motoru-v1` anahtarlarında, oturum açıksa hesap deposunda kişiye özel tutuyordu.
  Köprü yerel depoyu TMI veritabanına yazar; kayıt atölyede ortaktır (herkes aynı ürünleri, emirleri, planı görür), sürüm denetimlidir.
  Hesap deposu (`db`, `user`) verilmez: kişiye özel ikinci kopya olmaz.
- Yazı tipi: prototip Barlow ve Chakra Petch'i Google Fonts'tan çekiyordu; aynı yazı tipleri yerel dosyadan gelir, dış istek yok.
- Kayıt yeri yazısı "Bu cihazda kayıtlı" yerine "TMI'de kayıtlı" (yazma yetkisi yoksa "Yalnız bu sekmede (yazma yetkiniz yok)").
- Tema: prototip işletim sisteminin temasını izliyordu; açılışta TMI'nin açık ya da koyu teması geçer (prototipin kendi koyu teması).
- Yeni uyarı (yalnız hata anında): başka biri aynı anda değiştirdiyse "sayfayı yenileyin", kayıt 1 MB'ı aşarsa "kaydedilemedi".
- Yazma işlemi olmayan kişide (kalite, CAM) ekran aynı çalışır; değişiklikler yalnız açık sekmede kalır.
- Operatör ekranının istasyon seçimi, yan menü daraltma ve stüdyo tanıtımı prototipteki gibi "bu cihazda" kalır (ortak kayda gitmez;
  gitseydi iki tablet birbirinin seçimini ezerdi).
- Menü rozetleri: eski yan menünün sayıları kabuğun ikinci menüsüne `sayaclar` iletisiyle gider (kabukta tek sayı): açık emir (orders), geç emir (plan; plan hesaplıyken, yoksa sayı yok), plan stüdyosu senaryosu (studio), düşük stok (stock), onaydaki revizyon, yoksa taslak (schema), operasyon (ops), malzeme (items).

## Değişen onaylı karar
Menüde Rota'nın yerine geçer (kullanıcı kararı, 13.10.2026). Rota modülünün kodu ve kararları (kart #651, #544, #713) kalır; eski ekranlar adresle açılır.
Emirlerin ana menüye taşınması ve terminal bağlantısı bu pakette yapılmadı; yönergesi `BAGLAMA-YONERGESI.md`.
Proje ve veri penceresi (JSON/CSV indirme, JSON içe aktarma, örnek veri yükleme, sıfırlama) ve kurulum ekranı kaldırıldı (kullanıcı kararı 13.10, #1033); boş kayıtta ekran boş fabrikayla açılır, ilk değişiklikte yazılır.

## Üretim emri türü ve bölme (kart #1034, kullanıcı kararı 13.10.2026)
Prototipin kendi emirlerinde (uretim-emirleri modülüne dokunulmadan):
- Emir türü FAI, Seri (varsayılan), Prototip, Numune: açarken seçilir, listede rozet, süzgeç, ayrıntıda değiştirilir; türsüz eski kayıt Seri sayılır. Tür değişikliği plana etkisiz olduğundan taslak senaryo açmaz.
- Partili açma ve miktarla bölme: ilk parti ana emirde kalır, diğerleri `parentId` ile ana emre bağlı alt emir olur, toplam korunur. Başlamış emir de bölünür: uyarı onayı istenir, biten adımlar alt emirde de biter, devam eden adımların ilerlemesi miktara oranla dağılır; parça bölünmüş (splitOp) adımı olan emir önce birleştirilmelidir. Kollu emir ve kol emri de bölünür (kol emrinin bölünmesi aynı aralıkta kardeş kol açar; kol miktarı ana emirde kalandan küçük kalmalı).
- Adım kolu: N. adımdan sonra q adetle ayrılır, N+1..M-1 adımlarını q adetle yapar; ana emir kalanla (Q-q) aynı adımları kendi yapar, M. adımda ikisini bekler, miktarlar toplanır. Kol sonradan "Ana emre birleştir" ile başka bir adımda bağlanabilir (kol o adıma kadar ilerlemişse ya da ana emir o adıma gelmişse engellenir). Kolun kolu ve aynı aralıkta birden çok kol desteklenir; aynı noktadan ayrılan ikiz kollar kendi adımlarında bağımsız birleşir (ortak adımlarda toplam yük ana emirde kalandan küçük kalmak zorunda); kolun kolu, birleşme adımını ancak bağlı olduğu kolun adımları içinde seçebilir.
- Kol ana emirden durum, tarih, öncelik ve revizyon alır (kolda kilitli); yalnız miktarı kurala uyarak değişir. Kol tek başına tamamlanamaz; ana emir tamamlanınca kollar da tamamlanır, mamul stoğuna yalnız ana emrin miktarı girer, girdi tüketimi her emrin kendi miktarıyla düşer.
- Bütün bu değişiklikler mevcut kuralla canlı planda önce taslak senaryoya yazılır, Plan stüdyosunda onaylanınca canlıya geçer (yeni onay akışı yok).
- Silme kuralı değişmedi: ana emir silinince bütün kol soyu (kolun kolları dahil) silinir, partileri bağsız kalır.

Varsayımlar: (1) kalan miktar da N+1..M-1 adımlarını kendisi yapar, iki parça paralel planlanır; (2) kollu emirlerde bekleyen ara stok (statülü) kullanılmaz (iki ağaçta iki kez harcanmasın); (3) partili açarken kol yalnız ilk partiye (ana emre) bağlanır, diğer partiler tam rotalı bağımsız alt emirlerdir; (4) kol geri alınırken miktar kardeş kola aktarılmaz, adımlar ana emre döner; (5) partiden açılan kol varken o parti ana emre geri katılmaz, önce kollar geri alınır; (6) geri planlama (`dir:"geri"`) tek emir önhesabı kolları görmez. Operasyon parçası bölme (`splitOp`/`mergeOp`) ayrıdır ve değişmedi. Prototip yüklenen dosyayla bayt bayt aynı değildir.

## Süreler (kart #1044)
- Prototipe "Süreler" bölümü eklendi (ikinci menüde "Süreler" maddesi, Ana veriler grubunda Operasyonlar'ın yanında, yol `/recete-rota/sureler`; hızlı git ve adım paneli bağlantısı da var). "Kaynak" sütunu istasyon ve aktif makinelerdir; gerçekleşen değerin kaynağı (Elle, Kabul; bekleyen terminal değeri) her gerçekleşen alanın altında rozettir. Satır: ürün, revizyon, op no, operasyon, kaynak, teorik hazırlık/işlem/değişim, Değişim %, gerçekleşen hazırlık/işlem/değişim, plan tabanı.
- "Çevrim dk" yerine "İşlem dk" ve "Değişim dk" ve "Değişim %" (akış kartı, adım paneli, operasyon kataloğu). Değişim % = değişim ÷ işlem × 100; işlem boş ya da 0 ise boş.
- Eski kayıt açılışta normalleşir: işlem = eski çevrim, değişim boş. `cycle` toplam kalır.
- Plan etkin süreyi kullanır: hazırlık + (işlem + değişim) × miktar ÷ verim. Gerçekleşene yalnız elle giriş ya da "kabul et" ile geçilir (kullanıcı kararı S4 a); plan canlıyken değişiklik mevcut kurala göre taslak senaryoya yazılır.

## Plan motoru sunucuda (354, 391 a; ADR 0018)
- Motor dosyaları (`engine`, `kisitlar`, `mip`) `sunucu/moduller/recete-rota/motor/` altına taşındı; planlama çerçevesinin sayfası onları
  buradan gömer (`planlama-derle.ts` `MOTOR`); taşımanın kendisi sayfayı değiştirmedi, motor değişikliğiyle sayfa yeniden kuruldu.
- `plan-motoru.ts`: motor sunucuda ayrı iş parçacığında, boş `vm` bağlamında koşar; aynı anda tek çözüm, süre sınırı, yalnız aramasız
  kipler (`sabit`, `yeni`). `disari.ts` `planCoz`, `motorYukle` açar. Asıl plan bugün değişmedi: plan modülü çözücüyü bağlayana ve canlıya
  alma (356 b) kararına kadar `oner` yolu sürer.
- Davranış (391 a): gerçekleşen kaydı `kalan` (verimli saat) ve `sayim` (son sayım anı) taşırsa motor başlamış adımın bitişini
  `sayim`dan takvimle `kalan` kadar ilerletir; yoksa geçen süreyi düşen eski yol sürer. Plan, alt sınır, baş-kuyruk ve MIP gevşetmesi aynı
  yardımcıyı (`kalanBitis`) kullanır.
