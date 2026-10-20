# Malzemeler, Asama 1 tur 1: liste (kod yazilmadi)

Ortam: node -v = v24.21.0. Depo main 4a70288. Goc sirasi 31 goc, son `20261007230000_satin_alma_tablolar.sql`.
Kaynak: kartlar #226 #235 #236 #232 #229 #227 (GitHub), `sunucu/moduller/malzemeler/UYUM-BORCU.md`, `npm run harita -- --modul malzemeler`.

## a) Acik kartlar
- #226 Sahte fark: yazar degisiklik talebinde `talep.farklar`'i bos gosterip `talep.yeni`'ye baska icerik koyar, onayci "uygula" deyince o yazilir. Yazildi (dal `226-malzemeler-fark-dogrulama`, PR #252 kapali, birlesmedi); denetimde TUTAN bulgu: noktali anahtar carpismasi (`"com.ad"` ust anahtari `com.ad` yapragini ezer, fark bos kalir).
- #235 Belge deposu, Excel ice aktarimin sunucu denetimi, sayfali liste ve sunucuda arama (sunucu tarafi). Yazilmadi.
- #236 Cerceve yalitimi (sandbox, ayni-kok izni yok). Yazildi (dal `236-cerceve-kisitlamasi`, birlesmedi); `istemci/src/ortak` dosyalari iceriyor (YalitilmisCerceve), yani ortak arayuz seridi.
- #232 Kart icerigi tablolara, tanim listeleri sunucuya, Logo alanlari. Buyuk sema isi, once tasarim onayi; bu turun isi degil (kullanici: json'un tablolara acilmasi ve Logo borcta kalir).
- (bu turda yok: #233 Rota/Olcu Aletleri bagi, #234 ekran istekleri)

## b) UYUM-BORCU siniflari

KULLANIMI TUTAN
1. #226 sahte fark (yetki acigi): onayci gordugunden baska icerigi onaylar. DOGRULANDI (UYUM-BORCU "Denetimde bulunan aciklar" madde 7, kart #226 olcumu `farklar: []` ile 200).
   Varsayilan oneri: dal `226-malzemeler-fark-dogrulama`'daki iki commit'i bu dala al, noktali anahtar bulgusunu (yol dizi olarak) ve 30 satir sinirindaki bayat denetimini kapat; izinli ve reddedilen test.
2. #236 cerceve ayni kokte, sandbox yok (yetki acigi, savunma katmani): kart icerigine giren betik ust pencereye ve oturuma erisebilir. VARSAYIM (koddan okundu, denenmedi; UYUM-BORCU madde 7).
   Malzemeler kismi (MalzemeKatalogu.tsx, kopru.ts) bende; `YalitilmisCerceve` ortak arayuz konusunun (#172) seridi, istek olarak gider.

KULLANIMI ETKILEYEN (kullanicinin gordugu hata ya da eksik)
3. Her sunucu reddi "Kayit yapilamadi, birazdan tekrar dene" gorunur; gercek neden gorunmez (#234 m18, ekran).
4. Elle yazilan serbest stok kodu 400 alir; ekran alani hala gosterir (#234 m10).
5. Pasif karti yazma yetkilisi duzenler, 403 alir; baska yazarin bekleyen talebine dokunan 403 alir; sablon silme dugmesi herkese gorunur (ekran).
6. Yari mamul, mamul, demirbasta mukerrer denetimi yok (#227 m8, ekran gerekir).
7. Excel ice/disa aktarim, QR, belge yukleme kapali (#235 sunucu; paket onayi ve ekran #234).
8. Ikinci menu prototip dosyasinin icinde, kabugun ikinci menusunde degil (#227 m17, #198; DUZEN madde 2).
9. `tanim-yaz` hicbir rolde yok; tanim ve ayar yalniz yonetici (#229, rol karari sizde).

SONRA (gorunum, ic yapi, Logo / SMARTES)
10. Kart tek jsonb; sunucu icerigi dogrulamaz; tur/onek/anahtar istemci ozetinden gelir (#232).
11. Ekran kendi stilini tasir, lint taramaz (m15 kalsin).
12. `mk-*` tarayici anahtarlari (#234 m16; #236 bellek ici depo ile kismen kapanir).
13. Icerik politikasi `script-src 'unsafe-inline'`, ters vekil (dagitimda).
14. Sayfasiz kart listesi (#169, #235).
15. Surum ve kisit iletisi cekirdek kalibinda degil (#90, #168; m22 kalsin).
16. Sablon ve ayar surumsuz (son yazan kazanir).
17. Okuma uclarinda yetki serviste; `malzemeler.oku` islemi gelince uca tasinir.
18. Denetimde talep kapanisinin turu (uygulama/ret/geri cekme) okunamaz.
19. NOTLAR.md'deki iki yaniltici cumle.
20. Logo alanlari ve `stok_kodu <= 24` veritabani kisiti (#232).
21. `test:modul` Linux'ta sunucu testlerini bulmuyor (arac; `araclar/test-modul.ts` satir 19 tirnakli glob). Bu turda dogrulanmadi.

Sayim: TUTAN 2, ETKILEYEN 7, SONRA 12.

## c) Baska parcalardan beklenenler
- Ortak arayuz (#172): `YalitilmisCerceve` ve `yalitim.ts` (dal `236-cerceve-kisitlamasi`'ndaki hazir hali); madde 2 bunsuz kapanmaz.
- Cekirdek (#259): `paylasilan/islemler/malzemeler.ts`'e `malzemeler.oku` (madde 17, SONRA; bu tur sart degil); `test:modul` Linux duzeltmesi (madde 21).
- Rol x islem satiri (#229): `malzemeler.tanim-yaz` icin rol goc satiri; rol karari sizden, yazimi rol satirinin sahibinde.
- Uretim-emirleri: bir sey beklenmiyor. Harita: malzemelere bagli modul yok (`Ona bagimli (0)`), akis A bugun malzeme kartina dokunmuyor.

## d) #227 (25 madde): 07.10.2026 cevaplariniz
1 kalsin; 2 kalsin; 3 degissin (#226); 4 degissin (kapandi #228); 5 kalsin; 6 degissin (kapandi #228); 7 degissin: planlama_proje, mudur, yonetici (#229); 8 degissin (ekran);
9 kalsin; 10 degissin (kapandi #230); 11 degissin (kapandi #230); 12 bagla (#233, bekler); 13 degissin (#232); 14 degissin (#232); 15 kalsin; 16 degissin (#234);
17 degissin (#234); 18 degissin (#234); 19 ucu de acilsin, paket ayrica onaya (#235, #234); 20 degissin (#236); 21 degissin (#235, #234); 22 kalsin; 23 degissin (kapandi #231);
24 degissin (kapandi #231); 25 hepsi simdi (24 siniri kapandi #230; Logo alanlari #232).
