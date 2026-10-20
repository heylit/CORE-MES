# Başka modül istekleri (çekirdek, kart #259)

Çekirdek bu modüllerin dosyalarına yazmaz; istekler sahibine iletilir.

## uretim-emirleri (dışarıda yazılıyor; kart #247)

Okuma uçları bugün `yetki: 'oturum'`: sayfası olmayan rol (bakım, satın alma, depo, muhasebe) doğrudan istekle okuyor.
Çekirdek kalıbı (ADR 0007): GET ucunda `yetki: { biri: [...] }`, listedeki sayfa ya da veri işlemlerinden biri yeter.

1. `GET /uretim-emirleri` ve `GET /uretim-emirleri/:id` (`sunucu/moduller/uretim-emirleri/uclar.ts`):
   `yetki: { biri: ['sayfa.uretim-emirleri'] }`. Emirleri okuyan başka sayfa varsa listeye eklenir (sahibinin kararı).
2. `GET /terminal/isler`: `yetki: { biri: ['sayfa.terminal'] }`.
3. Her uç için iki test: listedeki işlemi olan 200, olmayan (ör. yalnız `sayfa.arkon` ya da `bakim` rolü) 403.
4. Arkon etkilenmez: `disari.ts` çağrıları uç katmanından geçmez. `arkon/yansima.test.ts` HTTP ile `/uretim-emirleri` okur; test
   kullanıcısının sayfa işlemi taşıdığı denetlenmeli.
5. `disari.ts` imzaları (Arkon'un çağırdıkları: `acikEmirler`, `emirOzeti`, `emirBaslat`, `emirDevam`, `emirDuraklat`, `emirBitir`,
   `emirSayim`, `emirDurdur`, `KOMUT_ISLEMI`) korunur; değişirse Arkon sözleşme testi kırılır.

## durus-nedenleri (bu turda konusu yok; kart #247)

`GET /durus-nedenleri` ve `GET /hurda-nedenleri` `yetki: 'oturum'`. Öneri: `yetki: { biri: ['sayfa.durus-nedenleri', 'sayfa.terminal'] }`
(terminal duruş ve hurda nedeni seçer); iki test. Konu açılana kadar açık kalır.

## satin-alma (rol matrisi borcuna; kart #162)

İkinci menünün kök sayfası `/satin-alma` menüde `sayfa.satin-alma` ile görünür; bu işlem bugün hiçbir rolde yok (toplama aşaması).
Bağlamada talep eden (`satin-alma.talep-ac`) ve depo (`satin-alma.teslim-al`) rollerine veri işlemiyle birlikte `sayfa.satin-alma`
de verilmezse bu kişiler menüyü görmez, ikinci menüdeki kendi bölümlerine ulaşamaz. Rol matrisi kararında birlikte sorulur.

## Saat dilimi (borç P-B24; plan, arkon, rota, stok)

Çekirdek veritabanı oturumunu tesis saat dilimine (`TESIS_SAAT_DILIMI`, `Europe/Istanbul`) sabitledi ve `#paylasilan/tesis-zamani.ts`'e
üç yardımcı ekledi (zod taşımaz; istemci değer olarak ithal edebilir): `tesisGunu(an)` ('GGGG-AA-GG'), `tesisSaati(an)` ('GGGG-AA-GG SS:DD'), `tesisGunBasi(tarih)` (günün
tesisteki başlangıç an'ı, ms). `current_date`, vardiya aralıkları ve zaman çıktısının saat farkı (`+03:00`) artık sunucu
kurulumuna bağlı değil. Aşağıdakiler gün ya da saati UTC'den türetiyor; tesiste 00:00-03:00 arasında bir gün geride kalıyor.

### plan (`sunucu/moduller/plan/servis.ts`)

1. `baglamKur`: `gun0` UTC gece yarısı yerine `(tesisGunBasi(tesisGunu(simdi)) - simdi) / DK`.
2. `gunTarihi`: `tarih(b, ...).toISOString().slice(0, 10)` yerine `tesisGunu(tarih(b, ...))`.
3. `vardiyaOku`: `baslangic` için `tesisGunu(simdi)`; vardiyasız kaynağın kapalı günü `dakikasi(\`${g.tarih}T00:00:00Z\`)` yerine
   `(tesisGunBasi(g.tarih) - simdi) / DK`.
4. Gün başı `T00:00:00Z` ile çevrilen tarihler (`gun_kapat` denemesi, `emirBaslangicDk`) `tesisGunBasi(tarih)` ile; teslim sonu
   `T23:59:59Z` (`teslimDk`, önizlemedeki `gec`) `tesisGunBasi(gunEkle(teslim, 1)) - 1000` ile.
5. Önizlemedeki `onerilen` teslim günü ve `zamanMetni` (değişiklik defteri), taslak adı: `tesisGunu` / `tesisSaati`.
6. Test: `simdi` tesiste gece yarısını geçmiş, UTC'de dünkü gündeyken (ör. 21:30Z) `gunler[0]` tesis günüdür; vardiyasız
   kaynağın kapalı günü tesisin 00:00'ında başlar. Uygulanınca `UYUM-BORCU.md` P-B24 kapanır.
   Not: gün uzunluğu 1440 dk sabit kalabilir (Türkiye 2016'dan beri yaz saati uygulamıyor); dilim değişirse ayrıca bakılır.

### arkon (`sunucu/moduller/arkon/kurallar.ts`)

7. `TARIH` (paket günlüğündeki zaman metni) `new Date(ms).toISOString().slice(0, 16)` yerine `tesisSaati(ms)`; günlük satırı
   tesiste okunan saati göstersin.

### rota (istemci, `istemci/src/moduller/rota/EmirlerEkrani.tsx`, `csv.ts`)

8. `bugun()` (yeni emir formunun başlangıç ve teslim varsayılanı) `tesisGunu(Date.now())`; dosya adındaki gün de aynı.

### stok (istemci, `Malzemeler.tsx`, `Hareketler.tsx`)

9. CSV dosya adındaki gün `tesisGunu(Date.now())`. Küçük; yalnız dosya adı.

### istasyonlar

10. `UYUM-BORCU.md` madde 16 ("bugün" `current_date` oturum saat dilimine bağlı) bu değişiklikle kapanır; kod değişmez.
