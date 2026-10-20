# Denetim gunlugu

| Tarih | Commit | Kayit |
|---|---|---|
| 2026-10-08 | 21c2b9acf38459fb22a34a065fbe3c16698cc251 | BASLANGIC: 43 bulgu (KRITIK 4, YUKSEK 8, ORTA 16, DUSUK 15). Tip, sinir, lint yesil; testler 1377 sunucu + 622 istemci, 0 kirmizi. Ayrinti: DURUM.md |
| 2026-10-08 | 21c2b9acf38459fb22a34a065fbe3c16698cc251 | B-013: kullanici Arkon islemlerinin alti roldeki dagilimini onayladi (AR1-b); risk kabul, B-005/B-006 canli. DN1-a: KRITIK ve YUKSEK bulgular modul yazarlarina dagitiliyor. Bulgu sayisi degismedi: 43. |

[2026-10-08 15:55 UTC] 1cc496f (onceki 21c2b9a; 32 dosya: arkon TA1/TA2/T2/TBw, ortak ikinci menu #325, satin-alma belge) · DIKKAT
Test arkon sunucu 144/144, arkon istemci 32/32, istemci/src/ortak 320/320 · Tip 0 hata · Lint 0 · Sinir 506 dosya 0 ihlal (Node 24.21, PG 16)
Yeni: yok. TBw `unsafe-eval` yalniz calisan cevabinda (arkon/sun.ts CALISAN_ILKESI), canli katmanda baslik eksigi UYUM-BORCU'da (sayilmadi). Yeni kurallarin testi var (yansima.test.ts TA1/TA2/T2, sun.test.ts TBw).
Kapanan: B yok; cekirdek istegi C-3 (ikinci menu 768'den sutun) kapandi: Kabuk.tsx useTabletEkran.
Hala acik: B-001..B-043 (2. kez); arkon degisti ama B-005, B-006 dokunulmadi (servis.ts yalniz yansima kismi, operator.ts kalite kapisi yine istemcide).
Gidisat: degisiklikler temiz ve testli; KRITIK 4 ve YUKSEK 8 bulgunun hicbirine bu turda dokunulmadi.

[2026-10-08 16:00 UTC] a45e794 (onceki 1cc496f; 15 dosya, yalniz arkon: TB2, T3, T4, T5) · DIKKAT
Test arkon sunucu 145/145, arkon istemci 34/34 · Tip 0 hata · Lint 0 · Sinir 507 dosya 0 ihlal
Yeni: yok. T5 (adimsiz paket yayinlanamaz) sunucuda: kurallar.ts yayinEksigi, servis.ts belgeYaz; izinli ve reddeden test guvenlik.test.ts "adimi olmayan paket yayinlanamaz (T5)". Sahiplik ve yon degismedi.
Kapanan: yok.
Hala acik: B-001..B-043 (3. kez); B-030 surer (operator ekraninda "FLN-120 flans" ornek etiketi duruyor, yalniz veri yoksa gizleniyor); B-005, B-006 dokunulmadi.
Gidisat: arkon kurallari sunucuya iniyor ama acik KRITIK ve YUKSEK bulgulara hala sira gelmedi.

[2026-10-08 16:15 UTC] KARAR DENETIMI (pencere 15:30-16:10 UTC, ilk kayit) · DIKKAT
Kararlar: 15 yeni (K-001..K-015, KARARLAR.md) · Onaysiz: K-003 (Arkon rol x depo okuma esitlemesi tablet davranisindan varsayildi; yetki modeli, kullaniciya sorulmadi) · Celiski: K-008 (SAT-56 <-> satin-alma Karar 10, B-021 ile ayni) · Sapma: K-005 (koordinator "ekrana dokunma" dedi; PR #337 arkon/web/src/app/kalite.ts tek satir degistirdi, kullaniciya bildirildi) · Takili: yok
Bekleyen: Arkon RED'de durdurma (15:38), Logo LB1-LB8 (15:48), #318 stok CI siniri (16:08).
Uygulama: K-009 FK1 PR #335 kurallar.ts caprazKurHatasi ile uyumlu; K-012 goc sayma testi PR'da (yazar beyani, kosulmadi).

[2026-10-08 17:15 UTC] KARAR DENETIMI (pencere 16:10-17:10 UTC) · DIKKAT
Kararlar: 11 yeni (K-016..K-026) · Onaysiz: yok (K-003 AK2-a ile 16:14'te onaylandi) · Celiski: K-008 (SAT-56, ertelendi); K-014/K-021 <-> proje talimati kural 8 "dis servis yok" (PM2 bekliyor) · Sapma: yok · Takili: yok
Bekleyen: LT2 kopru/REST (16:38), PM1-PM2 CLAUDE.md ve proje talimati (16:38), bos sayi ayari varsayilana dusuyor mu (17:02).
Uygulama: K-018 #340 ve #342 birlesti; K-016 #337 birlesti; K-026 #345 kirmizi kaniti PR yorumunda, zamanlayici parcasi kirmizi gorulmedi; K-025 tur-kod eslemesi serbestligi varsayim.

[2026-10-08 18:12 UTC] KARAR DENETIMI (pencere 17:10-18:10 UTC) · DIKKAT
Kararlar: 5 yeni (K-027..K-031) · Onaysiz: yok · Celiski: K-008 (SAT-56, ertelendi); K-027 CLAUDE.md istisnasi <-> proje talimati kural 8 (kullanici PM2 b ile bilerek birakti) · Sapma: yok · Takili: yok
Bekleyen: AY1 ayarda Iyi/Hurda (17:59), bos sayi ayari varsayilana dusuyor mu (17:02), SAT-56 (baglamada).
Uygulama: K-030 #350 birlesti (0f5b341), ana dal CI bekleniyor; K-029 onay kaniti olarak birlesticiye yanlis mesaj eklendi (gercek onay ...XzDfG9zc, 17:20); K-028 #339 taslak, degismedi.

[2026-10-08 19:12 UTC] KARAR DENETIMI (pencere 18:10-19:10 UTC) · DIKKAT
Kararlar: 0 yeni (yalniz onceki kararlarin uygulamasi ve birlestirmeler) · Onaysiz: yok · Celiski: K-008 (SAT-56, ertelendi); K-027 <-> proje talimati kural 8 (kullanici kabulu) · Sapma: yok · Takili: yok
Bekleyen: AY1 Arkon ayarda Iyi/Hurda (17:59), bos sayi ayari varsayilana dusuyor mu (17:02; #339 uyarlamasinda test yaziliyor), SAT-56 (baglamada).
Uygulama: K-016/K-031 #351 birlesti (ad6000b, tablet listesi sunucu okuyabilirMi ile testle esit); K-021 AR2 #345 birlesti (4f06ce0); K-029 #349 (fe7d932); K-020 LB10 #344 (f48619c); K-023 #347 (7561662), ana dal CI yesil; K-025 #348 (8b82170); #339 taslak (K-020), #343 ona bagli.

[2026-10-08 20:12 UTC] KARAR DENETIMI (pencere 19:10-20:10 UTC) · DIKKAT
Kararlar: 2 yeni (K-032, K-033) · Onaysiz: yok · Celiski: K-008 (SAT-56, ertelendi); K-027 <-> proje talimati kural 8 (kullanici kabulu) · Sapma: K-020 (LB10 "KDV bos gelir"; #344 "sayi ya da bos" turu birlesti ama bos deger kaydedilemiyor: sunucu/gocler/20261006183341_ayarlar_tablo.sql:8 ayar_deger_dolu; uygulama eksigi, KD1 ile soruldu) · Takili: yok
Bekleyen: AY1 Arkon ayarda Iyi/Hurda (17:59; 20:59'da TAKILI olur), KD1 kisit gevsetme gocu (19:24), SAT-56 (baglamada).
Uygulama: K-032 #352 birlesti (51a7f53), ana dal CI yesil; K-033 #339 1d88ba5 CI yesil, taslak.

[2026-10-08 21:10 UTC] KARAR DENETIMI (pencere 20:10-21:10 UTC) · DIKKAT
Kararlar: 0 yeni (konularda ve proje sohbetinde hareket yok) · Onaysiz: yok · Celiski: K-008 (SAT-56, ertelendi); K-027 <-> proje talimati kural 8 (kullanici kabulu) · Sapma: K-020 suruyor (bos KDV ayari, KD1 bekliyor) · Takili: Arkon oturtma (AY1, 17:59'dan beri)
Bekleyen: AY1 (TAKILI), KD1 kisit gevsetme gocu (19:24), SAT-56 (baglamada).

[2026-10-08 22:10 UTC] KARAR DENETIMI (pencere 21:10-22:10 UTC) · DIKKAT
Kararlar: 0 yeni (hareket yok) · Onaysiz: yok · Celiski: K-008 (SAT-56, ertelendi); K-027 <-> proje talimati kural 8 (kullanici kabulu) · Sapma: K-020 suruyor (KD1 bekliyor) · Takili: Arkon oturtma (AY1, 17:59'dan beri)
Bekleyen: AY1 (TAKILI), KD1 (19:24; 22:24'te TAKILI olur), SAT-56 (baglamada).

[2026-10-08 23:10 UTC] KARAR DENETIMI (pencere 22:10-23:10 UTC) · DIKKAT
Kararlar: 0 yeni (hareket yok) · Onaysiz: yok · Celiski: K-008 (SAT-56, ertelendi); K-027 <-> proje talimati kural 8 (kullanici kabulu) · Sapma: K-020 suruyor (KD1 bekliyor) · Takili: Arkon oturtma (AY1, 17:59'dan beri), Cekirdek oturtma (KD1, 19:24'ten beri)
Bekleyen: AY1 (TAKILI), KD1 (TAKILI), SAT-56 (baglamada).

[2026-10-09 01:00 UTC] KARAR DENETIMI (pencere 23:10-01:00 UTC) · DIKKAT
Kararlar: 9 yeni (K-034..K-042) · Onaysiz: yok · Celiski: K-035 <-> K-019/K-020 (KDV varsayilani bos -> %20; kullanici kendi kararini degistirdi, sonraki gecerli; K-034 ile farki koordinator KD2 ile sordu, kapandi); K-008 (SAT-56) acik, SA5 sorusuyla cozulecek; K-027 <-> proje talimati kural 8 (kullanici kabulu) · Sapma: K-020 kapandi (K-036: bos deger gerekmiyor) · Takili: yok (AY1 ve KD1 kapandi)
Bekleyen: SORULAR.md 22 soru + TS1 (00:38). Dikkat: SA2 onerisi (a, katalog-malzeme bagi istege bagli) onceki OS kararindaki "bag zorunlu" ile celisir; SA5 a K-008'i (Karar 10, sunucu kendi toplamini yazar) kapatir, b KURAL-TEST'i izler.
Uygulama: K-036 #354 birlesmeden kapandi, kisit sunucu/gocler/20261006183341_ayarlar_tablo.sql:8 aynen; K-035 #339'a KDV 20 eklenecek (dogrulanmadi). Koordinatorun 23:59 ozetindeki "denetci rutini 3 saatte bir" ifadesi yanlis; rutin saatlik calisiyor.

[2026-10-09 03:00 UTC] KARAR DENETIMI (pencere 01:00-03:00 UTC) · DIKKAT
Kararlar: 10 yeni (K-043..K-052) · Onaysiz: yok · Celiski: K-008 kapandi (K-044, SA5 a); K-047 teslim asimi kurali TS1 onerisiyle ayni mesajdaki "hepsi a" arasinda yorum (ozel kural esas alindi); K-027 <-> proje talimati kural 8 (kullanici kabulu) · Sapma: yok · Takili: yok
Bekleyen: AG2-1..5, FS1-4, MH1-5, RC1 (01:23); uc kart ve CLAUDE.md madde 6 (01:04); KH1-KH4 (01:04).
Uygulama (DOGRULANDI, origin/main 6e04d3e): K-046 SA3 sunucu/gocler/20261009023000_satin_alma_kur_finanstan.sql:12-21 once sayar, teklif kuru kalir, yalniz satin_alma_kur.kur duser; K-045 20261009024000_satin_alma_katalog_malzeme_bagi.sql once sayar, malzeme_no NOT NULL, kopya sutun dusurme yok. c73e2d4'ten beri rol gocu yok (RC1 onayi bekleniyor, kurala uygun). Birlesen: #356, #357, #358-#363, #364, #366, #367.

[2026-10-09 05:00 UTC] KARAR DENETIMI (pencere 03:00-05:00 UTC) · DIKKAT
Kararlar: 13 yeni (K-053..K-065) · Onaysiz: K-064 (#376 "yaz" denmeden acildi; 04:57 sonradan onaylandi) · Celiski: K-053 KH3 b bos ayar <-> K-036 ayar_deger_dolu kisiti (risk; Logo thread'inde) ; K-027 <-> proje talimati kural 8 (kullanici kabulu) · Sapma: yok · Takili: yok
Istisna: K-061 disaridaki terminal modulune cekirdek test satiri (kullanici onayli).
Bekleyen: CLAUDE.md madde 6 satiri (01:04, kullanicida).
Uygulama (DOGRULANDI, origin/main e86c155): 6e04d3e'den beri goc yok; birlesen #206 (stok malzeme turlerini malzemeler sozlesmesinden okur, hizmet stoka girmez; K-048 ile uyumlu), #246, kod degerlendirme 04:50.

[2026-10-09 07:00 UTC] KARAR DENETIMI (pencere 05:00-07:00 UTC) · DIKKAT
Kararlar: 10 yeni (K-066..K-075) · Onaysiz: yok · Celiski: K-067 <-> K-036 (bos ayar; kullanici kendi kararini gerekceyle degistirdi, K-053 riski kapandi); K-027 <-> proje talimati kural 8 (kullanici kabulu) · Sapma: yok · Takili: yok
Not: K-073 maddeleri koordinatorun ozet listesinden; ilgili thread metinleri bu turda tek tek okunmadi.
Bekleyen: KD-009..KD-011 a/b (06:53); satin alma rolleri gir (hazirlaniyor); CLAUDE.md madde 6 (01:04, kullanicida).
Uygulama (DOGRULANDI, origin/main 3232ca6): 11 yeni goc; 20261009050115_ayarlar_bos_deger.sql once sayar, kisiti kaldirir (K-067). Birlesen: #377, #374, #381, #371, #380, #382, #365, #390, #386, #387, #388, #397, #389. Rol gocu yalniz finans (K-070 onayli).
