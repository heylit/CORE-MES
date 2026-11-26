TEMEL KURAL: Bilmediğini uydurma, eksikte sor.
1. Her iddia üç türden biridir: DOĞRULANDI (komut çıktısı, dosya ve metin çapası ya da belge sayfasıyla), VARSAYIM (gerekçesiyle) ya da BİLMİYORUM. Kanıtsız şeye "doğrulandı" denmez; tahmin olgu gibi sunulmaz.
   Dış araçların (Claude Code, GitHub, PostgreSQL) davranışına dair belgeden ya da denemeden doğrulanmamış iddia "doğrulanmadı" diye işaretlenir.
2. Varsayılan öneriyle ilerlenir: ajan önerilen seçenekle yazar, karta "Varsayım:" yazılır; kullanıcı yalnız itiraz ettiğini değiştirir. Teknik ayrıntı sorulmaz.
   Yalnız geri alması pahalı karar sorulur: veri silen ya da dönüştüren göç (DROP, tür daraltma, veriyi yeniden yazma, varsayılansız NOT NULL), yetki modeli, kırmızı çizgi, yeni bağımlılık, onaylanmış kararla çelişme.
   Eski kurallar (özel takip deposunda; onlardan açılan #31-#43 kartları dahil) öneriyle ilerlemez: kullanıcı açıkça "kalsın" demeden onaylı sayılmaz, koda girmez. Konuyla ilgili eski kural uygulanmaz, sorulur: kural, gelen modülün yaptığı ve fark tek satırda; cevap "kalsın / gitsin / değişsin"; modül başına tek liste, en çok 10 madde; çelişmeyen ya da ilgisiz kural sorulmaz.
3. Soru: tek soru, neden gerektiği, seçenekler ve önerin. Cevap gelene kadar o kart durum:onay-bekliyor olur; başka kartlarla devam edilir.
4. Varsayımlar geri alma maliyetiyle karta yazılır; kararlar ve açık işler bu depoda değil, özel takip deposundadır; ajan görevinde kart numarası her zaman verilir.
5. Doldurulmamış yer tutucu (<…>), silinmemiş seçenekler ya da sessizlik onay değildir; yeniden sorulur.
6. Alt ajan kullanıcıya soramaz: durur, sorusunu ana oturuma döner; eksik bilgiyi uydurarak işi bitirmez.

# CORE MES
CNC talaşlı imalat atölyesi için üretim planlama ve izlenebilirlik sistemi; kurum içi, tek sunucu. Türkçe konuş; kod tanımlayıcıları Türkçe (ASCII), commit mesajı İngilizce. Kart = koordinatörün verdiği numara; GitHub kartları #679'da durdu, arşivdir. Kararlar devir belgesinde; kurulum `kurulum/devir.md`.

## Çalışma tercihleri
- Kısa yaz, emoji yok; soruda Türkçe karakterleri düz yaz. Rapor en çok 15 satır: önce sonuç (adım başına tek satır), sonra yalnız "sorulur" sorular, en çok 10 maddelik tek listede, tam metniyle (soru, neden, seçenekler, öneri; yalnız numarayla atıf yok). Ayrıntı, doğrulananlar ve varsayımlar karta.
- Odak: dışarıdan gelen modül esastır; depo çekirdek ve ortak parçaları taşır; ana oturumun işi çekirdek, ortak arayüz, paylaşılan kalıplar, araçlar ve kurulumdur. Araçlara yalnız işi durduran hata için dokunulur. Askıda: bulut eşliği (#121-#126). Ters vekil yalnız `kurulum/canli.md` ve ADR 0021 (ertelendi) kapsamında.
- Arayüzde en az dokunuş; profesyonel, gerçekçi, ikonlu, role göre sade. Eski sistemden kod, şema, test, veri taşınmaz.
- Süreç ağırlaştırılmaz: sahiplik defteri, ders dosyası, kanca, durum dosyası kurulmaz. Hata iki kez olursa kural yazılmaz; tip, kısıt, ortak parça ya da test eklenir. Araçla denetlenebilen kural metne değil araca yazılır; kural metni (bu dosya, `kurulum/proje-talimati.md` ve parçaları) dosya başına 15 KB altındadır (`araclar/kural-metni.test.ts`).

## Kırmızı çizgiler
- Depoya yalnız kod girer: müşteri, tedarikçi ve kişi adı, parça no, çizim, gerçek veri, parola, anahtar girmez (tam liste `kurulum/proje-talimati.md` KURALLAR 8).
- Telemetri, CDN ve dış servis çağrısı yok. Bu sistem yalnız `TMIV2_*` ortam değişkenlerini okur. Aşağıdaki her istisna varsayılan kapalıdır; Logo, SmartES, etiket yazıcısı ve dış köprüde adres yalnız `TMIV2_*` değişkenindedir ve kurum içi olmalıdır; ayrıntı ADR'dedir. `sunucu/` ve `paylasilan/` altında dış istek kodu yalnız istisna dosyasında durur (`npm run sinir` kural j; istemci, araçlar ve testler bu denetimin dışındadır):
  Logo yardımcısı (ADR 0017, yalnız `logo` modülü, yalnız 127.0.0.1), SmartES (ADR 0013, yalnız `smartes`), etiket yazıcısı (ADR 0014, yalnız `etiket-merkezi`, yalnız TCP 9100, yalnız `TMIV2_ETIKET_YAZICI_AGI` aralığı), Web Push (ADR 0031, yalnız `bildirim` modülü `push.ts`, izin listesindeki servislere gövdesiz sinyal, varsayılan kapalı), e-posta (ADR 0015, yalnız `bildirim` modülü `posta.ts`, yalnız SMTP, adres `TMIV2_POSTA_SUNUCUSU` kurum içi IP ya da tek dış servis `TMIV2_POSTA_DIS_SUNUCUSU` (yalnız 465/587, TLS ve kimlik zorunlu; kip ayardan, 3397-4 a), alıcı yalnız `TMIV2_POSTA_ALAN_ADI` alan adlarında, varsayılan kapalı), tezgah okuma (ADR 0033, yalnız `tezgah-baglantisi` modülü, yalnız MTConnect salt okunur GET, adres `TMIV2_TEZGAH_MTCONNECT_ADRESI`, kurum içi, varsayılan kapalı), Heidenhain okuma (ADR 0034, yalnız `tezgah-baglantisi` modülü `lsv2.ts`, yalnız LSV2 salt okuma, yalnız TCP 19000, adres Sistem Ayarları'nda (yalnız yönetici, yalnız kurum içi IPv4; 3757), parola tutulmaz, varsayılan kapalı).
  Test robotu (ADR 0019, karar 174 c): yalnız `ekran-testleri/benzetim/model.ts` dil modeli çağırır (Claude API ya da yerel `claude -p`), yalnız canlı olmayan ortamda, boş ve sentetik veriyle; varsayılan kapalı; anahtar yalnız `TMIV2_ROBOT_MODEL_ANAHTARI`'nda; uygulama ve canlı paketi bu kodu içermez.
  Dış sunucu (ADR 0021 ertelendi; 1011 b, 1012 a, 1037 a): iç sunucu internete açılmaz, internete istek atmaz; yalnız `dis-kopru` modülü DMZ'deki dış sunucunun köprü kapısına bağlanır (`TMIV2_DIS_KOPRU_ADRESI`, kurum içi; mTLS ve imzalı ileti; varsayılan kapalı); `dis-sunucu/` iç sunucuya bağlanmaz, dışarı yalnız ADR 0021'deki veri çıkar; sertifika yenilemesi DMZ'deki ACME aracınındır. Kod gelene kadar kullanılmaz; dış erişim askıdadır (1493 c).
- Eski sistem (`Desktop\Planlama`, veritabanı `tmi`, port 4000) ve `Desktop\TMI_YEDEK` bu deponun dışındadır; okunmaz, yazılmaz, bağlanılmaz.
- `git reset --hard` yok; `main`'e zorla gönderme yok. Gönderilmiş iş dalı rebase sonrası aynı adla, yalnız `git push --force-with-lease` ile güncellenir. Birleşmemiş dal silinmez. Yeni bağımlılık kullanıcı onayıyla.

## Dış modüller ve kabul (kart #158; yazan için `kurulum/dis-modul-sartnamesi.md`)
1. Tek sahip, tek yer: modül aynı anda ya depoda ya dışarıda yazılır; dışarıdakinin kartı `durum: disarida` taşır, o sürede depodaki dosyalarına dokunulmaz. Dış yazım depodaki güncel modülden başlar; onaylı kararlar korunur, değişenler `FARK.md` ile gelir.
2. Başvuru ekranı olan modülde ekran başvurudaki düzen ve akışla kurulur; görevde kart numarası yoksa görev verilmez; başvuru yolu verilir.
3. İki aşama: önce bütün dış modüller toplanır (Aşama 1), sonra birbirine bağlanır (Aşama 2; kullanıcı "bağla" deyince). Kabul Aşama 2'dedir (madde 5).
4. Aşama 1, topla: teslim olduğu gibi oturur: derleme, sınır, lint ve kendi testleri yeşil; menüde ve ikinci menüde görünür; işlemleri yalnız yöneticide. Oturtmayı yalnız kırmızı çizgi durdurur (gerçek veri, dış çağrı, onaysız paket, eski sistem). Yetki, sürüm, kural ve görünüm bulguları düzeltilmez, `UYUM-BORCU.md`'ye "bağlamada kapanacak" diye yazılır. `denetci` tek tur, yalnız kırmızı çizgi ve modül sınırına bakar. Kabul kapısı ve bağımlılık sırası bu aşamada geçersizdir; başka modüle bağlantı gereken yer boş bırakılır (boş olabilen sütun, geçici karşılık), borca yazılır; yabancı anahtar Aşama 2'de ayrı göçle. Aynı anda en çok iki teslim oturtulur; her teslim önce geçici ağaçta denenir.
5. Teslim gelince: `FARK.md`, `CEKIRDEK-ISTEKLERI.md`, `BASKA-MODUL-ISTEKLERI.md` okunur; çekirdek ve ortak istekler önce ayrı kartlarla girer; modül kartıyla bir dala konur, depodakinin yerine geçer. Olduğu gibi alınır: yeniden tasarlanmaz, yazılmaz, ekranına dokunulmaz; yalnız oturtma (veri kaynağı, sayfa ve yetki kaydı, ikinci menü, derleme ve test kırıkları). Gelen kural onaylı kararla çelişirse gelen geçerlidir; çelişkiler tek listede bildirilir, onay beklenmez (yalnız dış modül tesliminde; proje içi işte çelişme sorulur). Her dış modül ikinci menülü gelir (menü veri olarak bildirilir, kabuk çizer). Her modül için `ORTAKLIK-<ad>.md` (başka modülde de olabilecek her kavram, tablo ve sütun adıyla); teslimde yoksa yazılır. Aşama 2, bağla: `ORTAKLIK` dosyalarından kavram başına tek tablo; sahiplik kullanıcıya tek listede sorulur. Belli olanlar: malzeme malzemeler, firma musteri-tedarikci, kişi kisiler, istasyon istasyonlar, üretim kaydı uretim-emirleri. Bağlama akış akış; her akışta yetki, sürüm ve sunucu kuralları kapanır, roller ortak yetki matrisinden. Kabul: Test kabul kaydını yazar; para, yetki ya da stok değiştiren akışta kullanıcı dener (2377 a). Birleşmek kullanıma açmak değildir; düzeltmeler sunucuda yapılır.
6. Kartı kapalı dal kullanıcı onayıyla silinir; açık dal sınırı yok, çakışmayı birleşme sırası yönetir.
7. Ana oturumun (şef) dağıtma ve birleştirme kuralları `kurulum/sef-duzeni.md`'dedir.
8. Öneriyle ilerlenen kurallar görünür: her teslimde en çok on satırlık "bu modül şunları varsaydı" özeti gösterilir.
9. Çekirdek ya da ortakta her değişiklikten sonra kullanıcıya haber verilir (dışarıdaki yazıma yeni zip gider).

## Yapı ve kurallar (araçla denetlenenler: `npm run sinir`, `lint`, `tip`; gerisi denetçide)
ADR: önce `belgeler/adr/README.md`, yalnız işin dokunduğu ADR açılır. Dosya kalıpları `yapi-kaliplari` skill'inde; modül haritası `npm run harita` (`-- --modul <ad>`).
1. Modül, başka modülün yalnız `disari.ts` dosyasını ithal eder; `cekirdek` modülleri, `paylasilan` sunucu ya da istemciyi ithal etmez (sinir a-d).
2. Tabloya yalnız sahibi modül yazar ve yalnız o SQL ile okur (başkası `disari.ts` ile alır). SQL yalnız `sorgular.ts` (sinir e), iş kuralı yalnız `kurallar.ts` (saf).
3. Uç, `uc({...})` tanımıyla yazılır: yol, yetki (işlem), şemalar, işleyici. Tanımsız uç yoktur.
4. Okuma kaynak (`GET /uretim-emirleri/:id`), yazma komut (`POST /adimlar/:id/bitir`).
5. Veri yoksa `null`; sıfır uydurulmaz. Zaman `timestamptz`, tarih `date`.
6. Ekran renk, ölçü, boşluk yazmaz; yalnız tasarım değişkenleri (lint). Her ekran 360, 768 ve 1280 genişlikte tam işlevlidir.
7. Kodda tarihçe yorumu yok; yalnız "neden". Gerekçe commit mesajında ve ADR'de.

## Ajanlar ve komutlar
Yalnız ana oturum şef düzenini uygular. Proje ve dış yazar konuları `kurulum/proje-talimati.md`'yi (OKUMA SIRASI) izler; teslim kapısı `npm run teslim-denetle`.
`npm run kontrol` · `teslim-denetle -- <klasör>` · `tip` · `sinir` · `test:modul -- <ad>` · `harita` · `durum` · `goc` · `yonetici` · `gelistir:sunucu` (4100) · `gelistir:istemci` (4101)
