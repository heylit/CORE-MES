# ADR 0020 — Planlama ve plan motoru plan modülünde; Reçete ve Rota yalnız besler

Durum: kabul (kullanıcı kararı 26.10.2026: "ADR 0020: a, ADR onaylı", "ADR 0020 teyit"). Dayandığı kararlar: 658 b ("reçete ve rotada plan motoru olamaz, planlama besleyen reçete ve
rota, ama planı yapan planlama ve planlama motoru"), 661 a (var olan plan modülü), 662 a (dolu tablo göçü), 663 a (rol × işlem), 659 a (eski
çerçeve yalnız yöneticide), 657 a (kayıt yoksa sayfa boş çalışmayı kurar). ADR 0018'in 1. maddesindeki motor yerini değiştirir; 0018'in öteki
maddeleri (sunucuda çalışma, son söz sunucuda) aynen sürer. Eski planlama çerçevesi ve `/plan/eski` kodda yoktur; karar 1, 5 ve
Sonuçlar'daki çerçeve cümleleri bu yüzden çıktı (1526-c, 01.11.2026).

## Bağlam

- Motor dosyaları, planlama çalışmasının kaydı, planlama uçları ve planlama ekranı Reçete ve Rota modülündeydi; plan modülü yalnız asıl planı
  ve senaryoları tutuyordu. Reçete ve Rota plan modülünü ithal ediyordu (canlı özet, ayar).
- Kullanıcı Planlama'yı Reçete ve Rota'dan ayrı sayfa istedi; planı yapan Planlama ve motorudur, Reçete ve Rota yalnız veri verir.

## Karar

1. **Motor ve planlama kodu plan modülünde.** `sunucu/moduller/plan/motor/*.betik` tek kaynaktır; plan girdisi, çözücü, değerlendirme,
   yıllık çözücü, satın alma görünümü, teklif denemesi ve bütün planlama uçları `/plan/...` altındadır.
2. **Bağımlılık yönü tektir.** Plan, Reçete ve Rota'yı yalnız `recete-rota/disari.ts` ile okur (ana kayıt, emirler, kaynak okumaları,
   etkin malzemeler). Reçete ve Rota plan modülünü ithal etmez; durum cevabında plan alanı yoktur.
3. **Kayıt plan modülünün tablosunda.** Planlama çalışması ve tercih anahtarları `plan_planlama_kaydi` (geçmişiyle) tablosundadır; dolu
   veri göçle aynen taşınır, Reçete ve Rota tablosu bu anahtarları kısıtla reddeder. Anahtar adları değişmez (eski çerçeve aynı adları yazar).
4. **Yetki.** Planlama sayfalarını görmek `plan.planlama-oku`, ana menü satırı `sayfa.plan`; ikisi de müdür ve planlamadadır. Kayıt
   yazmak bugünkü gibi `recete-rota.yaz` ile `plan.yaz` ister (bağlamada sadeleşir).
5. **Ekran.** Planlama ana menüde ayrı sayfadır (`/plan`), görünümleri ikinci menüdedir. Eski `/recete-rota/<görünüm>`
   adresleri yeni sayfaya yönlenir. Kayıt yoksa yazabilen kişide sayfa boş çalışmayı
   sunucuya kurdurur (`POST /plan/planlama-calismasi/olustur`).

## Sonuçlar

- Reçete ve Rota'nın plan bağımlılığı kalkar; döngü riski (ADR 0006 madde 4) planlama tarafında yoktur.
- Açık borçlar plan modülünün `UYUM-BORCU.md` dosyasındadır (çift yazma yetkisi, Reçete ve Rota testlerinin plan uçlarını çağırması,
  derleme kopyası, ana kayıtta kalan plan ayar alanları).
