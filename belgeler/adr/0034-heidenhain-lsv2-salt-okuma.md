# ADR 0034 — Heidenhain tezgahları LSV2 ile doğrudan, salt okunur okunur

Durum: kabul (3753, kullanıcı kararı 26.11.2026 "Böyle girsin"). Numara 0034 koordinatörce 3753 için verildi.
## Bağlam

ADR 0033 tezgah verisini yalnız ortak MTConnect servisinden okur. Atölyedeki Heidenhain kontrollü tezgahlarda (TNC 6xx sınıfı, varsayım)
MTConnect ve OPC UA kapıları kapalıdır; açık tek arayüz LSV2'dir (TCP 19000). Bu tezgahların verisi bugün yalnız SmartES üzerinden gelir;
SmartES'in hata kayıtları onun da LSV2 ile, parolasız ve 3 saniye aralıkla okuduğunu gösterir (kullanıcı şartnamesi, 3753). Kullanıcı
kararı: okuma CORE'da TypeScript ile yazılır, yeni paket eklenmez. Tezgaha TCP bağlantısı açmak CLAUDE.md'deki "dış servis çağrısı yok"
kırmızı çizgisine yeni bir istisnadır. LSV2 aynı bağlantıda dosya yazma, program seçme, tuş gönderme ve PLC yazma da taşır; istisna
yalnız okumayı kapsamalıdır.

## Seçenekler

- **a) TypeScript LSV2 okuyucu, sabit beyaz liste:** yeni paket yok; telgraf biçimi pyLSV2 (MIT) kaynağına ve Heidenhain belgesine
  bakılarak yeniden yazılır; yalnız izinli okuma telgrafları gönderilebilir.
- **b) pyLSV2'yi yan süreç olarak çalıştırmak:** hazır kitaplık; Python çalışma ortamı ve yeni bağımlılık ister, beyaz liste kitaplığın
  dışında tutulamaz.
- **c) SmartES'ten okumaya devam:** değişiklik yok; hedef (SmartES'e ihtiyaç duymadan okuma) karşılanmaz.

## Karar

1. **Tek dosya, tek modül.** Tezgaha yalnız `tezgah-baglantisi` modülünün `lsv2.ts` dosyası bağlanır (`node:net`); başka dosyada istemci
   soketi yoktur (`npm run sinir` kural j izin listesi).
2. **Yalnız okuma, sabit beyaz liste.** Gönderilebilen telgraflar: `A_LG` (yalnız INSPECT, DNC, PLCDEBUG, FILE, DIAGNOSTICS; parola
   alanı yok), `A_LO` (yüksüz ya da yalnız `PLCDEBUG`, `FILE` ve `DIAGNOSTICS` düzeyinden çıkış), `R_VR` (yüksüz ya da alt kod 1-4),
   `R_PR`, `R_DT` ve `R_DI` (yüksüz), `R_RI` (yalnız 22, 23, 24, 25, 26, 27, 28, 51), `R_MB` (yalnız ayardaki sayaç adresi, 4 bayt),
   `R_FI` ve `R_FL` (yalnız sabit yol `TNC:\table\tool.t`; `R_FL` metin kipi), `R_DR` (yalnız tek kayıt kipi), `C_DC` (yalnız FILE
   düzeyinde, yalnız program listesi okunurken: oturumun açılış klasörü ve altındaki klasörler, en çok 3 seviye; okuma bitince açılış
   klasörüne dönülür, dönülemezse bağlantı kapatılır), `T_OK` (yüksüz; yalnız süren bir `R_FL` ya da `R_DR` aktarımında, blok alındı
   onayı). Liste dışı telgraf ve `C_DC` dışındaki her `C_` komutu soket yazılmadan reddedilir (`lsv2.ts` `telgrafKur`; `lsv2.test.ts`
   "LSV2 beyaz liste"). `C_DC` yalnız LSV2 oturumunun klasörünü değiştirir; kumandada program seçmez, dosya açmaz. NC program dosyalarının
   içeriği okunmaz; program listesinden yalnız ad, boyut ve tarih alınır (en çok 500 dosya).
3. **Adres Sistem Ayarları'nda, yalnız kurum içi IPv4.** Makine listesi "Heidenhain makineleri" ayarıdır (kullanıcı kararı 3757,
   26.11.2026: ortam değişkeni kalktı, ağ aralığı sınırı eklenmedi). Yalnız ayar değiştirebilen yönetici yazar; değişiklik denetim
   kaydına girer ve sonraki turda geçerli olur. Ad çözümlemesi ve kapı yazımı yoktur, kapı sabit 19000'dir; adres 10/8, 172.16/12 ya da
   192.168/16 içinde olmalıdır. Sunucu ve ekran aynı kuralla doğrular, ileti adresi söylemez (`paylasilan/lsv2-makineleri.ts`
   `lsv2ListesiHatasi`). Bilinen risk: sunucunun hangi kurum içi IP'nin 19000 kapısına bağlanacağını artık her yönetici ekrandan seçer;
   karşılığı sabit kapı, sabit okuma beyaz listesi, denetim kaydı ve ağ kuralıdır (19000'e yalnız CORE ve SmartES).
4. **Parola tutulmaz.** Kodda, depoda, ayarda ve ortam değişkeninde parola yoktur; giriş parolasızdır. Yetki yetmiyorsa alan null kalır
   ve uyarı gösterilir ("yetki yok"); parola eklenmez.
5. **Varsayılan kapalı.** `tezgah-baglantisi.lsv2-okuma` ("Heidenhain okuması") kapalıysa ya da liste boşsa bağlantı açılmaz
   (`lsv2-tur.ts` `lsv2Turu`; `lsv2-tur.test.ts`).
6. **Makineye yük bindirilmez, SmartES rahatsız edilmez.** Makine başına tek kalıcı bağlantı; istek beş saniyede bırakılır; aralık
   MTConnect ile ortak ayardır (5-60 sn), art arda hatada 60 saniyeye kadar uzar. Bağlantı reddedilir ya da kapatılırsa CORE geri
   çekilir: zorlamaz, sıfırlama (`C_CC`) göndermez, eski oturumu düşürmeye çalışmaz.
7. **Veri uydurulmaz, yalnız gösterilir.** Okunamayan alan null'dır. Okunan değer MTConnect adlarıyla aynı öğe modeline çevrilir ve ADR
   0033'teki gibi yalnız deneme ekranında SmartES'le yan yana gösterilir; üretim kaydına, sayıma, stoğa işlenmez.
8. **Gerçek değer depoya girmez.** Testler yerel sahte LSV2 sunucusuyla (`sahte-lsv2.ts`), uydurma adres ve sayaç adresiyle koşar.

## Sonuçlar

- CLAUDE.md "Kırmızı çizgiler" istisna listesine tek satır eklenir; `araclar/sinir-denetimi.ts` izin listesine `lsv2.ts` girer
  (tezgah-baglantisi CEKIRDEK-ISTEKLERI.md).
- CORE sunucusundan makinelerin TCP 19000'ine güvenlik duvarı izni gerekir; CNC ağının ofis ağından ayrılması önerilir
  (`kurulum/tezgah-baglantisi.md`).
- PLC sayacı için PLCDEBUG girişi gerekir; bu giriş kumandada PLC yazmayı da açar. CORE yazma telgrafı gönderemediği için okuma kalır;
  kullanıcı kararı (3753, 26.11.2026): giriş ayrı anahtarla ("PLC sayacı okuması", varsayılan kapalı), yalnız sayaç adresi verilmiş
  makinede, sayaçtan hemen önce yapılır ve okunur okunmaz çıkılır (`A_LO` yalnız yüksüz ya da `PLCDEBUG`); ilk açılış tek makinede.
- Takım tablosu ve program listesi için FILE girişi gerekir (3790). Giriş ayrı anahtarla ("Heidenhain seyrek okuma (takım tablosu)",
  varsayılan kapalı), seyrek aralıkta (varsayılan 10 dk, en az 2 dk) yalnız bu iki okuma için yapılır ve okuma biter bitmez çıkılır;
  çıkış reddedilirse bağlantı kapatılır. Aktarım 2 MB ya da 4096 bloğu aşarsa bağlantı kapatılır. Takım geçmişine yalnız ömür sınırı ya
  da kilit değişen takım yazılır; program listesinin geçmişi tutulmaz.
- Kumanda saati için DIAGNOSTICS girişi gerekir (3790, kullanıcı kararı "DIAGNOSTICS ile oku"). Bu düzey kumandada tuş gönderme ve saat
  kurmayı da açar; o komutlar beyaz listede yoktur. Giriş yalnız bağlantı başında, `R_DT` için yapılır ve hemen çıkılır; çıkış
  reddedilirse bağlantı kapatılır. Giriş reddedilirse saat boş kalır ve neden ekranda yazar. Saat sunucudan 60 saniyeden fazla farklıysa
  uyarı verilir; saat geçmişe yazılmaz.
- Program listesi alt klasörleri okur (3811, kullanıcı kararı "C_DC izinli olsun"): bu, 3790'daki "C_ ile başlayan hiçbir komut
  gönderilemez" kuralının tek istisnasıdır. Klasör yolu yalnız kumandanın verdiği listeden kurulur; dışarıdan yol alınmaz.
- Takım tablosundan önce `R_FI` ile dosya bilgisi okunur (3811); okunamazsa kumanda kodu ekranda yazar, `R_FL` gönderilmez.
  Tampon ayarı (`C_CC`) yapılmaz.
- TNC 640'ta alarm (`R_RI` 27, 28) ve takım (`R_RI` 51) "bilinmeyen telgraf" (kod 22) döner; pyLSV2'ye göre alarm okuması yalnız
  iTNC 530'da çalışır. Kullanıcı kararı (3811, "Desteklemiyor yazsın"): kod 22 dönen okuma o bağlantı boyunca yeniden sorulmaz,
  alan "kumanda desteklemiyor" yazar; Geçiş hazırlığında alarm ölçütü bu makinede ölçülemez.
- ADR 0033 değişmez; iki kaynak aynı tablolara yazar, aynı adlı cihazda LSV2 kazanır.

## Vazgeçilenler

- b) Yan süreç: yeni bağımlılık ve Python çalışma ortamı; beyaz liste kitaplığa bırakılırdı.
- c) Yalnız SmartES: hedefi karşılamaz.

## Doğrulanmadı

- Gerçek TNC 640'ta telgraf biçimi, R_PR uzunluğu ve D adresinin bayt hesabı (pyLSV2 ile aynı varsayıldı); canlı benzeri denemede
  sayacın SmartES ile aynı çıktığı görülecek (3753 kabul 9).
- SmartES bağlıyken kumandanın ikinci LSV2 bağlantısını kabul edip etmediği; DNC girişinin SmartES'in oturumunu etkileyip etkilemediği.
- Takım tablosu yolu `TNC:\table\tool.t` ve sütun adları (T, NAME, L, R, TL, TIME1, CUR_TIME) gerçek kumandada denenmedi.
- R_RI 22 (eksenler), 51 (takım), R_VR alt kodları, R_DR kayıt biçimi ve R_DT'nin saat dilimi pyLSV2 kaynağından alındı; gerçek
  kumandada denenmedi. DIAGNOSTICS düzeyinin parolasız açılıp açılmadığı bilinmiyor (açılmazsa yalnız saat boş kalır).
- `C_DC` ve `R_DI` biçimi, alt klasör bayrağı (0x20) ve takım tablosu kodu 20'nin (biçim hatası) nedeni pyLSV2 kaynağından alındı;
  gerçek kumandada denenmedi.
