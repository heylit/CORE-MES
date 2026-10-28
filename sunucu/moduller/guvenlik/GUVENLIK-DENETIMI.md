# guvenlik: güvenlik denetimi

| Konu | Durum | Kanıt |
|---|---|---|
| Yetki | Her uç `uc({...})` ile işlem ister: okuma `guvenlik.oku`, her yazma kendi ucunda `guvenlik.yonet`; sayaç ucu oturum ister ve yetkisize sayı vermez | `uclar.ts`; test `G-19` |
| Kimin yaptığı | Onaylayan, kapatan kişi ve zaman sunucudan; gövde `strict`, kişi alanı kabul etmez | `servis.ts durumDegistir`; test `onay ve kapanış` |
| Eşzamanlılık | Onay ve kapanış `surum` ister; satır `FOR UPDATE` kilitlenir; eski sürüm 409 | `sorgular.ts alarmKilitle`; test aynı |
| Değişmezlik | Kapanan alarm değişmez, durum geri dönmez, kaynak değişmez, açık alarm silinmez, TRUNCATE red; tarama defteri yalnız eklenir | göç tetikleyicileri; test `G-10, G-13` |
| Gizli bilgi | Alarmda parola, oturum anahtarı ya da özeti yok; kaynak yalnız kullanıcı adı, IP, kişi kimliği | göç (sütun yok); test `G-14` |
| Kilit açma | Kendi ucunda `guvenlik.yonet`; açan kişi sunucudan; oturum tablosuna yalnız oturum `disari.ts` ile | `uclar.ts`; test `hesap kilidi` |
| Oturum kapatma | Oturum kimlikle kapanır, anahtar ya da özet dışarı çıkmaz; kendi oturumu kapatılamaz | oturum `disari.ts oturumuKapat`; test `oturumlar` |
| Denetim kaydı | Yazma uçları denetim kaydına düşer (yol kalıbı ve `parametre.id`) | test `onay ve kapanış` |
| Arama | Giriş listesinde arama `strpos`, LIKE joker karakteri yorumlanmaz | oturum `sorgular.ts denemeSatirlari`; test `guvenlik-okumalari` |
| Tarama | Tek kopya (advisory kilit); zamanlayıcı işi | `sorgular.ts taramaKilidiAl`; test `G-15`, `zamanlanmış iş` |
| Sunucu durumu | Salt okuma, `guvenlik.oku`; son hatalarda yalnız ileti, hata türü ve iletisi, zaman ve hata kodu (istek gövdesi ve başlığı yok); okunamayan kaynak "bilinmiyor"; ağ sürücüsündeki disk 2 sn'de bırakılır | `servis.ts sunucuDurumu`; test `sunucu durumu` |
| Dış çağrı | Yok: e-posta, SMS, telemetri, CDN yok; uyarı yalnız uygulama içinde | kod |
| Olay günlüğü | Windows'un kendi `eventcreate` aracı, kurum içi, dışarı çağrı değil; dakikada en çok bir olay | çekirdek `olay-gunlugu.ts` |
| Gerçek veri | Testlerde uydurma ad ve 10.0.0.0/8 adresleri | testler |

Açık risk (tarif notu): VPN adres paylaştırırsa (NAT) birçok kişi aynı IP'den gelir; G-03 yanlış alarm, G-20 körleşir.
Muafiyet ayarı boş başlar; VPN'in adres verme biçimi doğrulanmadı. `UYUM-BORCU.md` madde 4.
