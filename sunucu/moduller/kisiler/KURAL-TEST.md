# Kural ve test eşlemesi: kisiler

Test adları dosyalardan okundu; uç başına ayrıntı `GUVENLIK-DENETIMI.md`.

## Emir kapanışı rol yetkileri (kart #1078)

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| KS-5 Kapanışta kalite onayı kalitede, müdür onayı müdürde; Kapanış onayları sayfası ikisinde ve planlamada; yönetici hepsini taşır (1078 a) | kapanis-yetkileri.test.ts "kalite kalite onayını, müdür müdür onayını alır; ..." (girişteki işlem kümesi) | aynı test: öteki bütün roller üç işlemden hiçbirini almaz; "kalite ve müdür rolü olan kişi ...": kalite müdür onayını, müdür kalite onayını almaz |
| KS-5 İki rolü olan kişi iki onayı da taşır (1077 b) | kapanis-yetkileri.test.ts "kalite ve müdür rolü olan kişi iki onayı da taşır ..." | - |

Mutasyon (DOĞRULANDI, yerelde `node --test kapanis-yetkileri.test.ts`): göç dosyası kaldırılınca 2 test kırmızı.

## Kişiye ek işlem (kart #1233)

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| KS-4 Kişiye rolün üstüne ek işlemi yalnız bayraklı kişi verir ve alır; ek işlem oturumdaki işlem listesine girer, uçlar onunla denetler | ek-islem.test.ts "KS-4: yönetici kişiye rolünde olmayan sayfa ve işlemi verir; ..." (200, `GET /ayarlar` 403'ten 200'e, alınca 403) | ek-islem.test.ts "KS-4: rol yöneten ama bayraksız kişi ..." (403, satır yazılmaz; rol yönetmeyen 403, oturumsuz 401) |
| KS-4 Pasif ya da girişsiz kişiye ek işlem verilmez; var olan satır pasifte korunur ve alınabilir | ek-islem.test.ts "KS-4: pasif ya da girişsiz ..." (alma 200) | aynı test: pasif ve girişsiz kişiye verme 422, satır yazılmaz |
| KS-4 Bayraklı kişiye, kayıtsız ve devredilmez işlem (`kisiler.rol-yonet`, `kisiler.parola-degistir`, `guvenlik.oku`, `guvenlik.yonet`) verilmez | aynı dosya: devredilmez satır alınabilir (200) | ek-islem.test.ts "KS-4: bayraklı kişi, kayıtsız işlem ve devredilmez ..." (422, olmayan kişi 404) |

Mutasyon (DOĞRULANDI, yerelde `node --test ek-islem.test.ts`): `ekIslemReddi`'nden bayraklı aktör satırı silinince 1, devredilmez satırı silinince 1 test kırmızı.

## 3. tur (sürüm, tekrar, dışa açık yazma)

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| KS-1 Kişi komutu beklenen sürümü taşır (`duzenle`, `pasife-al`, `aktif-yap`, `hesap-ac`, `parola-degistir`) | kisi-yonetimi.test.ts "KS-1: kişi komutları beklenen sürümü taşır; ..." (güncel sürüm 200, sürüm +1) | aynı test: eski sürüm 409 `eski-surum`, kayıt değişmez; sürümsüz 400; kişi yoksa 404 |
| KS-1 Rol komutu beklenen sürümü taşır (`rol-ata`, `rol-al`) | rol-atama.test.ts "KS-1: rol komutu beklenen sürümü taşır; ..." | aynı test: eski sürüm 409, rol değişmez; sürümsüz 400 |
| KS-1 Son yazan kazanmaz | kisi-yonetimi.test.ts "KS-1: aynı sürümle gelen iki eşzamanlı düzenlemeden biri 200, ..." | aynı test: öteki 409, kayıtta kazananın adı ve sürüm 2 |
| KS-1 Kendi parolasını değiştirme sürümü artırır | kisi-yonetimi.test.ts "KS-1: kişinin kendi parolasını değiştirmesi sürümü artırır; ..." | aynı test: eski sürümle gelen düzenleme 409 |
| KS-11 Başkasının bütün oturumlarını ayrı işlem (`kisiler.oturum-kapat`, yalnız yönetici) kapatır; kişi pasife alınmaz, girişi kalır; sürüm artar | oturumlari-kapatma.test.ts "izinli: yönetici kişinin bütün oturumlarını kapatır; ..." ve "izinli: yönetici başka bir yöneticinin oturumlarını da kapatır"; saf test KS-11 | aynı dosya: işlemsiz (`kisiler.yaz`'lı İK dahil) 403, oturumsuz 401; kendine 422; girişsiz 422; olmayan 404; eski sürüm 409; sürümsüz 400; bayraksız işlem sahibi bayraklıya 403; ek işlem olarak verilemez 422 |
| KS-2 `POST /kisiler` istek kimliği ister | kisi-yonetimi.test.ts "KS-2: aynı istek kimliğiyle ..." (farklı kimlik ikinci kişiyi açar) | aynı test: aynı kimlik ikinci kişi açmaz, aynı cevap; kimliksiz 400 |
| KS-3 Dışa açık `rolAta`, `rolAl` `kisiler.rol-yonet` sorar | rol-atama.test.ts "KS-3: dışa açık rolAta ve rolAl ..." (yönetici ile atar, alır) | aynı test: işlemsiz ve pasif aktör `YETKI_YOK`, durum değişmez |
| Ekran sürümü gönderir, eski sürümde listeyi yeniler | istemci PersonelIslemleri.test.tsx (gövdede `surum`) | aynı dosya: 409 `eski-surum` liste yeniden okunur |
| Ekran kişi eklemede istek kimliği gönderir | istemci PersonelIslemleri.test.tsx (başlıkta kimlik) | aynı dosya: 500 sonrası yeniden denemede aynı kimlik |

Mutasyon (DOĞRULANDI, yerelde `test:modul -- kisiler`): sürüm koşulu kaldırılınca 4, `tekrarKorumali` kapanınca 1, `rolAta` sarmalayıcısındaki
yetki denetimi silinince 1, `rolAl` sarmalayıcısındaki silinince 1 test kırmızı.

## Önceki kurallar

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| Kişi ekleme `kisiler.yaz` ister; girişsiz doğar, alanlar kırpılır, sicil tekil | kisi-yonetimi.test.ts "kişi ekleme kisiler.yaz ister; ..."; kurallar.test.ts "ad ve görev kırpılır; ..." | aynı test: yetkisiz 403, aynı sicil 409, boş ad 400; "şema: sicil ve görev boş, ..."; kurallar.test.ts "sicil ve görev sınırında kabul, bir fazlasında red" |
| Düzenleme: başkasının sicili reddedilir; kişi yoksa 404 | kisi-yonetimi.test.ts "düzenleme: alanlar değişir, ..." | aynı test: yetkisiz 403, 404 |
| Bayraklı kişinin kaydına yalnız bayraklı aktör dokunur | kisi-yonetimi.test.ts "bayraklı kişinin kaydını yalnız bayraklı aktör düzenler; ..."; kurallar.test.ts "bayraklı hedefe yalnız bayraklı aktör dokunur; ..." | aynı testler |
| Bayrak bilgisi yalnız `kisiler.rol-yonet` sahibine | rol-atama.test.ts "\"bütün işlemler\" bayrağı yalnız kisiler.rol-yonet sahibine döner; ..." | kisi-yonetimi.test.ts "düzenleme cevabı bayrak bilgisini kisiler.rol-yonet olmayana vermez" |
| Pasife alma: giriş ve oturum düşer, kayıt silinmez; kişi kendini alamaz | kisi-yonetimi.test.ts "pasife alma ve yeniden aktif yapma: ...", "girişsiz personel de pasife alınır; ..."; kurallar.test.ts "sıradan kişi herkesçe pasife alınır; ..." | kisi-yonetimi.test.ts "kişi kendini pasife alamaz"; yaris.test.ts "pasife alma sürerken açılan giriş: ..." |
| Bayraklıyı yalnız bayraklı başkası pasife alır ve aktif yapar | kurallar.test.ts "bayraklı kişiyi yalnız bayraklı başka biri pasife alır" | kisi-yonetimi.test.ts "bayraklı kişiyi yalnız bayraklı başka kişi pasife alır", "pasif bayraklı kişiyi yalnız bayraklı başka kişi yeniden aktif yapar" |
| Sigorta: sayılan son bayraklı pasife alınamaz | kisi-yonetimi.test.ts "sigorta: ...; ikinci bayraklı varken alınır"; kurallar.test.ts "sayılan son bayraklı pasife alınamaz; ..." | kisi-yonetimi.test.ts "sigorta: ...", "girişsiz bayraklı kişi sayıya girmez: ...", "iki yönetici birbirini aynı anda pasife alamaz: ..." |
| Hesap açma `kisiler.rol-yonet` ister; bayraklı rolle yalnız bayraklı aktör | kisi-yonetimi.test.ts "hesap açma kisiler.rol-yonet ister; ..."; kurallar.test.ts "hesap açma: seçilen rol bayraklıysa ..." | kisi-yonetimi.test.ts "hesap açma reddi hiçbir şey yazmaz: ...", "bayraklı rolle hesap açmayı yalnız bayraklı kişi yapar", "bayraklı rolü zaten olan girişsiz kişiye ..."; servis.test.ts "aynı kullanıcı adıyla ..." (iki test) |
| Kullanıcı adı ve parola kuralı | kurallar.test.ts "kullanıcı adı ve parola kuralı sınırda sınanır" | aynı test |
| Başkasının parolası `kisiler.parola-degistir` ister; hedefin oturumları düşer | kisi-yonetimi.test.ts "başkasının parolası kisiler.parola-degistir ister; ...", "başkası parolayı değiştirince hedefin açık oturumları geçersiz olur" | kisi-yonetimi.test.ts "bayraklı kişinin parolasını yalnız bayraklı başka kişi değiştirir; ..."; kurallar.test.ts "kendi parolası bu yoldan değişmez; ..."; yaris.test.ts parola testleri (üç test) |
| Rol atama ve alma `kisiler.rol-yonet` ile; birden çok rol, aynı rol iki kez yok | rol-atama.test.ts "M1: ...", "M2: ...", "RA1: pasif kişiye rol atanabilir", "P2: ..." | rol-atama.test.ts "M1" (yetkisiz 403), "M2" (ikinci kez), "bulunamayan kişi ya da rol 404; ..." |
| Bayraklı rolü yalnız bayraklı aktör atar ve alır | rol-kurallari.test.ts "atama: ...", "alma: ..." (üç test) | rol-atama.test.ts "P3: ..." (iki test), "P1: kişi kendi bayraklı rolünü alamaz ..." |
| Girişli kişinin son rolü alınamaz; son bayraklı kalır | rol-atama.test.ts "M4: iki ayrı bayraklı rol varken ..." | rol-atama.test.ts "M3: ...", "M4: son bayraklı kişinin rolü alınamaz; ...", "eşzamanlı iki alma: ..." (iki test) |
| Rol değişikliği açık oturumda sonraki istekte geçerli; denetime düşer | rol-atama.test.ts "M5: ...", "M6: başarılı atama ve alma denetim kaydına düşer; ..." | aynı M6 testi: reddedilen komut kayıt bırakmaz |
| Liste `kisiler.oku` ister; parola cevapta yok, kullanıcı adı yalnız `kisiler.rol-yonet` sahibine | rol-atama.test.ts "M8: ..." | aynı test: yetkisiz 403, oturumsuz 401 |
| Yetki rollerin birleşimi; bayraklı rol bütün kayıtlı işlemleri alır | kurallar.test.ts "rollerden gelen işlemler birleşir; ...", "bütün işlemler bayrağı kayıtlı her işlemi verir; ..." | aynı testler: kayıtsız işlem yetki vermez |
| Onaylı rol dağılımı (Arkon rolleri, malzeme, yansıma) | rol-dagilimi.test.ts (üç test) | aynı testler: bakım rolü işlem isteyen uçlarda 403 |
| Kullanımdaki rol silinemez | servis.test.ts "kullanımdaki rol silinemez; kullanılmayan rol işlemleriyle birlikte silinir" | aynı test |
| Göç: elle değiştirilmiş matris varken durur, hiçbir şey değiştirmez | goc.test.ts (beş test, beklenen durumda uygulanır) | aynı testler |
| Dışa açık okuma: adlar, varlık, liste, bayrak | kisi-adlari.test.ts (beş test); rol-atama.test.ts "disari: kisiVarMi ...", "disari: kisileriListele ..." | aynı testler: olmayan kimlik haritada yok, yanlış |

## Toplu işlem okuması

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| `kisilerinIslemleri` tek sorguda `kullaniciYukle` ile aynı sonucu verir | kisi-islemleri.test.ts "her aktif girişli kişi için sonuç kullaniciYukle ile aynıdır; tek sorgu" | aynı test: haritada yalnız aktif girişli kişiler |
| Bayraklı kişi bütün işlemleri, çok rollü kişi birleşimi alır | kisi-islemleri.test.ts "bayraklı kişi bütün işlemleri alır; ..." | aynı test: kayıtsız işlem geçmez |
| Pasif ve girişsiz kişi haritada yoktur | kisi-islemleri.test.ts "pasif ve girişsiz kişi haritada yoktur; ..." | aynı test |

Mutasyon (DOĞRULANDI, yerelde): bayrak çözümü kalkınca 2, aktif süzmesi kalkınca 2, giriş süzmesi kalkınca 2 test kırmızı.

## Özlük İK'dan (kart 1311; 1302 a, 1315 a)

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| KS-8 İK'ya bağlı kişide ad, sicil no ve görev Kişiler'den değişmez; aynı değer geçer; bağ kalkınca düzenlenir | ozluk-ik.test.ts "itme alanları yazar, ..." (aynı değer 200, bağ kalkınca 200); saf test KS-8 | aynı test: farklı ad 422 `ozlukIkte`, kayıt değişmez |
| KS-9 Çıkışı geçmiş kişi aktif yapılmaz; çıkış kalkınca yapılır | ozluk-ik.test.ts "geçmiş çıkış tarihi ..." (çıkış kalkınca 200) | aynı test: 422 `cikisVar`, kişi pasif kalır; saf test KS-9 |
| Çıkış tarihi gelince kişi pasif ve oturumu kapalı; ileri tarih aktif bırakır, iş tarihi gelince pasife alır | ozluk-ik.test.ts "geçmiş çıkış ...", "ileri tarihli çıkış ..." | aynı testler: çıkışsız ve bağsız kişiye dokunulmaz; eski oturum 401 |
| KS-10 Bayraklı kişiye yalnız bayraklı aktör iter; son bayraklı kullanıcı çıkışla pasife alınmaz | ozluk-ik.test.ts "son yönetici ..." (bayraklı aktör iter) | aynı test: bayraksız aktör `YETKI_YOK`, alan değişmez; son yönetici aktif kalır, iş günlüğe yazar |
| KS-11 Rolden gelen işlem rol değişmeden tek kişiden alınır; açık oturumda hemen geçerli, uç aynı listeyle denetler; işlemi taşıyan kişiler listesinden (`kisilerinIslemleri`, `kisilerinRolIslemleri`) de düşer; aynı roldeki öteki kişi etkilenmez | islem-kisiti.test.ts "KS-11: yönetici rolden gelen işlemi tek kişiden alır; ..." (200, uç 200'den 403'e, geri verince 200) | aynı test: öteki kişi 200 kalır |
| KS-11 Yalnız bayraklı aktör alır ve geri verir; bayraklı kişiden, pasif ya da girişsiz kişiden, devredilmez, kayıtsız ve rolde olmayan işlem alınmaz; var olan kısıt her durumda kaldırılır | islem-kisiti.test.ts "KS-11: pasif ya da girişsiz ..." (pasifte kaldırma 200) | islem-kisiti.test.ts "KS-11: bayraklı kişi, devredilmez ..." (422, 404, bayraksız rol yöneten 403, rol yönetmeyen 403, oturumsuz 401) |
| KS-11 Kısıt ek işlemi de bastırır; ek yeniden verilince kısıt kalkar; bütün yetkili role geçen kişide kısıt etkisizdir | islem-kisiti.test.ts "KS-11: kısıt ek işlemi de bastırır; ..." | aynı test: kısıt + ek varken uç 403 |
| Sicil benzersiz; olmayan kişi; çıkış yalnız İK'ya bağlı kişide | ozluk-ik.test.ts "sicil başka kişide ..." | aynı test: 409 `sicilVar`, 404, kısıt `kisi_ozluk_cikisi_ik_bagli` |
| Ortak seçici (#1320, 1321 b): adda ya da sicilde arar (Türkçe harf duyarsız), sicili tam tutan önce; varsayılan yalnız aktif; sayfa 30 ve `dahaVar`; çağıran modül işlemi şart | secim-ara.test.ts izinli ve reddedilen |
| Sınırlı hesap (2158-1 a, 2158-5 a): bitiş 0-90 gün; sorumlu aktif iç hesap; bayraklı kişi ve bayraklı rol sınırlı hesapta olmaz; bitiş geçince kullanıcı değil | sinirli-hesap.test.ts izinli testler; kurallar.test.ts "sınırlı hesap (kart 2158)" | sinirli-hesap.test.ts ret testleri ve "veritabanı kısıtı ..."; oturum/sinirli-oturum.test.ts "bitiş günü geçince ..." |

Mutasyon KS-11 (DOĞRULANDI, yerelde `node --test islem-kisiti.test.ts`): `yetkiKaydiBul` ya da `kisiIslemSatirlari` kısıt koşulu silinince 3, `kisiRolIslemSatirlari` koşulu silinince 2, `kisitReddi`'nden bayraklı kişi, devredilmez, bayraklı aktör ya da rolde yok satırı silinince 1'er test kırmızı.
