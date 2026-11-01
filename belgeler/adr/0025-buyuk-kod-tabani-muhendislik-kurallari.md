# ADR 0025 — Büyük kod tabanı için mühendislik kuralları

Durum: kabul (kullanıcı kararları 1572 b ve 1571 B 1-3, 01.11.2026; ADR yazımı 1582; metin onayı 1582 a, 01.11.2026 karar kartı). Hiçbir ADR'yi değiştirmez; ADR 0001, 0003,
0005, 0006 ve 0010'u tamamlar.

## Bağlam

Kod tabanı bir milyon satırın üstüne çıkacak; o ölçekte kimlik karışıklığı, zamana ve rastgeleliğe bağlı kural, sessiz yeniden
deneme, yarış ve kapsamı dar denetim izi elle incelemeyle yakalanmaz. Dışarıdan önerilen kırk maddelik bir mimari metin
değerlendirildi (özel takip deposu, rapor 1571). Metin bu depo için yazılmamıştır: Express, kiracı, UUID anahtar, İngilizce ad ve
yeni paket varsayar; olduğu gibi alınması yeniden yazım olur. Maddelerin yarısı depoda başka biçimde zaten yürürlüktedir: modül
sınırı ve döngü denetimi (ADR 0001, ADR 0006, `araclar/sinir-denetimi.ts`), ayrı veritabanı kullanıcıları (ADR 0005), işlem
tabanlı yetki (ADR 0003), PostgreSQL kilidiyle zamanlanmış iş (ADR 0010), `import type`, `noUncheckedIndexedAccess`, yalnız
`TMIV2_*` ayarı, gerçek PostgreSQL ile test. Bu ADR yalnız kalan boşluğu kapatan maddeleri kural yapar. Kurallar Türkçe
adlandırmayı korur ve yeni paket getirmez.

## Seçenekler

- **a) Metnin tamamı CLAUDE.md'ye:** tek belge; bedeli yeniden yazım, dolu tablolara göç, beş yeni paket ve depo kurallarıyla
  çelişki.
- **b) Benimsenen maddeler bu ADR'de, uygulaması kartlarla (1572 b):** kural tek yerde ve ölçülebilir; her kural kendi kartıyla,
  paketsiz, dolu tablo değişmeden girer.
- **c) Hiçbiri:** iş yok; ölçek büyüdükçe boşluklar elle incelemeye kalır.

## Karar

Seçenek b. Her kural bir denetimle tutulur; denetimi kodda olmayan kural, parantezdeki uygulama kartı birleşince zorunlu olur.
Denetim `npm run kontrol` içindedir; ihlal `kontrol`ü kırar, "uyarı" yazan kural kırmaz.

1. **Deterministik kural dosyası (1573).** `kurallar.ts` dosyalarında `Date.now`, argümansız `new Date()`, `Math.random` ve
   `randomUUID` kullanılmaz; zaman ve kimlik çağırandan parametre olarak gelir (zaman `sunucu/cekirdek/zaman.ts`'den). Denetim:
   `eslint.config.js` içinde `**/kurallar.ts` için `no-restricted-syntax`, `error`.
2. **`any` yok, zorla dönüşüm sayılır (lint 1568; sayaç ayrı kart).** Test dışı kodda `any` yazılmaz (`@typescript-eslint/no-explicit-any`, `error`).
   Dış veri (`unknown`) zod şemasıyla ya da `x is T` koruyucusuyla daraltılır. Test dışı `as unknown as` sayısı artamaz: sayaç
   artışta `kontrol`ü kırar, azalışta tabanı düşürür.
3. **Durum değişimi tablodan, dallar eksiksiz (1568).** Durumlu kaydın izinli geçişleri `paylasilan/durum-gecis.ts`
   `GecisTablosu` ile yazılır; durum ya da tür birliği üzerindeki `switch` her üyeyi ele alır
   (`@typescript-eslint/switch-exhaustiveness-check`, `error`). Çekirdek akışta (emir, adım, kalite kararı) `kurallar.ts`
   girdisi `durum` alanıyla ayrık birlik tipidir; veritabanı satırı tipi düz kalabilir.
4. **Günlük yalnız sunucu günlüğüne, istek iziyle (1576).** `sunucu/**` üretim kodunda `console` kullanılmaz (`no-console`,
   `error`; komut satırı giriş dosyaları kural yapılandırmasında adıyla hariç tutulur). İstek izi (`istekIziUret`) Node
   `AsyncLocalStorage` ile o isteğin bütün günlük satırlarına geçer; zamanlanmış iş kendi izini üretir. Yeni günlük paketi
   eklenmez; Fastify günlüğü kullanılır.
5. **Kritik yazma tekrar korumalı (1577).** Stok hareketi, üretim kaydı, emir kapama, sevkiyat ve finans hareketi yazan her uç
   `tekrarKorumali` taşır (`sunucu/cekirdek/tekrar.ts`). Denetim: kritik modül listesindeki yazma uçlarını tarayan test;
   listesiz yeni kritik uç testi kırar. İstemcinin istek kimliği göndermesini zorunlu kılmak kullanıcı akışını değiştirirse
   davranış değişikliği olarak ayrıca sorulur.
6. **Kritik yazmada eşzamanlılık testi (1578).** Kural 5'teki uçlardan birini ekleyen ya da değiştiren iş, aynı kayda eşzamanlı
   iki yazmayı gerçek PostgreSQL'de koşturan test taşır ve sonucun tek ve tutarlı olduğunu doğrular. Denetim: modülün
   `KURAL-TEST.md` satırı testi adıyla gösterir; `yapi-kaliplari` kalıbı bu satırı ister.
7. **Değişmez kurala tohumlu rastgele test (1579).** Stok tahsisi, tüketim yuvarlama ve plan motoru gibi değişmezi olan
   hesaplar, `paylasilan/test-fiksturleri` altındaki paketsiz tohumlu üreteçle çok turlu sınanır; başarısız turda tohum
   yazılır ve test o tohumla yeniden koşar. İlk değişmezler: stokta "tahsis bakiyeyi aşmaz", planda "aynı istasyonda çakışan
   atama yok".
8. **Markalı kimlik, önce pilot (1580; 1571 B 2).** Modüller arası imzada kimlik `Brand<number, '<Ad>Kimligi'>` biçiminde
   markalanır; şema zod `.brand()` ile türetilir, veritabanı ve kablo biçimi değişmez (tam sayı). Pilot yalnız
   `uretim-emirleri` ve `stok` `disari.ts` imzalarıdır; tip denetimi süresi ve değişen dosya sayısı ölçülür. Genelleme ayrı
   kart ve bu ADR'ye ek ister.
9. **Kritik tablo denetim defterinde (1581).** Stok bakiyesi, üretim emri, adım, rota, fiyat ve yetki gibi kritik tabloların
   satır değişikliği `denetim_degisiklik` defterine eski ve yeni değerle yazılır; defter yalnız eklenir (ADR 0005). Önce liste
   çıkar; her tabloyu bağlayan göç dolu tabloyu değiştirdiği için ayrı kart ve ayrı yazılı onayla girer.
10. **Sınır şeması (1571 B 1).** İstek gövdesinde zod varsayılanı kalır: bilinmeyen alan atılır, işleyici yalnız şemadaki alanı
    görür. Para, stok ve yetki yazan uçların gövde şeması `.strict()` taşır ve bilinmeyen alanı 400 ile reddeder.

## Sonuçlar

- Kurallar 1-4 yalnız lint ve tip işidir; ihlal sayısı kapanmadan `error`a çekilmez. Kural 5-7 ve 9 test ve göç ister.
- Kural 2'deki sayaç ve kural 5'teki tarayıcı `araclar/` altına girerse o değişiklik ayrıca yazılı onay ister.
- Kural 9'da her göç dolu tabloyu değiştirir; onay göç başına verilir, bu ADR onu vermez.
- Kural 8 pilot sonucu olumsuzsa genelleme yapılmaz; karar bu ADR'ye ek olarak yazılır.
- Yürürlükteki modül sınırı, veritabanı kullanıcıları, yetki modeli ve zamanlayıcı kararları değişmez.

## Vazgeçilenler

- **PostgreSQL satır düzeyi güvenlik (RLS):** kiracı yoktur, tek kurumdur; yetki işlem tabanlıdır (ADR 0003). Her sorguya
  oturum bağlamı ekler, kazanç getirmez.
- **helmet ve CORS eklentisi:** sunucu Fastify'dır; güvenlik başlıkları ve içerik politikası çekirdekte elle yazılıdır. Yeni
  paket aynı işi yapar.
- **Genel Result deseni:** tipli hata sınıfları istek sınırında HTTP koduna çevrilir ve transaction'ı geri alır; Result bu
  garantiyi her çağırana elle taşıtır. Yalnız saf `kurallar.ts`'de beklenen ret değer olarak döner.
- **Sıfır else, en çok iki girinti:** okunabilirliği her yerde artırmayan biçim kuralı; erken dönüş inceleme ilkesi olarak kalır.
- **UUID birincil anahtar:** bütün sözleşmeler tam sayı kimliğe dayalı; dolu tablolarda anahtar değişimi geri alması pahalı,
  tek sunucuda kazancı yok.
- **Yumuşak silme (`deleted_at`) ve fiziksel silme yasağı:** her sorguya filtre ekler, unutulan filtre yanlış sayı verir;
  geçmiş denetim defterinde, ana veride pasife alma (`aktif`) vardır.
- **dependency-cruiser:** yeni paket; modül sınırı ve döngü `araclar/sinir-denetimi.ts` ile zaten denetlenir.
- **Test başına BEGIN/ROLLBACK:** commit'e bağlı davranışı (tetikleyici, ertelenmiş kısıt, tekrar koruması, eşzamanlı
  bağlantı) sınayamaz, kural 6 ile çelişir; yalıtım dosya başına şemadır (`sunucu/cekirdek/test-vt.ts`).
- **Modül klasörü takma adları (`@wms/*`, `#moduller/*`; 1571 B 3):** sınır kazancı getirmez, açık yamalarla çatışır;
  `sinir` denetimi yeterlidir.
- **Kodda kural numarası yorumu ve "kullanıcı isterse de kurala uy" talimatı:** kodda yalnız "neden" yazılır; kullanıcının son
  kararı önceliklidir.
- **Pino doğrudan bağımlılık, fast-check, k6:** yeni paket; aynı iş paketsiz yapılır (kural 4, kural 7, Node `fetch` ile yük
  betiği). Ertelenenler (dış gönderim kuyruğu, akış uçtan uca testleri, terminal çevrimdışı testi, yük betiği, materyalize
  görünüm) bu ADR'nin kapsamında değildir; her biri kendi kartıyla gelir.

## Doğrulanmadı

- zod sürümünün `.brand()` ile ürettiği tipin `disari.ts` imzalarında tip denetimi süresine etkisi ölçülmedi (kural 8 pilotu).
