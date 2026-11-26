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
2. **Yalnız okuma, sabit beyaz liste.** Gönderilebilen telgraflar: `A_LG` (yalnız INSPECT, DNC, PLCDEBUG; parola alanı yok), `A_LO`
   (yüksüz ya da yalnız `PLCDEBUG` düzeyinden çıkış), `R_VR`, `R_PR` (yüksüz), `R_RI` (yalnız 23, 24, 25, 26, 27, 28, 51), `R_MB` (yalnız ayardaki sayaç adresi, 4 bayt).
   Liste dışı telgraf ve her `C_` komutu soket yazılmadan reddedilir (`lsv2.ts` `telgrafKur`; `lsv2.test.ts` "LSV2 beyaz liste").
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
- ADR 0033 değişmez; iki kaynak aynı tablolara yazar, aynı adlı cihazda LSV2 kazanır.

## Vazgeçilenler

- b) Yan süreç: yeni bağımlılık ve Python çalışma ortamı; beyaz liste kitaplığa bırakılırdı.
- c) Yalnız SmartES: hedefi karşılamaz.

## Doğrulanmadı

- Gerçek TNC 640'ta telgraf biçimi, R_PR uzunluğu ve D adresinin bayt hesabı (pyLSV2 ile aynı varsayıldı); canlı benzeri denemede
  sayacın SmartES ile aynı çıktığı görülecek (3753 kabul 9).
- SmartES bağlıyken kumandanın ikinci LSV2 bağlantısını kabul edip etmediği; DNC girişinin SmartES'in oturumunu etkileyip etkilemediği.
