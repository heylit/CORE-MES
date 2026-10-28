TEMEL KURAL: Bilmediğini uydurma, eksikte sor.
1. Her iddia üç türden biridir ve öyle yazılır: DOĞRULANDI (komut çıktısı, dosya ve metin çapası ya da belge
   sayfasıyla), VARSAYIM (gerekçesiyle) ya da BİLMİYORUM. Kanıtı olmayan şeye "doğrulandı" denmez; tahmin olgu gibi sunulmaz.
2. Varsayılan öneriyle ilerlemektir: ajan karar kartındaki önerilen seçenekle yazar, karta "Varsayım:" yazılır; kullanıcı yalnız itiraz ettiğini değiştirir.
   Sorulur (yalnız geri alması pahalı karar): dolu tabloyu değiştiren ya da silen şema işi, yetki modeli, kırmızı çizgi, yeni bağımlılık, onaylanmış kararla çelişme. Teknik ayrıntı sorulmaz.
   Eski kurallar öneriyle ilerlemez; her biri kullanıcıya sorulur. `kurulum/eski-kurallar/` ve ondan açılan kartlardaki (#31-#43) madde, kullanıcı açıkça "kalsın" demeden onaylı sayılmaz ve koda girmez.
   Konuyla ilgili eski kural uygulanmaz, sorulur: kural, gelen modülün yaptığı ve fark tek satırda; cevap "kalsın / gitsin / değişsin". Modül başına tek liste, en çok 10 madde; gelen modülle çelişmeyen ya da ilgisiz kural sorulmaz.
3. Soru biçimi: tek soru, neden gerektiği, seçenekler ve önerin. Cevap gelene kadar o kart durum:onay-bekliyor olur;
   başka kartlarla devam edilir, bütün iş durmaz.
4. Varsayımlar geri alma maliyetiyle karta yazılır; kararlar depoda değil karttadır, ajan görevinde kart numarası her zaman verilir.
5. Kullanıcının cevabındaki doldurulmamış yer tutucu (<…>), silinmemiş seçenekler ya da sessizlik onay değildir; yeniden sorulur.
6. Dış araçların (Claude Code, GitHub, PostgreSQL) davranışına dair belgeden ya da denemeden doğrulanmamış iddia
   "doğrulanmadı" diye işaretlenir.
7. Alt ajan kullanıcıya soramaz: durur ve sorusunu ana oturuma döner; ana oturum sorar. Alt ajan eksik bilgiyi
   uydurarak işi bitirmez.

# TMI CORE V2
CNC talaşlı imalat atölyesi için üretim planlama ve izlenebilirlik sistemi; kurum içi, tek sunucu. Türkçe konuş; kod tanımlayıcıları
Türkçe (ASCII), commit mesajı İngilizce. Açık işler ve kararlar GitHub kartlarında (`gh issue list`); kurulum `kurulum/devir.md`.

## Çalışma tercihleri
- Kısa yaz, emoji yok; soruda Türkçe karakterleri düz yaz. Rapor en çok 15 satır: önce sonuç (adım başına tek satır), sonra yalnız "sorulur" kademesindeki
  sorular, en çok 10 maddelik tek listede, tam metniyle (soru, neden, seçenekler, öneri; yalnız kod ya da kart numarasıyla atıf yapılmaz). Ayrıntı, doğrulananlar ve varsayımlar karta yazılır.
- Odak: dışarıdan gelen modül esastır; depo çekirdek ve ortak parçaları taşır. Ana oturumun işi çekirdek, ortak arayüz, paylaşılan kalıplar, araçlar ve kurulumdur.
  Araçlara yalnız işi durduran hata için dokunulur. Askıda: bulut eşliği (#121-#126). Ters vekil yalnız `kurulum/canli.md` ve ADR 0021 kapsamında.
- Arayüzde en az dokunuş; profesyonel ve gerçekçi; ikon kullan; role göre sadelik. Eski sistemden kod, şema, test, veri taşınmaz; `kurulum/eski-kurallar/` yalnız başvurudur, onaysız eski kural girmez.
- Süreç ağırlaştırılmaz: sahiplik defteri, ders dosyası, kanca, durum dosyası kurulmaz. Hata iki kez olursa kural yazılmaz; tip, kısıt, ortak parça ya da test eklenir.

## Kırmızı çizgiler
- Depoya yalnız kod girer: müşteri adı, parça no, çizim, gerçek veri, parola, anahtar girmez. Telemetri ve dış servis çağrısı yok; yalnız kurum içi üç servis istisna: Logo yardımcısı (ADR 0017, yalnız `logo` modülü, yalnız aynı bilgisayar: 127.0.0.1), SmartES (ADR 0013, yalnız `smartes` modülü) ve etiket yazıcısı (ADR 0014, yalnız `etiket-merkezi` modülü, yalnız TCP 9100, yalnız `TMIV2_ETIKET_YAZICI_AGI` aralığı). Üçünde de adres yalnız `TMIV2_*` ortam değişkenindedir ve kurum içi olmalıdır (Logo için yalnız 127.0.0.1); bağlantı varsayılan olarak kapalıdır.
  Dış sunucu istisnası (ADR 0021, kararlar 1011 b, 1012 a, 1037 a): iç sunucu internete açılmaz ve internete istek atmaz; yalnız `dis-kopru` modülü DMZ'deki dış sunucunun köprü kapısına bağlanır (adres yalnız `TMIV2_DIS_KOPRU_ADRESI`'nde, kurum içi olmalı; mTLS ve imzalı ileti; varsayılan kapalı). Dış sunucu (`dis-sunucu/`) iç sunucuya bağlanmaz; dışarı yalnız ADR 0021'deki veri çıkar. Uygulama kodu internete istek atmaz; sertifika yenilemesi DMZ'deki ACME aracınındır.
  Test robotu istisnası (ADR 0019, karar 174 c): yalnız `ekran-testleri/benzetim/model.ts` dil modeli çağırır (Claude API ya da yerel `claude -p`); yalnız canlı olmayan ortamda, boş ve sentetik veriyle; anahtar yalnız `TMIV2_ROBOT_MODEL_ANAHTARI`'nda; varsayılan kapalı; uygulama ve canlı paketi bu kodu içermez.
- Eski sistem (`Desktop\Planlama`, veritabanı `tmi`, port 4000) ve `Desktop\TMI_YEDEK` bu deponun
  dışındadır; okunmaz, yazılmaz, bağlanılmaz. Bu sistem yalnız `TMIV2_*` ortam değişkenlerini okur.
- `git reset --hard` yok; `main`'e zorla gönderme yok. Gönderilmiş iş dalı rebase sonrası aynı adla, yalnız `git push --force-with-lease` ile güncellenir. Birleşmemiş dal silinmez. Yeni bağımlılık kullanıcı onayıyla.

## Dış modüller ve kabul (kart #158)
1. Tek sahip, tek yer: bir modül aynı anda ya depoda ya dışarıda yazılır. Dışarıda yazılanın kartı `durum: disarida` taşır; o sürede depoda o modülün dosyalarına dokunulmaz.
   Dışarıdaki yazım depodaki güncel modülden başlar; onaylı kararlar korunur, değişenler teslimdeki `FARK.md` ile gelir.
2. Başvuru zorunlu: başvuru ekranı olan modülde ekran başvurudaki düzen ve akışla kurulur; görevde başvuru yolu ve kart numarası yoksa görev verilmez.
3. İki aşama: önce bütün dış modüller toplanır (Aşama 1), sonra birbirine bağlanır (Aşama 2; kullanıcı "bağla" deyince). Kabul Aşama 2'dedir: akış, kullanıcı deneyip "tamam" demeden bitmiş sayılmaz.
4. Aşama 1, topla: teslim olduğu gibi oturur: derleme, sınır, lint ve kendi testleri yeşil; menüde ve ikinci menüde görünür; işlemleri yalnız yöneticide kalır. Oturtmayı yalnız kırmızı çizgiler
   durdurur (gerçek veri, dış çağrı, onaysız paket, eski sistem). Yetki, sürüm, kural ve görünüm bulguları düzeltilmez; modülün `UYUM-BORCU.md` dosyasına "bağlamada kapanacak" başlığıyla yazılır.
   `denetci` tek tur, yalnız kırmızı çizgi ve modül sınırına bakar. Kabul kapısı ve bağımlılık sırası bu aşamada geçersizdir: başka modüle bağlantı gereken yer boş bırakılır (boş olabilen sütun,
   geçici karşılık) ve borca yazılır; yabancı anahtar Aşama 2'de ayrı göçle gelir. Aynı anda en çok iki teslim oturtulur; her teslim önce geçici ağaçta denenir.
5. Teslim gelince: `FARK.md`, `CEKIRDEK-ISTEKLERI.md`, `BASKA-MODUL-ISTEKLERI.md` okunur; çekirdek ve ortak istekleri önce ayrı kartlarla girer; gelen modül kartıyla bir dala konur ve
   depodakinin yerine geçer. Olduğu gibi alınır: yeniden tasarlanmaz, yeniden yazılmaz, ekranına dokunulmaz; yapılan yalnız oturtmadır (veri kaynağı, sayfa ve yetki kaydı, ikinci menü,
   derleme ve test kırıkları). Gelen kural depodaki onaylı kararla çelişirse gelen geçerlidir; çelişkiler kullanıcıya tek listede bildirilir, onay beklenmez. Her dış modül ikinci menülü gelir
   (menü veri olarak bildirilir, kabuk çizer). Her modül için `ORTAKLIK-<ad>.md` çıkar (teslimde yoksa yazılır): modülün tuttuğu ve başka modülde de olabilecek her kavram (firma, malzeme, kişi,
   istasyon, depo, birim, para birimi, belge no, durum listeleri), tablo ve sütun adıyla.
   Aşama 2, bağla: `ORTAKLIK` dosyalarından tek tablo çıkar (kavram başına hangi modül ne tutuyor); sahiplik kullanıcıya tek listede sorulur. Belli olanlar: malzeme malzemeler, firma musteri-tedarikci,
   kişi kisiler, istasyon istasyonlar, üretim kaydı uretim-emirleri. Bağlama akış akış yapılır; her akışta yetki, sürüm ve sunucu kuralları kapanır, roller ortak yetki matrisinden verilir,
   kullanıcı deneyip kabul eder. Birleşmek kullanıma açmak değildir; düzeltmeler sunucuda yapılır.
6. Dal ve kart temizliği: kartı kapalı dal kullanıcı onayıyla silinir. Açık dal sınırı yok; çakışmayı birleşme sırası yönetir.
7. Ana oturumun (şef) dağıtma ve birleştirme kuralları `kurulum/sef-duzeni.md`'dedir.
8. Öneriyle ilerlenen kurallar görünür olur: her modül tesliminde en çok on satırlık "bu modül şunları varsaydı" özeti kullanıcıya gösterilir.
9. Çekirdek ya da ortakta her değişiklikten sonra kullanıcıya haber verilir (dışarıdaki yazıma yeni zip gider).

## Yapı ve kurallar (ithal sınırı, SQL'in yeri, renk ve inline stil araçla; gerisi denetçide)
Dosya kalıpları `yapi-kaliplari` skill'inde; modül haritası `npm run harita` (tek modül: `-- --modul <ad>`).
1. Modül, başka modülün yalnız `disari.ts` dosyasını ithal eder; `cekirdek` modülleri, `paylasilan` sunucu ya da istemciyi ithal etmez.
2. Tabloya yalnız sahibi modül yazar ve yalnız o SQL ile okur (başkası `disari.ts` ile alır). SQL yalnız `sorgular.ts`, iş kuralı yalnız `kurallar.ts` (saf).
3. Uç, `uc({...})` tanımıyla yazılır: yol, yetki (işlem), şemalar, işleyici. Tanımsız uç yoktur.
4. Okuma kaynak (`GET /uretim-emirleri/:id`), yazma komut (`POST /adimlar/:id/bitir`).
5. Veri yoksa `null`; sıfır uydurulmaz. Zaman `timestamptz`, tarih `date`.
6. Ekran renk, ölçü, boşluk yazmaz; yalnız tasarım değişkenleri. Her ekran 360, 768 ve 1280 genişlikte tam işlevlidir.
7. Kodda tarihçe yorumu yok; yalnız "neden". Gerekçe commit mesajında ve ADR'de.

## Ajanlar
Şef ve ajan düzeni (ajan dağıtma, kart, birleştirme, test yükü) `kurulum/sef-duzeni.md`'dedir; yalnız ana oturum (şef) uygular.
Dış yazar konuları `kurulum/proje-talimati.md`'yi izler.

## Komutlar
`npm run kontrol` · `tip` · `sinir` · `test:modul -- <ad>` · `harita` · `durum` · `goc` · `yonetici` · `gelistir:sunucu` (4100) · `gelistir:istemci` (4101)
