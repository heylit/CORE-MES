# Güvenlik denetimi (plan)

Uçlar `uc()` ile: şema, oturum, işlem, kayıt noktası, denetim kaydı çekirdekten. Kişi ve zaman sunucudan. Genel kaydet ucu yok; her yazma
ayrı uçtur. Yerleşim komutları yerleşim sürümüyle, plan geneli (öner, yerleştir, sırala) plan sürümüyle denetlenir (eski sürüm 409).
Test: U = `sunucu/moduller/plan/plan.test.ts` (gerçek PostgreSQL), K = `kurallar.test.ts`, E = `istemci/src/moduller/rota/Rotalar.test.tsx`.

| Yol | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| GET /plan, GET /plan/senaryolar | oturum | Kapsam: iş merkezi kısıtlı kullanıcı yalnız izinli istasyonların kaynaklarını ve yerleşimlerini görür | U P1 | U P5 kapsam (liste boş) |
| POST /plan/oner | plan.yaz | Plan sürümü; tekrar korumalı; sabitler (kilitli, başlamış, kapsam dışı) yerinde; çakışmasız yerleştirme; kaynak iş emrine yazılır (P3) | U P1; K P1 | U P5 (operatör 403 taşıma testinde); eski sürüm aynı kural |
| POST /plan/yerlestir | plan.yaz | Plan sürümü; tekrar korumalı; iş planlı; kaynak var, aktif, kapsamda; süre (yoksa elle); çakışma | K PL-01 | U P5 çakışma / pasif / kapsam (taşı ile aynı denetim fonksiyonları) |
| POST /plan/yerlesimler/:id/tasi | plan.yaz | Yerleşim sürümü; kilitli değil; iş başlamamış; eski ve yeni kaynak kapsamda; yeni kaynak aktif; çakışma; kaynak iş emrine yazılır | U P5 izinli taşıma | U P5: operatör 403, çakışma 409, eski sürüm 409, pasif makine 422, kilitli 409, başlamış 409, kapsam 403 |
| POST /plan/yerlesimler/:id/kaldir | plan.yaz | Sürüm; kilitli ve başlamış kaldırılamaz; kapsam | U kilit testi (kilit açık, planlı) | U kilit testi (kilitli 409, başlamış 409) |
| POST /plan/yerlesimler/:id/kilitle, /kilidi-ac | plan.kilitle | Sürüm; kapsam | U kilit testi (müdür) | U kilit testi (operatör 403) |
| POST /plan/kuyruk/sirala | plan.yaz | Plan sürümü; yerleşimler o kaynakta; kilitli ve başlamış değil; çakışma | U kuyruk testi | U kuyruk testi (başka kaynak 400) |
| POST /plan/senaryolar | plan.studyo | Tekrar korumalı; canlının kopyası; taban plan sürümü | U P4 | U P4 (operatör 403) |
| POST /plan/senaryolar/:id/oner, /tasi, /vazgec | plan.studyo | Açık senaryo; taşıma kuralları (aktif, kapsam, başlamış, kilitli, çakışma) senaryo içinde; canlı değişmez | U P4 | U P4 (canlı değişmedi doğrulaması) |
| POST /plan/senaryolar/:id/canliya-al | plan.canliya-al | Canlı plan değiştiyse açık onay (409); kapsam; her kaynak aktif; başlamış işler canlıdaki hâliyle; kaynak iş emrine yazılır | U P4 (müdür, onaylı) | U P4 (onaysız 409, operatör 403) |

Kullanıcı metni (senaryo adı, iş adı) React metni olarak basılır; HTML/SVG yorumlanmaz (çizelgede SVG yalnız sayılarla çizilir).

## Yalnız ekranda kalan kurallar
- Sürükle-bırakın hedef başlangıcı (sütun sonu) ekranda hesaplanır; sunucu yine çakışma ve kuralları denetler.
- Kilitli ve başlamış kartın sürüklenememesi (sunucu da reddeder).
- Uyarıların renklendirilmesi.
