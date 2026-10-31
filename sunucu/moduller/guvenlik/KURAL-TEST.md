# guvenlik: kural ve test eşlemesi

Saf testler `kurallar.test.ts`, akış testleri `guvenlik.test.ts` (gerçek PostgreSQL), ekran testleri `istemci/src/moduller/guvenlik/guvenlik.test.tsx`.
Her kural için izin verilen ve reddedilen durum aynı testte sınanır.

| Kural | Kabul | Red | Test |
|---|---|---|---|
| G-01 kapsam yalnız güvenlik sinyali | dört sinyal | başka sinyal CHECK'e takılır (`guvenlik_alarmi_sinyal_gecerli`) | `veritabanı kısıtları` (kabul: tarama testlerindeki dört sinyal) |
| G-02 hatalı giriş serisi (10 / 15 dk, orta) | 10 deneme açar | 9 açmaz | `G-02: ...` (saf); `G-02, G-03, G-20: tarama ...` |
| G-03 yayılan deneme (3 ad / 60 dk, yüksek) | 3 ad açar | 2 ad ya da hatasız ad açmaz | `G-03: ...`; akış aynı |
| G-04 cihazı boş deneme | G-02'de tek kaynak | G-03 ve G-20'de sayılmaz | `G-04: ...` |
| G-05 çok oturum (4, orta) | 4 açar | 3 açmaz | `G-05: ...` (saf ve akış) |
| G-06 kaynak başına tek kapanmamış alarm | ikinci tarama yeni satır açmaz | elle ikinci satır `guvenlik_alarmi_acik_tekil` | `veritabanı kısıtları` |
| G-07 süren koşul sayaç günceller | yeni hatalı ya da büyüyen sayı günceller | aynı veri dokunmaz | `G-07: ...` |
| G-08 kapanan alarm yeniden açılır | kapanmış kaynağa yeni alarm | açık varken yeni yok | `G-08, G-09: ...` |
| G-09 kendiliğinden kapanmaz | insan kapatır | tarama koşul bitince kapatmaz | `G-08, G-09: ...` |
| G-10 durum yalnız ileri | açık->onaylandı->kapandı, açık->kapandı | geri dönüş tetikleyicide red, servis 422 | `G-10: ...` (saf); `G-10, G-13: ...`; `onay ve kapanış` |
| G-11 onay ve kapanış kişi ve zamanla | sunucu yazar | kişisiz onay `guvenlik_alarmi_onay_butun`, `_kapanis_butun` | `veritabanı kısıtları`; `onay ve kapanış` (gövde kişi seçemez) |
| G-12 kapanış notu dolu | notlu kapanır | boş not 400 ve `guvenlik_alarmi_not_gecerli`; ekran notsuz göndermez | `onay ve kapanış`; `veritabanı kısıtları`; ekran `kapatma notsuz gönderilmez` |
| G-13 kapanan değişmez, saklama | süresi geçmiş kapalı silinir | açık silinmez, kapanan değişmez, boşaltılamaz | `G-10, G-13: ...`; `G-13 saklama: ...` |
| G-14 gizli bilgi yok | cevap yalnız izinli alanlar | parola, anahtar alanı yok | `G-18: ... G-14: ...` |
| G-15 tek kopya tarama | kilidi alan yazar | alamayan `null`, hiçbir şey yazmaz | `G-15: ...` |
| G-16 defter yalnız yeni alarmda | yeni alarm satır yazar | yenisiz tur yazmaz; `guvenlik_taramasi_yeni_alarm_gecerli` | `G-02, G-03, G-20: ...`; `veritabanı kısıtları` |
| G-17 tarama durdu | 5 dk içi durmadı | 5 dk + 1 sn ya da kayıt yok durdu | `G-17: ...` |
| G-18 sıra ve varsayılan görünüm | önem, son görülme; etkin | kapanmış etkin görünümde yok | `G-18: ...`; ekran `varsayılan görünüm "etkin"` |
| G-19 yetki | yönetici okur ve yönetir | oturumsuz 401, müdür 403; okuyan ekranda düğme görmez | `G-19: ...`; `oturumlar: ...`; ekran `yalnız okuma yetkisi` |
| G-20 hedefli hesap (3 cihaz / 60 dk, yüksek) | 3 cihaz açar | 2 cihaz açmaz | `G-20: ...`; akış aynı |
| Sürüm (eski sürüm) | doğru sürüm yazar | eski sürüm 409, ekran güncel hali okur | `onay ve kapanış`; ekran `eski sürümde onay yazılmaz` |
| Oturum kapatma | başkasının oturumu | kendi oturumu 422, olmayan 404, müdür 403 | `oturumlar: ...`; ekran `hesap kilidi yokken` |
| Hesap kilidi alarmı (orta) | yeni kilit alarm açar; kapanandan sonraki kilit yeniden açar | aynı kilit ikinci taramada ve kapanmış alarmdan sonra açmaz | `hesap kilidi: ...` (saf ve akış) |
| Kilit listesi ve açma | yönetici okur ve açar, açan kişi yazılır | müdür 403, oturumsuz 401, ikinci açma 404; okuyan ekranda düğme görmez | `hesap kilidi: ...`; `G-19`; ekran `kilitli hesap listelenir` |
| VPN muafiyeti (G-03, G-20) | aralık dışı cihaz alarm açar; G-02 sürer | aralıktaki cihaz G-03 ve G-20 açmaz; hatalı aralık 400 | `VPN muafiyeti` (saf); `VPN aralığı: ...`; ekran `VPN aralığı doluysa` |
| Devredilmezlik | | `guvenlik.oku`, `guvenlik.yonet` kişiye verilemez (422) | kisiler `ek-islem.test.ts` "KS-4: bayraklı kişi, kayıtsız işlem ve devredilmez ..." |
| G-23 koruma: yedek | yedek açık, son yedek süresinde | kapalı yedek "kapalı"; eski ya da hiç yedek "uyarı"; okunamayan "bilinmiyor" | `G-23: ...` (saf); `koruma: kaynak okunamazsa ...` |
| G-24 koruma: güncelleme imzası | geçerli anahtarla kanal "açık" | anahtarsız ya da klasörsüz "kapalı", geçersiz anahtar "uyarı", okunamayan "bilinmiyor" | `G-24: ...`; `koruma: ...` |
| G-25 koruma: HTTPS | iki değişken varsa "açık" | yoksa "kapalı"; okunamayan "bilinmiyor" | `G-25: ...`; cekirdek `https-durumu.test.ts` |
| G-26 koruma: sertifika (30 gün) | 30 gün ve üstü "açık" | 30 günden az "uyarı", dolmuş "kapalı", okunamayan "bilinmiyor", HTTPS kapalıysa "kapalı" | `G-26: ...`; `https-durumu.test.ts` |
| G-27 koruma: denetim kaydı | yazılır ve değiştirme koruması etkin "açık", değer son kaydın zamanı | koruma yoksa "uyarı", yazılamıyorsa "kapalı" | `G-27: ...`; `özet, girişler, koruma ve kurallar` |
| Bilinmeyen değer | | sıfır uydurulmaz: `null` ya da "bilinmiyor" | `özet, girişler, koruma ve kurallar`; ekran `Veri yok`, `Bilinmiyor` |
| G-28 reddedilen istek kaydı (1363 a) | kapı, kapsam ve adres-yok reddi nedeni, kişisi, yol kalıbı ve cihazıyla tabloya geçer | izinli istek yazılmaz; adresteki sorgu yazılmaz | çekirdek `uc-red-kaydi.test.ts`; `reddedilen istek tarama turunda ...` |
| G-29 yetki reddi serisi (5 farklı uç ya da 10 kapsam / 15 dk, yüksek) | eşikte açar | aynı ucu yoklamak, cihaz ve dosya türü reddi açmaz | `yetki reddi serisi: ...` (saf ve akış) |
| G-30 adres taraması (5 farklı yok adres / 15 dk, kritik) | eşikte açar; yöneticiye bildirim ve olay günlüğü | 4 adres açmaz; süren koşul ikinci duyuru yapmaz; müdür bildirim almaz | `adres taraması: ...` (saf ve akış) |
| G-31 ret kaydı saklama (90 gün) | süresi geçen satırı tarama siler | genç satır silinmez, değişmez, boşaltılamaz; kişisiz yetki reddi kısıta takılır | `saklama: ...` |
| G-32 Reddedilen istekler listesi (1370 a) | `guvenlik.oku` okur; neden ve metin süzgeci sunucuda | müdür 403; bilinmeyen neden 400 | `reddedilen istek tarama turunda ...`; ekran `Güvenlik Merkezi reddedilen istekler` |
