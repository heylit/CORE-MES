# KURAL-TEST: nizamiye

| Kural | Test |
|---|---|
| NZ-01 yalnız beklenen ziyaret içeri alınır; habersiz gelen kayıt ve giriş tek komut | `NZ-01/02 giriş` (kurallar.test.ts), `NZ-01` (dört test, nizamiye.test.ts) |
| NZ-02 kimlik görülmeden girilmez; görülen kimliğin türü yazılır, son dört hane isteğe bağlı (NZM-5 a); atölye nedeninde (servis, denetim) kask ve gözlük işareti zorunlu; kimlikten yalnız son dört hane | `NZ-01/02 giriş`, `NZ-02` (üç test) |
| NZ-03 kart yalnız rafta boşsa ve kimsede değilse verilir (kısmi tekil indeks); ziyaretçiye yalnız ziyaretçi kartı | `NZ-03` (kurallar ve nizamiye.test.ts, taşeron kartı testi dahil) |
| NZ-04 yalnız içerideki çıkar; NZ-05 dizüstüyle girende çıkışta eşya kontrolü; teslim edilmeyen kart kayıp | `NZ-04/05` (iki test) |
| NZ-06 yalnız beklenen iptal edilir | `NZ-06` (iki test) |
| NZ-07 son giriş ya da çıkış 10 dakika içinde geri alınır; habersiz girişin geri alınması iptal; kart rafa ya da ziyaretçiye döner | `NZ-07` (dört test) |
| NZ-08 ön kaydı her çalışan kendi adına açar; ev sahibi oturumdan; yalnız kendininkini görür ve gelmeden iptal eder; başkasınınki 404 | `NZ-08` (iki test, nizamiye.test.ts) |
| NZ-09 ön kayıt bir saatten eski ya da 90 günden ileri açılmaz | `NZ-09` (kurallar.test.ts ve nizamiye.test.ts) |
| Gelmeyen ön kayıt kapıda en çok 24 saat kalır; kayıt silinmez, geçmişte beklenen | `gelmeyen ön kayıt kapıda` (nizamiye.test.ts) |
| Ekran: gecikme ve süre gün aşınca günle; beklenen saat bugünün değilse günüyle | `gorunum.test.ts` (3 test) |
| NZ-10 yalnız boş kart kayıp/hasarlı bildirilir; rafa yalnız kart yöneticisi alır | `NZ-10` (iki test) |
| NZ-K1 kartı yalnız kart yöneticisi ekler; numara tekil | `NZ-K1` |
| Görevli, numara ve zaman sunucudan; gövdedeki kişi alanı yok sayılır | `görevli kimliği sunucudan` |
| Geçmiş araması düz metin (LIKE işaretleri kaçırılır) | `geçmiş günün kayıtlarını verir` |
| Acil durum listesi içeridekiler ve yazdıran | `acil durum listesi` |
| Menü sayacı okumayana boş | `menü sayacı` |
| Ekran: kimlik EVET denmeden giriş kapalı, seçili kart gider, geri al; kimlik görülünce tür zorunlu (NZM-5 a, K24 a'yı kapsar); atölye kask; kart okutunca çıkış, eşya kontrolü; yetkiye göre düğmeler; kart rafı; acil durum yazdır | `Nizamiye.test.tsx` (8 test) |
| Ekran: Ziyaretçilerim üst çubukta oturuma açık; yalnız beklenen iptal; ön kayıt tesis saatiyle, ev sahibi alanı olmadan, istek kimliğiyle | `Ziyaretcilerim.test.tsx` (3 test) |
| PDKS dosyası: başlık, boş satır, tesis saati; bozuk ve ileri zamanlı satır hatada | `kurallar.test.ts` `PDKS dosyası` |
| PDKS: son hareketi giriş olan içeride, 24 saatten eski giriş sayılmaz | `kurallar.test.ts` `PDKS: son hareketi` |
| PDKS aktarımı yalnız `nizamiye.pdks-aktar` (259 a); eşleşmeyen sicil raporlanır, ikinci aktarım hareket yazmaz, istek kimliği | `PDKS dosyasını yalnız aktarma yetkilisi aktarır` |
| Ekran: PDKS yoksa personel "—"; personel listesi; dosya üst çubuktan aktarılır, sonuç görünür | `Nizamiye.test.tsx` (3 test) |
| PDKS kart okuyucu: ağ, kayıtlı adres, anahtar, etkin cihaz; ham gövde saklanır; dosyadan gelmiş hareket ikinci kez yazılmaz; anahtar yenilenince eskisi geçmez | `PDKS kart okuyucu (289 b)` |
| PDKS kart okuyucu ham gövdesi saklama süresinde silinir, 30 günden yenisi silinemez | `PDKS kart okuyucunun ham gövdesi` |
| PDKS kart okuyucu gövdesi başlıksız, 24 saatten eski satır alınmaz | `kurallar.test.ts` `PDKS kart okuyucu gövdesi` |
| Cihaz kapısı: dakikada 60, art arda 5 hatada 1 dk, ikiye katlanarak 1 saate kadar | `kurallar.test.ts` `PDKS cihaz kapısı` |
| Cihaz ağı yalnız kurum içi, döngü adresi yok; saklama süresi 30-3650 | `ag.test.ts` |
| Personel kartı (1326): yalnız PDKS aktaran kaydeder; kişi başına bir etkin kart, kart bir kişide; numara düz saklanmaz; kaldırılan kart kimseyi bulmaz | `personel-kart.test.ts` (3 test) |
| Ekran: personel kartı kart okuyucu ekranında; kişi seçilmeden kart alanı kapalı; kaldırma önce sorar | `Nizamiye.test.tsx` `personel kartı` |
| Ekran: Giriş/Çıkış işlem paneli açılınca görünür alana gelir (dar ekranda liste altında) | `Nizamiye.test.tsx` `Giriş ve Çıkış işlem panelini` |
| Ekran: sunucunun adını verdiği hata o alanda görünür; kapı listesi ikinci main açmaz; giriş iletisi bildirimin yerini söyler (NZM-5 a) | `Nizamiye.test.tsx` `sunucunun alan adını`, `kapı listesi kabuğun` |
