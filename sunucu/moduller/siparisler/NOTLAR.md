# Notlar: siparisler

- Taslak güncellemesi satırları silip yeniden yazar; satır kimliği değişir. Üretim emri ve sevk yalnız onaylı siparişin satırına bağlanmalı (onaylı satır değişmez).
- VARSAYIM: satılan kart türleri mamul, yarı mamul, ticari mal; verilen hizmet satış siparişine girmez. Geri alması ucuz (kurallar.ts SATILAN_TURLER).
- VARSAYIM: KDV oranı sipariş başına tektir (Portal prototipi `vat` siparişte). Satır başına oran gerekirse yeni sütun.
- Teklif satırı kartsız (yalnız tanımla) girilebilir; siparişe dönüşmeden kart bağlanır. Teklif no yılı açılış anından (Europe/Istanbul).
- VARSAYIM: geçerlilik tarihi bilgi içindir; süresi geçmiş sürüm de kabul edilebilir (saat kuralı yok). Geri alması ucuz.
- Numara yılı sipariş tarihinden alınır, açılış zamanından değil.
