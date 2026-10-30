# BASKA-MODUL-ISTEKLERI: kaynak-izi

1. arkon (1323 a): `makineOlaylari(db, makineId, { baslangic?, bitis?, sinir? })` -> `{ zaman, tur: 'ariza' | 'bakim', durum, aciklama, kisi }[]`, en yeni önce. Yetki denetlemez; salt okur. Makine 360'ın bakım ve arıza geçmişi.
2. plan: kaynak başına yük: `kaynakYuku(db, { tur: 'istasyon' | 'makine' | 'kisi', id, baslangic, bitis })` -> canlı plandaki dolu dakika ve kapasite dakikası (gün başına). Yetki denetlemez.
3. oee: makine ve kişi kırılımlı okuma (`makineOeeleri`); bugün yalnız istasyon özeti okunuyor.
4. istasyonlar: ayar yetkinliği `ayarYetkinlikleri` (kart 1313) main'e girince Kişi ve Makine 360'a "ayar yapabildiği makineler" eklenecek.
