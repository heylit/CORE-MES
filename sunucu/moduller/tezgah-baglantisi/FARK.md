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
