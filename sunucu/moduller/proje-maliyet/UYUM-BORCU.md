# Uyum borcu (proje-maliyet)

## Bağlamada kapanacak
- PM-B19 (940 c): masraf bağı yazılırken belge kilitlenmez; aynı anda finansta iptal edilen belge bağlanabilir. Bağ kalır, belge iptal göründüğü için toplama girmez (PM-42). Finans kilitli okuma verirse ona geçilir.
- PM-B20: taban fotoğrafı toplama girmeyen kalemleri (`eksik_kalemler`) saklar; güncel plan başka kalemlerle hesaplanırsa fark aynı kalemlerle karşılaştırılmaz, ekranda uyarı satırı çıkar. Kalem bazında eşleştirme bağlamada değerlendirilir.
- PM-B21: masrafın planı yok (911 b görevden tutarı kaldırdı); farka plansız gerçekleşen olarak girer.
- PM-B10: işçiliğin planı yok (rotada kişi süresi yok); işçilik kalemi toplamdan çıkar, ekranda gerçekleşeni ve uyarısı görünür. Rota adımına planlanan kişi süresi gelince bağlanır.
- PM-B15: iç yarımamul (projedeki başka emrin ürünü olan bileşen) malzemede sayılmaz; projede o ürünün emri yoksa bileşen satın alınan parça gibi fiyatlanır ve kg fiyatı yoksa emrin malzemesini bilinmez yapar. Ürün kartı olmayan emrin malzemesi bilinmez, ayrı uyarı yok.
- PM-B4: bütçe null; projeler `projeGetir` bütçe alanını verince okunur (198 a, göç 20261019091000).
- PM-B5: `siparisler.fiyat-oku` Çekirdek'te; gelince PM-14 gerçek girişle sınanır.
- PM-B9: ücret geçmişi yok; defter dondurma anındaki ücreti saklar. Ücret geçmişi gelirse bitiş zamanındaki ücret kullanılacak.
- PM-B8: Projeler'in Maliyet sekmesi (`ProjeMaliyeti`, sekme yalnız `finans.maliyet-oku` olana) Projeler'in dosyasında.
- PM-B14: genel gider oranı `amortismanDahil: false` girilirse amortisman (211 a gereği genel giderde olmalı) hiçbir kalemde yer almaz; oran deftere yazılır, ekranda `amortisman_dahil_degil` uyarısı çıkar (E-9). Finansta oran girişi bu bayrağı zorlayınca ya da amortisman ayrıca bağlanınca kapanır.
- PM-B17: bekleme finansmanında malzeme emrin son adım gününden sayılır (stok sarf günü değil) ve canlı planda olmayan işin plan finansmanı bilinmez; stok sarf tarihi disari'ye gelince malzeme sarf gününden sayılır.
- PM-B18: açık emirde işlenen adet ilk adımın sağlamıdır; ilk adımın hurdası disari'de yok, işlenmiş sayılmaz (talaş biraz az çıkar).
