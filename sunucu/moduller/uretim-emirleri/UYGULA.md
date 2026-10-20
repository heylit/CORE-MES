# Uygula (uretim-emirleri, kart #262)

1. `npm run goc` (göç 20261009193500). Göç veri taşır ve geri alınmaz: eski emirlerin hepsi arşive kopyalanır, planlı ve başlamış olanlar
   iptal edilir. Kopya sayısı tutmazsa göç hiçbir şey değiştirmeden durur. Çalıştırmadan önce yedek alınır.
2. Başlamış emir varsa göçten önce terminalde bitirilmesi önerilir (göç onları iptal eder; başlama ve sayaçlar arşivde kalır).
3. Rota ve plan bağlanana kadar (T4) yeni emir rotanın "Emre kopyala" ucundan açılamaz (`rota/baglanti.ts` geçici karşılığı); iş emirli emir
   ekranı T4'tedir. Bugünkü Üretim emirleri sayfası ve terminal değişmeden çalışır.
