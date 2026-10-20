# GUVENLIK-DENETIMI: satin-alma (kart #162, dal 162-satin-alma-uyum)

Her uç `uclar.ts`'te `uc({...})` ile; zaman ve kişi sunucudan (onay, hareket, teslim alan, açan). Testler `satin-alma.test.ts` (gerçek PostgreSQL).
"Test" sütunundaki adlar test başlığının başıdır. YOK: o yön için test yok (bu turda yazılmadı, borç).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /satin-alma-acilis` | `satin-alma.oku`, `yaz`, `onayla` ya da `ayar` | yalnız talep açabilen 403 (#375): bütçe, onay limiti, kur ve teklif talep edene gitmez; tedarikçi listesi yalnız tam görene (SAT-53, SAT-65) | SAT-53 SAT-65 #375 | SAT-53 SAT-65 #375 (talep eden, depo, operatör 403; kimliksiz 401) |
| `GET /satin-alma-taleplerim` | `satin-alma.talep-ac` | yalnız kişinin kendi talepleri; fiyat, teklif, tedarikçi, karar yok (#375) | #375 taleplerim | #375 (operatör 403; başkasının talebi yok) |
| `POST /satin-alma-talepleri/hizli-ac` | `satin-alma.talep-ac`; tekrar korumalı; tam denetim (gövde deftere girer) | yalnız oturumdaki kişi adına, gövdedeki kişi alanı yok sayılır; aktif ve talep türüne uyan kart (#375; SAT-75: hizmet talebi yalnız alınan hizmet) | #375 hızlı talep, SAT-75 | #375 (geçersiz kalem ve kart 400, operatör 403, kimliksiz 400); #1192 (hizmet talebinde alınan hizmet geçer; verilen hizmet, malzeme kartı ve türsüz gövdede hizmet kartı 400) |
| `POST /satin-alma-talepleri/ac` | `satin-alma.talep-ac`; tekrar korumalı | talep eden teklifsiz ve kararsız taslak açar (SAT-64); başkası adına açılan kişi var olmalı; numara sunucuda (SAT-01, SAT-06) | SAT-01 SAT-06; tekrar koruması | SAT-01 SAT-06 (operatör 403); SAT-64; tekrar koruması (kimliksiz 400) |
| `POST /satin-alma-talepleri/:id/kaydet` | `satin-alma.talep-ac` + servis: değişikliğin türüne göre `yaz` / `onayla` / `teslim-al` (V-33) | sürüm (SAT-45); durum geçişi (SAT-07); dört göz (SAT-30); toplam ve revizyon sunucuda (SAT-13); karar varken teklif silinmez (SAT-67) | SAT-70; SAT-29 SAT-30 | SAT-64; SAT-45; SAT-29 SAT-30 (satın alma onay 403); SAT-37 SAT-38 (satın alma teslim 403) |
| `POST /satin-alma-talepleri/:id/sil` | `satin-alma.talep-ac` + servis: kendi taslağı ya da `yaz` | yalnız taslak (SAT-66); sürüm | SAT-66 SAT-67 | SAT-66 SAT-67 (başkası 403, karar varken 422) |
| `GET /satin-alma-firma-secenekleri` | `satin-alma.yaz` | finans firması adla aranır (en az 2 harf) | SAT-41 (arama) | SAT-41 (arama: talep eden 403, tek harf 400) |
| `POST /satin-alma-tedarikcileri/kaydet` | `satin-alma.yaz` | yeni tedarikçi finansta aktif firma (SAT-41); bir kez; sürüm | SAT-41 | SAT-41 (pasif ve olmayan firma 422, ikinci kez 409, talep eden 403); geçici karşılık (finans yokken 422) |
| `POST /satin-alma-tedarikcileri/:id/sil` | `satin-alma.yaz` | teklifte kullanılan silinmez (SAT-42) | YOK | SAT-42 (409) |
| `POST /satin-alma-katalogu/kaydet` | `satin-alma.talep-ac` + servis: düzenleme `yaz`; tekrar korumalı | yalnız aktif malzeme kartı bağlanır (SA2 b); talep eden de ekler; sürüm | SAT-58 SA2 SAT-59; tekrar koruması | SAT-58 SA2 SAT-59 (talep eden düzenleme 403, olmayan ve taslak kart 400); tekrar koruması (kimliksiz 400) |
| `GET /satin-alma-malzeme-secenekleri` | `satin-alma.talep-ac` | aktif kart adla, kodla ya da no ile aranır (boş arama ilk 50); tür süzgeci sunucuda (SAT-75) | SAT-58 SA2 SAT-59 SAT-75 | #1192 (hizmet listesinde verilen hizmet ve malzeme yok; malzeme listesinde hizmet yok; bilinmeyen tür 400) |
| `POST /satin-alma-katalogu/:id/sil` | `satin-alma.yaz` | kullanılan silinmez; sürüm | YOK | SAT-58 SAT-59 (409) |
| `POST /satin-alma-ayarlari/kaydet` | `satin-alma.ayar` | sürüm | SAT-69 | SAT-69 (müdür 403, eski sürüm 409) |
| `GET /satin-alma-ayarlari/sirket-adi` | `oturum` | yalnız şirket adı; ayarın geri kalanı gitmez | SAT-72 (operatör 200) | SAT-72 (oturumsuz 401) |
| `GET /satin-alma-teslimleri` | `satin-alma.teslim-al` | fiyatsız (SAT-37) | SAT-37 SAT-38 | SAT-37 SAT-38 (satın alma 403) |
| `POST /satin-alma-siparisleri/teslim-al` | `satin-alma.teslim-al`; tekrar korumalı | teslim sipariş tarihinden önce olamaz; kişi sunucudan; bütün siparişler gelince talep tamamlanır | SAT-37 SAT-38; tekrar koruması | SAT-37 SAT-38 (erken tarih 400); tekrar koruması (kimliksiz 400) |

## Denetim kaydı
Bütün yazma uçları gövdeyi denetime TAM yazar (`denetim` seçeneği yok). Kullanıcı kararı S2 (teklif değişikliği özetle) çekirdek bekliyor: CEKIRDEK-ISTEKLERI.md Ç2, UYUM-BORCU 13.

## Yalnız ekranda kalan kurallar
- Ağırlık önayarları, puan, sıralama, net bugünkü maliyet, dağıtım: ekranda hesaplanır, kaydedilmez (kullanıcı kararı 10, NOTLAR.md); yetki değildir.
- Menüde bölümün görünmesi (`SATIN_ALMA_IKINCI_MENU` madde işlemi) yalnız görünürlüktür; veri yetkisi sunucudadır.
- Teklif girişinde aynı tedarikçinin iki sütunda seçilmemesi (`ui.ts` toplu teklif): ekranda.

## Açık yetki konuları (bu turda kapanmadı)
- Rol x işlem satırları yok; işlemler yalnız bayraklı yöneticide (UYUM-BORCU 6).
- Veri kapsamı uygulanmaz (VARSAYIM, UYUM-BORCU 12).

## Kart #1124 uçları

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /satin-alma-talepleri/:id/siparis-takibi` | `satin-alma.oku` ya da `yaz` | fatura tutarı gelmez (FNS-48) | SAT-73 SAT-74 FNS-63 FNS-64 #1124 (satın alma, müdür) | aynı test (talep eden 403) |
| `POST /satin-alma-talepleri/:id/odeme-plani` | `satin-alma.yaz`; tam denetim | sürüm (409); sipariş durumu ve siparişin varlığı (SAT-73); firma ve para birimi sunucudan; satır sırası ve sayısı, fatura kilidi (FNS-63, FNS-64); tutar > 0, yöntem listesi (şema) | aynı test | aynı test (müdür ve talep eden 403, eski sürüm 409, siparişsiz 422, faturalı 422, geçersiz satır 400) |

SAT-76 (19.10.2026, karar 87): `satin-alma-talepleri/:id/kaydet` askıdaki tedarikçiye yeni sipariş açmaz (422); izinli ve reddedilen test `satin-alma.test.ts` "SAT-76" (askıdan çıkınca verilir, var olan sipariş düzenlenir).
SAT-75 (14.10.2026): `satin-alma-katalogu/kaydet`, `satin-alma-talepleri/ac` ve `/:id/kaydet` da yalnız satın alınabilir kartı bağlar (fiziksel ya da alınan hizmet); izinli ve reddedilen test `satin-alma.test.ts` "SAT-75: katalog ve tam talep".

SAT-77 (19.10.2026, kg fiyatları): `GET /satin-alma-kg-fiyatlari`, `/gecmis` ve `/malzemeler` `satin-alma.oku`, `yaz` ya da `finans.maliyet-oku` (215 a, yetki genişletme onaylı); `POST /satin-alma-kg-fiyatlari/ekle` `satin-alma.yaz`, tekrar korumalı. Kişi ve zaman sunucudan; tablo yalnız eklenir (tetikleyici). İzinli ve reddedilen test `satin-alma.test.ts` "SAT-77" (müdür okur, yazamaz; operatör 403; sıfır, eksi, bilinmeyen para birimi ve bozuk tarih 400, hiçbir satır yazılmaz).
