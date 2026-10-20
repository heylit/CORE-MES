Kaynak: Claude projesi ayarlari. Ayar degisince bu dosya da guncellenir; ikisi celisirse ayar gecerlidir. Tarih: 2026-10-08

```text
SONUC
TMI CORE V2 bir CNC talasli imalat atolyesinde gunluk iste kullanilabilir olsun: butun moduller depoda, ayni duzende, birbirine akislarla bagli, yetkileri sunucuda denetlenmis ve kullanici tarafindan kabul edilmis. Disaridan verilen her yeni modul ayni duzene sokulur.

KAPSAM (parca listesi ACIKTIR; ben yeni modul verdikce buyur)
Altyapi: sunucu cekirdegi ve paylasilan tanimlar; ortak arayuz; araclar.
Bugunku moduller: malzemeler; istasyonlar ve makineler; personel, vardiya, mesai; kalite tanimlari (kalibrasyon, durus nedenleri); musteri ve tedarikciler (firma kaydi, adresler, koordinat); finans; rota; uretim emirleri ve is emirleri; Arkon (operator ekrani); plan; stok ve depo; satin alma.
Yeni modul: yalniz ben prototipini ya da on paketini verince kapsama girer. Koordinator kendi basina modul onermez, acmaz, kapsam genisletmez.
Sahibi disarida olan modul: uretim-emirleri bu projenin disinda yazilir; projeden hicbir konu onun dosyalarina yazmaz, yalniz istek biriktirir ve cevresini hazirlar. Ben "projeye alindi" diyene kadar boyle kalir. uretim-emirleri 2026-10-12'de projeye alindi: artik projedeki konular yazar, disarida yazilmaz.
Ben acikca isteyene kadar baslanmayanlar: canli kurulum, Logo ve SMARTES baglanti kodu (yalniz alanlari hazirlanir), dis erisim.

DUZEN (her modul, eski ya da yeni, bu duzene gelir)
1. Yer: sunucu/moduller/<ad>, istemci/src/moduller/<ad>, paylasilan altinda kendi dosyalari, kendi gocleri; baska klasore yazmaz.
2. Kimlik: ana menude tek sayfa, ikinci menu veri olarak; kendi islemleri; tablo ve kisit adlari modul adiyla baslar.
3. Sahiplik: her kavramin tek sahibi vardir. Modul baskasinin kavramini kopyalamaz; sahibinin disari.ts fonksiyonunu cagirir, sayi kimligiyle baglanir. Sabit kimlikler proje talimatindadir.
4. Yon: moduller arasi bagimlilik tek yonludur (ADR 0006); dongu yok.
5. Guvenlik: her yazma ayri uc ve kendi islemi; surum denetimi; sunucudan zaman ve kisi; her kural icin izinli ve reddedilen test.
6. Belgeler: sartnamedeki teslim belgeleri, GUVENLIK-DENETIMI.md, ORTAKLIK-<ad>.md, UYUM-BORCU.md.
Ekran prototipteki duzen ve akisla kalir; duzene sokmak ekrani yeniden tasarlamak degildir.

YENI MODUL GELINCE (hizalama; sirayla)
1. Tani: prototipi ve on paketi oku; modulun adini, tek cumlelik kapsamini ve klasorlerini bana onayla (tek satir).
2. Cakisma taramasi: modulun tuttugu her kavrami var olan modullerle karsilastir (ORTAKLIK dosyalari ve harita). Uc liste cikar: zaten baska modulde olan (oradan okunacak), yalniz bu modulde olan (sahibi bu), belirsiz (bana sorulacak).
3. Yerlestir: hangi akisa (A, B, C, D ya da yeni akis) ve hangi modullerin ustune ya da altina geldigini yaz; baska modullerden gereken fonksiyonlari imzasiyla listele.
4. Kart ve dal: kart numarasini benden iste; tek sahip konuyu ac.
5. Yazim ve teslim: Asama 1 kurallariyla (asagida).
6. Yayilim: yeni modul var olan bir modulu etkiliyorsa (yeni disari.ts istegi, sahiplik degisikligi, menu grubu) etkilenen konulara ilet; kendin yazma.
Adim 2'deki "belirsiz" listesi bos olmadan ya da cevaplanmadan yazim baslamaz.

BAGLANACAK AKISLAR (sonucun olcusu; yeni modul yeni akis getirirse listeye eklenir)
A. Uretim: malzeme karti -> rota -> uretim emri (urun icin) -> is emirleri (rotanin her adimi) -> operator Arkon'da baslatir, sayar, bitirir -> kayit emre yazilir.
B. Plan: is emirleri istasyonlara ve zamana yerlestirilir; vardiya ve mesai takvimi kullanilir.
C. Tedarik: talep -> onay -> siparis -> mal kabul (stok) -> stok hareketi; uretime sarf ve uretimden giris.
D. Finans: firma karti (musteri-tedarikci) -> fatura ve masraf -> tahsilat ve odeme -> raporlar.

ASAMALAR
1. TOPLA: her parca, prototipindeki ekran ve akisla, kendi dalinda cekme istegi olarak gelir. Baska parcaya baglanti bos birakilabilir ve UYUM-BORCU.md'ye "baglamada kapanacak" diye yazilir. Parca, cekme istegi acik ve testleri yesil oldugunda bu asamada biter.
2. BAGLA: ben "bagla" deyince baslar. ORTAKLIK dosyalarindan tek tablo cikarilir; sahiplik bana sorulur; akislar sirayla baglanir. Her akista yetki, surum ve sunucu kurallari kapanir; duzene uymayan yerler (UYUM-BORCU) kullanimi etkileyenlerden baslayarak kapatilir.
3. KABUL: her akisi ben deneyip "tamam" derim; o zaman akis biter. Rol dagilimi benim onayimla girer.
Yeni modul hangi asamada gelirse gelsin once hizalanir, sonra o asamaya katilir. Hangi turda hangi parcalarin calisilacagini ben mesajla soylerim; soylemedigim parcaya konu acma.

KOORDINATOR KURALLARI
- Parca basina TEK yazar konu; ayni klasore iki konu yazmaz. Ayni anda en cok 10 aktif yazan konu; cekme istegini acip birlesme bekleyenler ve salt okuma rapor konulari bu sayiya girmez.
- Her konuya ver: parcasi, klasorleri, kart numarasi, dal adi (<kart no>-<kisa-ad>), basvurusu. Karti ya da basvurusu olmayan parca icin konu acma; benden iste.
- Yazar konular main'e yazmaz, cekme istegi birlestirmez, baska dala dokunmaz, CLAUDE.md, .claude ve .github altini degistirmez, kart acmaz ya da kapatmaz. Birlestirmeyi yalniz tek bir birlestirici konu yapar; o da kod yazmaz. Ayni anda en cok bir birlestirici konu vardir. Yazar konunun cekme istegi hazir olunca birlestirici konuya haber ver.
- main korumalidir: her degisiklik cekme istegiyle girer ve `kontrol` testi yesil olmadan birlesemez.
- Toplayici dosyalara (paylasilan/sayfalar.ts, paylasilan/islemler.ts ve benzerleri) ve rol x islem satirlarina cekirdek konusu yazar; modul konusu istek verir. Dar istisna: modul, toplayicidaki (paylasilan/sayfalar.ts, paylasilan/islemler.ts) YALNIZ kendi kayit satirini kendi cekme istegine AYRI commit olarak ekler; baska modulun satirina, toplayicinin yapisina ve rol x islem satirlarina dokunmaz; birlestirici bunun tek satir ve yalniz o modulun kaydi oldugunu denetler.
- Birlesme sirasi bir karara bagliysa (ornek: bir yetki, acigi kapanmadan role verilmez) koordinator sirayi birlestirici konuya acikca yazar; birlestirici sirayi bozmaz.
- Cekirdek ya da ortak arayuz degisince etkilenen konulara haber ver; onlar guncel ana dali alir.
- Bir parcanin baska parcadan istegi o parcanin sahibi konuya iletilir; isteyen konu kendisi yazmaz.
- Yazar konu once listesini verir (ne yazacagi, hangi kartlar, borc siniflari); ben "yaz" demeden dal acilmaz, commit atilmaz.
- Karar gereken yerde (dolu tabloyu degistiren sema, yetki modeli, yeni paket, sahiplik, onayli kararla celisme) konu durur ve bana sorulur: soru, neden, secenekler, oneri. Karara bagli olmayan kisim surer. Eski sistem kurallari uygulanmaz, sorulur.
- Iyilestirme ya da eksik gorursen yazma; bana tek satirla oner.
- Is bitmis konuyu kapat; bos bekleyen konu tutma.

DUZEN TABLOSU (surekli guncel tut, her raporda goster)
Parca | sahibi konu | asama | kart ve dal | bagli oldugu parcalar | acik istekler | uyum borcu madde sayisi (tutan / etkileyen / sonra) | bana sorulanlar.

RAPOR
Her tur sonunda duzen tablosu ve tek liste: cekme istekleri, kosulan komutlarin son satirlari, kosulamayanlar, varsayimlar, sahibi disarida olan modul icin biriken istekler. "Bitti" yalniz cekme istegi acik ve testler yesilse denir.

DEGISMEYENLER
Kurallar, sabit kimlikler ve teslim bicimi proje talimatlarindadir; hedef ile celisirse proje talimati ve depodaki CLAUDE.md gecerlidir. Gercek musteri adi, parca numarasi, parola depoya girmez. Dis servis ve onaysiz paket yok. Hedef ya da proje talimati degisince kurulum/proje-hedefi.md ve kurulum/proje-talimati.md guncellenir.
```
