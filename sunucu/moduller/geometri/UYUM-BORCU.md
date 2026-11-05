# UYUM BORCU: geometri

## Bağlamada kapanacak
1. Rol x işlem: `sayfa.geometri`, `geometri.oku`, `geometri.hesapla` yalnız yöneticide (1445 a); roller 1390 rol menüsüyle verilir.

## Sonra
- Özellik tanıma (1923 b): delik, kademe, havşa, pah, radyüs sunucuda (2044, `geometri_ozellik`, `GET /geometri/ozellikler/:revizyonId`). Kalan: cep, kanal, basamak; 3D Atölyesi ekranında özellik listesi ve modelde vurgu (prototip onayı gerekir); Arkon teknik resminin kendi tanıması yerine bu tabloyu okuması; gerçek dosyalarla yerel deneme.
- PMI okuma libcascade ile mümkün (Aşama 2a, kart 1935); karakteristiklerin Kalite Merkezi'ne öneri olarak gitmesi ayrı kart.
- PMI (Aşama 2, 1428), CMM planı (Aşama 3), glTF (1434 a).
- Dosya sağlığı (2143): sunucu ve uç var; 3D Atölyesi'nde yeşil/sarı/kırmızı rozet 2139 kilidi kalkınca ayrı yamayla gelir.
- CNC Kurulum ham ekranının ve malzeme kartındaki "STEP'ten" kutusunun bu analizi okuması (`disari.ts` o zaman açılır).

## Bilgi (borç değil)

Kurgu, karar ve sınır kayıtları; kapanacak iş değildir (borç denetimi, kart 2049).

### Bağlamada kapanacak

- Ağırlık (1446 a, 1480; 1704 a ile değişti): 3D Atölyesi'nde net ve ham ağırlık yalnız öneridir. Mamul ve yarı mamul kartında net ağırlık analiz hacminden hesaplanır ve yalnız düğmeyle forma yazılır (1710); kart her zamanki kaydetmeyle, malzemeler.yaz ile yazılır. Yerleşik kalite yoğunluğu yalnız istemcide (Malzemeler tablosu); sunucu ağırlık hesaplamaz.
   Ayarda yerleşik kaliteyle aynı kodla eklenen kalite istemcide yok sayılır, sunucu ise onun yoğunluğunu döner (ayar ekranı bunu zaten engellemiyorsa uç durum).
- Stok önerisi kalite süzgeci kullanıcı seçimidir: parçanın reçetedeki hammaddesi okunmaz (Reçete ve Rota bağı Aşama 2).
- Yayına girişte anında tetik yok: tarama 30 sn'lik turdadır (cizimler geometri'yi çağırmaz, ADR 0006).
- Sağlık ekranı: hesap sürecinin durumu (açık mı, kaç kez açıldı) yalnız `surec.ts` `durum()` ile okunur; Güvenlik Merkezi kartı yok.
