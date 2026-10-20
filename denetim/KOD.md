# Kod degerlendirme (KOD.md)

Yazan: "Kod degerlendirme (6 saatte bir)" rutini. Salt okuma; depoya yazilmaz. Kapsam disi: kural/ADR uyumu, kararlar, modul sahipligi (denetim rutini bakar), lint bicim sorunlari.

## Derin inceleme sirasi
Kaynak: `npm run harita` (6e04d3e). Son madde (cekirdek) haritada modul olarak gecmez; VARSAYIM ile eklendi (sunucu/cekirdek + paylasilan).
1. arkon (sunucu/moduller/arkon, istemci/src/moduller/arkon, arkon/web)
2. ayarlar
3. denetim
4. dosya
5. durus-nedenleri
6. finans
7. istasyonlar
8. istek-kimligi
9. kalibrasyon
10. kisiler
11. malzemeler
12. oturum
13. plan
14. rota
15. saglik
16. satin-alma
17. sistem
18. stok
19. terminal
20. uretim-emirleri
21. vardiya
22. cekirdek (sunucu/cekirdek, paylasilan)
23. logo (VARSAYIM: 0aae1c8 haritasinda yeni modul, sona eklendi)
24. atolye (VARSAYIM: 64b00dfd'de yeni modul, sona eklendi)
25. sevkiyat (VARSAYIM: 64b00dfd'de yeni modul, sona eklendi)

Son incelenen sira: 8 (istek-kimligi) · Siradaki: 9 (kalibrasyon)
Son numara: KD-062

## Kayitlar

[2026-10-09 04:50 UTC] 6e04d3e46f2850a2e4ba030b0988fcf146c7b929 · derin: arkon
Ilk calisma: KOD.md yoktu, fark incelemesi atlandi.
Kod notu: 6/10. Sunucu tarafinda kilit ve kayit noktasi isi ozenli, ama tablet istemcisi sunucu hatasinda uretim sayimini sessizce dusuruyor ve 2 saniyelik ileti yoklamasi kisitli kiside her seferinde butun paketleri okuyor.

Yeni bulgular:

KD-001 | YUKSEK | arkon/web/src/data/store.ts:272
Sorun: Log.add sunucudan 5xx (or. 503 veritabani yok, 500) aldiginda kaydi kuyruga almiyor ve hatayi yutuyor; yalniz `e.offline` (fetch hic donmedi) durumu kuyruga giriyor.
Nasil kirilir: PostgreSQL 30 saniye yeniden baslarken operator "saglam 10" sayar; sunucu 503 doner, kayit yalniz tabletin IndexedDB'sinde (log_counts) kalir, outbox'a girmez, operatore ileti cikmaz; TMI emrine sayim hic yazilmaz. (flush() 5xx'i dogru ele aliyor: store.ts:157; dogrudan yol almiyor.)

KD-002 | YUKSEK | sunucu/moduller/arkon/servis.ts:749
Sorun: iletiler() her cagrida, yeni ileti olmasa bile, kisitli kiside kapsamSiniri() ve paketleriOnYukle() kosuyor; bu `SELECT govde->>'machine', govde->>'mc' FROM arkon_belge WHERE depo='pkgs'` ile butun paket govdelerini (cizim svg'leri dahil, TOAST'tan acarak) okur.
Nasil kirilir: istemci 2 sn'de bir yokluyor (istemci/src/moduller/arkon/baglanti.ts:14 ILETI_ARALIGI_MS). Is merkezi kisitli 20 tablet ve 500 paket (cizimli, paket basina yuzlerce KB) varken saniyede ~10 kez tum paket tablosu acilir; veritabani CPU'su bos ekranlar yuzunden dolar. Ek olarak her yoklamada isMerkezleri, istasyonlar, aktifMakineler okunur.

KD-003 | ORTA | sunucu/moduller/arkon/servis.ts:221
Sorun: belgelerHam('pkgs') kayitli her paket icin ayri iptalEmriMi -> emirOzeti sorgusu atiyor (N+1); belgeBul() tek taslak paket icin taslakPaketler() ile butun acik emirleri ve istasyonlari kurup arasindan birini seciyor (servis.ts:272), kapsaminda() bunu yazmada ikinci kez yapiyor (servis.ts:294).
Nasil kirilir: 400 kayitli paket ve 300 acik emirde paket listesini acan her tablet 400+ sorgu atar; taslak pakete tek yazim 300 emri iki kez okur ve donusturur.

KD-004 | ORTA | sunucu/moduller/arkon/sorgular.ts:262
Sorun: Her ileti eklemede 15 dakikadan eski iletiler siliniyor, ama iletiler() istemcinin `son` imlecinin silinen araliga dustugunu bildirmiyor; istemci (baglanti.ts:221) imleci korur ve bosluk tespiti yok.
Nasil kirilir: tablet 20 dakika ag disinda kalir; bu sirada planlamaci paketi yeniden yayinlar ($db iletisi). Tablet donunce yalniz son 15 dakikanin iletilerini alir, paket degisikligini hic duymaz ve operator eski paket surumuyle calismaya devam eder (ekran o depoyu yeniden okuyana kadar).

KD-005 | ORTA | sunucu/moduller/arkon/sorgular.ts:389
Sorun: paketCalistiMi (her "running" olayinda) ve kayitlar() paket/emir suzgeci arkon_kayit uzerinde paket_id / emir_no dizini olmadan calisiyor; tek dizin (tur, zaman) (20261007151000_arkon.sql:31).
Nasil kirilir: bir yilda yuz binlerce "events" satiri biriktiginde her Baslat istegi o turun butun satirlarini tarar; ilk parca kapisi her baslatmada yavaslar ve kayit isteginin kilit butcesini tuketir.

KD-006 | ORTA | sunucu/moduller/arkon/servis.ts:574
Sorun: korumaliIsle ve bekleyenleriSupur (servis.ts:591) butun hatalari bos catch ile yutuyor; gunluge hicbir sey yazilmiyor.
Nasil kirilir: emrinBekleyenleriniIsle icinde satir disi bir hata (or. bekleyenYansimalar sorgusunda bozuk govde yuzunden TypeError) her istekte geri alinir; satirlar `bekliyor`, deneme 0, son_hata bos kalir, kimse nedenini goremez ve sayimlar emre hic yazilmaz.

KD-007 | ORTA | sunucu/moduller/arkon/servis.ts:647
Sorun: Operatorun kayit istegi kendi isinden sonra baska emirlerin birikmis yansimalarini (en cok 10 emir, emir basina butun bekleyenler) ayni istek icinde, eszamanli olarak isliyor.
Nasil kirilir: uretim-emirleri tablolari uzun bir islemle kilitliyken her sayim istegi 10 emir x bekleyen satir x sorgu sure sinirina kadar bekler; tablette sayim dugmesi saniyelerce donar ve istemci zaman asimiyla kaydi yeniden kuyruga atar.

KD-008 | DUSUK | sunucu/moduller/arkon/servis.ts:64
Sorun: kisiler() her kisi icin ayri kisininIzinliIsMerkezleri sorgusu atiyor (N+1).
Nasil kirilir: 150 kisilik listede /arkon/kisiler 150+ sorgu atar; Arkon her acilista cagirir.

Duzelen: yok (ilk calisma) · Hala acik: KD-001..KD-008 (1. kez)

En kotu 3 dosya:
1. sunucu/moduller/arkon/servis.ts: 826 satir; kapsam, yansima kuyrugu, dosya yukleme, ileti ve belge isi tek dosyada; N+1 ve yutulan hatalar burada.
2. arkon/web/src/data/store.ts: tek satira sikistirilmis fonksiyonlar, cok sayida bos catch; KD-001 burada.
3. sunucu/moduller/arkon/kurallar.ts: 1178 satir tek dosya; saf ama surum, kapsam, yetki matrisi, cizim denetimi ve yansima karari ic ice.

[2026-10-09 06:46 UTC] 47c5eb4 (onceki 6e04d3e; 120 kod dosyasi, +3269/-605) · derin: ayarlar
Fark incelemesi iki parcada yapildi (stok/satin-alma/malzemeler; rota/istasyonlar/arkon/kalibrasyon/durus-nedenleri/ayarlar/kisiler/istemci stok ve talep).
Kod notu: 5/10. Yeni stok ve talep akisinda stoku ve satin almayi yanlis sayiya goturen uc somut yol var (siparis satiri malzemesi denetlenmiyor, elle yeniden gonderim cift hareket yazar, "1.000" bir olarak kaydedilir).

Yeni bulgular:

KD-009 | YUKSEK | sunucu/moduller/stok/servis.ts:347
Sorun: Mal kabul satirindaki malzemeId ile secilen siparis satirinin malzemesinin ayni oldugu ne stokta ne satin-alma/servis.ts:403 teslimIsle'de denetleniyor.
Nasil kirilir: depocu A kartindan 10 adet kabul eder ama siparis satiri olarak B kartinin satirini secer; stokta A artar, satin almada B "teslim alindi/fazla teslim" gorunur, A'nin siparisi acik kalir. stok.test.ts fiksturu katalogsuz kalem actigi icin bu yol hic sinanmiyor.

KD-010 | YUKSEK | istemci/src/moduller/stok/ortak.tsx:17
Sorun: korumaliPost her cagrida yeni istek kimligi uretiyor; tekrar korumasi yalniz tek cagrinin kendi otomatik denemelerini kapsiyor, elle yeniden gonderimi kapsamiyor (ayni kalip: istemci/src/moduller/satin-alma/talep/TalepAc.tsx:105, govde.id her tiklamada yeni).
Nasil kirilir: mal kabul sunucuda islenir ama atolye wifi'si kopuk oldugu icin uc deneme de cevapsiz kalir; ekran "Kaydedilemedi, yeniden deneyin" der, depocu ag donunce yeniden basar ve yeni kimlikle ikinci mal kabul yazilir; stok iki kat artar. Ayni yoldan cift satin alma talebi acilir.

KD-011 | YUKSEK | istemci/src/moduller/satin-alma/talep/TalepAc.tsx:17
Sorun: ondalik() yalniz ilk virgulu noktaya ceviriyor, binlik noktayi silmiyor (stoktaki miktarGirdisi siliyor).
Nasil kirilir: kullanici bin adet icin "1.000" yazar; sunucuya "1.000" gider ve 1 adet talep acilir, hata cikmaz. "1.250,5" yazilinca "1.250.5" gider ve reddedilir.

KD-012 | ORTA | sunucu/moduller/satin-alma/servis.ts:248
Sorun: hizliAc katalogda olmayan kart icin kendiliginden katalogEkle yapiyor; kod `max(kod)+1` ile kilitsiz uretiliyor ve malzeme_no benzersiz degil (satin-alma/sorgular.ts:300).
Nasil kirilir: iki kisi ayni yeni karti ayni anda hizli talebe koyar; ikisi de ayni kodu hesaplar, ikincisi benzersizlik ihlaline carpip 500 alir; siralama farkliysa ayni malzeme_no icin iki katalog kalemi acilir ve katalog bagi hangisini alacagini rastgele secer.

KD-013 | ORTA | sunucu/moduller/stok/servis.ts:514
Sorun: "Hizmet stoklanmaz" denetimi (stoklanirMi) yalniz mal kabulde var; sayimYap tur denetimi yapmiyor.
Nasil kirilir: POST /stok/sayim ile hizmet kartinin no'su, beklenen 0, sayilan 5 gonderilir; sayim_fazla hareketi yazilir ve hizmet icin stok bakiyesi olusur.

KD-014 | ORTA | sunucu/gocler/20261009043500_arkon_kayit_kimlik.sql:13
Sorun: Kodlu arkon_kayit satiri varsa goc RAISE EXCEPTION ile duruyor ve bu "onayi" verecek hicbir yol (bayrak, ayar, ayri adim) yok.
Nasil kirilir: Arkon'un bir kez kullanildigi her veritabaninda counts/events satirlari makine kodu tasir; `npm run goc` bu dosyada kalici durur ve arkasindaki butun gocler (20261009051324, 20261009053000 ...) hic kosmaz. Asmanin tek yolu goc dosyasini degistirmek, bu da goc damgasini bozar.

KD-015 | ORTA | sunucu/moduller/ayarlar/servis.ts:28
Sorun: ayarlariListele her ayar icin gecerliDeger cagiriyor; bu, saklanan deger tanimin turune uymazsa duz Error firlatiyor (kurallar.ts:20), yani tek bozuk ayar butun listeyi 500'e dusuruyor.
Nasil kirilir: bir ayarin turu boolean'dan sayiya cevrilir, saklanan `true` kalir; GET /ayarlar 500 doner, Sistem Ayarlari ekrani hic acilmaz. kurallar.ts:24'teki "ekrandan onarmanin tek yolu ustune yazmaktir" yolu bu yuzden kapali; ayrica o ayari okuyan her modul istegi de 500 alir.

KD-016 | ORTA | sunucu/moduller/ayarlar/servis.ts:37
Sorun: Ayar degistirme eski degeri kilitsiz okuyup yaziyor; surum ya da FOR UPDATE yok, denetim kaydindaki "eski" deger yanlis olabiliyor.
Nasil kirilir: iki yonetici ayni anda ayni ayari 3'ten 5'e ve 7'ye cevirir; ikisi de eski=3 okur, son yazan kazanir ve denetim kaydinda iki ayri "3 -> x" degisikligi gorunur; birinin degisikliginin ezildigi hicbir yerde gorunmez.

KD-017 | ORTA | sunucu/moduller/arkon/servis.ts:618
Sorun: Yeni istasyon_id / is_merkezi_id kaydin zamanina gore degil bugunku kod haritasindan birebir eslesmeyle cozuluyor; ayni farkta gelen eskiKoddanKimlikCoz(..., zaman) kullanilmiyor, kirpma ve buyuk-kucuk harf esitlemesi yok.
Nasil kirilir: tablet cevrimdisiyken "IST-1" koduyla sayim kuyruga alir; bu arada istasyon "IST-1A" olur; kuyruk bosalinca kayit istasyon_id = null ile yazilir ve bag kalici kopar (kayit-kimlik.test.ts bu davranisi dogru diye sabitliyor). Ayrica her kayitEkle istegi, kodsuz turlerde bile, butun istasyon ve is merkezi tablolarini okur.

KD-018 | ORTA | sunucu/moduller/rota/kurallar.ts:187
Sorun: Fason adimda sure ve termin denetleniyor ama aday kaynak (makine/kisi) ve makineKullanimi 'paralel' reddedilmiyor.
Nasil kirilir: planci fason "Kaplama" adimina aday makine ekler; kayit ve onay gecer, revizyon adimi `kaynak: null, fason: {...}, adaylar: [M-02]` olarak verir; adaylardan yerlesim yapan plan fason isi makineye yukleyebilir, onayaHazirMi de bu adaylarin aktifligini denetleyip onayi gereksiz durdurabilir.

Kayda girmeyen (sinir 10): stok adla aramanin 200 kartta sessiz kesilmesi (stok/servis.ts:237), taleplerim'in butun satirlari okuyup bellekte kesmesi (satin-alma/servis.ts:228), istasyonlar zamanli cozumde olusturulma zamanina bakilmamasi (istasyonlar/sorgular.ts:209), hizmet reddinin yalniz saf testte sinanmasi (stok/kurallar.test.ts:135). Sonraki calismada yeniden degerlendirilir.

Duzelen: yok · Hala acik: KD-001..KD-008 (2. kez; arkon/servis.ts ve sorgular.ts degisti ama bu satirlara dokunulmadi: servis.ts:759 paketleriOnYukle, sorgular.ts:262 ileti silme, store.ts:272 Log.add ayni)

En kotu 3 dosya:
1. sunucu/moduller/stok/servis.ts: siparis bagi yanlis malzemeye teslim yazdiriyor, hizmet kurali sayimda delik.
2. istemci/src/moduller/stok/ortak.tsx: butun stok hareket komutlarinin tek gonderim yolu elle yeniden denemede cift hareket yazdiriyor.
3. sunucu/moduller/arkon/servis.ts: bu dosyadaki 5 acik bulgu (KD-002, 003, 006, 007, 008) duruyor, ustune istek basina tam tablo okuyan kod haritasi eklendi.

[2026-10-11 18:47 UTC] 0aae1c8 (onceki 47c5eb4; 354 kod dosyasi, +24454/-2511) · derin: denetim
Fark alti parcada incelendi (uretim-emirleri/plan; arkon/vardiya; logo/stok/finans/satin-alma/rota; cekirdek ve kalan sunucu ile gocler; istemci moduller; istemci ortak). 47c5eb4 ile bu calisma arasindaki 6 saatlik turlar kayit uretmedi; fark bu yuzden buyuk.
Kod notu: 5/10. Eski bulgularin cogu duzgun kapatilmis, ama yeni kod ayni siniflari tekrarliyor: calismayan bir ekran dugmesi, emri sonsuza dek acik birakan rota uygulamasi, 50'de kesilen fason firma listesi ve goc zincirini durdurabilen bir NULL.
Derin inceleme (denetim): 7/10. Kayit append-only tetikleyicilerle korunuyor, okuma yeniden maskeliyor, sozlesme ve sayfalama duzgun; zayif yan buyuyen tabloda dizinsiz suzgec ve tam tarama.

Yeni bulgular:

KD-019 | YUKSEK | istemci/src/moduller/satin-alma/merkez/ui.ts:1146
Sorun: order-item-save once closeModal() ile pencerenin icini siliyor (ui.ts:29, modal-root innerHTML = ""), sonra $("#oc-item").value okuyor; oge artik yok, TypeError atiliyor.
Nasil kirilir: onay yetkilisi siparis kaleminin miktarini degistirir, gerekce yazar, "Degistir"e basar; pencere kapanir, siparisKalemiDegistir hic cagrilmaz, hata ya da bildirim cikmaz, girilen degisiklik kaybolur. Ozellik hic calismiyor; bu yol icin test yok.

KD-020 | YUKSEK | sunucu/moduller/uretim-emirleri/is-emri-servis.ts:184
Sorun: isEmirleriniYenile bekleyen is emirlerini silebiliyor ama sonunda emrin en az bir bekleyen is emri kalip kalmadigina ve durumuna bakmiyor.
Nasil kirilir: emirde OP10 bitti, OP20 bekliyor; yeni rota revizyonu OP20'yi kaldirir ve emre uygulanir. OP20 silinir, siradaki istasyon null olur; butun is emirleri bitmis oldugu halde emir "planli" kalir. Terminale dusmez, iptal baslamis is emri var diye reddedilir, bitiren yol yok; emir acik sayacinda kalici kalir (bitirme ve iptal reddi alt ajan okumasi, VARSAYIM; denetim eksigi DOGRULANDI).

KD-021 | YUKSEK | sunucu/moduller/rota/servis.ts:138
Sorun: fasonFirmalar firmaAra'yi 200 sinirla cagiriyor ama finans aramaSiniri bunu FIRMA_ARAMA_SINIRI=50'ye kesiyor (finans/kurallar.ts:61, paylasilan/sozlesme/finans.ts:8); fason suzgeci bu ilk 50 kayda bellekte uygulaniyor.
Nasil kirilir: finansta 60 aktif firma var; adla siralamada 50'nin otesine dusen fason firma rota seceneklerinde hic gorunmez ve fason adima secilemez, hata cikmaz.

KD-022 | YUKSEK | sunucu/gocler/20261011134500_kalibrasyon_arkon_kopyasi.sql:38
Sorun: kullanim_disi degeri `b.govde ->> 'status' = 'out'` olarak aciktan yaziliyor; status yoksa ifade NULL, sutun NOT NULL (20261006104020_kalibrasyon_tablolar.sql:23), DEFAULT devreye girmez.
Nasil kirilir: status alani olmayan tek bir Arkon alet belgesi `npm run goc`'u not-null ihlaliyle durdurur ve arkasindaki goclerin hicbiri kosmaz; asmanin yolu goc dosyasini degistirmek (KD-014 ile ayni sinif). Testlerdeki butun fiksturler status tasiyor. Boyle bir belgenin var olmasi VARSAYIM (sunucu gauges govdesinde status denetlemiyor).

KD-023 | YUKSEK | sunucu/moduller/arkon/servis.ts:208
Sorun: Tek is emri paketi icin isEmriTaslagi butun pkgs belgelerini govdeleriyle (sorgular.belgeler), butun acik emirleri, planlanacak is emirlerini ve canli sirayi okuyor; belge() kayitsiz pakette bunu iki kez yapiyor (belgeBul icinde servis.ts:417 ve servis.ts:428). belgeYaz ve belgeSil ayni yolu kullaniyor.
Nasil kirilir: 500 paket, her biri cizimli; 20 tablet paket acar ya da $db iletisinden sonra yeniden okur. Her GET /arkon/belgeler/pkgs/tmi-ie-N butun paket tablosunu TOAST'tan acar; kayitli pakette sablon gerekmedigi halde tam okuma yine yapilir.

KD-024 | ORTA | istemci/src/moduller/rota/EmirlerEkrani.tsx:134
Sorun: Onizleme penceresindeki onay ac.mutate(t) ile o anki formu (f, satir 101-102) gonderiyor, onizlenen girdiyi degil.
Nasil kirilir: planci 100 adetle onizler, tarihleri gorur; pencere acikken adedi 1000 yapar ve "Yeniden hesapla"ya basmadan onaylar; 1000 adetlik emir 100 adet icin gosterilen teslim tarihine guvenilerek acilir.

KD-025 | ORTA | istemci/src/moduller/rota/EmirlerEkrani.tsx:102
Sorun: Uretim emri adedi Number(f.adet) ile cevriliyor; Turkce binlik nokta ondalik sayiliyor (KD-011 ile ayni sinif, baska ekran).
Nasil kirilir: planci bin adet icin "1.000" yazar; Number("1.000") = 1 > 0 oldugu icin dugme acik kalir ve 1 adetlik uretim emri acilir, onizleme de 1 adetle hesaplanir.

KD-026 | ORTA | sunucu/gocler/20261011132800_vardiya_arkon_kopyasi.sql:25
Sorun: Goc Arkon molalarini vardiya icinde ve cakismasiz mi diye denetlemeden kopyaliyor; vardiyaParcalari (vardiya/kurallar.ts:102) da molayi vardiya sonuyla sinirlamiyor.
Nasil kirilir: 08:00-16:00 vardiyasinda mola "07:30, 30 dk" kayitli; goc yazar, vardiyaParcalari calismayi ertesi gun 07:30'a uzatir ve plan gunluk kapasiteyi kat kat sayar. Cakisan iki molada net dakika eksik cikar (alt ajan denemesi; VARSAYIM, burada yeniden kosulmadi).

KD-027 | ORTA | sunucu/moduller/plan/servis.ts:193
Sorun: baglamKur her cagrida N+1 calistiriyor (baslamis emrin her is emri icin isEmriOzeti, her istasyon icin istasyondakiMakineler) ve ayni istekte birden cok kez kosuyor (taslagaYaz 2 kez, senaryolar 1 + acik taslak sayisi kadar, menuSayaclari her cagrida).
Nasil kirilir: istemci ikinci menu sayaclarini 30 saniyede bir yokluyor (istemci/src/ortak/veri/ikinci-menu-sayaclari.ts:5); 20 acik ekran, 300 is emri ve 40 istasyonda her yoklama yuzlerce sorgu atar.

KD-028 | ORTA | sunucu/moduller/denetim/sorgular.ts:55
Sorun: suzgecSecenekleri (GET /denetim-kayitlari/suzgecler) her acilista denetim_kaydi uzerinde iki tam DISTINCT tarama yapiyor (kayitliKisiler, kayitliKomutlar); yol suzgecinin dizini yok, liste sayimi count(*). Tablo append-only ve her komutla buyuyor.
Nasil kirilir: bir yilda milyonlarca satir birikir; Denetim Kaydi ekraninin her acilisi iki tam tarama, yol ile her suzme bir tam tarama daha yapar; ekran yavaslar ve ayni sunucudaki uretim isteklerini yavaslatir. Silme yolu olmadigi icin zamanla duzelmez.

Kayda girmeyen (sinir 10): stok/servis.ts:154 pano sayisinda acik emir basina tamamlamaPlani (N+1); satin-alma/servis.ts:374 fatura bagi denetiminin en yeni 200 faturayla sinirli olmasi; logo/sorgular.ts:111 bos ya da tekrarli birim seti listesinin dogrulanmadan yazilmasi; kalibrasyon gocu:57 ayni gun uygunsuz kayda ek 'uygun' kayit; oturum/sorgular.ts:88 PIN denemesinin yalniz (kullanici, ip) ile sinirlanmasi; istemci/src/ortak/rota/gezinme-gecmisi.ts:89 401 ile biten oturumda gecmisin silinmemesi (ortak PC'de onceki kisinin sayfalari) ve :90 "default" anahtarli ilk adim; rota/KanbanEkrani.tsx:47 ust uste surukle-birakta bayat taslak hedefi; plan/servis.ts:832 degisiklikKaldir'in sonraki degisiklikleri ezmesi; is-emri-servis.ts:87 pasif kisinin kaynak olarak gecmesi; vardiya/servis.ts:227 ve arkon/servis.ts:1040 N+1; vardiya/kurallar.ts:242 istasyon secimi istasyonlar modulunden farkli; plan/servis.ts:572 yinelenen isEmriIdleri; PlanEkrani.tsx:99 bos tamponun 0 yazilmasi; sozlesme/satin-alma.ts:157 miktarda ondalik sinir yok; istasyonlar sorgular.ts:503 yetkinlik yarisi ve servis.ts:396 N+1. Onceki turdan: stok 200 kart, taleplerim, istasyonlar zamanli cozum, hizmet reddi testi. Sonraki calismada yeniden degerlendirilir.

Duzelen: KD-001 (store.ts:292 gonder, 5xx kuyrukta kalir: gonderim-hatasi.ts:7), KD-002 (servis.ts iletiler paketleriAnanlariOnYukle), KD-003 (belgelerHam acikEmirler + emirDurumlari toplu; KD-023 ayri yol), KD-004 (8088f2cf, ILETI_YENIDEN_YUKLE kurallar.ts:1376; istemci tarafi okunmadi), KD-005 (20261009170500 arkon_kayit_paket_idx), KD-006 (korumaliIsle neden yazar, servis.ts:976), KD-007 (istek yalniz kendi emirlerini isler, birikmis bekleyenleriYinele arka plan isinde, servis.ts:994), KD-009 (stok/servis.ts:411 siparisMalzemeEngeli), KD-010 (stok/ortak.tsx:22 sonucu bilinmeyen gonderimde ayni kimlik; TalepAc.tsx:94 kimlik yalniz girdi degisince yenilenir), KD-011 (TalepAc.tsx:17 miktarOku), KD-012 (satin-alma katalogEklemeKilidi), KD-013 (stok/servis.ts:107), KD-015 (ayarlar listeDegeri, gecersiz bayragi), KD-016 (ayarlar/servis.ts:44 ayarKilitle), KD-017 (8088f2cf; kayit zamaniyla cozum), KD-018 (rota/kurallar.ts:173 RT-69).
Hala acik: KD-008 (3. kez; arkon/servis.ts:93 isMerkeziKodlari kisi basina; ayni sinif istasyonlar/servis.ts:396'ya da tasindi), KD-014 (2. kez; 20261009043500_arkon_kayit_kimlik.sql:13 RAISE EXCEPTION duruyor).
3+ kez tekrar eden: KD-008.

En kotu 3 dosya:
1. sunucu/moduller/arkon/servis.ts: 1300 satira cikti; tek paket okumasi butun paket, emir ve plan tablolarini tariyor (KD-023), KD-008 ucuncu kez acik.
2. sunucu/moduller/plan/servis.ts: 953 satir; istek basina birkac kez kurulan agir baglam (KD-027), geri almada kaybolan degisiklik, cakisma denetimsiz canliya alma.
3. istemci/src/moduller/rota/EmirlerEkrani.tsx: uretim emri acan ana form; adet ayristirma ve onizleme-onay tutarsizligi dogrudan yanlis emir yaziyor (KD-024, KD-025).

[2026-10-12 00:46 UTC] 64b00dfd (onceki 0aae1c8; 333 kod dosyasi, +28937/-606) · derin: dosya
Fark bes parcada incelendi (atolye sunucu; atolye istemci; sevkiyat; kalan sunucu ve gocler; kalan istemci). Farkin yarisindan cogu iki yeni modul: atolye ve sevkiyat.
Kod notu: 5/10. Uc eski bulgu duzgun kapatildi, ama yeni iki modul eszamanlilik sozlerini kilitsiz veriyor (sevkiyat taslagi, atolye krokisi, ATL-31) ve bir ayar ekrani tek tikla kapatilmis butun sayfalari geri acabiliyor.
Derin inceleme (dosya): 7/10. Kisi ve ozet kilidi, ozet dogrulamasi, icerikten tur bulma, bag kilidi ve nosniff ozenli; zayif yan her parcada tekrarlanan tam tablo toplamlari.

Yeni bulgular:

KD-029 | YUKSEK | istemci/src/moduller/ayarlar/SayfaAyarlari.tsx:30
Sorun: Kapali sayfa listesi sunucuya surumsuz tam liste olarak yaziliyor; liste staleTime Infinity onbellekten kuruluyor ve gelmemisse ya da hata verdiyse bos dizi donuyor (istemci/src/ortak/veri/kapali-sayfalar.ts:15-17), ekran yukleniyor ya da hata durumunu gostermiyor.
Nasil kirilir: GET /kapali-sayfalar gecici 500 doner; ekranda butun sayfalar acik gorunur, yonetici bir sayfayi kapatir, govde {kapali:["/x"]} gider ve daha once kapatilmis butun sayfalar herkesin menusune geri gelir. Iki yonetici ayni anda calisirsa birinin kapattigi sayfa otekinin eski listesiyle sessizce yeniden acilir.

KD-030 | YUKSEK | sunucu/moduller/sevkiyat/servis.ts:384
Sorun: "Bir isin tek taslagi olur" kurali yalniz kaydedilen gunun plan satiri kilitlenerek korunuyor (planYazmayaAc); isin satiri ve oteki taslaklarin duraklari kilitlenmiyor (sorgular.ts:186-211).
Nasil kirilir: X havuzda; A D1'i, B ayni anda D2'yi X ile kaydeder. B'nin isleriBaskaTaslaklardanCikar DELETE'i A'nin henuz commit edilmemis D1 duragini goremez; X iki taslakta kalir, D1 ve D2 ayri onaylanir ve ayni is iki araca yazilir. Ters yonde surum artirmalari kilitlenme uretebilir ve kullaniciya 500 doner (kilit yokluk DOGRULANDI; READ COMMITTED sirasi alt ajan izlemesi, kosulmadi).

KD-031 | YUKSEK | istemci/src/moduller/atolye/fabrika.ts:43
Sorun: Fabrika taslagi bolum koordinatini fabrika koordinatina cevirip 0,01'e yuvarliyor, kayitta geri cevirip yine yuvarliyor; "bolumun icinde mi" toleransi ise PAY=1e-6 (satir 20; duzenleyici-durumu.ts:523, 562-568).
Nasil kirilir: 15 dereceye dondurulmus bolumun kenarindaki duvarlar dokunulmadan kaydedilir; yuvarlama orta noktayi bolum disina atar, fabrika kaydi "N oge hicbir bolumun icinde degil" diye tamamen durur ve ic ogeler her kayitta 1 cm kayar (alt ajanin node denemesi: 39 duvardan 14'u; burada yeniden kosulmadi). fabrika.test.ts yalniz 0 ve 90 derece sinaniyor.

KD-032 | ORTA | sunucu/moduller/atolye/servis.ts:598
Sorun: Kroki yuklemesi kimlikle degil kapsamla (salon ya da fabrika) adresleniyor; yeni baslatma eskisini hemen siliyor (krokiSil) ve parca yazma kapsamdaki o anki krokiye gidiyor; istemci hata olunca kapsamdaki krokiyi kosulsuz siliyor (istemci/src/moduller/atolye/veri.ts:183, 194).
Nasil kirilir: A 20 MB'lik kroki yuklerken B ayni bolume yeni kroki baslatir; A'nin kalan parcalari B'nin krokisine yazilir, iki tamamlama da ozet hatasi verir. Wi-Fi yuklemenin ortasinda koparsa eski kroki ve hizalamasi kalici olarak gider.

KD-033 | ORTA | sunucu/gocler/20261011174600_satin_alma_siparis_no_eski.sql:12
Sorun: Eski siparis numarasi lpad(sira, 3, '0') ile yaziliyor; PostgreSQL lpad'i uzun metni kesiyor (belgedeki davranis, burada kosulmadi) ve sira sayacta zaten numara almis siparislere bakmadan 1'den basliyor.
Nasil kirilir: bir yilin 1000. eski siparisi 'SP-2026-100' alir, 100. siparisle cakisir; satin_alma_siparis_no_tek ihlali `npm run goc`'u durdurur ve arkasindaki gocler kosmaz (KD-014/KD-022 sinifi). siparis-no-goc.test.ts sayacla cakisan numarayi dogru diye sabitliyor (alt ajan okumasi).

KD-034 | ORTA | sunucu/moduller/arkon/servis.ts:1278
Sorun: Ana sayfa sayisi (arkonOzeti) her depoda tam liste yolunu (belgeler) cagiriyor; pkgs'te bu butun paket govdelerini okur, cizim denetiminden gecirir ve acik emirlerden taslak paket kurar.
Nasil kirilir: 500 cizimli paket varken hazirlik rolundeki her kullanicinin her ana sayfa acilisi butun paket tablosunu TOAST'tan acar (KD-023 ile ayni yuk, bu kez yalniz bir sayi icin ve ana sayfada).

KD-035 | ORTA | sunucu/moduller/atolye/servis.ts:205
Sorun: fabrika() her bolum icin yerlesim() cagiriyor (N+1); her cagri yaklasik 9 sorgu atiyor, ikisi tam tablo (istasyon listesi pasifler dahil, aktif makineler); fabrikaKaydet (satir 285) ayni yuku yazma islemi icinde kilit tutarken yeniden kosuyor.
Nasil kirilir: 15 bolumlu fabrikada 3B sayfasinin her acilisi yaklasik 135 sorgu atar ve istasyon ile makine tablolarini 15 kez okur.

KD-036 | ORTA | paylasilan/atolye-sabitleri.ts:9
Sorun: parcaAnahtari toLocaleUpperCase('tr-TR') kullaniyor; "i" "İ" oluyor, "I" oldugu gibi kaliyor, yani "harf buyuklugu ayirmaz" sozu i harfinde tutmuyor.
Nasil kirilir: parca modeli "MIL-01" ile kayitli, uretim emrinde parca no "mil-01" yazili; anahtarlar "MIL-01" ve "MİL-01" cikar, model bulunmaz ve ayni goze iki ayri kalem yazilir. Test i/I durumunu sinamiyor.

KD-037 | ORTA | sunucu/moduller/istasyonlar/servis.ts:388
Sorun: panoOzeti personel sayisini gecerliAtamalar'dan aliyor; kisi pasife alininca istasyon atamasi kapanmiyor (kisiler/servis.ts:254) ve ayni kaynagi vardiyaPersoneli (vardiya/servis.ts:172) ile yeni gunluk mesai (vardiya/servis.ts:400) da kullaniyor.
Nasil kirilir: isten ayrilan operator pasife alinir; ana sayfa personel karti onu saymaya, gunluk mesai onu planli vardiyasiyla "calisiyor" gostermeye devam eder. Yeni test yalniz aktif kisiyle kosuyor.

KD-038 | ORTA | sunucu/moduller/dosya/sorgular.ts:112
Sorun: Her yukleme parcasinda depoBayti (dosya ve dosya_yuklemesi tam toplami), kisiAcikYuklemeleri ve bayatSeritleriSil (dosya_yuklemesi uzerinde GROUP BY) tam tablo kosuyor; dosya_yuklemesi'nin yukleyen_id ile baslayan dizini yok (birincil anahtar ozet ile basliyor).
Nasil kirilir: 200 MB'lik dosya 400 parca; bes kisi ayni anda yukleyince her parca acik parcalarin tamamini birkac kez tarar, toplam tarama parca sayisinin karesiyle buyur ve yukleme suresi kisi kilidi altinda uzar.

Kayda girmeyen (sinir 10): sevkiyat/servis.ts:235 yeniden acmanin onceki "yapilamadi" sonucunu silmesi, servis.ts:264 onay saatlerinin ayiklanmamis satirlarla kayması, servis.ts:46 harita paketi hatasinin yutulmasi ve her istekte yeniden ayristirma, sevkiyat.test.ts:339 sonucu denetlemeyen eszamanlilik testi; atolye kurallar.ts:484 sifirsiz adres aramasinin bos donmesi, atolye servis.ts:147 ATL-31 bolum cakismasinin kilitsiz denetlenmesi, istemci atolye kurallar.ts:85 istasyon basina tek emir, YerlesimDuzenleyici.tsx:152 hizalamada eski surum ve :466 bos gecmis adimi; ArkonCercevesi.tsx:52 yoneticinin uretim terminalinde pano'ya dusmesi; istasyonlar/csv.ts:7 CSV formul kacirmamasi ve uc kopya CSV yazici; App.tsx:24 acilis yonlendirmesinin kapali listeden once calismasi; KurumAyarlari.tsx:43 yakalanmayan dosya okuma hatasi; finans/sorgular.ts:403 "7 gun" sorgusunun 8 gunu saymasi; satin-alma/sorgular.ts:541 yeni ve eski siparis numarasinda farkli yil kurali; dosya kurallar.ts:58 "solid " ile baslayan her metnin STL sayilmasi (nosniff var, risk dusuk). Onceki turlarin "kayda girmeyen" listeleri sonraki calismada yeniden degerlendirilir.

Duzelen: KD-019 (8951463e; ui.ts:1147 kalem kapanmadan okunuyor), KD-021 (rota/servis.ts:140 fason suzgeci finans aramasinda; 50'den cok fason firma bugun hala listeye girmez, kodda yorumla kabul edilmis), KD-022 (kalibrasyon gocu:38 coalesce(..., false)).
Hala acik: KD-008 (4. kez; arkon/servis.ts:95), KD-014 (3. kez; RAISE EXCEPTION duruyor), KD-020 (2. kez; is-emri-servis.ts isEmirleriniYenile sonunda bekleyen is emri denetimi yok), KD-023 (2. kez; arkon/servis.ts:210), KD-024 ve KD-025 (2. kez; EmirlerEkrani.tsx:101-102, 134 ayni), KD-026 (2. kez; goc ve vardiyaParcalari degismedi), KD-027 (2. kez; plan/servis.ts baglamKur ayni, canliyaAl ustune eklendi), KD-028 (2. kez; denetim/sorgular.ts:55-61 ayni).
3+ kez tekrar eden: KD-008 (4), KD-014 (3).

En kotu 3 dosya:
1. sunucu/moduller/sevkiyat/servis.ts: is durumu gecisleri ve taslaklar arasi esitleme kilitsiz ve dagitik (KD-030), kayda girmeyen uc bulgu daha burada.
2. sunucu/moduller/atolye/servis.ts: kroki parcalari kapsamla adresleniyor (KD-032), fabrika okumasi N+1 (KD-035), ATL-31 kilitsiz; yorumlardaki eszamanlilik sozlerini hicbir test sinamiyor.
3. sunucu/moduller/arkon/servis.ts: KD-008 dorduncu kez acik, tek paket okumasi (KD-023) ve ana sayfa sayisi (KD-034) butun paket tablosunu okuyor.

## [2026-10-12 06:47 UTC] 583d9bab (onceki 64b00dfd; 59 kod dosyasi, +1066/-106) · derin: durus-nedenleri
Puan: 6/10 (durus-nedenleri 7/10). Uc YUKSEK bulgu (KD-029, 030, 031) testleriyle kapandi; acik listenin geri kalanina hic dokunulmadi, KD-008 besinci turda.

Yeni bulgular:

KD-039 | ORTA | sunucu/moduller/durus-nedenleri/sorgular.ts:47
Sorun: Durus ve hurda nedeni guncellemesi kodu serbestce degistiriyor (hurda icin satir 87); Arkon tablet kuyrugu nedeni kimlikle degil kodla cozuyor (arkon/servis.ts:717 ve 723).
Nasil kirilir: tablet cevrimdisiyken operator "ARZ-01" ile durus yazar; yonetici kodu "ARZ-1" yapar, kuyruk gelince komut "eslenemedi" olur ve durus kaybolur; eski kod sonradan baska nedene verilirse durus yanlis nedene yazilir. Testler kod degisikligini yalniz basari olarak sinaniyor.

Kayda girmeyen (sinir 10): durus-nedenleri sorgular.ts:34 ve :76 sira = MAX(sira)+1 kilitsiz ve tekil kisitsiz; eszamanli eklemede ayni sira cikar, ORDER BY sira, id sayesinde zarar dusuk. Fark incelemesinde (ayarlar kapali sayfalar, sevkiyat plan kilidi, malzemeler firma kodu, Yetkiler salt okuma matrisi, rol acilis sayfasi gocleri, ArkonCercevesi yonlendirmesi, araclar test raporlayicisi) somut senaryolu yeni bulgu cikmadi.

Duzelen: KD-029 (kapaliSayfalarGovdesi tek sayfa; liste sunucuda ayarKilitle sonrasi kuruluyor, istemci yeniden okumadan once anahtarlari kilitliyor), KD-030 (sevkiyat/sorgular.ts planKilitle FOR UPDATE oncesi pg_advisory_xact_lock; eszamanlilik testi eklendi), KD-031 (fabrika.ts PAY = 0.01).
Hala acik: KD-008 (5. kez; arkon/servis.ts:95), KD-014 (4. kez; 20261009043500 satir 13 RAISE EXCEPTION), KD-020, KD-023, KD-024, KD-025, KD-026, KD-027, KD-028 (3. kez; ilgili dosyalar bu farkta degismedi), KD-032, KD-033, KD-034, KD-035, KD-036, KD-037, KD-038 (2. kez; dosyalar degismedi, KD-033 lpad ve KD-036 toLocaleUpperCase('tr-TR') yerinde).
3+ kez tekrar eden: KD-008 (5), KD-014 (4), KD-020, KD-023..028 (3).

En kotu 3 dosya:
1. sunucu/moduller/arkon/servis.ts: KD-008 besinci kez acik, KD-023 ve KD-034 butun paket tablosunu okuyor, kuyruk kod ile cozuluyor (KD-039).
2. sunucu/moduller/atolye/servis.ts: kroki kapsamla adresleniyor (KD-032), fabrika N+1 (KD-035), ikisine de dokunulmadi.
3. sunucu/moduller/dosya/sorgular.ts: her yukleme parcasi tam tablo toplamlari kosuyor (KD-038).

## [2026-10-12 13:00 UTC] 883fa35f (onceki 583d9bab; 286 commit, 349 kod dosyasi, +19280/-791) · derin: finans
Puan: 5/10 (finans 7/10). Yeni gelen dis moduller (logo, smartes, kalite-merkezi) yarim kalan dis yazmalari ve parcali yazmalari sinamadan girmis; acik listeden tek bulgu kapanmadi.
Fark buyuk oldugu icin dort alt incelemeye bolundu; asagidaki her bulgunun cekirdegi burada kodda okundu, "alt ajan okumasi" diye isaretli kisimlar yeniden kosulmadi.

Yeni bulgular:

KD-040 | YUKSEK | sunucu/moduller/logo/servis.ts:477
Sorun: Niyet yazilirken saat iki kez okunuyor: veritabanina o.saat() (satir 477), bellege araya giren sorgudan sonra yeniden okunan o.saat().getTime() (satir 478) gidiyor; kalkanEylemi'ndeki "taze" esitligi (servis.ts:351) bu yuzden gercek saatte neredeyse hic tutmuyor (siparis icin ayni: satir 412-413).
Nasil kirilir: onayli talep sirada; tur N niyeti yazar, tur N+1 niyeti taze saymaz ve BELIRSIZ_BEKLEME_MS dolunca eylem 'gonder' olur (kurallar.ts:225); satir 475 `eylem === 'gonder' && !taze` talebi SONUCU_BILINMIYOR ile reddeder, talep fisi Logo'ya kendiliginden hic gitmez. Testler sabit saat kullaniyor (alt ajan okumasi: siparis.test.ts:152, :461), hatayi gormuyor.

KD-041 | YUKSEK | sunucu/moduller/kalite-merkezi/servis.ts:39
Sorun: Yedekten geri yukleme ayri isteklerle parca parca geliyor (istemci/src/moduller/kalite-merkezi/kopru.ts:94); ilk parca iz disindaki butun kayitlari siliyor (izDisiniSil) ve sonraki parcalarin gelecegine dair ne guvence ne geri donus var; belgeParcalari (kopru.ts:26) yalniz bayta bakiyor, sozlesmedeki max(5000) sinirina bakmiyor.
Nasil kirilir: 1,5 MB'lik yedekte ikinci parca ~100 baytlik 5000'den fazla kayit tasir ve 400 alir (ya da ag kopar, oturum biter); Kalite Merkezi eski verisi silinmis, yedegin yalniz ilk parcasi yazilmis kalir ve oteki istemciler esitlemede yarim veriyi gorur. `docs` alani bos yedek `[[]]` parcasini ilk:true ile gonderir: hicbir sey yazmadan her seyi siler.

KD-042 | YUKSEK | sunucu/moduller/stok/kurallar.ts:358
Sorun: haritaPlani, rafi pasife alinan gozun konumunu stogu olsa bile guncelle listesine aktif:false ile koyuyor; stoklu konum denetimi yalniz kapat yolunda var ve haritaKonumuGuncelle (stok/sorgular.ts:117) kosulsuz UPDATE ediyor.
Nasil kirilir: Fabrika Haritasi'nda bir raf pasife alinir, gozlerinden birinde stok vardir; stok_bakiye_aktif_konumda (ON UPDATE RESTRICT, 20261008142031_stok_tablolar.sql:99) UPDATE'i reddeder, korumali 409 doner (servis.ts:230) ve butun islem geri alinir. Haritadan esleme ve onu cagiran bolum deposu islemi stok tasinana kadar her denemede duser. Test (kurallar.test.ts:217) pasif rafi yalniz stoksuz sinaniyor (alt ajan okumasi).

KD-043 | YUKSEK | sunucu/moduller/uretim-emirleri/is-emri-servis.ts:187
Sorun: isEmirleriniYenile yalniz ek adimli kolu atliyor; emrin bolunmus kol (ust_emir_id, birlesme_op_no) ya da kolu olan ust emir olup olmadigina bakmiyor ve guvenliUygula rotadaki ama emirde olmayan her op'u ekliyor.
Nasil kirilir: OP30'dan bolunmus, birlesmeOpNo=50 olan kola yeni revizyon uygulanir; kola ustte yapilmis OP10, OP20 ile OP50 ve sonrasi geri eklenir, kol OP10 istasyonuna duser ve katilinca OP50 sonrasi iki kez yapilmis olur. Ust emre OP50'yi kaldiran revizyon uygulanirsa kolun birlesme adimi yok olur, ust emir kolu beklemeden biter (katilma ve bekleme sonucu alt ajan okumasi, VARSAYIM; denetim eksigi DOGRULANDI).

KD-044 | YUKSEK | sunucu/moduller/smartes/servis.ts:65
Sorun: Okuma turu hata alinca pencere ne ilerliyor ne kuculuyor (okumaPenceresi sabit 24 saat, kurallar.ts:28); ayni hata her turda ayni pencereyle yineleniyor ve kaynak kendiliginden hic toparlanmiyor.
Nasil kirilir: SmartES alarm metninde `&#x0;` doner; kodNoktasi (soap.ts:60) reddeder, sonuc "bozuk" olur ve her 15 dakikada ayni 24 saatlik pencere yeniden istenir. Uzun kesintiden sonra 24 saatlik alarm penceresi 60 sn zaman asimini ya da 32 MB sinirini asarsa ayni sekilde kalici takilir; satirYaz istisnasi da turu geri alir ve okumaHatali da geri alindigi icin ekranda eski "tamam" kalir (alt ajan okumasi).

KD-045 | ORTA | sunucu/moduller/logo/servis.ts:522
Sorun: guncellemeEslemesi null donunce TMI satirlari kayit numarasiz gonderiliyor; onceki denemede Logo'ya eklenmis ama TMI'ye baglanamamis satirlar yeniden eklenebiliyor.
Nasil kirilir: ilk duzenleme Logo'ya 2 yeni satir ekler, "sonra" okumasi zaman asimina duser; kullanici TMI'de bir satir daha ekler. Yeniden denemede Logo'da 2 bilinmeyen, TMI'de 3 kayitsiz satir vardir, esleme null olur ve 3 satir yeniden eklenir; her geri cekilme turunda ayni dongu (kopru davranisi DOGRULANMADI, alt ajan okumasi).

KD-046 | ORTA | sunucu/moduller/logo/servis.ts:570
Sorun: Iptal iki ayri Logo yazmasi: once karsilamaKaldir siparisin butun karsilamalarini siliyor, sonra siparisIptal; ikinci adim reddedilirse birinci geri alinmiyor ve TMI'ye bildirilmiyor.
Nasil kirilir: Logo irsaliyesi bagli siparisin iptalini reddeder; karsilamalar Logo'da silinmis, siparis acik kalir, TMI'deki karsilama kayitlari dolu kaldigi icin yeniden karsilama kuyruga alinmaz (alt ajan okumasi).

KD-047 | ORTA | paylasilan/sozlesme/finans.ts:167
Sorun: Dovizli belge, odeme, cek ve toplu satirda kur gelmezse 1 yaziliyor (kurSemasi.default(1), ayrica :201, :233, :338); veritabani yalniz "TRY ise kur 1" kuralini tutuyor.
Nasil kirilir: yeni USD kasasi acilir, USD kuru henuz yoktur; 1000 USD'lik gider kur gonderilmeden girilir, toplam_tl 1000 TL yazilir; kar, pano ve kur farki bunu hata vermeden tasir (istemci tarafi finans.html:3378 `|| 1` alt ajan okumasi).

KD-048 | ORTA | sunucu/gocler/20261008132300_finans_cekirdek.sql:341
Sorun: Odeme tetikleyicisi finans_hesap satirini kilitsiz okuyor (firma icin :325'teki FOR SHARE hesapta yok; cek sonucu ve virman tetikleyicileri :501, :520 ayni, alt ajan okumasi).
Nasil kirilir: T1 hesabi pasife alirken bakiyeyi 0 okur; ayni anda T2 o hesaba 50 TL odeme yazar, tetikleyici aktif=true gorur; ikisi de commit eder ve pasif hesapta 50 TL bakiye kalir. Eszamanlilik testi bes farkli sonucun hepsini kabul ediyor (alt ajan okumasi: para.test.ts:432).

KD-049 | ORTA | istemci/src/moduller/finans/kopru.ts:91
Sorun: Her yazma komutundan sonra tamYukle finansin butun gecmisini yeniden okuyor (17 liste, 200'luk OFFSET sayfalari, her sayfada count(*)); liste 500 sayfada sessizce kesiliyor (alt ajan okumasi: kopru.ts:100).
Nasil kirilir: uc yilda 15 bin belge, odeme ve dagitim birikince her "Tahsilat aldim" yuzlerce istek uretir ve sayfalar giderek pahalanir; 100 bin satiri asan listede analiz eksik veriyle calisir, hata cikmaz.

Kayda girmeyen (sinir 10): smartes servis.ts:121 isaret turu 50 SOAP cagrisi boyunca satir kilidi tutuyor, okuma ters sirayla upsert ediyor (kilitlenme); smartes sorgular.ts:203 zaman asimiyla biten ilk gonderimin ozet'i null kalinca kapanis hic gitmiyor; smartes servis.ts:145 listeden dusen bitmemis is "pasif" kapaniyor; smartes istemci.ts:84 boyut siniri yalniz Content-Length'e bakiyor, chunked cevap sinirsiz bellege okunuyor; portal servis.ts:41 ve :63 olmayan satirda FOR UPDATE yeni belgeyi ve kilidi korumuyor; cizimler servis.ts:131 bag hedefinin varligina bakmiyor (ILETILER.hedefYok olu); arkon/web operator.ts:297 "Kaliteye gonder" cift dokunusta iki numune istegi; cizimler komut.ts:35 istek kimligi girdi degisince yenilenmiyor; Model3B.tsx:106 iptalde OCCT iscisi sonlanmiyor; PartiPaneli.tsx:135 Number(adet) ve tek virgul degisimi (KD-025 sinifi); satin-alma sorgular.ts:580 geri alinan teslim ortalama alis fiyatinda kaliyor; rota varsayilan sablon degisiminde tekil dizin yarisi (500); finans servis.ts:417/:503 odeme ve cek kilit sirasi ters, dagit istek sirasiyla kilitliyor, kilitlenmedeYinele yok; finans hesapEsitle ileri tarihli hareketi farka katiyor; finans_faiz gecmis tarihli girisle gecmis orani degistiriyor (bugun cagiran yok); arkon/servis.ts:184 ekAciklamalariniOku emir basina adimliEmirAyrintisi (KD-023 yukune ek N+1).

Duzelen: yok.
Hala acik: KD-008 (6. kez; arkon/servis.ts:95), KD-014 (5. kez; RAISE EXCEPTION), KD-020 (4. kez; isEmirleriniYenile sonunda yalniz siradakiIstasyonuYaz, kalan is denetimi yok), KD-023 (4. kez; isEmriTaslagi servis.ts:219 butun pkgs), KD-024 (4. kez; onay hala ac.mutate(t) ile formu gonderiyor, EmirlerEkrani.tsx:156), KD-025 (4. kez; Number(f.adet) satir 117), KD-026 (4. kez), KD-027 (4. kez; plan/servis.ts:87 dongude istasyondakiMakineler), KD-028 (4. kez), KD-032 (3. kez; krokiYuklemeBaslat atolye/servis.ts:692 hala krokiSil), KD-033 (3. kez; lpad), KD-034 (3. kez; arkonOzeti servis.ts:1288), KD-035 (3. kez; servis.ts:228 bolum basina yerlesim), KD-036 (3. kez; tr-TR upper), KD-037 (3. kez; pasife almada atama kapanmiyor), KD-038 (3. kez; dosya sorgulari degismedi), KD-039 (2. kez; kod hala serbest, arkon/servis.ts:726 ve :732 kodla cozuyor).
3+ kez tekrar eden: KD-008 (6), KD-014 (5), KD-020, KD-023..028 (4), KD-032..038 (3).

En kotu 3 dosya:
1. sunucu/moduller/logo/servis.ts: talep niyeti hic taze sayilmiyor (KD-040), duzenleme satir cogaltabiliyor (KD-045), iptal Logo'da yarim kaliyor (KD-046); testler sabit saat ve tutarli sahte kopruyle bunlari gormuyor.
2. sunucu/moduller/smartes/servis.ts: hatada ilerleyemeyen pencere (KD-044), dis cagrilar boyunca tutulan kilit ve yanlis kapanis tek uzun islemde.
3. sunucu/moduller/uretim-emirleri/is-emri-servis.ts: rota yeniden uygulama ne bitmis emri (KD-020) ne parti kolunu (KD-043) gozetiyor.

## [2026-10-12 18:46 UTC] a2b048e2 (onceki 883fa35f; 236 commit, +20863 satir kod) · derin: istasyonlar
Puan: 5/10 (istasyonlar 7/10). Onceki turun dort YUKSEK bulgusu testleriyle kapandi, ama yeni gelen mesaj, ik ve cerceve kopru modulleri sahiplik, girdi ve yazma sirasi denetimi olmadan girdi.
Fark dort alt incelemeye bolundu; her bulgunun cekirdegi burada kodda okundu, "alt ajan okumasi" isaretli kisimlar yeniden kosulmadi.

Yeni bulgular:

KD-050 | YUKSEK | sunucu/moduller/mesaj/servis.ts:54
Sorun: belgeSil ve belgeYaz (satir 39) yalniz data/users/<kisi> yolunu koruyor (kurallar.ts:15 erisebilirMi diger her yol icin true); olusturan_kisi_id yaziliyor ama hic okunmuyor, govdedeki gonderen alani dogrulanmiyor. denetim-hazirlik sunucu katmani bunun birebir kopyasi.
Nasil kirilir: mesaj.yaz yetkili herhangi bir kisi POST /mesaj/belge/sil ile channels/duyurular/msgs/<id> yolundaki mudur duyurusunu siler; /mesaj/belge/yaz ile {by:"<mudur id>"} yazarak mudur adina ileti atar ya da baskasi adina "okudum" isaretler. Testler yalniz data/users yolunu sinaniyor (alt ajan okumasi).

KD-051 | YUKSEK | sunucu/moduller/ik/servis.ts:162
Sorun: IK rolune kayitlar is merkezi kapsamiyla suzulerek, degisiklik gecmisi ise suzulmeden (son 1000 satir, alan alan onceki ve sonraki deger) donuyor.
Nasil kirilir: yalniz is merkezi 1 kapsamindaki IK uzmani GET /ik/veri cagirir; is merkezi 2 personelinin brut maas, TC kimlik ve IBAN degisikliklerini acik metinle, silinen kaydin tam govdesini de gorur (gecmis tablosu yalniz ekleme kabul ettigi icin veri orada kalici, alt ajan okumasi).

KD-052 | YUKSEK | sunucu/moduller/ik/kurallar.ts:71
Sorun: Izin gun sayisi istemciden geliyor; sunucu onu baslangic ve bitisten hesaplamiyor, alt sinir da koymuyor (turDenetle yalniz tarih ve durumu denetliyor) ve bakiye bu sayiyla dusuluyor (motor.ts:98).
Nasil kirilir: calisan 28.12-08.01 arasi yillik izin talebini gun -10 ya da 0 ile acar; yonetici onaylar (karar ucu icerigi degistirmiyor); bakiye 10 gun artar ya da hic dusmez.

KD-053 | YUKSEK | sunucu/moduller/logo/servis.ts:504
Sorun: Niyetli acma yolunda on kosul okumasi ag hatasiyla dusunce kalici niyet birakiliyor (niyet undefined), bellekteki niyet ise satir 501'de silinmis oluyor; sonraki turda niyet taze sayilmiyor ve satir 492 belgeyi reddediyor.
Nasil kirilir: satis teklifi icin niyet yazilir; sonraki turda kopru kapali oldugu icin musteri okumasi 'ulasilamadi' doner, Logo'ya hicbir sey yazilmaz. Geri cekilme bitince eylem 'gonder', taze=false olur ve teklif SONUCU_BILINMIYOR ile reddedilir; hic gitmemis teklif "Logo'da kontrol edin, kendiliginden gonderilmez" durumunda kalir (KD-040'in duzeltmesinden sonra ayni sonuca baska yoldan varan delik).

KD-054 | YUKSEK | istemci/src/moduller/denetim-hazirlik/cerceve-kopru.ts:95
Sorun: Ortak kayda yazma ayni anahtar icin "yolda" siralamasi yapmiyor; ikinci yazma birinci donmeden ayni beklenen surumle gidiyor, ag ve 5xx hatasi sessizce yutuluyor (mesaj/cerceve-kopru.ts ayni kopya; cnc-kurulum'daki sira ve yeniden deneme duzeltmesi tasinmamis).
Nasil kirilir: Denetim Hazirligi butun durumunu tek ortak anahtarda tutuyor; kullanici bir madde isaretler, yazma #1 surum 5 ile gider ve 800 ms'den uzun surer; ikinci isaret yazma #2'yi yine surum 5 ile gonderir ve cakisma alir. Kullanici "baska biri degistirdi" uyarisi gorur, durdu=true olur ve sayfa yenilenene kadar hicbir degisiklik sunucuya gitmez, ekranda ise kaydedilmis gorunur (cakisma kodunun eslemesi alt ajan okumasi).

KD-055 | YUKSEK | arkon/web/src/app/hazirlik.ts:142
Sorun: merkezdenAl yeni dosya listesini ve plani tiklama anindaki p'den kuruyor, sonucu ise patch ile (setCur(o => ...), satir 161) cevap geldigi anda secili olan pakete yaziyor.
Nasil kirilir: hazirlikci A paketinde "Yeni revizyon var > Guncelle"ye basar, buyuk STEP inerken soldaki listeden B paketini secer; cevap gelince B'ye A'nin dosyalari, kontrol plani ve parca no'su yazilir ve 500 ms sonra DB.put ile kalici olur.

KD-056 | ORTA | sunucu/moduller/ik/motor/motor.ts:129
Sorun: Net, gelir vergisi, damga, SGK ve issizlik kalemleri yuvarlanmadan hesaplanip ayri ayri numeric(14,2) sutunlara yaziliyor; saklanan net saklanan kalemlerden cikan farka esit olmuyor.
Nasil kirilir: brut 10000,10 ile net 8424,18 yazilir, yuvarlanmis kalemlerden 8424,19 cikar; bordro dokumu ve muhasebe aktarimi 1 kurus tutmaz (alt ajanin node denemesi, burada kosulmadi).

KD-057 | ORTA | sunucu/moduller/logo/servis.ts:384
Sorun: Numarayla bulma ucu olmayan belgede (talep fisi, satis teklifi) Logo kaydi acildiktan sonra satir eslemesi kurulamazsa sonuc 'yazilamadi' olur, kayit numarasi ve niyet bosaltilir ve belge kuyrukta kalir; satir 376'daki "numarayla bulunur" yorumu yalniz satin alma siparisi icin dogru.
Nasil kirilir: teklif acilir, cevap satir dondurmez ve satir okumasi zaman asimina duser; geri cekilmeden sonra niyet-yaz ve gonder yeniden calisir ve Logo'da ikinci teklif acilir, her turda yinelenir (kopru cevabi DOGRULANMADI, alt ajan okumasi).

KD-058 | ORTA | sunucu/moduller/istasyonlar/servis.ts:216
Sorun: hedefVarMi yalniz varliga bakiyor; atama pasif istasyon, makine ya da ekibe yazilabiliyor, hedef pasife alininca atamalar acik kaliyor ve disari.istasyonKisiAtamalari (disari.ts:98) bunlari suzmeden veriyor, modulun kendi istasyonKisileri ise yalniz aktiflere bakiyor.
Nasil kirilir: kisi sonradan pasife alinan P istasyonunda %100 atamali kalir; plan ve Arkon kisiyi hicbir istasyonda gormez, is emri kaynagi ve vardiya kapsami onu P'ye baglar, kisiye baska yerde yapilan her atama "en cok %0" ile reddedilir ve ileti engelleyen hedefi yazmaz (tuketici satirlari alt ajan okumasi).

KD-059 | ORTA | istemci/src/moduller/stok/gorunum.ts:23
Sorun: Miktar ayristirmasi ekranlar arasinda tutarsiz: stokta "1.250,5" 1250,5 ama "1.250" 1,25 okunuyor; satin alma talebinde (talep/TalepAc.tsx:19) "1.250" 1,25, "1.250,5" ise reddediliyor (KD-011 sinifi).
Nasil kirilir: depocu sevk formuna binlik aliskanligiyla "1.250" yazar; sunucuya 1,25 gider ve 1250 yerine 1,25 adet cikis hareketi yazilir.

Kayda girmeyen (sinir 10): mesaj ve denetim-hazirlik servis.ts:61 olmayan satirda FOR UPDATE yeni belgede surum ve kilit yarisini korumuyor (KD portal bulgusuyla ayni sinif); mesaj sorgular.ts:10 her sorgu koleksiyonun tamamini okuyor, tek global damga her yazmada butun abonelikleri yeniden sorgulatiyor; ayarlar guncelleme.ts:177 paket dosyasi bildirimden once tasiniyor, arada hata kalici 409; denetim-hazirlik sunucu katmani mesajin birebir kopyasi; ik servis.ts:375 yeniden kesinlestirme sonraki aylarin kumulatif matrahini bayat birakiyor; ik servis.ts:82 her istek butun IK tablolarini okuyor (menu sayaclari dahil); ik bugun() surecin yerel saat dilimini kullaniyor (TZ ayari BILMIYORUM); satin-alma servis.ts:356 iptalden donen talebin fisi bir daha kuyruga girmiyor, gitmis fisi iptal eden yol yok; satin-alma servis.ts:61 Logo'nun reddettigi "kalani kapat" TMI'de kapali sayiliyor; satin-alma sorgular.ts:645 bos yil/sira ile siralama; rota planGorunumu.ts:107 kaynak matrisi 1440 dk paydasi; cerceve-kopru.ts:121 bekleyen yazma yalniz pagehide'da gonderiliyor, kabuk dinleyicisi o anda kalkmis; istasyonlar servis.ts:117 makine tasimada acik is emri gozetilmiyor; istasyonlar disari toplu makine okumasi yok (tuketicilerde N+1); istasyonlar servis.ts:168 savepoint ile kullanilan tip denetimi (PostgreSQL davranisi DOGRULANMADI); sorgular.ts:481 durum satiri olmayan makinenin calisir sayilmamasi; servis.ts:71 tek kisi icin butun kisi listesi; arkon merkezKontrol 50 belge icin sirali cagri; uretim-emirleri sorgular.ts:299 projeId ile arsiv yok sayiliyor; kolEmirNo 120 karakter CHECK'i.

Duzelen: KD-040 (logo/servis.ts:419 ve :495 saat bir kez okunuyor), KD-042 (stok/kurallar.ts:359 stoklu goz aktif kaliyor ve bildiriliyor), KD-043 (is-emri-servis.ts:191 kol ve kolu olan ust emir degistirilmiyor), KD-044 (smartes/kurallar.ts:33 hatada pencere yariya iniyor, satir hatasi yalniz o satiri geri aliyor).
Kismen: KD-041 (kalite-merkezi/servis.ts:43 silme son parcaya tasindi; yarida kalan yuklemede yazilan parcalar eski veriyle karisik kaliyor, kopru.ts:26 max(5000) sinirina hala bakmiyor).
Hala acik: KD-008 (7. kez; arkon/servis.ts:99), KD-014 (6. kez), KD-020 (5. kez; is-emri-servis.ts sonunda kalan is denetimi yok), KD-023 (5. kez; ekAciklamalariniOku N+1'i kalkti, butun pkgs okumasi duruyor), KD-024 ve KD-025 (5. kez; YeniEmir degismedi), KD-026, KD-027, KD-028 (5. kez), KD-032..038 (4. kez; ilgili dosyalar degismedi, KD-033 lpad ve KD-036 tr-TR yerinde), KD-039 (3. kez), KD-041 (2. kez, kismen), KD-045, KD-046, KD-047, KD-048, KD-049 (2. kez; finans hepsiniOku'ya iki liste daha eklendi).
3+ kez tekrar eden: KD-008 (7), KD-014 (6), KD-020, KD-023..028 (5), KD-032..038 (4), KD-039 (3).

En kotu 3 dosya:
1. sunucu/moduller/logo/servis.ts: niyetli acma yolu on kosul hatasinda kalici reddediyor (KD-053) ve esleme kurulamazsa ikinci belge aciyor (KD-057); KD-045 ve KD-046 hala acik.
2. sunucu/moduller/mesaj/servis.ts: paylasilan belge deposunda sahiplik yok (KD-050), yeni belgede surum ve kilit yarisi; ayni kusurlar denetim-hazirlik kopyasinda.
3. sunucu/moduller/ik/servis.ts: gecmis kapsamla suzulmuyor (KD-051), her istek butun IK verisini okuyor, yeniden kesinlestirme sonraki aylari bayat birakiyor.

## [2026-10-13 00:46 UTC] 688a77ad (onceki a2b048e2; 41 commit, +1076 satir kod) · derin: istek-kimligi

Puan: 6/10 (istek-kimligi 8/10). Gecen turun uc YUKSEK yetki bulgusundan ikisi kapandi, ucuncusu (KD-050) daraldi ama zamanli ileti yolunda baskasi adina yazma hala mumkun; logo, arkon/web ve cerceve-kopru bulgularina dokunulmadi.

KD-060 | ORTA | sunucu/moduller/mesaj/kurallar.ts:181
Sorun: zamanliGonderenler pencere icindeki her 'zamanli' belgeyi gercek gonderim sayiyor; yeni 'zamanli' belgede sahiplik denetimi atlaniyor (mevcut null) ve gonderenDenetle (satir 211) by=X'i yalniz `X/<kanal>` anahtarina bakarak kabul ediyor.
Nasil kirilir: X'in kanaldaki zamanli iletisi gonderildikten sonraki 5 dakika icinde Y, {by:X, cid:kanal, text:"herhangi", sentAt:simdi} ile yeni zamanli belge yazar; bu belge `X/kanal/herhangi` anahtarini uretir ve Y ayni metinle by=X ileti yazar, ileti X'in agzindan cikar (servis.ts:27 akisi koddan okundu, uctan uca denenmedi).

KD-061 | DUSUK | sunucu/moduller/istek-kimligi/servis.ts:18
Sorun: Yorum, cakisan satir araya giren temizlikle silinmisse komutun "taze calisir" dedigini soyluyor; kod ise duz Error atiyor.
Nasil kirilir: 24 saatlik kimlikle yeniden deneme, ayni anda baska komutun eskileriSil'i satiri silerken gelir; istemci 500 alir ve ayni kimlikle her denemede ayni yarisa dusebilir, beklenen tekrar calisma olmaz.

KD-062 | DUSUK | sunucu/moduller/istek-kimligi/sorgular.ts:15
Sorun: `SET LOCAL lock_timeout TO DEFAULT` oturumun onceki degerine degil sunucu varsayilanina donuyor (PostgreSQL davranisi DOGRULANMADI, belgeden okunmadi).
Nasil kirilir: islemi acan katman lock_timeout'u kendi degerine kurmussa anahtar ayirmadan sonra islemin geri kalani o degeri kaybeder; uzun kilit beklemesi siniri sessizce kalkar.

Kayda girmeyen (sinir 10): uretim-emirleri goc 20261012201935 proje_id yabanci anahtari yetim deger varsa kurulumda dusuyor (veri durumu BILMIYORUM); PortalCercevesi gec gelen kurum adinda sayfayi bir kez yeniden kurup cerceve icindeki durumu kaybedebilir; denetim-hazirlik MutationObserver butun belge agacini izliyor; uretim-emirleri emir_no CHECK uzunlugu 120 (onceki kayitta da anildi); araclar/paket-yap.ts ve paket.ts imzali paket yolunda bulgu cikmadi.

Duzelen: KD-051 (ik/servis.ts gecmis d.harita ve kapsamdaGorunurMu ile suzuluyor, test IK-51), KD-052 (ik/kurallar.ts 0 < gun <= takvimGunu, test IK-52).
Kismen: KD-050 (d334e5bc ve 69a9d07a: mesaj ve denetim-hazirlik yazma ve silmede sahiplik denetliyor; kalan zamanli delik KD-060 olarak yazildi).
Hala acik: KD-008 (8. kez; arkon/servis.ts:99), KD-014 (7. kez; RAISE EXCEPTION yerinde), KD-020, KD-023..028 (6. kez; EmirlerEkrani yalniz baska yerde degisti), KD-032..038 (5. kez; KD-033 lpad, KD-036 tr-TR yerinde), KD-039 (4. kez), KD-041 (3. kez, kismen), KD-045..049 (3. kez; finans degismedi), KD-053 (2. kez; logo yalniz 7 satir degisti), KD-054 (2. kez; cerceve-kopru.ts yalniz kurum adi gozlemcisi eklendi), KD-055 (2. kez; arkon/web degismedi), KD-056..059 (2. kez).
3+ kez tekrar eden: KD-008 (8), KD-014 (7), KD-020, KD-023..028 (6), KD-032..038 (5), KD-039 (4), KD-041, KD-045..049 (3).

En kotu 3 dosya:
1. sunucu/moduller/logo/servis.ts: niyetli acma on kosul hatasinda belgeyi kalici reddediyor (KD-053), esleme kurulamazsa ikinci belge aciyor (KD-057); KD-045, KD-046 acik.
2. sunucu/moduller/mesaj/kurallar.ts: yeni sahiplik katmani zamanli belgeyi kanit sayiyor, kanit da sahte yazilabiliyor (KD-060).
3. arkon/web/src/app/hazirlik.ts: yaris sonucu yanlis pakete kalici yaziliyor (KD-055), iki turdur dokunulmadi.
