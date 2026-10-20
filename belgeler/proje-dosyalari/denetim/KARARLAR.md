# Karar defteri

Kaynak: konular ve proje sohbeti. Ilk kayit 2026-10-08 16:10 UTC; pencere 15:30 UTC'den beri (onceki kararlar geriye doldurulmadi).
Onay: kullanici (kullanici mesaji, kimligiyle) · kural (CLAUDE.md, proje talimati, ADR, ON-PAKET) · YOK.

| No | Tarih (UTC) | Konu | Karar | Dayanak | Onay |
|---|---|---|---|---|---|
| K-001 | 2026-10-08 15:33 | proje sohbeti | AR1-b: Arkon islemleri alti rolde kalir; B-013 risk kabul | yeni karar | kullanici (cmsg ...Xi7NyctyWpu3) |
| K-002 | 2026-10-08 15:33 | proje sohbeti | DN1-a: KRITIK ve YUKSEK bulgular modul yazarlarina; once kirmizi test, sonra tek PR | yeni karar | kullanici (ayni mesaj) |
| K-003 | 2026-10-08 15:34 | Arkon oturtma | B-005: hangi Arkon rolu hangi depoyu okur, bugunku tablet davranisindan cikarilir (bakim kayitlari operatore, olcu aletleri operator ve bakima kapali; cizim yalniz yonetici, planlama, hazirlik) | koordinator talimati, varsayim | kullanici, sonradan (AK2-a, 16:14, cmsg ...ERpzwuHT4M); 15:34-16:14 arasi onaysizdi |
| K-004 | 2026-10-08 15:55 | Arkon oturtma | B-006 ilk parca: onaysiz ilk baslatma reddedilir; operatorun kendi "uygun" olcumu onay sayilmaz | tabletteki kural (arkon/web/src/app/kurallar.ts:92), K-002 | kural |
| K-005 | 2026-10-08 15:55 | Arkon oturtma | B-006 kritik olcu: kural acik pakette ikinci kontrol isareti olmadan onay reddedilir; tablet isareti kayda yazar | tabletteki kural (kalite.ts:144), K-002 | kural |
| K-006 | 2026-10-08 15:51 | Satin alma uyum | B-001, B-010: karar veren, karar tarihi, senaryo kisisi ve zamani oturumdan ve sunucu saatinden; ekran degeri yok sayilir | proje talimati kural 7 | kural |
| K-007 | 2026-10-08 15:51 | Satin alma uyum | B-002: onaysiz siparis yok; onay yalniz onaydaki ve kararli talebe; onayli karar reddedilmeden degismez; talep yalniz taslaktan ulasilabilir durumla acilir | proje talimati kural 7 ("onayli kayit onaysiz degismez"), K-002 | kural |
| K-008 | 2026-10-08 15:51 | Satin alma uyum | SAT-56: kod ekranin toplamini yok sayip kendisi hesaplar (Karar 10); KURAL-TEST farkli toplamin reddini ister; baglamada sorulacak | satin-alma Karar 10 ve SAT-56 | celiski acik (B-021) |
| K-009 | 2026-10-08 15:48 | Finans tanisi | FK1 a: capraz kur gunun kurundan en cok %20 sapar; pay finans ayarinda; o gun kur yoksa kaydin kendi kuru; hic yoksa kur istenir; ret iletisi girilen, referans kur ve araligi yazar | yeni karar | kullanici (cmsg ...DNqkHpv6) |
| K-010 | 2026-10-08 15:48 | Finans tanisi | FK1 eki: pay ayari ekrandan degistirilemiyor, cekirdek isi; borca yazildi | kullanicinin "yapamiyorsan borca yaz" eki | kullanici |
| K-011 | 2026-10-08 15:48 | Finans tanisi | FK2 a: tek KDV oraniyla olusmayan toplam reddedilir; Logo faturasi ve coklu oran borca | yeni karar | kullanici |
| K-012 | 2026-10-08 15:48 | Finans tanisi | FK3 a: mahsup kur sutunu gocu once sayar, doluysa degistirmeden durur | yeni karar (dolu tablo semasi) | kullanici |
| K-013 | 2026-10-08 15:42 | Logo malzeme gonderim | #205 madde 6 yalniz malzeme karti icin kalkti; karsilik izinli listeden; deneme yalniz sahte kopruyle | yeni karar | kullanici (konu kok mesaji) |
| K-014 | 2026-10-08 15:42 | Logo malzeme gonderim | ADR 0011: kurum ici kopru cagrisi "dis servis yok" kuralindan ayrilir; CLAUDE.md icin yalniz oneri | #209 | kullanici (ayni mesaj) |
| K-015 | 2026-10-08 16:00 | Birlestirici | Denetim duzeltmeleri (#336, #337, #335) siranin basina | koordinator; proje talimati birlestirme sirasi | kural (sira koordinator isi) |
| K-016 | 2026-10-08 16:14 | proje sohbeti | AK2-a: #337 depo okuma dagilimi onaylandi (K-003 kapandi) | yeni karar (yetki) | kullanici (cmsg ...ERpzwuHT4M) |
| K-017 | 2026-10-08 16:14 | Arkon oturtma | AK1-c: kalite RED'de durdurma borcta acik madde kalir | yeni karar | kullanici (ayni mesaj) |
| K-018 | 2026-10-08 16:14 | Cekirdek oturtma | CI1 c: CI is siniri 20 dk (#340) ve cekirdek testleri hizlanir (#342 eszamanlilik) | yeni karar | kullanici; "CL1-C" koordinatorce CI1 c okundu (yorum, itiraz gelmedi) |
| K-019 | 2026-10-08 16:11 | Logo malzeme gonderim | LB1/2/4/5/7 a; LB3 KDV tek deger, varsayilan bos, bossa gonderilmez; LB6 c kopru listesi saklanir + yonetici elle girer; LB8 bicim bilgisi, exists ve unitsets bicimi DOGRULANMADI | yeni karar | kullanici (cmsg ...EtH1C7azn7) |
| K-020 | 2026-10-08 16:15 | Logo malzeme gonderim | LB9 a karsilik tablosu malzemelerde; LB10 a KDV Logo modulu ayari, bos gelir, tek deger vat+sellVat; LB11 a birim seti tablosu Logo'da, islem logo.birim-seti-yaz yalniz yonetici; "Logo baglantisi" anahtari varsayilan kapali | yeni karar; LB10, K-019'daki "finans/malzeme ayari" yerini kullanici kendisi degistirdi | kullanici (cmsg ...RaJhZZdUnv) |
| K-021 | 2026-10-08 16:36 | proje sohbeti | LR1 evet (logo.birim-seti-yaz rol satiri, goc); LR2 a (CLAUDE.md satiri proje metinleri PR'i); CSP a (#341); AR2 a (#345) | yeni karar | kullanici (cmsg ...CqtDTgCPL5) |
| K-022 | 2026-10-08 16:37 | Logo Tiger REST | LT1 a: atolyede Tiger 3 Enterprise; #339 LT2 kararina kadar oldugu gibi | bilgi | kullanici (cmsg ...TpQsW5WGPw) |
| K-023 | 2026-10-08 16:58 | Cekirdek oturtma | #347: calisamayan zamanlanmis is isBekliyor('neden') doner; #339'daki LogoOrtamDegiskeniYok hatasinin yerine gecer | Logo cekirdek istegi madde 7; K-013 "degisken yokken kapali calisir" | kural |
| K-024 | 2026-10-08 16:58 | Cekirdek oturtma | #343: logo.birim-seti-yaz yalniz yoneticide, goc gerekmedi (matris kaydi) | K-021 LR1 | kural |
| K-025 | 2026-10-08 ~17:00 | Malzemeler oturtma | #348: tur karsiligi yalniz 10/11/12/13, demirbas bos; LB7 gocu uymayan satirda durur; VARSAYIM: demirbas olmayan her tur dort koddan herhangi birine eslenebilir | K-019 LB2 a, LB7 a; K-020 LB9 a | kural; tur-kod serbestligi varsayim (kartta yazili olmali) |
| K-026 | 2026-10-08 17:08 | Birlestirici | #345 kirmizi kanit ayri commit yerine PR yorumundaki taban kosusuyla kabul; zamanlayici parcasi tabanda kosturulamadi | K-002 "once kirmizi test" | kural; zamanlayici parcasi icin kirmizi gorulmedi |
| K-027 | 2026-10-08 17:18 | proje sohbeti | PM1 a: CLAUDE.md kirmizi cizgi satirini kullanici GitHub'da elle degistirir; PM2 b: proje talimati degismez | yeni karar | kullanici (cmsg ...9b4cDwAFgm); CLAUDE.md istisnasi ile proje talimati kural 8 arasindaki fark bilerek birakildi |
| K-028 | 2026-10-08 17:22 | Logo Tiger REST | LT2 a: Logo gonderimi simdi kopruyle (#339); REST ayri kartla, kimlik ve Swagger bicimleri gelince | yeni karar | kullanici (karar karti, ...MYbeVmGgf8) |
| K-029 | 2026-10-08 17:20 | Cekirdek oturtma | kisiler'in iki test dosyasi dosya basina kurulum + test basina hizli sifirlama (#349); cekirdek yapar | yeni karar (kapsam) | kullanici ("A", cmsg ...XzDfG9zc); koordinator birlesticiye onay olarak baska mesaji (...ERpzwuHT4M) ekledi |
| K-030 | 2026-10-08 17:48 | Birlestirici / Cekirdek | Ana dal kirmizisi (53200): #341 geri alinmaz; test kapanisi semayi kilitle sirali siler (#350); es zamanlilik 8, .github degismez, test atlanmaz | birlestirme durdurma kurali; K-018 kapsami | kural (birlestirici geri almayi kullaniciya sordu, koordinator teknik ayrinti sayip karar verdi) |
| K-031 | 2026-10-08 ~17:58 | Arkon oturtma | #351: operator tableti okuyamadigi depoyu (olcu aletleri) istemez | K-016 AK2-a dagilimi | kural |
| K-032 | 2026-10-08 19:33 | Cekirdek oturtma | #352: ayar varsayilan deger tip kirigi duzeltildi (bos varsayilanli sayi ayari) | K-019 LB3, K-020 LB10 | kural |
| K-033 | 2026-10-08 19:20 | Logo malzeme gonderim | #339 KDV ayari, cekirdek bos degeri kaydedene kadar eklenmez; KDV gonderilmez | K-020 LB10 ("o gelene kadar KDV gonderilmez") | kural |
| K-034 | 2026-10-08 23:52 | Cekirdek oturtma | KD1 a (kart): ayar_deger_dolu kisiti gevsesin; #354 acildi | yeni karar (sema) | kullanici (karar karti); K-035 ve K-036 ile yerine gecildi |
| K-035 | 2026-10-08 23:55 | proje sohbeti | Logo KDV orani varsayilani %20 (bos degil) | yeni karar; K-019 LB3 ve K-020 LB10'daki "varsayilan bos" kararini degistirir | kullanici (cmsg ...M1rk1xpBTo) |
| K-036 | 2026-10-08 23:57 | Cekirdek oturtma | KD2 "Kalmasin": bos birakma secenegi yok, #354 birlesmeden kapandi, kisit degismedi | K-034 ile K-035 arasindaki farki koordinator sordu | kullanici (karar karti, ...NqkuwbvwKe) |
| K-037 | 2026-10-08 23:53 | proje sohbeti | AY1 a: tablette ayarda basilan Iyi ve Hurda bugunku gibi sayilir; ilk parca ayarda islenir, onaylaninca gercek parca (#353 belge) | yeni karar (is kurali) | kullanici (cmsg ...BVsmjANVT1) |
| K-038 | 2026-10-09 00:04 | proje sohbeti | BG1 a: Asama 2 (BAGLA) baslar, Logo gercek kopru denemesi yanda surer | proje talimati kural 5 ("bagla" deyince) | kullanici ("1" sonrasi acik "bg1a", cmsg ...1T55wtPQQn) |
| K-039 | 2026-10-09 00:12 | proje sohbeti | SR1 a: akis sirasi C tedarik, A uretim, B plan, D finans | yeni karar | kullanici (cmsg ...B3f7mb2e9Z) |
| K-040 | 2026-10-09 00:17-00:23 | Bagla hazirlik | SH1 a (stok satin almaya yazar, teslim satin almada); SH2 b (GKK kalite modulune kadar yok); SH3 a (plan, Arkon, sarf is emrine; parti ve uretim girisi uretim emrine); SH4 a (malzemelerde birim tablosu); SH5 b (istasyona uretim alani isareti, goc ayrica sorulur); SH6 a (departman ve butce satin almada) | yeni karar (modul siniri, sahiplik) | kullanici (cmsg ...S5ywpRGsbQ, ...LkeKYsynhW) |
| K-041 | 2026-10-09 00:24 | proje sohbeti | TR1 a: tedarik ilk turu finans, satin alma, stok, malzemeler; once liste, "yaz" onayi kullanicida | yeni karar (kapsam) | kullanici (cmsg ...4QDD1cJCvV) |
| K-042 | 2026-10-09 00:26 | proje sohbeti | BO1 a: istasyonlar, Arkon, rota, cekirdek, ortak arayuz yalniz liste verir; yaz onayi kullanicida | yeni karar (kapsam) | kullanici (cmsg ...NKUySxZqd2) |
| K-043 | 2026-10-09 01:01 | proje sohbeti | Bagla tur 1: SORULAR.md hepsi a, farklar asagida (ST1-ST3, ST5, ST6 a; SA1, SA4, SA5 a; ML1 a; AG1 a; RG1 a; UA1 a; CK1-CK3 a; KN1 a) | yeni karar | kullanici (cmsg ...8xWGALpYst) |
| K-044 | 2026-10-09 01:01 | proje sohbeti | SA5 a: ekranin teklif toplami farkliysa sunucu kendi hesabini yazar (satin-alma Karar 10 korunur; SAT-56/KURAL-TEST'in ret istegi duser) | K-008 celiskisini kapatir | kullanici (ayni mesaj) |
| K-045 | 2026-10-09 01:01 | proje sohbeti | SA2 b: katalog kalemi malzeme kartina zorunlu bagli; goc once sayar; kopya sutunlar hizmet turu gelmeden dusmez (ayri, en son goc); talep ekraninda kart isteme yolu | OS6 guncellendi | kullanici (ayni mesaj) |
| K-046 | 2026-10-09 01:01 | proje sohbeti | SA3 a kosullu: teklif ve sipariste gunun kuru saklanir; finansta kur yoksa satin alma kullanicidan ister, finansa yazmaz; goc once sayar. ST4 a: toplamayi baslatan ya da stok.toplama tasiyan kapatir, kapatan kayitta gorunur. ML2 b: Birimler sayfasi acilmaz, Ayarlar listesi kalir (malzemeler.tanim-yaz) | yeni karar | kullanici (ayni mesaj) |
| K-047 | 2026-10-09 01:01 | proje sohbeti | Teslim asimi reddedilmez: depo saydigini yazar, asan miktar siparis satirinda "fazla teslim" gorunur | yeni karar (is kurali); TS1'in onerisi (a, ret) yerine | kullanici (ayni mesaj); koordinator TS1'i "dustu" saydi (yorum, kullanicinin ozel kurali "hepsi a"dan once gelir) |
| K-048 | 2026-10-09 01:01 | proje sohbeti | Malzemeler ve Hizmetler: sayfa adi degisir (modul adi degismez); yeni tur hizmet, zorunlu hizmet_yonu (alinan/verilen), aktif sonrasi degismez; ofis/temizlik sarf kategorisi; hizmet recete bileseni olamaz; satin alma yalniz alinan hizmet; hizmet stoklanmaz; Logo'ya ayri hizmet karti ucuyla | yeni karar (veri yapisi, kapsam) | kullanici (ayni mesaj); yazim once liste ve onayla |
| K-049 | 2026-10-09 01:01 | proje sohbeti | Fason iscilik rota adimidir (recete bileseni degil); yazim baslatmaz, once liste | yeni karar | kullanici (ayni mesaj) |
| K-050 | 2026-10-09 01:03 | proje sohbeti | SABIT KIMLIKLER proje talimatina eklendi (malzeme turleri, hizmet yonu, fason, OS6) | kullanicinin "SABIT KIMLIKLER'E EKLE" istegi | kullanici; koordinator proje ayarini guncelledi (01:03:52) |
| K-051 | 2026-10-09 01:04 | proje sohbeti | CLAUDE.md "acik dal en cok 5" yerine "parca basina bir acik dal" metni onerildi; dosyayi kullanici duzenleyecek | kullanicinin istegi; CLAUDE.md "Dis moduller" madde 6 | kullanici (oneri, henuz islenmedi) |
| K-052 | 2026-10-09 01:04 | proje sohbeti | Kartsiz kalanlar var olan kartla: ayar denetim kaydi #119, ortak arayuz kisi secici/menu #172 ("itiraz yoksa") | K-043 KN1 a | kural |
| K-053 | 2026-10-09 04:26 | Logo malzeme gonderim | KH1-KH4: hizmet gonderimi "var mi" ucu dogrulanmadan acilmaz; JSON alan adlari BILMIYORUM; KH3 b: ayri "Logo: hizmet KDV orani" ayari, varsayilan bos, bosken gonderilmez | KH sorulari (01:04) | kullanici. CELISKI RISKI K-036: ayar_deger_dolu kisiti (20261006183341_ayarlar_tablo.sql:8) bos degeri yalniz varsayilan olarak birakir, sonradan bos kaydedilemez |
| K-054 | 2026-10-09 04:31 | proje sohbeti | AG2-1 a (A+C), AG2-2 a (istasyonlar eski kod gecmisini disari.ts "eski koddan kimlik coz" ile tutar), AG2-3..5 a | AG2 listesi (01:23) | kullanici |
| K-055 | 2026-10-09 04:31 | proje sohbeti | FS1 a, FS2 a, FS4 a; FS3 b: fason firma her operasyon tipinde secilebilir | FS listesi (01:23) | kullanici |
| K-056 | 2026-10-09 04:31 | proje sohbeti | MH1 a (HZ), MH2 a, MH3 a, MH5 a; MH4 a + kg, m2, km; varsayimlar kabul ("Yeni kart", hizmet kartinda etiket yok) | MH listesi (01:23) | kullanici |
| K-057 | 2026-10-09 04:31 | proje sohbeti | RC1 kosullu onay: bakim sayfa.stok salt okur, stok.cikis yok; roller modul modul, o modulun borcu kapaninca kullanici "gir" deyince | RC1 (01:23) | kullanici |
| K-058 | 2026-10-09 04:3x | proje sohbeti | Talep ana sayfadan acilir (R1/R2 varsayimi ve SAT-53 degisir); talep eden hicbir satin alma ucunda fiyat, tedarikci, butce, kur gormez (uc basina test); serbest kalem "kart bekliyor", siparise donemez; hizli acma oturum kisisi; operatore yok; AS1-3 a | AS sorulari | kullanici |
| K-059 | 2026-10-09 04:3x | proje sohbeti | "/" ortak arayuze gecer; sistem modulunun sahibi ortak arayuz (modul siniri); kart #172 dal 172-ana-sayfa-kartlari; satin alma tarafi #375 | K-058 | kullanici |
| K-060 | 2026-10-09 04:3x | proje sohbeti | Uc kart acildi: #368, #369, #370 | K-051/K-052 bekleyeni | kullanici |
| K-061 | 2026-10-09 04:45 | terminal | Cekirdek, disarida olan terminal modulune 4 test satiri ekler | kullanici karti | kullanici. CLAUDE.md "Dis moduller" 1 ("o surede depoda dokunulmaz") istisnasi, kullanici onayli |
| K-062 | 2026-10-09 04:57 | Arkon oturtma | Arkon test satiri (kart) | kart | kullanici |
| K-063 | 2026-10-09 04:51 | proje sohbeti | KD-001 ve KD-002 Arkon'a liste olarak gider | soru (a) | kullanici |
| K-064 | 2026-10-09 04:5x | proje sohbeti | #376 finans "yaz" denmeden acildi; 04:57 kullanici birlestirmeyi onayladi | - | ONAYSIZ, sonradan onaylandi |
| K-065 | 2026-10-09 04:5x | proje sohbeti | 6 saatte bir kod degerlendirme rutini (PR #378, KOD.md); 2 saate cekilmesi sorusuna "B" (birak) | kullanici istegi | kullanici |
| K-066 | 2026-10-09 05:00 | Logo malzeme gonderim | Hizmet karti plani onayli; LH1 a: gonderim kapali isareti kodda, Sistem Ayarlari'nda anahtar yok; "var mi" yolu acilirken ayni PR'da gercek kopru denemesi belgeye girer, denemesiz PR birlesmez; SalesService VARSAYIM, ayri kapali isaret; alan adlari "dogrulanmadi" | LH sorulari | kullanici |
| K-067 | 2026-10-09 05:00 | Logo / Cekirdek | LH2 b: sayi ayari dolduktan sonra yeniden bosaltilabilir; cekirdek istegi hemen (#382) | yeni karar (sema); K-036 KD2 "Kalmasin"i kullanici kendisi degistirdi, gerekce: yanlis KDV oranini silme yolu | kullanici. Uygulama DOGRULANDI: sunucu/gocler/20261009050115_ayarlar_bos_deger.sql once sayar, ayar_deger_dolu kalkar, satir degismez |
| K-068 | 2026-10-09 05:11 | proje sohbeti | Iki kart koordinatorce acildi: Arkon #383 (kopya #384 kapandi), Istasyonlar eski kod gecmisi #385 | CLAUDE.md "kartsiz is yok" | kullanici (karar karti "Sen ac") |
| K-069 | 2026-10-09 05:20 | proje sohbeti | Ana sayfa talep ekrani onayli (#388) | K-058 | kullanici ("A") |
| K-070 | 2026-10-09 06:05 | Cekirdek | Finans rolleri gir (#387, 16 satir) | K-057 RC1 | kullanici (yazili). Birlesti 3a6cc6d; goc 20261009053000_kisiler_finans_islemleri.sql |
| K-071 | 2026-10-09 06:09 | Cekirdek | #370: kilitlenmede 3 yeniden deneme, sonra 503 (PR #396); "3 yeniden" = toplam en cok 4 kosu VARSAYIM; hicbir uca isaret konmaz, her modul kendi dalinda | K-060 | kullanici (a yaz) |
| K-072 | 2026-10-09 06:15 | Cekirdek | Stok rolleri gir (#394): depo, mudur, planlama yalniz toplama, bakim yalniz okuma, cikis yok | K-057 RC1 | kullanici (yazili); henuz birlesmedi |
| K-073 | 2026-10-09 05:26-06:38 | Ortak arayuz / diger | Menu duzeni 1a 2a (#392), ikonlar (#393), hizmet cesitleri (#397), fasondan donen hizmet satiri c, finans fason suzgeci yaz, proje dosyalari depoya (#399) | koordinatorun 06:08 listesi | kullanici (koordinator listesine gore; thread metinleri tek tek okunmadi) |
| K-074 | 2026-10-09 06:47 | proje sohbeti | Arkon kalite RED'de makine durdurma: c, borc listesinde kalir | K-017 ile ayni | kullanici ("1-C") |
| K-075 | 2026-10-09 06:49 | proje sohbeti | UE-LISTESI icin dayanak teslim-rota-plan-c2c9871 (kullanici: "icinde hepsi var"); karsilastirma thread'de | - | kullanici; sonuc bekleniyor |
| K-076 | 2026-10-09 04:48 | proje sohbeti | Ana sayfa kartlari (#172): "/" ortak arayuze gecer, Sistem durumu kart olur, sistem modulunun sahibi ortak arayuz; talep karti ustte | yeni karar (modul siniri) | kullanici (proje sohbeti 04:48); #399'da K-066 |
| K-077 | 2026-10-09 04:48 | proje sohbeti | Ana sayfadan talep (#375): AS1 a (operator yok), AS2 a, AS3 a; serbest kalem kart baglanmadan siparise donusmez (sunucu ret, testli); talep eden fiyat, tedarikci, butce, limit, kur gormez; hizli acma yalniz oturumdaki kisi adina | yeni karar | kullanici (ayni mesaj); #399'da K-067 |
| K-078 | 2026-10-09 04:57 | proje sohbeti | #376 finans cek cirosu birlesir; Arkon test satirina cekirdek `surum: 1` ekler | karar karti | kullanici; #399'da K-068 |
| K-079 | 2026-10-09 06:36 | Kalan isler | Proje dosyalarinin metin kismi depoya `belgeler/proje-dosyalari/` altina girer (goruntu, zip, betik ve kayitlar haric); proje sohbetinin soru-cevaplari `SORU-CEVAP.md` | yeni karar | kullanici ("SECIMIM A", "YAZ"); #399'da K-076 |
| K-080 | 2026-10-09 ~06:39 | Stok ve depo tanisi | Fasondan donen hizmet satiri: c, giden yari mamul fason konumuna transfer edilir, donuste yeni yari mamul girer, giden duser (#206) | yeni karar | kullanici ("C"); #399'da K-077 |
| K-081 | 2026-10-09 07:04 | proje sohbeti | KD-009, KD-010 stoka; KD-010 talep tarafi ve KD-011 satin almaya duzeltmeye gider; her biri once liste verip "yaz" bekler (#403, #404) | kod degerlendirme rutini | kullanici ("a") |
| K-082 | 2026-10-09 ~07:00 | Cekirdek | Satin alma rolleri R1-R3 girdi (#402 birlesti, DOGRULANDI a096c1a); "gir" cevabinin metni thread icinde, bu kopyada okunmadi (VARSAYIM: koordinator bildirimi) | K-057 RC1 | kullanici |
| K-083 | 2026-10-09 08:08 | proje sohbeti | uretim-emirleri modulunu kullanici getirir ("MODULU BEN VERICEM"); istek listesi `bagla/UE-LISTESI.md` (UE19 eklendi), teslim gelince madde madde karsilastirilir (`bagla/UE-teslim-karsilastirma.md`) | K-075 | kullanici |
| K-084 | 2026-10-09 08:11 | proje sohbeti | Kod degerlendirme ve proje raporu rutinleri durduruldu (silinmedi); proje baska yerde surer | - | kullanici ("A") |
| K-085 | 2026-10-09 ~13:00 | Gelistirici oturumu | Akis C deneme hatalari modul basina kartla duzelir, sira satin alma, malzemeler, finans (S2 a); deneme belgesi (`bagla/satin-alma-deneme.md`) duzeltmeler bitince tek seferde guncellenir (S3 a) | yerel deneme, 15 adim (11 gecti, 2 kaldi, 2 ara adimla gecti) | kullanici ("s2a,s3a") |
| K-086 | 2026-10-09 ~13:30 | Gelistirici oturumu | S7 a: satin alma artik depoda yazilir; #162'den `durum: disarida` etiketi kalkti | CLAUDE.md "Dis moduller" 1; #403 depoda yazilmisti | kullanici ("a, yaz") |
| K-087 | 2026-10-09 ~13:30 | Gelistirici oturumu | S4 a: SAT-07 degisti, `teklif_isteniyor -> onayda` gecisi sunucuda izinli (en az teklif sayisina ulasmamis talepte karar 422 ile kayboluyordu) | satin-alma KURAL-TEST SAT-07 | kullanici ("s4a") |
| K-088 | 2026-10-09 ~13:30 | Gelistirici oturumu | S5 a: SAT-41 genisledi, pasif ya da tedarikci olamayan firmayla yeni ya da firmasi degisen teklif sunucuda reddedilir; eski teklif korunur; ekranda "(pasif)" | satin-alma KURAL-TEST SAT-41 | kullanici ("s5a") |
| K-089 | 2026-10-09 ~13:30 | Gelistirici oturumu | S6 b: talep kalemi karta baglaninca birim kart birimi olur, kullanici uyarilir; var olan siparislere dokunulmaz | yeni karar (is kurali) | kullanici ("s6b") |

Numara notu: #399 ile depoya giren kopyada K-066..K-077 farkli siralanmisti. Gecerli sira bu tablodur (denetim gunlugu bu numaralari kullanir). Eski -> yeni: K-066 -> K-076, K-067 -> K-077, K-068 -> K-078, K-069 -> K-066/K-067 (Logo LH1, LH2), K-070 -> K-068, K-071 -> K-069, K-072 -> K-073 (menu, ikon), K-073 -> K-071, K-074 -> K-070 ve K-072, K-075 -> K-073 (fason suzgeci, hizmet cesitleri), K-076 -> K-079, K-077 -> K-080.

## Bekleyen sorular

| Soru | Konu | Soruldugu (UTC) | Durum |
|---|---|---|---|
| RED'de makineyi durdurma | Arkon oturtma | 15:38 | kapandi 16:14 (K-017) |
| LB1-LB11 | Logo malzeme gonderim | 15:48, 16:13 | kapandi 16:11 ve 16:15 (K-019, K-020) |
| #318 stok CI siniri (CI1) | Birlestirici | 16:08 | kapandi 16:14 (K-018); #318 birlesti |
| SAT-56 Karar 10 ile celiski (K-008) | Satin alma uyum | baglamaya ertelendi | kapandi 01:01 (K-044) |
| LT2: Logo gonderimi kopru mu REST mi | Logo Tiger REST | 16:38 | kapandi 17:22 (K-028) |
| PM1: CLAUDE.md satiri nasil girsin | Proje metinleri | 16:38 | kapandi 17:18 (K-027); satir kullanicida |
| PM2: istisna proje talimatina da eklensin mi | Proje metinleri | 16:38 | kapandi 17:18 (K-027, hayir) |
| Bos (null) sayi ayari varsayilana dusuyor mu | Logo malzeme gonderim | 17:02 (koordinator) | cevaplandi 19:13: bos deger hic kaydedilemiyor (KD1) |
| kisiler test kurulumu kim yapsin | Cekirdek oturtma | ~16:50 | kapandi 17:20 (K-029) |
| AY1: tablette ayarda basilan Iyi ve Hurda ne olsun (kural yok) | Arkon oturtma | 17:59 | kapandi 23:53 (K-037; 5 sa 54 dk bekledi) |
| KD1: ayar tablosunda ayar_deger_dolu kisiti gevsetilsin mi (goc, bos KDV icin) | Cekirdek oturtma | 19:24 | kapandi 23:57 (K-034..K-036) |
| SORULAR.md 22 soru + TS1 | proje sohbeti | 00:27-00:38 | kapandi 01:01 (K-043..K-047); AG2 listeye dondu |
| KH1-KH4 Logo hizmet karti kopru alanlari | Logo malzeme gonderim | 01:04 | kapandi 04:26 (K-053) |
| Uc yeni kart acilsin (istasyonlar uretim alani; durus/kalibrasyon surum; kilitlenme yeniden deneme) | proje sohbeti | 01:04 | kapandi (K-060: #368-#370) |
| CLAUDE.md madde 6 satirini kullanici duzenlesin | proje sohbeti | 01:04 | bekliyor |
| AG2-1..AG2-5, FS1-FS4, MH1-MH5, RC1 | proje sohbeti | 01:23 | kapandi 04:31 (K-054..K-057) |
| AS1-AS3 talep ana sayfadan | proje sohbeti | ~04:30 | kapandi (K-058) |
| LH1, LH2 Logo hizmet | Logo malzeme gonderim | ~04:59 | kapandi 05:00 (K-066, K-067) |
| #370 kilitlenme yaz | Cekirdek | 04:59 | kapandi 06:09 (K-071) |
| Finans / stok rolleri gir | Cekirdek | 05:15, 06:13 | kapandi 06:05, 06:15 (K-070, K-072) |
| Satin alma rolleri gir | Cekirdek | hazirlaniyor (06:45) | kapandi (#402, K-082) |
| KD-009..KD-011 duzeltmeye gonderilsin mi (a/b) | proje sohbeti | 06:53 | kapandi 07:04 (K-081); #403, #404 birlesme sirasinda |
| UE-LISTESI teslimle karsilastirma | proje sohbeti | 06:49 | modulu kullanici getirecek (K-083); teslim gelince karsilastirilir |
| Stok: fasondan donen hizmet satiri mal kabulde (a yalniz teslim / c fason konumuna transfer, oneri c) | Stok ve depo tanisi | ~06:05 | kapandi ~06:39 (K-080) |
| Arkon RED'de makine durdurma kapanisi (a/b/c, K-017 ile borcta) | Arkon oturtma | 08.10 16:14 | kapandi 06:47: c, borcta kalir (K-074) |
| uretim-emirleri yeni emir modeli (UE-LISTESI) disaridaki yazara iletilsin | Kalan isler | 06:20 | modulu kullanici getirecek (K-083) |
| S8: yeni kurulumda USD/EUR/GBP aylik faizi %0 mi (DB varsayilani, onerilen) yoksa ekranin eski 0,4/0,3/0,4'u mu | Gelistirici oturumu (#162) | ~14:20 | bekliyor; kod %0 ile yazildi (oneri) |
