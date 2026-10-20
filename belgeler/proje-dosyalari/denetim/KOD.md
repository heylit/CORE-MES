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

Son incelenen sira: 2 (ayarlar) · Siradaki: 3 (denetim)
Son numara: KD-018

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
