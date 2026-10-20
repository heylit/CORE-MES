# recete-rota: fark

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
