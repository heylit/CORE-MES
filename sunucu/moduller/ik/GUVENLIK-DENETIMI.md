# GUVENLIK-DENETIMI: ik (kart #740)

Uçlar `uclar.ts`'te `uc({...})` ile. Okuma uçları `oturum`; cevap kişinin rolüne ve kapsamına göre serviste süzülür (`servis.ts gorunur`).
Yazma uçları adından belli ve kendi işlemiyle; kayıt zamanı ve kişi sunucudan; sürüm denetimi her yazmada.
Testler: `ik.test.ts`, `bordro-onayi.test.ts` (gerçek PostgreSQL, gerçek giriş; rolleri sınama kendisi verir), `kurallar.test.ts`, `eslesme.test.ts`, `sema.test.ts`.
Ayrıntılı kural -> test eşlemesi: `KURAL-TEST.md`.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /ik/ben`, `/ik/veri`, `/ik/menu-sayaclari` | oturum | rol (ik / yönetici / çalışan) işlemden ve ekipten; iş merkezi kapsamı; ekip kaydında ücret, kimlik, banka yok; çalışan yalnız kendi devamını görür (IK-21, 24, 25, 27, 30, 31, 35); değişiklik geçmişi de kapsamla süzülür (IK-51) | "IK-21, IK-24, IK-25", "IK-30, IK-31, IK-35", "IK-51" | aynı testler (ekip dışı görünmez, eşleşmeyen kişi boş) |
| `GET /ik/ozet` | `ik.oku` | yalnız iki sayı (izinli, raporlu), kişi adı yok; okuyanın iş merkezi kapsamıyla süzülür (IK-53) | "IK-53" | aynı test (403) |
| `POST /ik/<alan>/:kimlik/kaydet`, `/iptal`, `/toplu-kaydet` | alanın işlemi (`ik.personel-yaz`, `ik.izin-yaz`, `ik.devam-yaz`, ...) | sürüm 409; zorunlu alan 400; izin günü 0 ile takvim günü arasında (IK-52); bağlı kayıt; kapsam; ücret alanı `ik.ucret-yaz` ister (IK-0, 4, 13, 18, 19, 22, 23) | "IK-0", "IK-19, IK-23" | "IK-0", "IK-13" (403), "IK-19, IK-23" (409) |
| `POST /ik/izinler/:kimlik/talep` | `ik.izin-talep` | yalnız kendi adına, bekleyen durumda; tarihleri sunucu yazar (IK-3, 9) | "IK-9, IK-3" | aynı test |
| `POST /ik/izinler/:kimlik/karar` | `ik.izin-onay` | yalnız ekibine; kendine karar yok; sonuçlanmış izin değişmez (IK-5, 6, 7, 8) | "IK-7, IK-8" | "IK-7, IK-8", "IK-5, IK-6" |
| `POST /ik/pozisyonlar/:kimlik/onayla` | `ik.pozisyon-onay` | dört göz (ayarlı); onaylı pozisyonun kadrosu (IK-10, 11, 12) | "IK-10, IK-11, IK-12" | aynı test; kısıt `ik_pozisyon_dort_goz` |
| `POST /ik/devam/:kimlik/onay` | `ik.devam-onay` | yalnız onay değişir, içerik okunan hâliyle; sürüm; kendi devam kaydına onay yok; kaydet ucunda yetkisizin onayı "Beklemede"ye döner (IK-77, 78); eksi süre ve bütçe 400 ve kısıt (IK-79) | "IK-77, IK-78", "IK-79" | aynı testler (403, 404, 400) |
| `GET /ik/veri`, `POST /ik/personel/:kimlik/kaydet` (özel veri) | `ik.ozel-veri-oku` | kan grubu ve engel durumu yetkisiz kişiye dönmez (kişinin kendi kaydı hariç), yetkisiz değişikliği 403, boş gönderim eski değeri korur (IK-73); geçmişte IBAN, ücret, kan grubu ve engel değeri yok (IK-72) | "IK-73", "IK-72" | "IK-73" (403) |
| `POST /ik/personel/:kimlik/iletisim` | oturum | yalnız kendi personel kaydının iletişim alanları (IK-14) | "IK-14" | aynı test |
| `POST /ik/bordro/:donem/kesinlestir` | `ik.bordro-kesinlestir` | bordro sunucuda hesaplanır; kesinleşmiş ay `ik.bordro-kilit-ac` ister (IK-15, 16, 17) | "IK-15, IK-16, IK-17" | aynı test |
| `POST /ik/bordrolar/:kimlik/gordum` | `ik.bordro-gordum` | yalnız kişinin kendi, kesinleşmiş bordrosu; sürüm; tek onay; yalnız ekleme defteri (IK-40..46) | "IK-40..IK-46" | "IK-41" (409), "IK-40..IK-46" (403, 400, 409), "IK-42" (değişmez, silinmez) |
| `POST /ik/ayarlar/kaydet` | `ik.ayar-yaz` | tanımsız ayar 400; kilitli parametre dönemi değişmez (IK-20) | "ayarlar tablolara ayrışır" | "IK-20" |
| `GET /ik/puantaj` | oturum | İK yalnız iş merkezi kapsamındaki personeli (IK-27), öteki roller yalnız kendini görür (IK-67); başkası istenirse 404 | "kişi sayfası ve matris aynı kaydı okur" | "IK-67" (404) |
| `POST /ik/puantaj/yaz` | `ik.devam-yaz` | tek işlem; kapsam (IK-27); saat ve durum (IK-61, 62); tarih (IK-63, 64); kesinleşmiş ay (IK-65); sürüm 409 (IK-66); yazan ve zaman sunucudan | "IK-66", "toplu yazma tek işlemdir" | "IK-67" (403), "IK-27" (403), "IK-61, IK-62" (400), "IK-63, IK-64" (422), "IK-65" (403), "IK-66" (409) |

Yalnız ekranda kalan kurallar: `UYUM-BORCU.md` "Ekranda kalan kurallar" (izin bakiyesi, tazminat, maliyet planı, Excel doğrulamaları ve benzeri).
Tekrar koruması: bordro kesinleştirme istek kimliği taşımıyor (UYUM-BORCU).
