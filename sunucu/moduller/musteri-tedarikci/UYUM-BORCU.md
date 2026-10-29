# Uyum borcu: musteri-tedarikci

## Bağlamada kapanacak
1. Sevkiyat koordinatı hâlâ `sevkiyat_noktasi.enlem/boylam`'dan okur; firmaya bağlı noktada `firmaKonumlari` ile bu modülden okumalı (BASKA-MODUL-ISTEKLERI 1). Göç koordinatı bir kez kopyaladı; iki yer arasında eşitleme yok.
2. Finans çerçevesindeki "Firmalar" görünümü firma kartını hâlâ kendi içinde düzenler; bağlamada cari (bakiye) görünümüne inip kart düzenlemesi bu sayfaya yönlenmeli (BASKA-MODUL-ISTEKLERI 2).
3. Satın alma ve finans firma seçicileri ek adresleri (fatura, teslim) seçtirmez; belge yalnız firmaya bağlanır (BASKA-MODUL-ISTEKLERI 3).
4. Ana menü simgesi geçici olarak `dash`; firma için uygun simge sette yok (CEKIRDEK-ISTEKLERI 1).
5. Rol ve yetki: beş rol aynı hakla taşındı (S6); ortak yetki matrisinde ayrıca gözden geçirilmedi.
6. Ctrl K firma kaynağı (kart 1235): reddedilen yol bugün kaynağın yetki bildirimiyle sınanır; çekirdek `/arama` ucu (kart 1233) girince 401/403 ve işlemsiz kişinin firma görmemesi uç üzerinden de sınanmalı.
