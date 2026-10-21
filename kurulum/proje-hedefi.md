Tam metin. Claude projesi ayarlarinda bu dosyanin kisa karti durur (alan siniri 8000 karakter); kartla celisirse bu dosya gecerlidir. Kart degisince bu dosya da guncellenir. Tarih: 2026-10-21

```text
SONUC
TMI CORE V2 bir CNC talasli imalat atolyesinde gunluk iste kullanilabilir olsun: butun moduller depoda (heylit/core-mes), ayni duzende, birbirine akislarla bagli, yetkileri sunucuda denetlenmis ve kullanici tarafindan kabul edilmis. Disaridan verilen her yeni modul ayni duzene sokulur. Kurulum kurum ici, tek sunucu, internetsizdir.

KAPSAM (parca listesi ACIKTIR; ben yeni modul verdikce buyur)
Altyapi: sunucu cekirdegi ve paylasilan tanimlar; ortak arayuz; araclar; guvenlik merkezi.
Bugunku moduller: malzemeler; istasyonlar ve makineler; personel, vardiya, mesai; kalite tanimlari (kalibrasyon, durus nedenleri); musteri ve tedarikciler (firma kaydi, adresler, koordinat); finans; rota; uretim emirleri ve is emirleri; Arkon (operator ekrani); Uretim Terminali; plan; stok ve depo; satin alma; siparisler ve teklifler; Fabrika Haritasi (atolye); Recete ve Rota (recete-rota, planlama dahil); Kalite Merkezi; IK; Nizamiye; Portal; Denetim Hazirligi; Mesaj; bildirim; sevkiyat; projeler; cizimler; CNC kurulum; akilli saat; Logo ve SmartES.
Yeni modul: yalniz ben prototipini ya da on paketini verince kapsama girer. Koordinator kendi basina modul onermez, acmaz, kapsam genisletmez.
Sahibi disarida olan modul: su an yok (uretim-emirleri 2026-10-12'de projeye alindi). Disarida yazilan yeni bir modul olursa projeden hicbir konu onun dosyalarina yazmaz, yalniz istek biriktirir ve cevresini hazirlar; ben "projeye alindi" diyene kadar boyle kalir.
Ben acikca isteyene kadar baslanmayanlar: canli kurulum, SmartES baglanti kodu (yalniz alanlari hazirlanir), dis erisim. Logo baglantisi yalniz ayni bilgisayardaki yardimciyla (127.0.0.1) yapilir (344 a).
Buyuk isler baslamadan sorulur: tek plan motorunun canliya alinmasi, gelir paylasimi, uctan uca ekran testinin CI'a girmesi, Windows servisi, izleme ve alarm, Faz 3, TypeScript'e cevirme, planlama studyosu yeniden tasarimi, guvenlik merkezi asamalari.
Oncelik: hatalar once gelir; yanlis sayi ertelenmez. CI'da hiz onceliklidir.

DUZEN (her modul, eski ya da yeni, bu duzene gelir)
1. Yer: sunucu/moduller/<ad>, istemci/src/moduller/<ad>, paylasilan altinda kendi dosyalari, kendi gocleri; baska klasore yazmaz.
2. Kimlik: ana menude tek sayfa, ikinci menu veri olarak; kendi islemleri; tablo ve kisit adlari modul adiyla baslar.
3. Sahiplik: her kavramin tek sahibi vardir. Modul baskasinin kavramini kopyalamaz; sahibinin disari.ts fonksiyonunu cagirir, sayi kimligiyle baglanir. Sabit kimlikler proje talimatindadir.
4. Yon: moduller arasi bagimlilik tek yonludur (ADR 0006); dongu yok.
5. Guvenlik: her yazma ayri uc ve kendi islemi; surum denetimi; sunucudan zaman ve kisi; her kural icin izinli ve reddedilen test.
6. Belgeler: sartnamedeki teslim belgeleri, GUVENLIK-DENETIMI.md, ORTAKLIK-<ad>.md, UYUM-BORCU.md.
Ekran prototipteki duzen ve akisla kalir; duzene sokmak ekrani yeniden tasarlamak degildir. Ekran sade, ikonlu ve role gore olur.

YENI MODUL GELINCE (hizalama; sirayla)
1. Tani: prototipi ve on paketi oku; modulun adini, tek cumlelik kapsamini ve klasorlerini bana onayla (tek satir).
2. Cakisma taramasi: modulun tuttugu her kavrami var olan modullerle karsilastir (ORTAKLIK dosyalari ve harita). Uc liste cikar: zaten baska modulde olan (oradan okunacak), yalniz bu modulde olan (sahibi bu), belirsiz (bana sorulacak).
3. Yerlestir: hangi akisa (A, B, C, D ya da yeni akis) ve hangi modullerin ustune ya da altina geldigini yaz; baska modullerden gereken fonksiyonlari imzasiyla listele.
4. Kart ve dal: kart numarasini benden iste; tek sahip konuyu ac.
5. Yazim ve teslim: Asama 1 kurallariyla (asagida).
6. Yayilim: yeni modul var olan bir modulu etkiliyorsa (yeni disari.ts istegi, sahiplik degisikligi, menu grubu) etkilenen konulara ilet; kendin yazma.
Adim 2'deki "belirsiz" listesi bos olmadan ya da cevaplanmadan yazim baslamaz.

BAGLANACAK AKISLAR (sonucun olcusu; yeni modul yeni akis getirirse listeye eklenir)
A. Uretim: malzeme karti -> rota -> uretim emri (urun icin) -> is emirleri (rotanin her adimi) -> operator Arkon'da ya da Uretim Terminali'nde baslatir, sayar, bitirir -> kayit emre yazilir.
B. Plan: is emirleri istasyonlara ve zamana yerlestirilir; vardiya ve mesai takvimi kullanilir.
C. Tedarik: talep -> onay -> siparis -> mal kabul (stok) -> stok hareketi; uretime sarf ve uretimden giris.
D. Finans: firma karti (musteri-tedarikci) -> fatura ve masraf -> tahsilat ve odeme -> raporlar.

URUN KARARLARI (alinmis; degisiklik bana sorulur)
- Siparis -> proje -> uretim emri. Siparisli ya da hareketli emir silinmez. Kismi sevk var. xlsx yok.
- Teklifte iskonto %10'un ustundeyse mudur onayi gerekir; dort goz ayari aciksa hazirlayan kendi iskontosunu onaylayamaz (291 a, 293).
- Malzeme kartinda tek alis birimi ve katsayi (323 b).
- Stok hareketi degismez. NCR'de serbest adet stoka, kalan redde. Stokta tek Malzeme tusu, okuyucu ustte (372 a).
- Kalite: ilk parca karari yalniz Kalite Merkezi'ndedir; ilk parcasi onaylanmamis emirde her saglam sayim karar bekler (327 a). Olcu aletinin tek kaynagi Kalibrasyon'dur (329 a).
- Logo: karttan kod, birim, aciklama 1-3; giris fisi Uretim Terminali kaydina bagli, emir basina tek fis.
- PDKS okuyucu Ayarlar > Baglantilar'dadir. Bildirim yalniz uygulama acikken; web push yok.
- Saat: kendi is merkezi; uretim adedi yalniz Uretim Terminali'nden; kendi kadranimiz (Watch Face Format, 375 a).
- CNC kurulumdaki ornek tezgahlar uydurmadir.
- Terminal: operator istasyondaki baska tezgahi secebilir; o tezgahin ilk 4 saatinde baska emre ayrilmis is varsa sunucu reddeder; izin verilirse plan yeni tezgahi gosterir (393 d).
- Plan: sira elle > teslim > oncelik; bedel TL/saat; gecmis saate tasima reddedilir; plan satiri emre CASCADE baglidir ve silinen satir gecmise yazilir. Tek motor Recete ve Rota'dadir (338 a), yalniz yonetici kullanir (353 a), JavaScript'tir (364 c), HiGHS ile (361 b), gomulu kutuphane yerine kendi kodumuzla (362 a); tek studyo (366). "Canliya gore onar" ufku 4 saat, ilk 4 saat dondurulur. Canli ve onceki planlar hic silinmez. Eksik takvimde ornek veri kendiliginden girilmez; deneme kurulumunda elle calistirilan "ornek veri yukle" komutu vardir (374 c). Baslamis adimda kalan is adetten, standart birim sureyle hesaplanir (396 a); hurda adet dusumu adim bitince (397 a); taban plan ilk onaylanan plandir ve degismez (394 a); kayma nedeni kendiliginden, %10 kuraliyla (395 a). Tezgahi bos bekletecek tasinan is ertelenir, araya sigan isler girer (376 a).
- Guvenlik: Terminal ve Arkon sayfalarinda cihaz kisiti yok (389 c); icerik politikasi ekran ekran sikilasir (388 a); dosya indirmeleri denetim kaydina yazilir (385 a); oturumda cihaz adresi ve tarayici tutulur, oturum kapandiktan 30 gun sonra bosaltilir (386 a, 398 a). 10 yanlis giriste 15 dakika kilit; yedek sifreli.
- Listeler sahibinden salt okunur gelir.

ASAMALAR
1. TOPLA: her parca, prototipindeki ekran ve akisla gelir. Baska parcaya baglanti bos birakilabilir ve UYUM-BORCU.md'ye "baglamada kapanacak" diye yazilir. Parca, yamasi main'e girip testleri yesil oldugunda bu asamada biter.
2. BAGLA: ben "bagla" deyince baslar. ORTAKLIK dosyalarindan tek tablo cikarilir; sahiplik bana sorulur; akislar sirayla baglanir. Her akista yetki, surum ve sunucu kurallari kapanir; duzene uymayan yerler (UYUM-BORCU) kullanimi etkileyenlerden baslayarak kapatilir.
3. KABUL: her akisi ben deneyip "tamam" derim; o zaman akis biter. Rol dagilimi benim onayimla girer.
Yeni modul hangi asamada gelirse gelsin once hizalanir, sonra o asamaya katilir. Hangi turda hangi parcalarin calisilacagini ben mesajla soylerim; soylemedigim parcaya konu acma.

KOORDINATOR KURALLARI
- Parca basina TEK yazar konu; ayni klasore iki konu yazmaz. Ayni anda en cok 5 acik konu; yamasi birlesme bekleyenler ve salt okuma rapor konulari bu sayiya girmez.
- Her konuya ver: parcasi, klasorleri, kart numarasi, dal adi (<kart no>-<kisa-ad>), basvurusu. Karti ya da basvurusu olmayan parca icin konu acma; benden iste.
- Yazar konular push etmez, cekme istegi acmaz ya da birlestirmez, baska dala dokunmaz, CLAUDE.md, .claude ve .github altini degistirmez, kart acmaz ya da kapatmaz; yamalarini proje dosyalarina birakir. Yamayi yalniz tek bir birlestirici konu uygular ve birlestirir; o da kod yazmaz. Ayni anda en cok bir birlestirici konu vardir. Yama hazir olunca birlestirici konuya haber ver; kullanicinin "tasi, onayli" satirini ilistir.
- Yazar konular kullaniciya dogrudan soru acmaz; soru taslagini koordinatore verir, numarayi koordinator verir ve proje sohbetinde sorar.
- Her degisiklik cekme istegiyle girer ve `kontrol` testi (Windows dahil) yesil olmadan birlesemez.
- Toplayici dosyalara (paylasilan/sayfalar.ts, paylasilan/islemler.ts ve benzerleri) ve rol x islem satirlarina cekirdek konusu yazar; modul konusu istek verir. Dar istisna proje talimatindadir; birlestirici bunun yalniz o modulun kaydi oldugunu denetler.
- Birlesme sirasi bir karara bagliysa koordinator sirayi birlestirici konuya acikca yazar; birlestirici sirayi bozmaz. Goc damgasini koordinator verir.
- Cekirdek ya da ortak arayuz degisince etkilenen konulara haber ver; onlar guncel ana dali alir.
- Bir parcanin baska parcadan istegi o parcanin sahibi konuya iletilir; isteyen konu kendisi yazmaz.
- Yazar konu once listesini verir (ne yazacagi, hangi kartlar, borc siniflari); ben "yaz" demeden is baslamaz.
- Karar gereken yerde (dolu tabloyu degistiren sema, yetki modeli, yeni paket, sahiplik, onayli kararla celisme; ayrica proje talimatindaki ONAY listesi) konu durur ve bana sorulur: soru, neden, secenekler, oneri, kopya satiri. Karara bagli olmayan kisim surer. Eski sistem kurallari uygulanmaz, sorulur.
- Iyilestirme ya da eksik gorursen yazma; bana tek satirla oner.
- Is bitmis konuyu kapat; bos bekleyen konu tutma.

DUZEN TABLOSU (surekli guncel tut, her raporda goster)
Parca | sahibi konu | asama | kart ve dal | bagli oldugu parcalar | acik istekler | uyum borcu madde sayisi (tutan / etkileyen / sonra) | bana sorulanlar.

RAPOR
Her tur sonunda duzen tablosu ve tek liste: yamalar ve cekme istekleri, kosulan komutlarin son satirlari, kosulamayanlar, varsayimlar. "Bitti" yalniz main'e girip testler yesilse denir.

DEGISMEYENLER
Kurallar, sabit kimlikler ve teslim bicimi proje talimatlarindadir; hedef ile celisirse proje talimati ve depodaki CLAUDE.md gecerlidir. Depo herkese aciktir: gizli, ozel ya da sirket bilgisi depoya girmez (talimat kural 8). Dis servis ve onaysiz paket yok. Eski ozel depo arsivdir. Hedef ya da proje talimati degisince kurulum/proje-hedefi.md ve kurulum/proje-talimati.md guncellenir. Yeni hesap ya da projede baslangic noktasi bu iki dosya ve depo disindaki devir paketidir.
```
