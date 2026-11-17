# Notlar: siparisler

- Taslak güncellemesi satırları silip yeniden yazar; satır kimliği değişir. Üretim emri ve sevk yalnız onaylı siparişin satırına bağlanmalı (onaylı satır değişmez).
- VARSAYIM: satılan kart türleri mamul, yarı mamul, ticari mal; verilen hizmet satış siparişine girmez. Geri alması ucuz (kurallar.ts SATILAN_TURLER).
- VARSAYIM: KDV oranı sipariş başına tektir (Portal prototipi `vat` siparişte). Satır başına oran gerekirse yeni sütun.
- Teklif satırı kartsız (yalnız tanımla) girilebilir; siparişe dönüşmeden kart bağlanır. Teklif no yılı açılış anından (Europe/Istanbul).
- VARSAYIM: geçerlilik tarihi bilgi içindir; süresi geçmiş sürüm de kabul edilebilir (saat kuralı yok). Geri alması ucuz.
- Numara yılı sipariş tarihinden alınır, açılış zamanından değil.
- Karar 180 değişti (65 a, 21.10.2026): fiyat ve kârı müdür ile satış rolü görür. Maliyet dökümü (`siparisler.maliyet-oku`) yalnız müdürde.
- Teklif denemesi motoru Reçete ve Rota'dadır; `teklifDenemeCozucusu` kablolama.ts'te kaydedilir. Kayıtsızken termin ve fiyat elle girilir.
- VARSAYIM: süresi dolan satış taslağı okuma anında "satış denemesi" sayılır; zamanlanmış iş yok. Gün veritabanının `current_date`'idir.
- VARSAYIM: plan taslaklı sürümde termin tektir (en geç kalemin plan termini ya da istenen termin); kartsız kalem bu termine bağlıdır.
- VARSAYIM: elle (plansız) verilen yeni sürüm teklifin plandaki yerini kaldırır; kabul yeri korur, sipariş ve red kaldırır.
- VARSAYIM: plancı onayı `plan.yaz` ile verilir (63 b); ayrı işlem açılmadı.
- `onay-bekliyor` artık iskonto ya da termin onayıdır; durum adı "onay bekliyor".
- 3401-1 a: maliyet toplamı, birim maliyet ve kâr oranı yalnız `finans.maliyet-oku` (satış fiyatını görmek açmaz; karar 65 a ve 180 bu yönde değişti). Satış fiyatı ve tutar `fiyat-oku`'da kalır.
- 3401-2 a: ceza, tavan ve vade fiyat-oku'nun parçası. Fiyatsız yazar bunları göndermez (gönderirse 403); düzenlemede kayıttaki korunur.
- VARSAYIM: plan taslağının `kar_orani` kolonu NOT NULL; maliyet görmeyen satışçının formu varsayılan kârı (%25) gizli gönderir. Kâr gizli olduğundan fiyat önerisi yoktur, satışçı fiyatı elle girer.
