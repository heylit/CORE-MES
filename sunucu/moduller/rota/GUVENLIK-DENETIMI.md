# Güvenlik denetimi (rota)

Bütün uçlar `uc()` ile tanımlıdır: şema doğrulaması, oturum ve işlem denetimi, kayıt noktası ve denetim kaydı çekirdekten gelir.
Yazma uçlarında kişi ve zaman sunucudan yazılır (istemciden alınmaz); her yazma uç adından belli ayrı bir komuttur, genel kaydet ucu yoktur
(`kaydet` yalnız taslak revizyonun içeriğini, okunan sürümle yazar). Test adları: U = `sunucu/moduller/rota/rota.test.ts`,
K = `kurallar.test.ts`, E = `istemci/src/moduller/rota/Rotalar.test.tsx`.

| Yol | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /rota/urunler/:urunId, /rota/revizyonlar/:id(?miktar), /fark, /agac, /talimatlar/:opNo, /rota/malzeme-kullanimi, /rota/revizyon-kunyeleri, /rota/urunler/:urunId/ham-onerisi, /rota/urunler/:urunId/op-numaralari, /rota/talimat-sablonlari, /rota/talimat-sablonlari/:id, /rota/talimat-sablonlari/:id/kopyalar (2588 a), /rota/talimat-medyasi/:ozet | ROTA_OKUR (biri: sayfa.recete-rota, recete-rota.oku, beş rota yazma eylemi, rota.onayla, rota.talimat-yaz, rota.emre-kopyala, rota.sartname-yaz, rota.sartname-yayinla; 2490 b); /rota/urunler ve /rota/sablonlar ek olarak malzemeler.yaz (yeni kart sihirbazı), /rota/secenekler ek olarak sayfa.istasyonlar (operasyon tipleri), /rota/malzeme-ara ek olarak sayfa.markalama (markalama tanımları); /rota/menu-sayaclari oturum | Oturumsuz 401; okuma yan etkisizdir; operatör ekranları rota verisini sunucuda `disari.ts` ile alır, bu uçlara gelmez | U RT-22 (kalite okur); U `uc-yetkisi.test.ts` (her okuma ucu tablodaki işlemle geçer); U malzeme arama; U ikinci menü sayacı | U RT-22 (operatör 403); U `uc-yetkisi.test.ts` (kimliksiz 401, tablo dışı her işlem 403) |
| GET /rota/revizyon-ozeti | ROTA_OKUR (ana sayfa kartları rota.revizyon-yaz, rota.onaya-gonder ve rota.onayla ile görünür) | Yalnız iki sayı (açık revizyonu olan ve açık revizyonu onay bekleyen ürün); okuma yan etkisizdir | U "ana sayfa revizyon özeti" (listeden sayılanla aynı) | U `uc-yetkisi.test.ts` |
| POST /rota/urunler/:urunId/taslak-ac | rota.taslak-ac | Yalnız kullanımdaki mamul/yarımamul (RT-57); tek açık revizyon (RT-02, kısmi tekil dizin); istek kimliği (RT-65) | U RT-07, RT-05, RT-65 | U RT-22 (operatör, kalite, CAM 403); U RT-02 (409, mamul olmayan kart 422); U RT-65 (kimliksiz 400) |
| POST /rota/urunler/:urunId/kopya-iste | biri: malzemeler.yaz, rota.taslak-ac | Yalnız rotasız mamul/yarımamul, pasif kart değil; kaynak kullanımda ve yürürlükte rotalı, kendisi değil; kart kullanımdaysa taslak hemen açılır (RT-57, RT-02), değilse istek yazılır; açan ve isteyen oturumdaki kişi, zaman sunucudan; istek kimliği (RT-65); taslağı ilerletmek ayrı uçlarda rota.revizyon-yaz, rota.onaya-gonder ve rota.onayla ister (RT-80, #500) | U RT-80 (kalite hemen açar; onaydaki kart bekler; yeni istek yerine geçer) | U RT-80 (operatör 403, kimliksiz 400, kendisi ya da rotasız kaynak 400, rotalı kart 409, hammadde 422, olmayan kart 404; kalite kaydet, gönder, onayla 403) |
| İş: rota-karttan-taslak (uç değil, 60 sn) | yok (istek değil) | Uç denetimi uygulanmaz; yalnız kullanımdaki, kodlu operasyonu olan ve hiç revizyonu olmayan mamul/yarımamul kartına karttan taslak açar; açan kartı onaylayan kişidir; kart başına kayıt noktası (#688); kopya isteği olan kart önce isteğin kaynağından açılır, açanı isteyendir, istek silinir (RT-80) | U "#688: onaylanan kartın ilk taslağı iş taramasıyla kendiliğinden açılır"; U RT-80 (onaydaki kart, açılamayan istek) | aynı test: taslaktaki kart, operasyonsuz kart ve iptal edilmiş taslaklı kart açılmaz |
| POST /rota/revizyonlar/:id/kaydet | rota.revizyon-yaz | Durum taslak (RT-19, tetikleyici); sürüm (RT-20, eski sürüm 409); OP numarası defteri (RT-30..32); kaynak var ve kullanımda (RT-38); aday kuralları (RT-39); bileşen kullanımdaki kart, kendisi değil (RT-52, RT-55) | U RT-20/30/31/32; U RT-37/39 | U RT-20 (eski sürüm 409); U RT-37/39 (bilinmeyen tip, kendi makinesi aday 400); U RT-08/09/38 (bilinmeyen makine 400); U RT-04/19 (onay bekleyen 409, SQL ile de yazılamaz) |
| POST /rota/revizyonlar/:id/onaya-gonder | rota.onaya-gonder | Adım, süre, kullanımda tip ve kaynak (RT-08, RT-09, RT-38); alt ürünün yürürlükte rotası, döngü (RT-56, RT-57) | U RT-08/09/38 (kaynaksız adımla gider) | U RT-08/09/38 (süresiz 422, pasifleşen makine 422); U RT-52..57 (döngü 422) |
| POST /rota/revizyonlar/:id/iptal | rota.revizyon-yaz | Yalnız taslak; silinmez (RT-14, RT-03, RT-15, tetikleyici) | U RT-14 | U RT-14 (iptal revizyon değişmez) |
| POST /rota/revizyonlar/:id/kopyala | rota.revizyon-yaz | Hedefte açık revizyon yok (RT-16); kullanılmış numara yenilenir; istek kimliği (RT-65) | U RT-16 | U RT-16 (409) |
| POST /rota/revizyonlar/:id/geri-gonder | rota.onayla | Yalnız onay bekleyen (durum geçişi) | U RT-04/19/13 | U RT-22 (planlama 403 — onay işlemleri) |
| POST /rota/revizyonlar/:id/onayla | rota.onayla | Dört göz: gönderen ve düzenleyen onaylayamaz (RT-18, tetikleyici `rota_revizyonu_dort_goz`); ayar kapalıyken işaretlenir (RT-17); yürürlüğe alırsa teorik süresi değişen ölçümleri boşaltma satırıyla kapatır (RT-79) | U RT-18/22/17 (müdür onaylar) | U RT-18/22/17 (kalite 403, gönderen yönetici 403) |
| POST /rota/revizyonlar/:id/yururluge-al | rota.onayla | Yalnız onaylı; tek yürürlükte (RT-10..12, kısmi tekil dizin); teorik süresi değişen ölçümler boşalır, yalnız ekleme (RT-79) | U RT-10/11/12/01; U RT-77/78/79 | U RT-10/11/12/01 |
| POST /rota/urunler/:urunId/talimat-yaz | rota.talimat-yaz | Okunan sürüm (RT-63); adımı olan numara (RT-62); revizyonu değiştirmez (RT-61) | U RT-60..63 (CAM yazar) | U RT-60..63 (eski sürüm 409, adımsız numara 422) |
| POST /rota/revizyonlar/:id/emre-kopyala | rota.emre-kopyala | Yalnız yürürlükteki, adımlı rota (RT-66); kart kullanımda; istek kimliği (RT-65); yazımı üretim emirleri komutu yapar | U RT-66/68 | U RT-66/68 (operatör 403, kimliksiz 400, taslak 422) |
| GET /rota/revizyonlar/:id/sureler(?makineId) | oturum | Okuma yan etkisizdir; plan yalnız teoriği kullanır (RT-74, 169 c); elle ve terminal satırı yalnız `olcum` alanında (RT-73) | U RT-73/74 (operatör okur); U RT-76 (ölçüm makinede ve makinesiz görünümde) | U RT-73 (ölçüm etkin süreye girmez); U RT-76 (başka makinenin görünümünde ölçüm yok) |
| GET /rota/revizyonlar/:id/patlatma-onizleme(?miktar) | rota.emre-kopyala | Yan etkisiz okuma, patlatma kaydı yazmaz; miktar 1..1000000 tam sayı, geçersiz 400 (2557) | U 1476-F; U 2557 | U 1476-F (operatör ve CAM 403, olmayan revizyon 404); U 2557 (miktar 0, 1.5, x: 400) |
| GET /rota/revizyonlar/:id/sureler(?makineId) | ROTA_OKUR | Okuma yan etkisizdir; plan yalnız teoriği kullanır (RT-74, 169 c); elle ve terminal satırı yalnız `olcum` alanında (RT-73) | U RT-73/74 (kalite okur); U RT-76 (ölçüm makinede ve makinesiz görünümde) | U RT-73 (ölçüm etkin süreye girmez); U RT-76 (başka makinenin görünümünde ölçüm yok) |
| POST /rota/adimlar/:id/gerceklesen-sure | rota.sure-kabul | Kişi ve zaman sunucudan; okunan son satır (eski 409, kilit altında); işlem sıfır olamaz (RT-75); fason adıma girilmez; bilinmeyen makine 409; istek kimliği; defter yalnız eklenir (`rota_gerceklesen_sure_degismez`) | U RT-73/74 (planlama ölçüm yazar, boş giriş boşaltır; plan değişmez) | U RT-75 (sıfır 400, operatör/kalite/CAM 403, eski okunan 409, bilinmeyen adım 404, fason 422, yinelenen istek tek satır, UPDATE reddi) |
| POST /rota/adimlar/:id/gerceklesen-sure/kabul | rota.sure-kabul | Kişi ve zaman sunucudan, değer ölçüm satırından ya da (deger: ortanca, 2564 a) sunucunun hesapladığı pencere ortancasından (istemci süre göndermez; ortancada ölçüm pencerenin son ölçümü olmalı, değilse 422); yalnız bu adımın bu türdeki bekleyen ölçümü, makineye özgü kabulde başka makinenin ölçümü değil (RT-77); okunan son satır (eski 409, kilit altında); taslak açık taslak ya da yürürlükteki revizyondan yeni taslak, onaydaki varsa 409; içerik yazımı mevcut revizyon kilidiyle (`rota_icerik_kilitli`); kabul eden düzenleyen olur, onayı başkası verir (RT-18); fason adıma girilmez; istek kimliği; defter yalnız eklenir | U RT-77/78/79 (planlama kabul eder, taslağa yazar, müdür onaylar, yürürlükte boşalır) | U RT-77 (operatör/kalite/CAM 403; başka adım, başka tür, boşaltma satırı, başka makine 422; bilinmeyen ölçüm ve adım 404; eski okunan 409; onaydaki revizyon 409; yinelenen istek tek taslak) |
| Olay: emir bitti -> rota (uç değil; bağ `kablolama.ts`) | yok (komutun işlemi: `terminal.uret`) | Emir bitirme komutuyla aynı işlemde; yazan kişi bitiren, değer uretim-emirleri `isEmriSureOzeti`'nden; yalnız rotada olan OP, makine ya da kişi iş emri; iş emri başına bir kez; eksik veri reddedilmez, atlanır (ret bitirmeyi geri alırdı) | U RT-76 | U RT-76 (ikinci çağrı satır yazmaz) |

Kullanıcı metni (adım adı, açıklama, talimat, revizyon notu) düz metindir: ekranda React metni olarak basılır (kaçırılır); HTML ve SVG
yorumlanmaz, `dangerouslySetInnerHTML` kullanılmaz. Kapsam: rota verisi iş merkezi kısıtlı değildir (iş merkezi kısıtı rota okuma ve
yazmasına uygulanmaz; VARSAYIM, ON-PAKET V6).

## Yalnız ekranda kalan kurallar

- Seçim listelerinde pasif kaynağın ve kapalı operasyon tipinin gösterilmemesi (sunucu yine de yeni seçimi reddeder).
- İlk değişiklikte taslağın kendiliğinden açılması ve geri al / yinele geçmişi (oturumluk; sunucu her kaydı ayrı komut ve sürümle alır).
- "Taslağı ilk revizyona çevir": ekran iptal ve taslak aç komutlarını sırayla gönderir (sunucuda tek komut değil).
- Akış şemasının çizimi, yakınlaştırma, tahta ve yüzen kart.

## İşlem şartnamesi (971 a, 976 a) - test adları `sartname.test.ts`

| Yol | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /rota/sartnameler, /rota/sartnameler/:id, /rota/revizyonlar/:id/sartnameler, /rota/is-emri-sartnameleri | ROTA_OKUR (kalite Reçete ve Rota sayfasıyla okur) | Yan etkisiz okuma; olmayan şartname 404 | varsayılan kütüphane; adım şartnamesi; 971 a | varsayılan kütüphane (404, operatör 403); `uc-yetkisi.test.ts` |
| POST /rota/sartnameler/ekle, /:id/kopyala, /:id/kunye, /:id/surum-ac, /:id/taslak-kaydet, /:id/taslak-sil, /rota/standartlar/ekle | rota.sartname-yaz (kalite, planlama_muduru, planlama_proje; 2491 c) | Sürüm denetimi; kod ve numara tekil; şablon biçimi; müşteri firma ve belge no birlikte; açan kişi sunucudan | 976 a; müşteri şartnamesi; taslak şablonu; standart atfı | 976 a (403, 409); müşteri (400); taslak şablonu (400, 422) |
| POST /rota/sartnameler/:id/yayinla, /pasife-al, /etkinlestir | rota.sartname-yayinla (kalite, planlama_muduru, planlama_proje; 2491 c) | Sabit zorunlu alan dolu; yayınlanan sürüm değişmez (tetikleyici); yayınlayan ve zaman sunucudan | 976 a; yayınlanmış sürüm; kullanımdan kalkan | 976 a (403); taslak şablonu (422); yayınlanmış sürüm (SQL reddi) |
| POST talimat-adimli-yaz, talimat-taslak-kaydet `kaynakSablon` (2588 a) | rota.talimat-yaz (değişmedi) | Şablon satırı kilitlenir; olmayan şablon 404, ekranın gördüğünden farklı sürüm 409; verilmezse köken dayanılan sürümden devralınır; köken yalnız eklenir (tetikleyici) | U 2588 a | U 2588 a (404, 409, UPDATE reddi; kopyalarda operatör 403) |
| POST /rota/revizyonlar/:id/adim-sartnameleri | rota.revizyon-yaz | Yalnız taslak ve okunan sürümle; adım var; kapsam adımın kaynağına uyar; yalnız adımda değişen alan ve türüne uyan değer | adım şartnamesi | adım şartnamesi (403, 400, 409); onaya giden revizyon (409) |
| GET /rota/olcu-aleti-turleri (2893-4 a) | rota okuma işlemleri | Yalnız açık tür kimliği ve adı (kalibrasyon kayıtları, alet ve vade yok) | adım ekipmanı | rota-ekipman.test.ts (operatör 403) |
| POST /rota/revizyonlar/:id/adim-ekipmani (2893-4 a) | rota.revizyon-yaz | Yalnız taslak ve okunan sürümle; adım var; liste bütün yazılır; yeni aparat kartı kullanımda, yeni ölçü aleti türü açık; aynı öğe iki kez yok. Kaydet listeyi göndermezse kayıtlı liste korunur | adım ekipmanı | rota-ekipman.test.ts (403, 400, 409; kaydet koruması; emre kopya, kol kopyası) |
| emre-kopyala, yururlukteki-rotayi-uygula (var olan uçlar) | rota.emre-kopyala | Sabitleme aynı işlemde; yayınlanmamış ya da zorunlu alanı boş şartname emri geri alır; sabitleme yalnız eklenir | 971 a; emre uygulama | emir açılırken (422, emir sayısı değişmez) |
| POST /rota/emirler/:emirId/is-emirleri/:isEmriId/sartnameler (1034) | uretim-emirleri.yaz ya da plan.canliya-al (rework adımı komutuyla aynı) | İstek kimliği; emrin okunan sürümü; yalnız bekleyen rework/tamir/ek adımı ve açık emir; iş emri o emirde olmalı; kapsam, yürürlükteki sürüm, zorunlu alan; sabitleyen kişi sunucudan; aynı iş emrine eşzamanlı komut kilitle sıraya girer | 1034 rework adımına şartname | aynı test (operatör 403, rota adımı 409, eski sürüm 409, başka emrin iş emri 404, zorunlu boş ve kapsam dışı 400) |

## Eylemlere bölme (3165 a)

`rota.yaz` beş eyleme bölündü; eski işlem hiçbir ucu açmaz (okumayı da), satırı ayrı kartla kalkar. Göç `kisiler_rota_eylemleri` eski işlemi taşıyan role, kişi ekine ve kişiden alınana beşini kopyalar.

| Eylem | Uçlar |
|---|---|
| rota.revizyon-yaz | /rota/revizyonlar/:id/kaydet, /iptal, /kopyala, /adim-sartnameleri, /adim-ekipmani; /rota/adimlar/toplu-kaydet (Excel) |
| rota.onaya-gonder | /rota/revizyonlar/:id/onaya-gonder |
| rota.sablon-yaz | /rota/sablonlar/ekle, /:id/kaydet, /:id/varsayilan-yap, /:id/sil |
| rota.taslak-ac | /rota/karttan-taslaklar, /rota/urunler/:urunId/taslak-ac, /rota/urunler/:urunId/kopya-iste (ya da malzemeler.yaz) |
| rota.sure-kabul | /rota/adimlar/:id/gerceklesen-sure, /gerceklesen-sure/kabul |

- Excel açık taslağı olmayan üründe taslak açacaksa `rota.taslak-ac` de ister (serviste, tek transaction; red hiçbir şey yazmaz). U: rota.test.ts "3165 a".
- Gerçekleşen süre kabulü açık taslak yoksa yürürlükteki revizyondan taslağı kendisi açar ve ölçümü yazar; `rota.sure-kabul` bunun için yeterlidir (VARSAYIM: eylemin tanımı bu; ayrıca taslak açma istenirse tek satır).
- Revizyon komut listesi (`izinliKomutlar`): kaydet, iptal `rota.revizyon-yaz`; onaya-gonder `rota.onaya-gonder`; kopyala `rota.revizyon-yaz` ile `rota.taslak-ac` birlikte. U: kurallar.test.ts "3165 a".
- Kopyala hedef üründe yeni taslak açar: uç `rota.revizyon-yaz` ister, servis `rota.taslak-ac` de arar ve yoksa hiçbir şey yazmadan 403 döner (Risk D7 K1). U: rota.test.ts "3165 a".
- Reçete ve Rota'nın rota dilimi (`recete-rota/servis.ts` ROTA_OKUMA) eski anahtarı saymaz (Risk D7 K2). U: rota-dilimi.test.ts RRR-4.
- U: eylem-bolme.test.ts (hiçbir uç eski işlemi istemez, 16 yazma ucu tek eylem ister; rol x uç tablosu önce/sonra aynı; göç kopyası).
