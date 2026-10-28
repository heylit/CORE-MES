# Kural -> test: dosya

Sahip: çekirdek konusu. Test adları dosyadaki adın başıdır; `dosya.test.ts` gerçek PostgreSQL ve gerçek giriş, `kurallar.test.ts` saf.

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| DSK-01 Aynı içerik iki kez yüklenince tek dosya satırı; ilk kez gönderen bütün içeriği gönderir | `DSK-01 aynı içerik iki kez yüklenince ...` (A ikinci kez "tamam") | aynı test: B ilk parçada "tamam" almaz, eksikler listesinde kalır; ikinci yükleme satır eklemez |
| DSK-02 Özet tutmazsa şerit atılır, 400 | `DSK-01 ...` (tutan özet) | `DSK-02 özet tutmazsa şerit atılır, 400; dosya oluşmaz` |
| DSK-03 Dosya sınırı 413, depo toplamı 429 | `DSK-03 ...` (sınırın tam üstü geçer) | aynı test: 413 ve şerit atılır; 429 ve başkasının şeridi kalır |
| DSK-04 Kişi başına 5 açık yükleme; en eskisi atılır | `DSK-04 kişi kotası: ...` (altıncı yükleme kabul) | aynı test: en eski şerit yok, başkasınınki var |
| DSK-05 Tür ilk baytlardan; tanınmayan içerik 400 | `kurallar.test.ts` `DSK-05 tür ilk baytlardan bulunur: ...`; `dosya.test.ts` `DSK-05 ...` (PDF kabul) | `kurallar.test.ts` `DSK-05 tanınmayan içerik türsüzdür: ...`; `dosya.test.ts` `DSK-05 ...` (HTML 400) |
| DSK-06 Başkasının şeridine yazılamaz ve onu engelleyemez | `DSK-06 ...` (A yüklemesini tamamlar) | aynı test: B'nin bozuk parçası yalnız B'nin şeridini düşürür |
| DSK-07 Bağsız dosyayı yalnız yükleyen okur | `DSK-07 ...` (yükleyen 200, içerik aynen) | aynı test: başkası 404, oturumsuz 401, bağlanınca 404 |
| DSK-08 Bağsız dosya 7 gün sonra silinir; bağlı silinmez | `DSK-08 ...` (6 günlük kalır, bağlı kalır) | aynı test: 8 günlük bağsız silinir; bağlı dosyayı SQL ile silmek reddedilir |
| DSK-09 İndirme bağlayan modülün işlemiyle; ikili cevap başlıkları | `DSK-09 ...`; `uc-ikili.test.ts` `ikili cevap: içerik transaction bittikten sonra ...` | `DSK-09 ...` (işlemsiz 403, bağı olmayan kayıt 404); `uc-ikili.test.ts` `... yetkisiz 403`, `... boyutu tutmayan akış bağlantıyı keser` |
| DSK-10 Bağlama ve kaldırma denetime içeriksiz girer; yükleme gövdesiz | `DSK-10 ...` (`_ek` satırları) | aynı test: yükleme kaydında yalnız `_ozet`, içerik yok |
| Bağ modülün tür ve boyut sınırına uyar | `kurallar.test.ts` `bağ sınırı: ...`; `dosya.test.ts` `bağ: modül sınırı ...` | aynı testler: izinsiz tür 400, büyük 413, yüklenmemiş özet 400 |
| Akış ve liste yalnız verilen kaydın dosyası | `bağ: ...` (kendi kaydı) | aynı test: başka kayıt ve başka modül `null` / boş |
| DSK-11 Bağlamayı yalnız içeriği kendisi gönderen yapar | `DSK-11 ...` (doğru içerikten sonra bağlar) | aynı test: özeti bilen ret, yanlış içerikle 400 ve yine ret |
| DSK-12 Kişinin bağsız dosyaları 2 GiB | `kurallar.test.ts` `kota: ...`; `DSK-12 ...` (sınırın tam üstü, bağlayınca yer açılır) | aynı testler: `kotaBagsiz`, 429 |
| DSK-13 Bayat şerit bütün olarak silinir | `DSK-13 ...` (yeni parçası olan şerit kalır ve tamamlanır) | aynı test: bütün parçası eski şerit silinir |
| DSK-14 Bağ kaldırılınca sayım eşzamanlı kaldırmada da başlar | `DSK-14 ...` | dosya satırı kilidi kaldırılınca aynı test kırmızı (mutasyonla denendi) |
| Yükleme uçları oturum ve biçimli özet ister | `yükleme uçları: ...` (biçimli özet 200) | aynı test: oturumsuz 401, biçimsiz özet 400, şerit yazılmaz |
| DSK-15 Diske alınan medya özet adlı yazılır, parçaları silinir, okunur | `disk-deposu.test.ts` `bağlanan resim ve video ...` | içerik özetle uyuşmazsa `diskeYaz` hata verir |
| DSK-16 Canlıda disk deposu kapalı | `disk-deposu.test.ts` `canlıda disk kapalı ...` | aynı test: video bağlanmaz |
| DSK-17 Künyesi silinen diskteki dosya 30 gün bekler | `disk-deposu.test.ts` `bağı kalkan diskteki dosya ...` | aynı test: yeniden bağlanan kalır |
