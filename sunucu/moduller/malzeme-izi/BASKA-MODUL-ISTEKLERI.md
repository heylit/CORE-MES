# BASKA-MODUL-ISTEKLERI: malzeme-izi

1. stok: `malzemeBakiyeSatirlari(db, malzemeId)`: konum (kod, tür), statü kimliği, kalite durumu, parti (lot no), miktar ve emre ayrılan miktar. Yetki denetlemez; salt okur.
2. stok, satin-alma, kalite-merkezi, uretim-emirleri, sevkiyat, malzemeler: `malzemeOlaylari(db, malzemeId, { baslangic?, bitis?, partiId?, emirId? })` -> `{ zaman, tur, miktar?, lot?, emir?, belge, kisi }[]` (rapor 3.3).
3. plan: malzeme başına net ihtiyaç ve eksik (açık sipariş ve dağıtım düşülmüş), Planlama MRP'nin hesabıyla.
4. satin-alma: `malzemeGelisTarihleri` satırına tedarikçi firma kimliği ve adı.
