# BASKA-MODUL-ISTEKLERI: etiket-merkezi

Bu PR'a gerekmez; kaynak bağlama PR'ından önce sahiplerine gider.
- stok: konum için yeni fonksiyon gerekmedi (`konumAdlari` kodu veriyor, 94 a). Kod değiştiren komutlardan sonra "Etiketleri bas" düğmesi
  `/etiket-merkezi?tur=konum&id=1,2,3` adresini açar (stokun işi). `lotEtiketleri` ve `istasyonKonumlari` geldi (#1908) ve bağlandı. Lot ve istasyon ekranlarına "Etiket Merkezi'nde bas" bağlantısı (`?tur=lot&id=<parti>`, `?tur=istasyon&id=<istasyon>`) sahiplerin işi.
- uretim-emirleri: `refakatKarti(db, emirId)` geldi (#1926) ve bağlandı. Emir ayrıntısına "Etiket Merkezi'nde bas" bağlantısı (`?tur=refakat&id=<emir>`) sahibin işi.
- istasyonlar: ad `istasyonAdlari` ile okunur; yeni fonksiyon gerekmedi.
- stok ve satın alma: mal kabul ekranına "Etiket Merkezi'nde bas" bağlantısı (`?tur=mal-kabul&id=<kabul>`); malzeme ekranına `?tur=malzeme&id=<kart no>`.
- uretim-emirleri ve lot ekranları: "Etiket Merkezi'nde bas" bağlantısı aynı biçimle (`/etiket-merkezi?tur=<tur>&id=<id,...>`), tür eklendikçe.
- stok (#115): Okut ve teslimde `RAF:<raf kodu>` okutulunca rafın gözleri listelensin, göz seçilsin (raf stok konumu değildir). Etiket Merkezi rafı Fabrika Haritası raf kimliğiyle basar (#116).
