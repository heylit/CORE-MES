# UYUM BORCU: bildirim

## Bağlamada kapanacak
1. Dört olayın tetik çağrısı sahibi modüllerde yazılacak (satın alma, siparişler, İK, istasyonlar); bu dal o modüllere yazmaz. Liste `BASKA-MODUL-ISTEKLERI.md`.
2. Profilim sayfasına "Bildirimlerim" bağlantısı profil modülünün işi (`BASKA-MODUL-ISTEKLERI.md`). Bugün liste zilden ve `/profil/bildirimler` adresinden açılır.

## Sonra
3. Olay türü kataloğu bu modülün sözleşmesinde (`BILDIRIM_TURLERI`). Faz 2'de tür sayısı artınca modül başına `paylasilan/bildirimler/<modul>.ts` ve toplayıcıya geçebilir (çekirdek işi).
4. Yönetici ekranları (olay türü varsayılanları, zorunlu işaret, e-posta defteri) Faz 3 ile; `bildirim.yonet` işlemi o zaman gelir.
5. Arşiv temizliği (180 gün, kurgu §5) zamanlanmış işle Faz 2'de.
6. Operatör ayrımı işlemden çıkarılıyor (`arkon.operator` var, `kisiler.rol-yonet` yok). Rol kodu dışarı açılırsa (kisiler) ona geçer.

## Ekip çağrısı (298 a)
7. Arkon tetiği (BASKA-MODUL-ISTEKLERI 6) girene kadar `arkon.ekip-cagrisi` hiç yazılmaz; yönlendirme ekranı yalnız ayarı tutar.
8. Yükseltme (`phase: 'esc'`, "vardiya amirine yükseltildi") Arkon istemcisinde kalır; bildirime dönüştürülmesi ayrı karar.

## Bildirim alıcıları (760 c)
9. Seçilen rolün türün ekranını açıp açamadığı ekranda uyarılmaz; `araclar/bildirim-yollari.test.ts` yalnız işlem kuralını ölçer. Seçilen rol ekranı açamıyorsa kişi bildirimi görür, ekran yetki hatası verir.
10. `cnc-kurulum.takim-omru` türü tanımlı ama gönderen yok; tetik cnc-kurulum modülünün işi (ayrı kart).
