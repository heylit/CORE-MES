# Kural - test eşlemesi (vardiya)

| Kural | Tanım | Test |
|---|---|---|
| VR-01 | Net süre = vardiya - molalar; gece yarısını geçen vardiya başladığı güne sayılır | kurallar.test.ts "VR-01: net süre..."; vardiya.test.ts "VR-01, VR-05..." |
| VR-02 | Tatil ve kapalı gün o gün başlayan vardiyaları sıfırlar (tesis geneli) | kurallar.test.ts "VR-01, VR-02..."; vardiya.test.ts "VR-02, VR-03, VR-10..." |
| VR-03 | Bugünden önceki takvim günü yalnız `vardiya.gecmis-yaz` ile değişir | vardiya.test.ts "VR-02, VR-03, VR-10..." (uç ve `disari.gunYaz`) |
| VR-04 | Planın okuma yolu `disari.ts` (calismaSuresi, calismaTakvimi, calismaTakvimleri) | vardiya.test.ts "VR-01, VR-04, VR-09...", "VR-07, VR-08 (K3)..." |
| VR-05 | Mola vardiyanın içinde, molalar çakışmaz; başlangıç ve bitiş aynı olmaz | kurallar.test.ts "VR-05..."; vardiya.test.ts "VR-01, VR-05..." (400) |
| VR-06 | Haftayı uygula: kaynak düzeni öbür aktif iş merkezlerine yazılır, eskisi silinir | kurallar.test.ts "VR-06..."; vardiya.test.ts "VR-06..." |
| VR-07 | Çalışma aralıkları: molalar dışarıda, önceki günden taşan gece vardiyası dahil, aralık dışı kesilir, bitişikler birleşir | kurallar.test.ts "VR-07..." (iki test); vardiya.test.ts "VR-07, VR-08 (K3)..." |
| VR-08 | Kaynak -> iş merkezi (makine istasyonundan, kişi en büyük yüzdeli atamadan); kişinin vardiyası varsa yalnız o; bağlanamayan null | kurallar.test.ts "VR-08..." (iki test); vardiya.test.ts "VR-07, VR-08 (K3)..." |
| VR-09 | Tesis geneli yazma yalnız iş merkezi kısıtı olmayan kişide; matris ve kişi vardiyası kapsamla | vardiya.test.ts "VR-01, VR-04, VR-09...", "VR-07, VR-08 (K3)..." |
| VR-10 | Temizle: Vardiya'nın kendi günleri silinir, İK tatilleri kalır; geçmiş günler yalnız geçmiş yazma işlemiyle silinir | vardiya.test.ts "VR-02, VR-03, VR-10..." |
| VR-11 | Planlı duruşun hedefi kapsamına uyar: tesiste hedef yok, iş merkezinde yalnız iş merkezi, istasyonda yalnız istasyon | kurallar.test.ts "VR-11..."; vardiya.test.ts "VR-11, VR-12, VR-14..." |
| VR-12 | Dakika hassasiyeti, bitiş başlangıçtan sonra; tekrarlı duruş 24 saatten kısa, haftalıkta en az bir gün, tekrar bitişi başlangıçtan önce değil | kurallar.test.ts "VR-12..."; vardiya.test.ts "VR-11, VR-12, VR-14..." (400) |
| VR-13 | Tesis geneli duruş yalnız iş merkezi kısıtı olmayan kişide; iş merkezi ve istasyon duruşu kişinin kapsamında | vardiya.test.ts "VR-13..." |
| VR-14 | Neden yalnız planlı kategoriden; pasif neden yalnız değişmeden kalırsa | vardiya.test.ts "VR-11, VR-12, VR-14..." |
| VR-15 | Aktif duruş takvim aralıklarından ve günlük dakikadan düşülür: tesis duruşu her kaynağa, iş merkezi duruşu o merkeze, istasyon duruşu yalnız o istasyona ve makinelerine (kişiye değil) | kurallar.test.ts "VR-15..." (iki test); vardiya.test.ts "VR-15..." |
| VR-16 | Arkon yolu `disari.ts` (`planliDurusYaz`, `planliDurusSilArkon`): `vardiya.durus-yaz` ister, kaynak kimliğiyle tek kayıt, Arkon sürümü kilitten sonra denetlenir, silinmiş kayıt kimlikle yeniden açılmaz | vardiya.test.ts "VR-16..."; arkon guvenlik.test.ts "planlı duruş Vardiya kaydıdır..." |
| VR-18 | Toplu matris: seçilen merkez ve günlerde ekle, kaldır ya da yalnız seçilenler; seçilmeyen gün ve merkez değişmez; kapsam dışı merkez varsa hiçbiri yazılmaz | kurallar.test.ts "VR-18..."; vardiya.test.ts "VR-18..." |
| VR-19 | Kopyala: kaynak haftası yalnız seçilen hedeflere; kaynak hedefte olamaz; her hedef kapsamda | vardiya.test.ts "VR-19..." |
| VR-20 | Kişi vardiyası toplu belirlenir ya da kaldırılır; kapsam dışı kişi varsa hiçbiri yazılmaz | vardiya.test.ts "VR-20..." |
| VR-21 | Fazla mesai: başlangıç ve bitiş aynı olamaz; hedef kapsamla tutarlı (iş merkezinde yalnız iş merkezi, istasyonda yalnız istasyon) | kurallar.test.ts "VR-21..."; vardiya.test.ts "VR-21, VR-22, VR-23..." (400) |
| VR-22 | Fazla mesai hedefi (istasyonda istasyonun iş merkezi) ve listedeki her kişi yazanın kapsamında; güncelleme ve iptalde eski kayıt da | vardiya.test.ts "VR-21, VR-22, VR-23..." ve "VR-24, VR-25, VR-26..." (kısıtlı 403, kişi ayrıntısıyla) |
| VR-23 | Geçmiş tarihli fazla mesai `vardiya.gecmis-yaz` ister | vardiya.test.ts "VR-21, VR-22, VR-23..." |
| VR-24 | Fazla mesai kapsamdaki makine, istasyon ve iş merkezi takvimine eklenir, kişiye yalnız listedeyse; vardiyayla örtüşen dakika iki kez sayılmaz, duruş düşer, gece yarısını geçen kayıt ertesi güne taşar; iptal takvime girmez | kurallar.test.ts "VR-24..." (iki test); vardiya.test.ts "VR-24, VR-25, VR-26..." |
| VR-25 | Kişinin onaylı izinli günü 0 dakika ve `izinli`; bekleyen ve reddedilen izin düşürmez | kurallar.test.ts "VR-25..."; vardiya.test.ts "VR-24, VR-25, VR-26..." |
| VR-26 | Kişi takviminde `yuzde` atama yüzdeleri toplamı / 100; atama yoksa null | kurallar.test.ts "VR-26..."; vardiya.test.ts "VR-24, VR-25, VR-26..." |
| VR-27 | Kişi takvimini (izin günleri) kişinin kendisi ve `ik.oku` görür; `arkon.amir` ya da `vardiya.yaz` taşıyan yalnız kişinin iş merkezi kapsamındaysa görür; kalan 403 (karar 140 a). Kişisiz kaynak oturumla açık | kurallar.test.ts "VR-27..."; vardiya.test.ts "VR-27 (karar 140 a)..." |
| Kısıt | `vardiya_ad_tekil`, `vardiya_sure_var`, `vardiya_matrisi_gun`, yabancı anahtarlar | vardiya.test.ts (aynı ad 409, olmayan iş merkezi ve kişi 409); `vardiya_planli_durus_*` denetimleri ve yabancı anahtarlar (VR-11..14 testleri) |
| VR-17 | Arkon vardiyaları `disari.vardiyaTanimlari` ile okur | arkon.test.ts "A7-V1" |
| A7 kopya | Arkon vardiyaları bir kez kopyalanır; aynı ad korunur; bozuk satır ve mola atlanır; Arkon belgesi değişmez | arkon-kopya-goc.test.ts (iki test) |
| VR-28 | (soru 142 b) Resmî tatilin sahibi İK: takvim günleri `ik/disari.resmiTatilGunleri` ile İK tatilleri + Vardiya'nın kendi günleridir (İK satırı `kaynak: 'ik'`); 142'den önce girilmiş Vardiya tatili tatil kalır ve Vardiya'dan silinir, aynı gün İK tatili kazanır; Vardiya tatil yazmaz (400), İK tatilini silmez (404); `resmi-tatiller` ucu yok | kurallar.test.ts "VR-28..."; vardiya.test.ts "VR-02, VR-03, VR-10, VR-28..."; istemci Vardiya.test.tsx "soru 142 b, 160 a..." |
