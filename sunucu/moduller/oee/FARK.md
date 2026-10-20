# FARK: oee (kart #1330)

Taban: main cc1613c. Başvuru: kart #1330 ve kart #1324 kararları (OEE ayrı sayfa, birim maliyet `finans.maliyet-oku`, planlı süre hem vardiya hem takvim). Önceki sistemde OEE ekranı yok; prototip yok.

## Gelen
- Sözleşme `paylasilan/sozlesme/oee.ts`, işlem `paylasilan/islemler/oee.ts` (`oee.oku`), sayfa ve ikinci menü `paylasilan/sayfalar/oee.ts` (`/oee` İş merkezleri, `/oee/makineler` Makineler). Toplayıcılara yalnız OEE satırları (ayrı commit).
- Sunucu: tek uç `GET /oee?baslangic&bitis` (`oee.oku`), kurallar OE-01..OE-09, kendi tablosu ve göçü yok; veriyi istasyonlar, vardiya, üretim emirleri ve finans `disari.ts` dosyalarından okur.
- İstemci: dönem süzgeci (Dün, Son 7 gün, Bu ay, Tarih seç), tesis özeti (OEE, TEEP, Kullanılabilirlik, Performans, Kalite, yetkiliye Birim maliyet), iş merkezi + istasyon tablosu ve makine tablosu.

## Hesap
- Planlı süre = vardiya takvimi (molalar, tatiller, planlı duruşlar düşülmüş; fazla mesai #1324 ile takvime girince kendiliğinden sayılır). Takvim süresi = pencerenin bütün saatleri (TEEP).
- OEE = sağlam parçaların standart süresi / planlı süre; A = makine çalışma / planlı; Q = sağlam / (sağlam + hurda); P = OEE / (A x Q).
- 1 kişi N makine: kişinin makinedeki payı = o makinedeki yüzdesi / bütün makine yüzdeleri toplamı. "Kişi / makine" sütunu bu payların toplamıdır (1:3'te 0,33; 3:1'de 3).
- Birim maliyet = (planlı saat x istasyon saat maliyeti + kişi mesaisi x pay x kişi saat maliyeti) / sağlam; yalnız TRY tutarlar.
- Üst düzey toplamlar ham değerlerin toplamıdır; bir makinede bilinmeyen değer üstü de bilinmez yapar (sıfır uydurulmaz).
