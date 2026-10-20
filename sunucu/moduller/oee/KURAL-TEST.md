# Kural - test eşlemesi (oee)

| Kural | Tanım | Test |
|---|---|---|
| OE-01 | Takvim aralıklarının yalnız pencereye düşen süresi sayılır | kurallar.test.ts "OE-01..."; oee.test.ts "OE-01, OE-02..." |
| OE-02 | OEE = sağlam standart / planlı; A, P, Q; payda yoksa null, üretimsiz planlı makinede gerçek sıfır | kurallar.test.ts "OE-02..." (iki test); oee.test.ts "OE-01, OE-02..." |
| OE-03 | TEEP aynı payın takvim süresine oranıdır | kurallar.test.ts "OE-03..." |
| OE-04 | Üst düzey ham değerlerin toplamıdır; bilinmeyen üste taşınır | kurallar.test.ts "OE-04..." |
| OE-05 | Kişi payı = makinedeki yüzde / makine yüzdeleri toplamı | kurallar.test.ts "OE-05..."; oee.test.ts "OE-05, OE-07, OE-08..." |
| OE-06 | Makine maliyeti = planlı saat x istasyon saat maliyeti | kurallar.test.ts "OE-06..." |
| OE-07 | İşçilik = kişi mesaisi x pay x saat maliyeti; eksikte null | kurallar.test.ts "OE-07..."; oee.test.ts "OE-05, OE-07, OE-08..." |
| OE-08 | Birim maliyet = (makine + işçilik) / sağlam | kurallar.test.ts "OE-08..."; oee.test.ts "OE-05, OE-07, OE-08..." |
| OE-09 | `finans.maliyet-oku` yoksa tutarlar boş, oranlar aynı | kurallar.test.ts "OE-09..."; oee.test.ts "OE-09..." |
| OE-10 | `oee.oku` olmayan 403 | oee.test.ts "OE-10..." |
| Veri eksik | Standart süre çalışmadan büyükse ya da çalışma planlı süreden uzunsa (planlı süre eksik) performans, OEE ve TEEP hesaplanmaz, ikincisinde kullanılabilirlik de; ortalamaya girmez (kodda OE-10 adıyla) | kurallar.test.ts "OE-10..." (üç test) |
| OE-11 | Ters ya da 92 günden uzun aralık 400 | oee.test.ts "OE-11..." |
| OE-12 | İş merkezi kısıtlı kişi yalnız kendi merkezinin makinelerini görür | oee.test.ts "OE-12..." |
