# Başka modül istekleri (oee)

- vardiya: kişi çalışma takvimi yalnız istasyon atamasından iş merkezi buluyor (`servis.ts` kişi -> iş merkezi). Yalnız makineye atanmış kişinin takvimi boş döner, o makinenin işçiliği bilinmez görünür. İstek: kişinin iş merkezi istasyon ataması yoksa makine atamasının istasyonundan alınsın.
- uretim-emirleri: makine bazında duruş nedeni kırılımı okuması (`disari.ts`). Kullanılabilirlik kaybının nedenini OEE sayfasında göstermek için.
- uretim-emirleri: makine çalışma kaydı olmadan sayım girilen işler performansı %100'ün çok üstüne çıkarıyor (örnek veride görüldü). Ekran %120 üstünü "veriyi kontrol et" diye işaretliyor; kaynakta çözüm sayım ile makine kullanım kaydının birlikte açılması.
