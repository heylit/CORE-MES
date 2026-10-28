# ADR 0021 — Dış erişim: DMZ'de dış sunucu ve tek yönlü köprü

Durum: kabul (2026-10-28; yazılı onay 1037 a ve TOTP paketsiz 1041 a, 07:42, okuma teyidi 13:11; kullanıcı kararları 1011 b, 1012 a, 1013 a, 1014 c, 1015 a, 1016 a, 1017 a, 1018 a, 1019 a, 1025 a, 1026 a, 1027 c, 1028 b, 1029 a, 1030 a, 1031 a, 1032 b, 1040 a, 1041 a).
`kurulum/https.md`'deki 2026-10-14 kararının ("şirket dışından erişim VPN ile olur") Portal ve Mesaj için yerine geçer; öteki modüller için o karar sürer.
ADR 0002, 0003 ve 0012 iç kullanıcı için değişmez; dış hesaplar bu ADR'nin 4. kararına uyar. ADR 0011 karar 2'deki kurum içi adres kuralı köprü adresine de uygulanır.

## Bağlam

Proje hedefi "kurum içi, tek sunucu, internetsiz" diyordu; kullanıcı Portal'ın müşteri ve tedarikçiye, Mesaj'ın çalışanlara atölye dışından açılmasını istedi.
Bugünkü portal dış kullanıcıya açılamaz: görünürlük kuralı tarayıcıda, sunucu bütün koleksiyonu verir (`sunucu/moduller/portal/UYUM-BORCU.md`).
Mesaj'da sunucu tarafı kanal üyeliği yok (`sunucu/moduller/mesaj/kurallar.ts`). Yönetici dışı giriş 6 haneli PIN'dir (ADR 0012); bekleme kullanıcı adı ve IP çiftine göredir (ADR 0003)
ve internette IP değiştiren saldırgana karşı yetmez. İç sunucunun internete açılması bu yüzden reddedildi; internete yalnız ayrı bir dış sunucu bakar.

## Karar

1. **İki sunucu.** İç sunucu (bugünkü uygulama) internetsiz kalır, internete açılmaz, internetten bağlantı kabul etmez. Dış sunucu kurum DMZ'sinde ayrı makine ya da
   sanal makinedir (1016 a); kendi PostgreSQL'i (1026 a), kendi ortam değişkenleri, kendi yedeği vardır. İç sunucuyla aynı makinede koşmaz.
   Kodu aynı depoda, kökte ayrı `dis-sunucu/` giriş noktasındadır (1025 a). `dis-sunucu/` iç sunucunun `sunucu/` ağacını ithal etmez, iç sunucu da onu ithal etmez;
   ortak olan yalnız `paylasilan/sozlesme/dis-kopru.ts`'tir. Sınır `npm run sinir` ile denetlenir.
2. **Bağlantıyı yalnız iç sunucu açar.** Kurum güvenlik duvarında DMZ'den iç ağa yön kapalıdır; iç ağdan DMZ'ye yalnız köprü kapısı açıktır. Köprü kapısı internete açık
   değildir, yalnız iç sunucunun adresinden bağlantı kabul eder. Dış sunucu iç sunucuya hiçbir zaman istek atmaz.
3. **Köprü iletisi imzalı, sürümlü ve tekildir.**
   - Taşıma: HTTPS, karşılıklı sertifika (mTLS); köprü kapısı yalnız iç sunucunun istemci sertifikasını kabul eder.
   - Zarf: `{ tur, surum, sira, kimlik, zaman, govde, imza }`. İç -> dış iletiyi iç anahtar, dış -> iç iletiyi dış anahtar imzalar (Ed25519, `node:crypto`).
   - Tür ve sürüm `paylasilan/sozlesme/dis-kopru.ts`'te zod şemasıyla tanımlıdır; bilinmeyen tür ya da sürüm reddedilir. Her taraf bir önceki sürümü de okur.
   - `kimlik` iki tarafta bir kez işlenir; `sira` artar, boşluk varsa eksik istenir. Gönderen giden kutusu tutar, alındı gelince işaretler.
   - İç -> dış: değişiklikte hemen itilir, ayrıca belirli aralıkla tam karşılaştırma yapılır. Dış -> iç: iç sunucu uzun yoklama açar (bağlantıyı iç açar, dış bekletir).
   - Köprü işi ADR 0010 kalıbıyla koşar. Bağlantı varsayılan kapalıdır (Sistem Ayarları anahtarı); anahtar değişikliği denetim kaydına girer.
4. **Dış hesap ayrıdır.** Dış sunucuda ayrı hesap tablosu; `kisi` tablosu dışarı çıkmaz. Müşteri ve tedarikçi hesabı yalnız iç kullanıcının davetiyle açılır; davet köprüyle gider, tek kullanımlıktır ve süresi
   dolar. Giriş parola (scrypt) + TOTP (RFC 6238, `node:crypto`) ile, ikisi de zorunlu (1015 a). PIN dışarıda yoktur. Bekleme hesap başına ve IP başına ayrı sayılır.
   Müşteri ve tedarikçi hesabı bir firmaya, çalışan hesabı bir TMI kişisine bağlıdır; kişi pasifleşince ya da firma bağı kalkınca dış hesap aynı köprü turunda kapanır.
   Çalışan hesabı (1028 b): `mesaj.oku` ya da `mesaj.yaz` alan her kişiye kendiliğinden açılır, yetki kalkınca kapanır. Hesap "kurulmamış" açılır ve
   girişe kapalıdır; kişi parolasını ve TOTP'sini yalnız iç ağdan, kendi iç oturumuyla kurar (VARSAYIM: internetten ilk kurulum açılmaz; geri alma maliyeti düşük, akış değişir).
   Dış sunucuda yönetici ekranı ve internete açık yönetim ucu yoktur; yönetim iç sunucudan köprüyle yapılır.
   **İki adımlı doğrulama (1040 a), her dış hesapta zorunlu, kapatılamaz:**
   - TOTP, RFC 6238: SHA-1, 6 hane, 30 sn adım; yalnız bir önceki ve bir sonraki adım kabul edilir. Aynı adımın kodu ikinci kez kabul edilmez (hesabın son kullanılan adımı saklanır).
   - Sır 20 bayt `crypto.randomBytes`; dış veritabanında AES-256-GCM ile şifreli durur, anahtar yalnız `TMIV2_DIS_TOTP_ANAHTARI`'nda. Sır yalnız kurulum anında bir kez gösterilir.
   - Kurulum yalnız iç ağdan: QR kodu ve elle girilecek anahtar iç ekranda gösterilir; doğru ilk kodla kurulum tamamlanır. QR, depoda onaylı `qrcode-generator` ile çizilir.
   - On tek kullanımlık kurtarma kodu, scrypt özetiyle. Telefon kaybında TOTP'yi yalnız iç yönetici sıfırlar (köprüyle); sıfırlama hesabın oturumlarını kapatır ve denetim kaydına girer.
   - Parola doğru, kod yanlış: aynı tek tip hata, aynı bekleme sayacı; hangi adımın yanlış olduğu söylenmez.
   - Uygulama: `node:crypto` ile, yeni paketsiz (1041 a); RFC 6238 Ek B ve RFC 4648 sınama vektörleriyle test edilir.
5. **Kiracı yalıtımı sunucudadır.** Dış sunucunun her ucu firma ya da kişi kapsamını uç tanımında bildirir; kapsamsız uç tanım hatasıdır. Başka firmanın kaydı 404 döner;
   her uç için izinli ve reddedilen test yazılır.
6. **En az veri.** Dışarıda yalnız iç sunucunun yayınladığı kopya durur; doğruluğun kaynağı iç sunucudur ve dış veritabanı iç sunucudan yeniden doldurulabilir.
   - Portal (1014 c, müşteri ve tedarikçi): o firmanın teklif, sipariş, sevk, teslim ve uygunsuzluk kayıtları; firmanın kendi kullanıcıları. Maliyet, rota, plan, stok, çizim,
     iç onay zinciri, limitler, öteki firmalar dışarı çıkmaz. Liste dışına kalem eklemek ayrı karar ister.
   - Mesaj (1011 b, 1027 c): kişinin üye olduğu bütün kanallar, yalnız o kişiye. Genel kanallar (`genel`, `duyurular`) herkesin üyeliğidir, dolayısıyla dışarı çıkar.
     Sipariş, onay, kural ve zamanlı iş belgeleri dışarı çıkmaz. Ön koşul: Mesaj'da sunucu tarafı kanal üyeliği (bugün yok).
7. **İlk aşama salt okunur** (1013 a). Dışarıdan iç sunucuya talep (teklif talebi, kabul, tedarikçi cevabı, Mesaj iletisi) sonraki aşamadadır. Gelen her talep iç sunucuda
   iç kullanıcının işi gibi yetki ve iş kuralından yeniden geçer; dış sunucunun onayı hiçbir şeyi onaylamaz.
8. **Dışarıdan dosya.** Portal'da ilk aşamada yoktur (1018 a). Mesaj'da açıktır (1032 b): dosya önce dış sunucuda karantinaya düşer; tür ilk baytlardan
   bulunur, izinli tür listesi dışındaki reddedilir; boyut bugünkü Mesaj sınırı (700 KB) ve kişi başına günlük kota; kötü amaçlı yazılım taraması yoktur. İç sunucu eki
   köprüden çeker, türü ve özeti yeniden doğrular.
   **Karantina (1040 a):** dışarıdan gelen ek, içeride yetkili biri "aç" diyene kadar karantinadadır. Karantinadaki ek kanalda yalnız adıyla (ve tür, boyut, yükleyen, zaman)
   görünür; içerik indirilemez, önizlenmez, küçük resmi çizilmez, başka kanala ya da modüle aktarılamaz. Bu, içeride ve dışarıda bütün üyeler için geçerlidir; yalnız yükleyen
   kendi dosyasını görür. "Aç" ayrı komuttur (`POST /mesaj/dis-ekler/:id/ac`, işlem `mesaj.dis-ek-ac`); komut eki açan kişiyi ve zamanı denetim kaydına yazar, açılan ek
   "dış kaynak, taranmadı" işaretini taşımaya devam eder. "Reddet" eki siler. Açılmamış ek 14 gün sonra silinir (VARSAYIM; geri alma: sabit).
   `mesaj.dis-ek-ac` bugün yalnız yöneticidedir; başka role verilmesi rol x işlem kararıdır.
   Dışarı yalnız iç kullanıcının açıkça yayınladığı ek ya da kişinin kanalındaki ek gider.
9. **Sertifika genel CA'dan, otomatik yenilemeyle** (1017 a). DMZ makinesindeki win-acme (1029 a) Let's Encrypt'ten sertifika alır, yeniler ve IIS bağlamasını günceller.
   Doğrulama HTTP-01 ile (1030 a): 80 portu yalnız `/.well-known/acme-challenge/` yoluna açıktır, öteki her istek HTTPS'e yönlenir. Bu, uygulama kodunun değil kurulumun
   internete çıkışıdır ve tek istisnadır: uygulama kodu (iç ve dış) internete istek atmaz. Araç kod deposuna girmez; adı ve kurulumu kurulum belgesindedir.
10. **Adres ve anahtar yalnız ortam değişkeninde.** İç sunucuda `TMIV2_DIS_KOPRU_ADRESI` (köprü kapısı; ADR 0011 karar 2'deki kurum içi adres kuralıyla denetlenir),
    `TMIV2_DIS_KOPRU_SERTIFIKA`, `TMIV2_DIS_KOPRU_ANAHTAR`, `TMIV2_DIS_KOPRU_IMZA_ANAHTARI`, `TMIV2_DIS_KOPRU_KARSI_ANAHTAR`. Dış sunucuda eşleri. Alan adı, IP, anahtar
    depoya, karta, teste, günlüğe girmez (kural 8). Biri eksikse ya da adres geçersizse sunucu açılmaz; ileti değişken adını söyler, değerini söylemez.
11. **Yeni paket yok.** `node:crypto`, `node:https`, var olan `pg` ve `zod`. win-acme kurulum aracıdır, depoya ve pakete girmez; kurulumu yeni araç onayıdır (1029 a).
12. **Dış ekranda satır içi betik yok** (1031 a). Portal ve Mesaj prototiplerinin düzeni ve akışı aynen kalır; betikleri ayrı dosyaya alınır ve dış sunucu içerik politikasında
    `script-src 'unsafe-inline'` ve `'unsafe-eval'` olmadan sunar. İç sunucudaki çerçeve bugünkü gibi kalır.

## Sonuçlar

- Dış sunucu ele geçirilirse en kötü sonuç: yayınlanmış kopyanın okunması ve sahte talep bırakılması; iç sunucuya giden bağlantı yoktur, talepler içeride yeniden denetlenir.
- Gecikme: iç -> dış saniyeler; dış -> iç uzun yoklamayla saniyeler. İç sunucu kapalıyken dışarıda son bilinen veri "son güncelleme" zamanıyla görünür, talepler kuyrukta bekler.
- Mesaj dışarıda yazma aşamasında (D5m) gelir; salt okunur sohbet sunulmaz. Uygulama kapalıyken telefona bildirim gitmez (Web Push dış servis gerektirir).
- Yedek: iç sunucuda bugünkü gece yedeği; dış sunucuda yalnız dış hesaplar ve çekilmemiş talepler, ayrı anahtarla.
- Kurulumda ikinci makine, IIS ters vekil ve ACME aracı bilgi işlem işidir; Windows adımları denenmedi.
- İlk aşamada portal ekranı dış sunucuda prototipin düzeniyle sunulur; içerik politikası ve çerçeve biçimi ayrıca karara bağlanır.

### Birlikte risk: 1027 c + 1028 b + 1032 b

Üç karar kullanıcı tarafından risk notu okunarak teyit edildi (2026-10-28 07:19). Ayrı ayrı yönetilebilirler; birlikte iç sunucuyu kapalı tutan tasarımın etrafından dolaşan bir yol açar.
- **Kapsam:** Mesaj yetkisi olan her kişinin (bugün operatör dışındaki on bir rol) internetten giren hesabı olur (1028 b) ve her hesap kişinin bütün kanallarını görür (1027 c).
  Genel kanallar herkesin olduğu için iç yazışmanın büyük kısmı DMZ'de durur. Dış sunucu ele geçirilirse kayıp, "en az veri" değil, iç yazışmanın neredeyse tamamıdır.
- **Hesap ele geçirme:** Bir çalışanın parolası ve TOTP'si (ya da kilitsiz telefonu) ele geçerse saldırgan internetten o kişinin bütün kanallarını okur ve yazar.
  Hesap sayısı arttıkça bu olasılık artar; kullanılmayan hesaplar da saldırı yüzeyidir.
- **İçeri giden dosya:** Saldırgan ya da zararlı yazılım bulaşmış telefon, taranmamış dosyayı (1032 b) bir kanala koyar; dosya köprüyle iç ağa gelir ve iç bilgisayarda bir çalışan
  tarafından açılır. Köprünün tek yönlü kuralı kodu korur, insanı korumaz: bu, dışarıdan iç ağa giden tek gerçek yoldur.
- **Hafifletme (bu ADR'de):**
  - Zorunlu iki adımlı doğrulama (1040 a, karar 4): yalnız parolanın çalınması hesabı açmaz; TOTP kurulumu yalnız iç ağdan.
  - Ek karantinası (1040 a, karar 8): dışarıdan gelen dosya, içeride yetkili kişi açana kadar kimse tarafından açılamaz; iç bilgisayara yalnız bilinçli bir kararla ulaşır ve kimin açtığı kayıtlıdır.
  - Hesap kurulmadan girişe kapalı; tür ilk baytlardan ve dar izinli liste (PDF, PNG, JPEG; ofis belgesi, arşiv, betik yok); 30 günde girilmeyen dış hesabın kendiliğinden
    kapanması (VARSAYIM); dış oturum 30 dk / 8 saat.
- **Kalan risk:**
  - Dosya: karantina dosyayı taramaz, yalnız açılmasını bir kişinin kararına bağlar. Açan kişi zararlı bir PDF'i tanıyamazsa dosya iç ağa ulaşır. Yetki dar tutulursa
    (bugün yalnız yönetici) açma kararı az ve deneyimli kişide kalır; geniş verilirse önlem zayıflar.
  - Hesap: TOTP, parola ile birlikte telefonu da ele geçen saldırgana ya da kimlik avı sayfasına anlık girilen koda karşı korumaz.
  - Kapsam: geniş kanal kapsamı (1027 c) ve otomatik hesap (1028 b) bu önlemlerle küçülmez; dış sunucu ele geçirilirse kayıp iç yazışmanın neredeyse tamamıdır.
  - Kapatan seçenekler değişmedi: kanal başına dışarıda görünür işareti (1027 a), davetle hesap (1028 a), dışarıdan ek yok ya da tarama aracı (1032 a).

## Açık konular

- `kurulum/dis-sunucu.md` (win-acme, IIS, güvenlik duvarı yönleri) ayrı belge olarak yazılacak.
- `mesaj.dis-ek-ac` işleminin yönetici dışındaki rollere verilmesi.
