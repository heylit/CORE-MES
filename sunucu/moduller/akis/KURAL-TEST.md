# Kural -> test (akis)

Testler: `kurallar.test.ts` (saf), `akis.test.ts` (gerçek PostgreSQL), `istemci/src/moduller/akis/Akis.test.tsx`. Kısıt yok (modülün tablosu yok).

| Kural | Test |
|---|---|
| AKS-1 Adım olayları hazırlık / işleme / duraklama / duruş bölümlerine ayrılır; açık son durum şimdiye kadar sürer | `hazırlık, işleme, duraklama, duruş ve bitiş sırayla bölümlenir`; `bitmemiş adımın son durumu şimdiye kadar açık sürer`; `olayı olmayan adımda başlama-bitiş işleme sayılır; başlamamış adımda bölüm yok` |
| AKS-2 Fason ilk gidişten son dönüşe; eksik dönüşte açık | `ilk gidişten son dönüşe; eksik dönüşte şimdiye kadar açık` |
| AKS-3 Adım önü bekleme: önceki adımın ilk sağlam sayımından (fasonda ilk dönüşten) bu adımın ilk olayına | `adım ölçüleri: bekleme önceki adımın ilk sayımından (fasonda ilk dönüşten) başlar; çevrim işleme ÷ sağlam` |
| AKS-4 Statüde kalış ilk giren ilk çıkar; aynı statüde konum değişimi sayılmaz; geri alma kalış yazmaz | `parça parça giren adet, sonraki adımın çevirmesiyle sırayla eşleşir`; `aynı statüde konum değiştirmek kalışı bozmaz; geri alma en son girişten düşer ve kalış yazmaz` |
| AKS-5 Hammadde: mal kabul partiden; kullanım sarf, HM'den çevirme ya da ilk başlama; mal kabulsüz partide bekleme uydurulmaz | `hammadde: sarf yoksa HM statüsünden çevirme kullanım sayılır; mal kabulü bilinmeyen partide bekleme uydurulmaz` |
| AKS-6 Damgalar ve ölçüler; sürende açık, iptalde açık ölçü yok; akış verimi | `damgalar ve uçtan uca ölçüler: mal kabulden sevke`; `sürmekte olan emirde ölçüler şimdiye kadar açık; iptal emirde açık ölçü yok`; `şeritler: hammadde, her adım ve sevk; bekleme bölümü adımın önünde` |
| AKS-7 Sevk anı: tamamlanan iş ya da kaldırılan kayıt; yoldaki ve iptal iş sevk değil | `tamamlanan iş sevk sayılır; yoldaki sayılmaz; kaldırılan kayıt kaldırıldığı an sevk sayılır` |
| AKS-U1 Okuma yalnız `sayfa.akis` ile | `AKS-U1: sayfa işlemi olmayan okuyamaz (403); yönetici okur; olmayan emir 404` |
| AKS-U2 Yolculuk gerçek kayıtlardan kurulur | `AKS-U2: emir yolculuğu adımların, fasonun ve sevke hazırın gerçek kayıtlarından kurulur` |
