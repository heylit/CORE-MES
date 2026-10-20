# ADR 0007 — Okuma ucunda sayfa ya da veri işlemi

Durum: kabul (kullanıcı kararı Ç1, 08.10.2026, kart #247 ve #259)

## Bağlam

ADR 0003 madde 4'e göre uç `sayfa.*` isteyemezdi. Uç katmanı yalnız veri işlemi kabul ettiği için sayfası
olan rollere okuma vermek, her modülde ayrı okuma işlemi ve rol göçü gerektiriyordu. Modüller bunun yerine
okuma uçlarını `yetki: 'oturum'` ile açtı: sayfası olmayan roller (bakım, satın alma, depo, muhasebe) doğrudan
istekle üretim emirlerini, istasyonları, makineleri, duruş ve hurda nedenlerini okuyabiliyordu. Malzemeler ve
satın alma sayfa denetimini kendi servisinde yazdı.

## Karar

1. **Okuma ucu işlem listesi alabilir; listeden biri yeter.** `uc({ yontem: 'GET', yetki: { biri: [...] } })`.
   Listede sayfa işlemi de veri işlemi de olabilir. Aynı veriyi birden çok sayfa okur (emir açma ekranı
   istasyonları okur); veriyi okuyan her sayfa listeye yazılır.
2. **Yazma ucu da listeyi alabilir** (değişiklik: kullanıcı yazılı onayı 17.10.2026; ilk kararda yalnız GET'ti).
   Arkon'un yazma uçları `'oturum'` ile açıktı; aynı komutu üç ekran (Arkon, Üretim Terminali, kuyruk) verdiği için
   tek veri işlemine bağlamak rol göçü isterdi. Listeyle yazma, ekranı olan rollere daralır. Tek veri işlemi isteyen
   yazma ucu öyle kalır; liste rol x işlem eşlemesini değiştirmez. Denetim kaydına yetki `biri:a|b` diye yazılır.
3. **Liste tanımda denetlenir.** Boş liste, kayıtlı olmayan ya da yinelenen işlem tanım hatasıdır.
   Liste kayıtta kopyalanıp dondurulur.
4. **`'oturum'` okuma için istisna kalır.** Yalnız kişinin kendi kaydını ya da her oturumun görmesi gereken
   veriyi okuyan uç (kullanıcı kararıyla) `'oturum'` tutar.
5. Rol göçü gerekmez: sayfası olan rol okur. Menüde görünürlük ile okuma aynı işleme bağlanır; ayrı yönetilmesi
   gereken veri için modül yine kendi okuma işlemini tanımlayabilir.

## Sonuçlar

- Modüller `'oturum'` okuma uçlarını ve servisteki sayfa denetimlerini bu kalıba taşır (her modül kendi işinde).
- `ucEnvanteri` listeyi olduğu gibi taşır; harita `biri:a|b` diye basar.
