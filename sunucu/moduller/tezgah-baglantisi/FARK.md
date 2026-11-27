# FARK (tezgah-baglantisi, kart 3753, taban 93a60d8)

Heidenhain kumandalarını LSV2 ile (TCP 19000) doğrudan, salt okunur okuma. Yeni paket, göç ve yetki yok; package.json değişmedi.

| Dosya | Ne |
|---|---|
| `sunucu/moduller/tezgah-baglantisi/lsv2.ts` (yeni) | LSV2 istemcisi; ağ kodu (`node:net`) yalnız burada. Sabit beyaz liste (`telgrafKur`), makine başına tek kalıcı bağlantı (`Lsv2Hatti`), 5 sn istek süresi, okuma (`lsv2IstemcisiKur`) |
| `sunucu/moduller/tezgah-baglantisi/lsv2-tur.ts` (yeni) | Okuma turu: makine başına aralık ve geri çekilme, son durum, durum örneği ve değer geçmişi (MTConnect ile aynı tablolar ve süzgeç) |
| `sunucu/moduller/tezgah-baglantisi/sahte-lsv2.ts` (yeni, yalnız test) | Yerel sahte LSV2 sunucusu; gelen telgrafları kaydeder |
| `sunucu/moduller/tezgah-baglantisi/lsv2.test.ts`, `lsv2-tur.test.ts` (yeni) | Kabul 1-5 testleri (beyaz liste, çeviri, hata halleri, ayar, eşzamanlılık; tur gerçek PostgreSQL ile) |
| `ayar.ts` | (3757) LSV2 listesi okuyucusu kalktı; liste `paylasilan/lsv2-makineleri.ts` ile Sistem Ayarları'ndan |
| `kurallar.ts` | LSV2 okumasının MTConnect öğelerine çevrilmesi (`lsv2Ogeleri`), değişen öğe, uyarı metinleri, alan tanımları |
| `servis.ts`, `sorgular.ts` | MTConnect turu LSV2 adlarını atlar ve onların son okuma anını yenilemez; durum ucu `kaynak`, `uyari`, `lsv2Baglanti` verir |
| `baglanti.ts`, `isler.ts`, `uclar.ts` | Makine listesi açılışta okunur; ayrı iş `tezgah-baglantisi-lsv2-okuma` |
| `paylasilan/sozlesme/tezgah-baglantisi.ts` | Satırda `kaynak` (mtconnect, lsv2) ve `uyari`; cevapta `lsv2Baglanti` |
| `paylasilan/ayarlar/tezgah-baglantisi.ts` | `tezgah-baglantisi.lsv2-okuma` ("Heidenhain okuması", varsayılan kapalı) |
| `istemci/src/moduller/tezgah-baglantisi/Karsilastirma.tsx`, `fikstur.ts`, test | Satırda ve kartta "Heidenhain LSV2" ve uyarı; "Heidenhain okuması açık" rozeti |
| `kurulum/tezgah-baglantisi.md` (yeni) | "Heidenhain okuması" kurulum, deneme sırası, güvenlik duvarı, sorun giderme |

## Ortam değişkeni
`TMIV2_TEZGAH_LSV2_MAKINELERI=CIHAZ=ADRES;SAYAC,...` (şartnamedeki öneri). Adres yalnız kurum içi IP (ad ve kapı yok, kapı sabit 19000);
SAYAC `D` ve 4'ün katı (pyLSV2 ile aynı bayt hesabı: kelime alanı başı + n). Boş = kapalı. En çok 32 makine.

## Bu modül şunları varsaydı (geri alma maliyeti düşük)
1. PLC sayacı PLCDEBUG girişi (parolasız) ister (pyLSV2 `read_plc_memory`); kullanıcı kararı (26.11): ayrı anahtar "PLC sayacı okuması" (varsayılan kapalı); giriş yalnız sayaç adresi varken, her okumada R_MB'den hemen önce yapılır, hemen sonra `A_LO PLCDEBUG` ile çıkılır; çıkış kabul edilmezse bağlantı kapatılır. Gerçek kumandada yalnız PLCDEBUG'dan çıkışın DNC oturumunu korumadığı canlı denemede görülür (doğrulanmadı).
2. DNC girişi bağlantı başında bir kez denenir; kumanda reddederse durum, program, takım, alarm null ve "DNC" uyarısı.
3. Kumandanın bütün hata iletileri tek koşul öğesinde Fault sayılır (durum "alarm"); Heidenhain hata sınıfları ayrılmadı (canlı denemede SmartES ile karşılaştırılacak).
4. İlerleme ve iş mili oranı (%) hız değildir: `isMiliHizi`, `ilerleme`, `isMiliYuku` LSV2'de null kalır; oranlar ayrıntıda `PathFeedrateOverride`, `RotaryVelocityOverride` olarak görünür.
5. Program adı kumandanın verdiği ana program yoludur (ör. TNC:/...); SmartES başka biçim yazıyorsa ekranda "program" farkı çıkar.
6. Bağlantı tamponu 256 bayt varsayılanında kalır: tampon büyütme `C_CC` komutudur ve yasaktır; cevaplar uzunluk alanına göre birleştirilir.
7. Aynı ad hem MTConnect'te hem LSV2 listesinde varsa LSV2 kazanır; MTConnect o cihazı yazmaz.
8. Bağlanılamayan makinede son durum yalnız ilk hatada "bağlantı yok"a iner; son okuma anı ilerlemez ("eski okuma").
9. MTConnect adresi yoksa ya da okuması kapalıysa saatlik geçmiş temizliğini LSV2 turu yapar (aynı bellek, tek temizlikçi).
10. Kapalı makineye bağlantı reddi hata sayılmaz (iş "tamam" döner); uyarı makine kartındadır, geri çekilme 60 sn'ye kadar uzar.


## Kart 3757: makine listesi Sistem Ayarları'nda

Kullanıcı kararı "Satır satır, ağ aralığı yok" (26.11.2026). `TMIV2_TEZGAH_LSV2_MAKINELERI` kalktı; liste "Heidenhain makineleri" metin ayarıdır (biçim `lsv2-makineleri`, sunucu ve ekran aynı kuralla doğrular), her turda okunur. Listeden çıkan ya da adresi/sayacı değişen makinenin bağlantısı kapatılır. Ekranda satır satır düzenleyici (`istemci/src/moduller/ayarlar/Lsv2MakineListesi.tsx`). CLAUDE.md kırmızı çizgi satırı, ADR 0034 madde 3 ve README çapası kullanıcının yazılı onayıyla (26.11.2026 13:39) aynı committe değişti.

## Kart 3790: LSV2 ile bütün okumalar, yazma yok

Beyaz liste genişledi (R_RI 22, R_VR alt kodları, A_LG/A_LO FILE, R_FL yalnız `TNC:\table\tool.t`, T_OK yalnız R_FL aktarımında); C_ yine yasak. Her okumada tümce no, hızlı hareket oranı, iş milindeki takımın indeks/eksen/boy/yarıçapı ve eksen konumları okunur; eksen, tümce ve tanı geçmişe yazılmaz. Bağlantı başında R_VR alt kodları ve R_PR (LSV2 sürümü, en büyük telgraf). Her T_ER alan adı ve kumanda koduyla "Okunamayan veri" öğesine yazılır. Kumanda metni Windows-1254 ile çözülür. Takım tablosu ayrı anahtar ve aralıkla FILE girişiyle okunur; yeni tablolar `tezgah_lsv2_takim`, `tezgah_lsv2_takim_gecmisi`, `tezgah_lsv2_seyrek` (yalnız ekleyen göç). Yeni uç `GET /tezgah-baglantisi/tezgahlar/:cihazAdi/takim-tablosu`. Ekranda Takım, Eksenler, Kumanda grupları ve Heidenhain'e özel "Takım tablosu" sekmesi. Program listesi ve kumanda saati okunmaz (C_DC ve DIAGNOSTICS gerekir; Soru Merkezi). ADR 0034 değişikliği kullanıcı onayına bağlı (CEKIRDEK-ISTEKLERI-3790).

Risk bakışı (3790, B1-B2): seyrek okuma denemesi sonucu ne olursa olsun aralığı başlatır, okuma düşerse neden seyrek kaydına yazılır (sonraki normal turlar FILE'a girmez); integer'a sığmayan takım numarası çözümde atlanır; aktarımda blok sayısı 4096 ile sınırlı; takım geçmişine kullanılan süre tek başına satır yazmaz (yalnız ömür TIME1 ya da kilit).

Kullanıcı kararları (27.11, Soru Merkezi): T_OK yalnız süren R_FL ya da R_DR aktarımında; program listesi oturumun açılış klasöründen (R_DR tek kayıt kipi, C_DC yok; ad, boyut, tarih; yeni tablo `tezgah_lsv2_program`, `tezgah_lsv2_seyrek.program_tani`); kumanda saati bağlantı başında DIAGNOSTICS girişiyle R_DT, hemen çıkış, 60 sn üstü farkta uyarı, geçmişe yazılmaz.

## Kart 3811 ve 3811-2: tezgâh verisi deneme sayfası (gölge mod)

Yeni ikinci menü grubu "Deneme": Makine eşleme, Sayım, Duruş ve alarm, OEE, Geçiş hazırlığı (yalnız `sayfa.tezgah-baglantisi`, yönetici). Hesaplar yalnız okur; üretim emrine, duruşa, stoka ve OEE modülüne yazılmaz (kabul testi `deneme-kabul.test.ts` öteki modüllerin bütün tablolarının içeriğini önce ve sonra karşılaştırır). Yeni tablolar (yalnız ekleyen göç): `tezgah_makine_esleme` (cihaz→makine, çevrimde parça, duruş eşiği), `tezgah_alarm_olayi` (Fault ve tetiklenmiş acil stop; Warning alarm değil; 90 gün), `tezgah_sayac_artisi` (her sayaç değişimi program, kip, Dryrun, Singleblock ile; 90 gün), `tezgah_program_surumu` (Heidenhain program dosyası boyut/tarih sürümleri). Uçlar: `GET /tezgah-baglantisi/deneme/{esleme,sayim,durus,oee,gecis}?pencere=bugun|dun|yedi-gun`, `POST /tezgah-baglantisi/deneme/esleme/:cihazAdi/kaydet`.

Başka modülden okuma (disari.ts): `uretim-emirleri.makineIsAraliklari` (yeni, salt okuma: kullanım aralığı, iş emri no, OP, parça no, ilk parça onay anı; kullanıcı kararı S5 a), `uretim-emirleri.makineSayimAnlari`, `vardiya.calismaTakvimleri`, `oee.makineOeeleri`, `istasyonlar.makineler`, `kisiler.kisiAdlari`.

LSV2 (kullanıcı kararları S1-S3 a, 27.11; CLAUDE.md ve ADR 0034 yazılı onayla): program listesi R_DI ile açılış klasörü, C_DC ile en çok 3 seviye alt klasör ve 500 dosya, sonra açılış klasörüne dönüş (dönülemezse bağlantı kapanır); C_DC yalnız gezi sırasında ve yalnız açılış klasörünün altına gider. Takım tablosunda önce R_FI; reddedilirse kodu yazılır, R_FL gönderilmez. Kumandanın 22 ile reddettiği R_RI okuması (alarm, takım) "kumanda desteklemiyor" yazılır ve bir daha istenmez. Sürüm ve seçenek metinleri geçmişe sayı olarak yazılmaz.

## Bu modül şunları varsaydı (3811, geri alma maliyeti düşük)
1. Rota adımında "NC program" ve "çevrimde parça" alanı yok: program eşleşmesi tahmindir (programda parça no ve OP aranır), çevrimde parça Makine eşleme ekranından gelir; ölçüt h "ölçülemiyor" kalır (koordinatör 27.11: rotaya göç eklenmez; 3800'ün NC program kaydı main'e girince kesin eşleşmenin kaynağı o olabilir).
2. Kip okunamıyorsa artış üretim sayılır; Dryrun ya da Singleblock okunamıyorsa kapalı sayılır.
3. Fark = tezgâh adedi − (terminal sağlam + hurda); geçişte öneri = bu farkın eksi olmayan kısmı.
4. Duruş sınıfı: alarm hâli ya da alarm olayı arıza; açık iş yoksa iş yok; iş var, ilk parça onayı yoksa ölçüm; gerisi neden sorulacak. Kayıtsız duruş: terminalde makine kullanımı açıkken tezgâhın durduğu süre.
5. Vardiyası tanımlanmamış makinede planlı süre bilinmiyor (null); çizgide vardiya dışı gösterilmez.
6. Performans: işin terminal sayımından adet başına standart süre × tezgâh adedi / çalışma süresi; önerilen standart, gerçek çevrim standarttan %10'dan fazla saparsa gösterilir.
7. MTConnect saat farkı: tezgâh çalışırken son okumadaki en yeni öğe zamanı − okuma anı (okuma aralığı kadar şaşar).
8. "Program değişti": işin onaylı program bilgisi işin programla ilk eşleştiği andaki sürümdür (o günün sonu değil).
9. Alarm olayının iş emri okurken makine kullanımından bulunur (tabloda tutulmaz).
10. Program listesinde en çok 200 klasör gezilir (500 dosya sınırına ek güvenlik).
