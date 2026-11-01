# UYUM BORCU: geometri

## Bağlamada kapanacak
1. Rol x işlem: `sayfa.geometri`, `geometri.oku`, `geometri.hesapla` yalnız yöneticide (1445 a); roller 1390 rol menüsüyle verilir.
2. Ağırlık (1446 a, 1480; 1704 a ile değişti): 3D Atölyesi'nde net ve ham ağırlık yalnız öneridir. Mamul ve yarı mamul kartında net ağırlık analiz hacminden hesaplanır ve yalnız düğmeyle forma yazılır (1710); kart her zamanki kaydetmeyle, malzemeler.yaz ile yazılır. Yerleşik kalite yoğunluğu yalnız istemcide (Malzemeler tablosu); sunucu ağırlık hesaplamaz.
   Ayarda yerleşik kaliteyle aynı kodla eklenen kalite istemcide yok sayılır, sunucu ise onun yoğunluğunu döner (ayar ekranı bunu zaten engellemiyorsa uç durum).
3. Stok önerisi kalite süzgeci kullanıcı seçimidir: parçanın reçetedeki hammaddesi okunmaz (Reçete ve Rota bağı Aşama 2).
4. Yayına girişte anında tetik yok: tarama 30 sn'lik turdadır (cizimler geometri'yi çağırmaz, ADR 0006).
5. Sağlık ekranı: hesap sürecinin durumu (açık mı, kaç kez açıldı) yalnız `surec.ts` `durum()` ile okunur; Güvenlik Merkezi kartı yok.

## Sonra
- PMI (Aşama 2, 1428), CMM planı (Aşama 3), glTF ve dosya sağlığı (1434 a).
- CNC Kurulum ham ekranının ve malzeme kartındaki "STEP'ten" kutusunun bu analizi okuması (`disari.ts` o zaman açılır).
