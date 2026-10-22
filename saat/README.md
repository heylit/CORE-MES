# TMI Saat (Galaxy Watch, Wear OS)

Kart #1633. Kullanici onaylari: madde 22 (araclar), 23 (kod bu klasorde), 24 (okuma uclari), 25 (saat oturumu).
Ilk surum yalniz okur. Akis ornektekiyle ayni: ana menu (Istasyonlarim, Uyarilar), istasyon ayrintisi, Sureler, uyari listesi
ve tam ekran uyari (yeni uyari gelince acilir). Yazma (durus nedeni, NFC, cagri)
ve 3B ikinci surumdedir. Ekran duzeni ornek sayfadan gelir (`/mnt/project-files/arastirma/akilli-saat/ornek/`).

Bu klasor npm calisma alanina, `npm run kontrol`'e ve guncelleme adimlarina girmez.

## Yapi

- `cekirdek/`: saf Kotlin kurallari (durum kodlari, geri sayim, titresim deseni, kod gosterimi). Android'siz derlenir ve sinanir.
- `uygulama/`: Wear OS uygulamasi (Jetpack Compose for Wear OS, OkHttp). Sunucu uclari: `GET /api/saat/*`, eslesme
  `POST /api/oturum/saat-istegi` ve `POST /api/oturum/saat-istegi/sor`.

## Derleme (internetli makinede)

Gerekenler: JDK 17, Android SDK (platform 34, build-tools), Gradle 8.14. Atolye agindaki makinede internet yoktur; derleme
internetli makinede yapilir ve yalniz APK tasinir.

Saate kurulan surum release'tir (kart #85): debug derlemesi saatte yavas acilir ve kaydirmada takilir (olcum: soguk acilis
4,0 sn yerine 1,2 sn). Release R8 ile kuculur ve kurum anahtariyla imzalanir.

Anahtar deposu bir kez, depo disinda uretilir ve kurum icinde yedekli saklanir. Kaybolursa ayni uygulama bir daha guncellenemez
(yeni anahtarla her saatte once kaldirma gerekir).

```
keytool -genkeypair -keystore C:\imza\tmi-saat.jks -alias tmi -keyalg RSA -keysize 2048 -validity 10000
```

Parolalar derleyenin kendi `%USERPROFILE%\.gradle\gradle.properties` dosyasina yazilir (deponun `saat/gradle.properties`
dosyasina degil):

```
imzaParolasi=<depo parolasi>
imzaAnahtari=tmi
```

`imzaAnahtarParolasi` yalniz anahtarin parolasi depodan farkliysa gerekir. Derleme:

```
gradle -PimzaDeposu=C:\imza\tmi-saat.jks :uygulama:assembleRelease :kadran:assembleRelease
```

Ciktilar `uygulama/build/outputs/apk/release/uygulama-release.apk` ve `kadran/build/outputs/apk/release/kadran-release.apk`.
- Anahtar deposu depo icindeyse ya da yoksa derleme durur; `*.jks`, `*.keystore`, `*.p12`, `*.pfx` `.gitignore`'dadir.
- `-PimzaDeposu` verilmezse release paketlenmez (imzasiz APK saate kurulmaz).
- Her yeni surumde `uygulama/build.gradle.kts` icindeki `versionCode` artirilir; ayni ya da kucuk surum ustune kurulmaz.
- Gelistirmede `gradle :uygulama:assembleDebug` kalir; debug APK saatte olcum ve kullanim icin degildir.

Debug'dan release'e ilk geciste imza degisir: her saatte bir kez `adb.exe uninstall tmi.saat` gerekir (eslesme ve sunucu adresi
silinir, saatte yeniden girilir). Sonraki release'ler ayni anahtarla `install -r` ile ustune kurulur.

Sunucu adresi uygulamaya ve depoya yazilmaz; saatte ilk acilista bir kez girilir (kullanici karari, soru 29). Ayni APK her saate
kurulur. Saf kurallarin testi: `gradle -PyalnizCekirdek :cekirdek:test`.

Imza anahtari depoya girmez (`.gitignore`); kurum icinde saklanir.

## Kurum kok sertifikasiyla derleme (kart #2045)

Bazi saatler kullanici CA sertifikasi yukletmez (Galaxy Watch SM-R960, Wear OS, Android 16: ayarlarda yukleme ekrani yok,
certinstaller CA'yi reddeder). Sunucu kurum ici ya da deneme kokunden imzali sertifika kullaniyorsa bu saat TLS'de duser ve
"Sunucu sertifikasina guvenilmiyor (TLS)" gosterir. Cozum kokun APK'ya derlemede eklenmesidir:

```
gradle -PkurumKok=C:\sertifikalar\kurum-kok.crt -PimzaDeposu=C:\imza\tmi-saat.jks :uygulama:assembleRelease
```

- Dosya X.509 PEM ya da DER olur, mutlak yolla verilir; deponun disinda durur (depo icindeki yol reddedilir, `*.crt`, `*.pem`, `*.cer`, `*.der`
  `.gitignore`'dadir). Kopyasi yalniz `uygulama/build/generated/kurumKok/` altina yazilir.
- Ag ayari system + user'a ek olarak bu koke guvenir (`ag_guvenligi_kurum.xml`, `ag_guvenligi.xml`'den turetilir); guven daralmaz.
- Derleme ciktisi kokun adini, gecerlilik sonunu ve SHA-256 parmak izini yazar. Parmak izini kokun kendisiyle karsilastirin:
  `openssl x509 -in kurum-kok.crt -noout -fingerprint -sha256` (ya da Windows'ta `certutil -hashfile kurum-kok.crt SHA256`, yalniz DER dosyada esit cikar).
- Suresi dolmus ya da okunamayan dosyada derleme durur.
- `-PkurumKok` verilmezse derleme bugunkuyle aynidir (yalniz system + user).
- Sunucu sertifikasinda saatin girdigi ad ya da IP, SAN alaninda olmalidir; yoksa saat yine "sertifikaya guvenilmiyor" der.
- Kok degisince APK yeniden derlenir ve yeniden kurulur; eslesme surer.

Saate yukleme asagidaki adimlarla aynidir. Daha once koksuz APK kurulduysa ayni imzayla `adb.exe install -r tmi-saat.apk`
yeterlidir; imza farkliysa once `adb.exe uninstall tmi.saat` (eslesme biter, kod yeniden alinir).

Denemede kabul: saatte sunucu adresi `https://<ip>:4101` girilir, saat 6 rakamli kodu gosterirse TLS gecmistir.

## Saate yukleme

1. Saatte Ayarlar > Saat hakkinda > Yazilim bilgileri > "Yazilim surumu" satirina 5 kez dokunun (gelistirici secenekleri).
2. Ayarlar > Gelistirici secenekleri: "ADB hata ayiklama" ve "Kablosuz hata ayiklama" acik. Saat ve bilgisayar ayni Wi-Fi'da.
3. Google "platform-tools" zip'i bir klasore acilir (kurulum istemez).
4. Saatte "Yeni cihaz eslestir": `adb.exe pair ADRES:PORT` (6 haneli kod), sonra `adb.exe connect ADRES:PORT`.
5. `adb.exe install -r uygulama-release.apk`.
6. Uygulamayi on derleme (her kurulumdan sonra bir kez; soguk acilis ve kaydirma icin, 78 a):
   `adb.exe shell cmd package compile -m speed-profile -f tmi.saat`. APK'daki profil sistem bosta kalinca da derlenir;
   bu adim beklemeyi kaldirir. Olcumler bu adimdan sonra alinir.

Sunucu ve saat birlikte guncellenir: uyari cevabinda istasyon artik bos olabilir (kalibrasyon uyarisi), eski saat uygulamasi yeni sunucunun uyarilarini okuyamaz.

## TMI kadrani (Watch Face Format, soru 375 a)

Wear OS 6 (Android 16) kodla cizilen eski tip kadrani reddeder; kadran bu yuzden ayri ve kodsuz bir APK'dir (`kadran/`,
`res/raw/watchface.xml`). Kadran veri cekemez: veri saat uygulamasinin kutucuklarindan (`uygulama/.../kadran/VeriKutucuklari.kt`)
gelir. Her kutucuk kendi sayfasini acar:

| Yer | Kutucuk | Dokununca |
|---|---|---|
| Dis halka (yalniz halka bandi dokunulur) | TMI Açık emirler | Yonetici ozeti |
| Ust | TMI Logo | Tezgahlar 3B |
| Sol tus (saat 9) | TMI Uyarı sayısı: sayi, varsa kirmizi, yoksa gri | Uyarilar |
| Alt kutu | TMI İstasyonlar: dikkat isteyenler ve durum cubugu | Istasyonlarim |

Sistem kutucuklari en sik 5 dakikada bir ister (logo saatte bir); uygulama acikken uyari sayisi degisince kadrana hemen bildirir.
Kisik modda kadran yalniz saat, tarih ve uyari sayisini tek renk gosterir. Vurgu rengi (sari, yesil, mavi) kadran duzenleme
ekranindan secilir. Yeni tus eklenince kadranda "Duzenle" > kutucuklar ile secilmesi gerekebilir.

```
gradle -PimzaDeposu=C:\imza\tmi-saat.jks :uygulama:assembleRelease :kadran:assembleRelease
adb.exe install -r uygulama-release.apk
adb.exe install -r kadran-release.apk
```

Cikti `kadran/build/outputs/apk/debug/kadran-debug.apk`. Saatte kadrana uzun basilir, listeden "TMI Kadran" secilir. Kutucuklar
bos kalirsa kadran duzenleme ekraninda her yere sirasiyla "TMI Açık emirler", "TMI Logo", "TMI İstasyonlar" secilir.

## Saatte ilk acilis

Saat once TMI sunucu adresini sorar (orn. `tmi.kurum.ic:4100`; https kendiliginden eklenir, http kabul edilmez). Adres
girilmezse uygulama acilir ama ozellikler kapali kalir; adres sonra uygulamadaki "Sunucu adresi" dugmesinden girilir. Adres
degisince eslesme biter.

Adres girilince saat 6 rakamli bir kod gosterir. TMI'da Profil > Hesap ve guvenlik > "Akilli saatimi eslestir" penceresinde kodu girip
"Onayla"ya basin; saatte "Devam" (saat 15 sn'de bir kendisi de sorar). Eslesme 12 saat surer; Profil'den ya da yonetici
tarafindan kesilebilir (kullanici karari, soru 26).

## Istasyon NFC etiketi

Etikete yalniz istasyonun TMI'daki kodu yazilir (NDEF metin kaydi ya da text/plain; en cok 64 karakter). Saat etiketi yalniz okur ve
kisinin kendi istasyonlarindan biriyse ayrintisini acar. Etiket herhangi bir NFC yazma uygulamasiyla hazirlanir; saat etikete yazmaz.

## Dogrulanmayanlar

- Uygulama derlendi (debug APK) ama gercek saatte denenmedi.
- Kurum ici HTTPS sertifikasinin saatte "kullanici sertifikasi" olarak taninmasi (`res/xml/ag_guvenligi.xml`) denenmedi.
- `-PkurumKok` ile derlenen APK'nin gercek saatte deneme kokunden imzali sunucuya baglanmasi denenmedi (cihaz adimi kullanicida).
- Kurumsal Wi-Fi istemci yalitimi yapiyorsa kablosuz adb ve saatin sunucuya ulasmasi engellenir.
- Galaxy Watch'ta NFC okuyucu kipinin (enableReaderMode) uygulamaya acik oldugu ve etiketin okunmasi denenmedi.
- TMI kadrani gercek saatte denenmedi. Kadran XML'i Google'in Watch Face Format 1 semasina gore gecerlidir (resmi XSD ile denendi);
  kutucuk ifadeleri (`[COMPLICATION.*]`), halkanin 12 yonunden baslamasi ve kadranin uygulama kutucuklarini kendiliginden
  secmesi (`DefaultProviderPolicy primaryProvider`) cihazda denenmedi.
