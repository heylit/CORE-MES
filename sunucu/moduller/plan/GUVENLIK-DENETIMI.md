# Güvenlik denetimi (plan)

Uçlar `uc()` ile: şema, oturum, işlem, kayıt noktası, denetim kaydı çekirdekten. Kişi ve zaman sunucudan. Genel kaydet ucu yok; her yazma
ayrı uçtur. Yerleşim komutları yerleşim sürümüyle, plan geneli (öner, yerleştir, sırala) plan sürümüyle denetlenir (eski sürüm 409).
Test: U = `sunucu/moduller/plan/plan-*.test.ts` (gerçek PostgreSQL; ortak kurulum `plan-ortak.test.ts`), K = `kurallar.test.ts`, E = `istemci/src/moduller/rota/Rotalar.test.tsx`.

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
| POST /plan/senaryolar/:id/canliya-al | plan.canliya-al | PL-ONAY: yalnız onaydaki taslak (açık 409); dört göz açıkken son gönderen alamaz (403); senaryo sürümü; canlı plan değiştiyse açık onay (409); kapsam; her kaynak aktif; başlamış işler canlıdaki hâliyle; kaynak iş emrine yazılır; taslağın ayarı ve bedel ayarı tek güncellemeyle, taslaktaki elle çarpanlar yazanıyla geçmişe (148 a); onay kaydı ve taban plan aynı işlemde, kişi ve zaman sunucudan, yalnız eklenir (33 a) | U P4 (müdür, onaylı); U 33-1, 33-4; U PL-ONAY; U 146 (başkası, dört göz kapalıyken gönderen) | U PL-ONAY (açık taslak 409, operatör 403, eski sürüm 409); U 146 (dört göz 403); U P4 (onaysız 409, operatör 403); U 33-3, 33-5 |
| POST /plan/senaryolar/:id/onaya-gonder | plan.studyo | PL-ONAY: yalnız sahip, yalnız açık taslak; senaryo sürümü; not en çok 500; onay kaydı yalnız eklenir; onaydaki taslağa plan yazılmaz (409), taslaksız yazma yeni taslak açar | U PL-ONAY | U PL-ONAY ret (başkası 403, operatör 403, stüdyosuz 403, onaydaki 409, vazgeçilen 409, eski sürüm 409) |
| POST /plan/senaryolar/:id/onaydan-cek | plan.studyo | PL-ONAY: yalnız sahip, yalnız onaydaki taslak; senaryo sürümü; taslak açık olur | U PL-ONAY | U PL-ONAY ret (açık 409, başkası 403) |
| POST /plan/senaryolar/:id/geri-gonder | plan.canliya-al | PL-ONAY: yalnız onaydaki taslak; neden zorunlu (boş 400, kısıt `plan_senaryo_onay_kaydi_neden`); dört göz açıkken son gönderen geri gönderemez; taslak açık olur, canlı değişmez | U PL-ONAY | U PL-ONAY (boş neden 400); U PL-ONAY ret (açık 409, operatör 403); U 146 (403) |
| POST /plan/bedel-ayari | plan.bedel-ayari | 148 a: taslağa yazılır (taslak verilmezse kişiye açılır; verilirse açık, kişinin, okunan sürümde); değerler sınırlı; defter değer taşımaz (237 a); canlıya onayla geçer | U 210 a; U 148 a | U 210 a (planlama 403, sınır dışı 400) |
| GET /plan/bedel-ayari | plan.yaz, plan.bedel-ayari ya da siparisler.fiyat-oku | Taslak verilirse taslağın bedeli (taslak yoksa 404) | U 210 a, 148 a | U 6b (kalite, operatör 403) |
| GET /plan/plan-sagligi | plan.planlama-oku | 1478: salt okunur; ölçüler plan sapmasıyla (782) aynı hesap, kayma ve tutarlılık canlıya alma ölçüm kaydından (1470); veri eksikleri veri sağlığı gibi çağıranın yetkisiyle okunur; tutar dönmez (emir no, op no, istasyon adı, zamanlar, oranlar) | `plan-sagligi.test.ts` (planlama, müdür 200) | `plan-sagligi.test.ts` (operatör 403, oturumsuz 401) |
| GET /plan/projeler/:projeId/plan-gerceklesen | sayfa.projeler ya da projeler.oku | 933 a: salt okunur; proje yoksa 404; iş emirleri iptal hariç; ölçüler plan sapmasıyla aynı hesap (PG-933); iş merkezi kapsamı ve emir okuma yetkisi aranmaz (933 a: projeyi okuyan görür; emir no, op no, istasyon adı ve zamanlar döner, tutar dönmez) | `proje-plani.test.ts` (satın alma, plan okumadan 200) | `proje-plani.test.ts` (operatör 403, yok 404) |

815: `POST /plan/siparisler/:id/carpan` ve `GET /plan/siparisler/:id/bant` kalktı (U 815: 404). `GET /plan/siparisler/:id/carpan` yalnız geçmişi okur; okuma yetkisi aynı (U 815: kalite, operatör 403).

Kullanıcı metni (senaryo adı, iş adı) React metni olarak basılır; HTML/SVG yorumlanmaz (çizelgede SVG yalnız sayılarla çizilir).

Dört göz ayarı (`plan.dort-goz`, varsayılan kapalı, 146) sunucuda okunur; kapalıyken gönderenin kendi onayı kayıtta `dort_gozsuz` diye işaretlenir.
Onaylayan kuralı (sahip mi, gönderen mi, işlem, durum, dört göz) `kurallar.ts` `onayGecisiReddi`'ndedir; senaryo cevabındaki `yapabilir` aynı kuraldan çıkar.

## Yalnız ekranda kalan kurallar
- Sürükle-bırakın hedef başlangıcı (sütun sonu) ekranda hesaplanır; sunucu yine çakışma ve kuralları denetler.
- Kilitli ve başlamış kartın sürüklenememesi (sunucu da reddeder).
- Uyarıların renklendirilmesi.
