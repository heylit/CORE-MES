# UYUM BORCU: geometri

## Bağlamada kapanacak
1. Rol x işlem: `sayfa.geometri`, `geometri.oku`, `geometri.hesapla` yalnız yöneticide (1445 a); roller 1390 rol menüsüyle verilir.
2. Net ağırlık (1446 a): hacim x yoğunluk yalnız ekranda öneri; yoğunluk okuması ayrı küçük yamadır (malzemeler/disari.ts okuma fonksiyonu).
3. Stok önerisi kalite süzgeci kullanıcı seçimidir: parçanın reçetedeki hammaddesi okunmaz (Reçete ve Rota bağı Aşama 2).
4. Yayına girişte anında tetik yok: tarama 30 sn'lik turdadır (cizimler geometri'yi çağırmaz, ADR 0006).
5. Sağlık ekranı: hesap sürecinin durumu (açık mı, kaç kez açıldı) yalnız `surec.ts` `durum()` ile okunur; Güvenlik Merkezi kartı yok.

## Sonra
- PMI (Aşama 2, 1428), CMM planı (Aşama 3), glTF ve dosya sağlığı (1434 a).
- CNC Kurulum ham ekranının ve malzeme kartındaki "STEP'ten" kutusunun bu analizi okuması (`disari.ts` o zaman açılır).
