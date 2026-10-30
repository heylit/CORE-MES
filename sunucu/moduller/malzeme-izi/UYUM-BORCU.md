# UYUM-BORCU: malzeme-izi (kart 1296)

## Bağlamada kapanacak
1. Elde bölümü konum x hal x lot tablosu: stok'tan malzemenin bakiye satırları (konum türü, statü, kalite durumu, rezerve, lot) okunacak; hal `kurallar.ts` `hal` ile türetilecek (1278 a). Bugün yalnız stok'un değer grupları gösteriliyor. İstek: BASKA-MODUL-ISTEKLERI madde 1. Sıra: E2, GKK satın alma yaması (1246) main'e girince.
2. Zaman çizelgesi (rapor 3.3): her sahibin `disari.ts`'inde aynı biçimde olay okuması; bugün yok. İstek: madde 2.
3. Sayfa işlemi `sayfa.malzeme-izi` yalnız yöneticide; roller ortak yetki matrisinden verilecek (rol göçü).
4. Gidecek bölümü (emir ihtiyacı, rezerve, Planlama MRP eksiği): Planlama'nın tek hesabı dışa açılınca (rapor H6, 224 a). İstek: madde 3.
5. Tedarikçi adı ve firma karnesi bağlantısı: açık sipariş okuması tedarikçiyi taşımıyor. İstek: madde 4.
6. Stok değeri (1291 a: lotun sipariş fiyatı) ve seçilebilir fiyat görünümü (1290 a): stok Dal B'de resmi değer tanımı girince Para bölümüne eklenecek.
7. Malzeme kartından ve stok ayrıntısından 360'a bağlantı; kartın kendi ekranına derin bağlantı (bugün `/malzemeler` açılıyor).
8. `degerGrubuToplamlari` bütün malzemeleri döndürüyor, 360 kendi kartını süzüyor; malzeme süzgeçli okuma madde 1 ile gelince kalkar.
