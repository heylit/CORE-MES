# Kural -> test: cizimler

`cizimler.test.ts` gerçek PostgreSQL ve gerçek giriş; `kurallar.test.ts` saf; `istemci/src/moduller/cizimler/cizimler.test.tsx` ekran. Test adları başlığın başıdır.

| Kural | İzinli test | Reddedilen test |
|---|---|---|
| CZ-01 Belgeyi `cizimler.yaz` açar; ilk revizyon A ve taslak | `CZ-01 ...` | aynı test: yetkisiz 403, belge açılmaz |
| CZ-02 Sayfası ya da `cizimler.oku` olan okur; menü sayacı okuyamayana boş | `CZ-02 ...` | aynı test: 403, sayaç `{}` |
| CZ-03 Dosya türü belge türüne uyar | `CZ-03 dosya türü ...` (STEP), `CZ-03 GLB ...` (GLB 3B modele), `CZ-03 rapor ...` (rapor PDF, stok ve iş emri bağı); `kurallar.test.ts` `CZ-03 ...` | aynı testler: 3B modele PDF 400, teknik resme GLB 400 |
| CZ-04 Revizyon harfi sıradan; bağlamayı içeriği yükleyen yapar | `kurallar.test.ts` `CZ-04 revizyon harfi ...` | `CZ-04 içeriği kendisi yüklemeyen ...`; harf: sıfır ve eksi |
| CZ-05 Yayınlama ayrı işlem; yeni yayın eskisini eskiye düşürür; eski yeniden yayınlanır | `CZ-05 yayın: ...`; `kurallar.test.ts` `CZ-05 ...` | `CZ-05 yayınlama ayrı işlemdir ...` (403); yayındakini yeniden yayınlama 409 |
| CZ-06 Aynı dosya bir belgede tek revizyon | `CZ-06 ...` (başka belgede olur) | aynı test: 400 |
| CZ-07 Yalnız taslak silinir, son revizyon silinmez; yayınlanmış revizyon değişmez | `CZ-07 yalnız taslak ...`; `kurallar.test.ts` `CZ-07 ...` | `CZ-07 veritabanı: ...` (tetikleyici, kısmi tekil dizin) |
| CZ-08 Arşivdeki belge değişmez; arşiv ayrı listelenir | `CZ-08 ...` (arşivden çıkınca eklenir) | aynı test: 409 |
| CZ-09 Merkezden malzeme bağı (istasyon bağı CZ-14); dosya bağlı kayıttan ve yalnız yayındaysa akar | `CZ-09 merkezden ...`, `CZ-09 disari: ...` | aynı testler: ikinci bağ 409, başka modül 400, taslak ve bağsız kayıt `null` |
| CZ-10 Sürüm denetimi | `CZ-10 ...` (güncel sürüm) | aynı test: 409 |
| CZ-11 Revizyon dosyası içeriğiyle akar | `CZ-11 ...` | aynı test: başka belgenin revizyonu 404 |
| CZ-12 Belge açma tekrar korumalı | `CZ-12 ...` | aynı test: başlıksız 400, ikinci belge açılmaz |
| CZ-13 Başka modül kaydına sertifika ya da rapor açılır, yayınlanır ve bağlanır; yetki çağıranındır | `CZ-13 disari: belgeAcVeBagla sertifikayı ...` | `CZ-13 disari: ... hiçbir şey bırakmaz` (türe uymayan ve başkasının dosyası; belge kalmaz) |
| CZ-14 Merkezden 3B model istasyona bağlanır (makine eşleştirmesi, kart #1196); istasyon başına tek 3B model, yeni bağ eskisinin yerini alır | `CZ-14 merkezden 3B model ...`; `kurallar.test.ts` `CZ-14 ...` | aynı test: yetkisiz 403, başka tür 400, olmayan istasyon 400 |
| CZ-16 3B listesi iki sekmede: istasyona (makineye) bağlı model "Makineler 3B", geri kalanı (bağsız ve malzemeye bağlı dahil) "Malzemeler 3B"; veri değişmez, süzgeçsiz liste aynı | `CZ-16 3B listesi ...`; istemci `CZ-16: 3B bölümü ...` | aynı test: geçersiz süzgeç 400; öbür bölümlerde sekme ve süzgeç yok |
| Ekran: okur yazma düğmesi görmez; yayınlama yalnız `cizimler.yayinla` ile; yayın sürümü taşır | `cizimler ekranları` grubu | aynı grup |
| Ekran: parçalı yükleme, eksik olmayan dosya yeniden gönderilmez; http'de SHA-256 yazılımla | `cizimler dosya aktarımı` grubu | aynı grup: boş dosya istek atmadan reddedilir |
