# UYUM BORCU: istasyonlar (kart #186, #105, #247)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

## Kullanıma açmadan önce

Okuma uçlarındaki yetki boşluğu (#247) kapandı: üç tanım listesi `sayfa.istasyonlar` ya da `istasyonlar.yaz` ister (IS8).

2. KAPANDI (borç turu 19.10.2026): `Istasyonlar.tsx` bölümleri `IKINCI_MENU_TANIMLARI`ndan (ortak/rota/ikinci-menu.ts) okur; adres tekrarı kalktı. İkinci menü bu PR'da girdi (T1 a istisnası). Ekranın bölüm tablosu (`Istasyonlar.tsx` `BOLUMLER`) menünün adreslerini tekrar eder: istemci `paylasilan/sayfalar/` alt dosyasını değer olarak ithal edemiyor (lint, DOĞRULANDI). Bağlamada menüden okunur.

1. KAPANDI (borç turu 19.10.2026): `ekran-testleri/sayfalar.spec.ts` bölümü 360, 768 ve 1280 genişlikte açar; başlık görünür, konsol ve API hatası yok, yatay taşma yok, üst çubuk çakışmıyor (yerelde 36/36 yeşil). İşlevin elle denemesi Aşama 2 kabulündedir. Ekran 360, 768 ve 1280 genişlikte denenmedi (BİLMİYORUM: tam işlevli olup olmadığı). Kişi kısıtları, operasyon tipleri, ekipler bölümleri ve kişi paneli geldi; kabul öncesi üç genişlikte bakılır.

## Bağlamada kapanacak

4. Operasyon tipi kataloğu ekranla yazılır (IS13; `/istasyonlar/operasyon-tipleri`); silme yok; kod yalnız kullanılmamışken düzenlenebilir (#460, #544; kodla arayanlar için BASKA-MODUL-ISTEKLERI 14). Malzemelerin ekran sabitleri (`OPS`, `OP_VARSAYILAN`, ayar `operasyonlar`) ve Arkon'daki operasyon metni bağlamada bu kataloğa bağlanır. Grup listesi sözleşmede sabit 13 kod; istemcideki grup adları (`etiketler.ts`) sözleşmedekinin kopyasıdır (istemci zod'lu sözleşmeden değer alamaz).
5. Kişi kendi kısıtını değiştiremez (245 a); başkasınınkini `istasyonlar.yaz` ya da `arkon.amir` sahibi değiştirir (252 a). İstemci düzenlemeyi yalnız `istasyonlar.yaz` ile açar: müdür sekmeyi görür ama düzenleme düğmesi görmez (bekleyen karar). Kişi kısıtı listesi tümden yazılır; aynı kişiye eşzamanlı iki yazmada son yazan kalır (DOĞRULANDI: `sorgular.ts` `kisiIsMerkezleriniYaz` yorumu). Uyum: kısıta sürüm ya da kişi satırı kilidi.
6. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): plan ve vardiya kapasiteyi istasyonlar `disari.ts`'inden okuyor (`vardiya/servis.ts` `ekipler, ekipUyeleri, ... makineKisiAtamalari` ithali, `plan/servis.ts` `istasyonKisileri` ithali). Ekip ve yüzdeli kapasite (#105) `105-ekip-kapasite` dalında yeniden yazıldı. Kapasite hesabı (kişi saati x yüzde, ekibin istasyona sayılması, pasif ekibin düşmesi)
   bu modülde yok; plan ve vardiya `disari.ts` (`istasyondakiKisiler`, `makineKisiAtamalari`, `ekipler`, `ekipUyeleri`) ile okur. Akış B (plan) öncesi.
10. Kapasite kaynağı (IK4) bugün yalnız ekranda zorunlu; sunucu boşu kabul eder (E2z). Bağlamada sunucu da zorunlu kılacak (IK4): Arkon ve çekirdek test kurulumları
    (`POST /istasyonlar` gövdeleri) güncellenir, sonra `istasyonGovdesi` alanı zorunlu ve sütun `NOT NULL` olur (dolu satırlar için göç gerekir). Var olan boş satırlar ekranda düzenlenirken seçtirilir.
11. Kişi paneli kişi listesini `GET /kisi-secenekleri` ile bu modülden okur (`kisiler/disari` `kisileriListele`); bağlamada ortak kişi seçicisine geçer.
12. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): rotanın `baglanti.ts` dosyası kalktı (`sunucu/moduller/rota/baglanti.ts` yok); rota asıl fonksiyonları kullanıyor (`rota/servis.ts` `istasyonKisiAtamalari`, `operasyonTipleri as katalogTipleri` istasyonlar `disari.ts` ithali). Rota (#260) operasyon tipi kodlarını kendi eşlemiyle karşılar (IR2 a); kataloğun dört varsayılanı geldi (#324), rotanın `baglanti.ts` `operasyonKatalogu` ve `istasyonKisileri` geçici karşılıkları bağlamada `operasyonTipleri` ve `istasyonKisiAtamalari`'na geçer.
7. Arkon tesis kodlarını metinle tutar, yabancı anahtar yok (Arkon ORTAKLIK). SMARTES alanı yok.

## Sonra

8. Testler kişiyi `POST /kisiler` ve `pasife-al` uçlarıyla açar (#105 bulgu 6). Kalan doğrudan SQL: `IS1` kişi silmeyi SQL'le dener, çünkü kişi silme işlevi ve ucu yok,
   kısıtı yabancı anahtar tutar; `istasyon-adlari.test.ts` istasyonu doğrudan ekler. Kişi silme gelirse ya da kisiler silme işlevi verirse ona geçer.
14. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): kabul edilmiş varsayım, bilgi notu; borç değil. Atamanın bitiş tarihi yok, açık uçludur (#105 bulgu 3, varsayım kabul). İleride başlayan atama varken araya, o güne kadar başka hedefe atama girilemez;
    yol ilerideki kaydı çıkarıp yeniden girmektir. Ret iletisi engelleyen kaydı ve başlangıç tarihini söyler. Bitiş tarihi istenirse ayrı kartla gelir.
15. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): tüketene bilgi notu; borç değil. `disari.ts` yüzdeyi iki ondalıklı metin döndürür (`"50.00"`). Tüketen modül `Number` ile toplarsa ondalık hatası alır; yüzdeyi sente (x100, tam sayı) çevirerek toplar.
    Bağlamada sent döndüren bir yardımcı ya da ortak bir yüzde tipi düşünülür.
16. "Bugün" veritabanının `current_date` değeridir (`sorgular.ts` `bugun`); oturumun saat dilimine bağlıdır. Sunucu kurulumunda veritabanı saat dilimi atölyenin saat dilimine ayarlanır
    (VARSAYIM: gece yarısına yakın atamada gün kayabilir; denenmedi).
9. `disari.ts` tipleri sürüm taşımaz, çalışma anında satırlar `surum` alanını da taşır (VARSAYIM: zararsız; tüketen modüller alanları adıyla okur).
20. Plan ayarı ve makine durumu yazmalarında sürüm isteğe bağlı (#409): rota ekranının beklenen sözleşmesi göndermiyor. Verilmezse son yazan kalır. Bağlamada rota ekranı `surum` gönderince gövdede zorunlu olur.
17. "Paralel adet" (OZELLIK-LISTESI Kaynaklar, istasyon plan ayarı) ilk sistem kodunda ve beklenen sözleşmede yok (BİLMİYORUM: anlamı ve plandaki etkisi). Bağlamada plan ile birlikte sorulur.
18. Makine durumu geçmiş tutmaz, bugünkü hâldir (ilk sistemle aynı); kim ve ne zaman değiştirdiği denetim kaydında ve satırda. Arkon arıza bildirimi bağlamada bu uca yazar. Makine arızaya geçince bakım ve amir işlemi olanlara bildirim bu uçtan gider (`istasyonlar.makine-durdu`, #1882); Arkon'un kendi arıza kaydı bu uca bağlanınca aynı bildirimi alır.
19. `kisilerinIzinliIsMerkezleri` kısıtı olan her kişi için ayrı bayrak sorgusu atar (kisiler toplu bayrak okuması vermiyor, BASKA-MODUL-ISTEKLERI 12).
21. Makine durumunu `istasyonlar.makine-durumu` ile yazan (263 a) Makineler listesinde durum ve notu satırda değiştirir; toplu durum çubuğu satır seçimine bağlı olduğundan yalnız `istasyonlar.yaz` sahibinde görünür (uç ikisini de kabul eder). Makine ayrıntı penceresi de yalnız yazana açılır.
