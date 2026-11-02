# Kural -> test (markalama)

Testler: `kurallar.test.ts` (saf), `markalama.test.ts` (gerçek PostgreSQL), `istemci/src/moduller/markalama/Markalama.test.tsx`, `sahne.test.ts`.

| Kural | Test |
|---|---|
| MRK-01 Şablon: bilinen parçalar, tek {SEQ}, {PARCA} zorunlu, kapsam emirse {EMIR}, yılsa {YY}/{YYYY}; harf, rakam, `. _ / -` | `MRK-01`; `MRK-U2` (400) |
| MRK-02 Sabit markanın metni olur (harf, rakam, boşluk, `. _ / -`), seri markanın olmaz; seri alanı yoksa birim izlenmez | `MRK-02`; `MRK-U3` (seri alanı olmayan tanımda 422) |
| MRK-03 Seri şablondan; sıra genişliğe doldurulur, taşarsa kısalmaz; ISO hafta; kapsam anahtarı | `MRK-03`; `MRK-U3` |
| MRK-04 Durum geçişi: sağlam -> red, hurda; red -> rework, kabul, hurda; rework -> red, kabul, hurda; hurda son | `MRK-04`; `MRK-U5` (409) |
| MRK-05 Hurda nedeni yalnız hurdada ve orada zorunlu | `MRK-05`; `MRK-U5` |
| MRK-06 Doğrulama yalnız bu tanımın birimi; hurda doğrulanmaz; yinelenen okutma olay yazmaz | `MRK-U4` |
| Önizleme: emirsiz istekte {EMIR} yer tutucusu, emir kapsamında yeni emrin ilk numaraları | `MRK-U11` |
| MRK-07 Seri yalnız açık emirde, tanımın malzemesinin emrinde | `MRK-U3` (422) |
| MRK-08 Tanım var olan malzemeye açılır; (malzeme, op) tekil; sürüm denetimi | `MRK-U2` |
| MRK-09 Başlangıç sırası değişince: malzeme ve yıl kapsamında başlamış sayaç ileri alınır, geri alma reddedilir; emir kapsamında yeni emirde geçer | `MRK-09`; `MRK-U10` |
| MRK-10 Ölçü, sabit ondalığa yuvarlanınca 0'a ya da sınır dışına düşmez (yükseklik, derinlik, en, boy, açı, merkez) | `MRK-10`; `MRK-U9` (400, alan yolu) |
| MRK-11 Seri no en çok 80 karakter: kayıtta en uzun açık emirle, markalamada gerçek numarayla | `MRK-11`; `MRK-U9` (kayıtta 400, markalamada 422) |
| MRK-12 Model tanımın malzemesine bağlı belge; istasyon kayıtlı ve aktif; yer normali sıfır değil | `MRK-12`; `MRK-U8` (400) |
| Pasif tanım seri vermez, listede kalır, geri etkinleşir | `MRK-U12` |
| İzleme: seri parçası (harften bağımsız, tam eşleşme önde), tanım süzgeci, olayda kişi adı ve hurda nedeni; olmayan emrin özeti 404 | `MRK-U13` |
| Seri tekil, sayaç tekrar korumalı | `MRK-U3`; kısıt `markalama_birimi_seri_tekil` |
| Olay defteri yalnız eklenir | `MRK-U6` (UPDATE, DELETE, TRUNCATE reddedilir) |
| 3B yer: nokta ve normal yere, düzlem normale döner, açı normal çevresinde | `sahne.test.ts` |
