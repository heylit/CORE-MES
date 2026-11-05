# UYUM BORCU: bildirim

## Bağlamada kapanacak
1. Dört olayın tetik çağrısı sahibi modüllerde yazılacak (satın alma, siparişler, İK, istasyonlar); bu dal o modüllere yazmaz. Liste `BASKA-MODUL-ISTEKLERI.md`.

## Sonra
4. Yönetici ekranları (olay türü varsayılanları, zorunlu işaret, e-posta defteri) Faz 3 ile; `bildirim.yonet` işlemi o zaman gelir.
5. Arşiv temizliği (180 gün, kurgu §5) zamanlanmış işle Faz 2'de.
6. Operatör ayrımı işlemden çıkarılıyor (`arkon.operator` var, `kisiler.rol-yonet` yok). Rol kodu dışarı açılırsa (kisiler) ona geçer.

## Ekip çağrısı (298 a)
7. Arkon tetiği (BASKA-MODUL-ISTEKLERI 6) girene kadar `arkon.ekip-cagrisi` hiç yazılmaz; yönlendirme ekranı yalnız ayarı tutar.
8. Yükseltme (`phase: 'esc'`, "vardiya amirine yükseltildi") Arkon istemcisinde kalır; bildirime dönüştürülmesi ayrı karar.

## Bildirim alıcıları (760 c)
9. Seçilen rolün türün ekranını açıp açamadığı ekranda uyarılmaz; `araclar/bildirim-yollari.test.ts` yalnız işlem kuralını ölçer. Seçilen rol ekranı açamıyorsa kişi bildirimi görür, ekran yetki hatası verir.
10. `cnc-kurulum.takim-omru` türü tanımlı ama gönderen yok; tetik cnc-kurulum modülünün işi (ayrı kart).

## Bilgi (borç değil)

Kurgu, karar ve sınır kayıtları; kapanacak iş değildir (borç denetimi, kart 2049).

### Sonra

- Olay türü kataloğu bu modülün sözleşmesinde (`BILDIRIM_TURLERI`). Faz 2'de tür sayısı artınca modül başına `paylasilan/bildirimler/<modul>.ts` ve toplayıcıya geçebilir (çekirdek işi).

## Elle bildirim (2147)
11. ~~Ekranlar Y2'de~~ Y2 ile geldi (Hazırla, Yayınlar ve okunma, ekran ortası penceresi, süzgeçler, liste satırına yayın künyesi).
12. Üretim Terminali'nde ortadaki pencerenin Arkon hazırlık uyarısıyla sırası Y3'te (Operator.tsx kilit zinciri sonrası). İstasyon hedefi bugün yalnız o günkü atamadan; terminal oturumu Y3'te.
13. ~~Y4'te~~ Y4 ile geldi: Bildirim yönetimi'nde "Ekran ortası ve onay" kartı, tablo `bildirim_tur_gosterimi`; ayarlanmamış türde BIL-16 geçer.
14. Hedef seçimi yayınlayanın kendi kapsamıyla daraltılmaz (prototip notu); işlem bugün yalnız yönetici taşıdığından gerek yok. Role verilirse ayrı karar.
16. Y3'e kadar ortadaki pencere terminal yollarında (`/uretim-terminali`, `/arkon/operator`, `/terminal`) çıkmaz ve sorulmaz (`istemci/src/moduller/bildirim/gorunum.ts` `ortadaBekletilirMi`); bildirim zilde ve merkezde durur. Y3'te Arkon hazırlık uyarısıyla sıra kurulunca bu bekletme kalkar.
17. Ortadaki pencere başka kipli pencere (karşılama, açılış gösterisi, açık form) açıkken bekler; bekleme DOM'daki `aria-modal` pencereyi gözler. Kabukta katman sırası ortak parçası olursa ona geçer (çekirdek isteği 2147-a).
15. `bildirim-yayin-dagit` işinin okunur adı `istemci/src/moduller/sistem/is-adlari.ts`'de yok (kod adıyla görünür); Y2'de eklenir.
