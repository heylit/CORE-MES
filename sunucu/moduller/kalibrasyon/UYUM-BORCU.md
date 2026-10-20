# UYUM BORCU: kalibrasyon (kart #247, dal 247-tanim-modulleri)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI (kod ya da komut), VARSAYIM, BİLMİYORUM.
Sınıflar: TUTAN (kullanımı tutar), ETKİLEYEN (kullanımı etkiler), SONRA. Kullanıcı kararları 08.10.2026 (kart #247).

## Bu dalda kapananlar
- KAPANDI: okuma uçları yalnız `kalibrasyon.oku` istiyordu; sayfası olan rol ekranda 403 alırdı. Üç GET ucu artık
  `{ biri: ['sayfa.kalibrasyon', 'kalibrasyon.oku'] }` (ADR 0007 madde 5; `kalibrasyon.oku` kalır, kullanıcı kararı). Test: "yetki: sayfası olan rol...".
- KAPANDI (TUTAN): ikinci menü yoktu, ekran kendi sekme şeridini çiziyordu. Menü `paylasilan/sayfalar/kalibrasyon.ts` `KALIBRASYON_IKINCI_MENU`;
  bölüm adresten (`/kalibrasyon/turler`). Toplayıcı satırı ayrı commit'te (kullanıcı kararı T1 a).

## Bağlamada kapanacak
1. KAPANDI. Rol x işlem: `20261008082300_kisiler_kalibrasyon_istasyon_denetim.sql` kaliteye `sayfa.kalibrasyon` ve `kalibrasyon.yaz`,
   müdüre `sayfa.kalibrasyon` verir (kullanıcı kararı RM2: kalite görür ve yazar, müdür görür). `kalibrasyon.oku` hiçbir rolde değil;
   okuma uçları sayfa işlemini de kabul eder (ADR 0007). DOĞRULANDI: `kisiler/rol-dagilimi.test.ts` "kalibrasyon, istasyon yazımı...".
2. SONRA. Ölçü aleti malzemeler demirbaşında da tutuluyor (`kayit.g.kalAy`, `kayit.g.sonKal`). Arkon `gauges` A7 (#518) ile buradan okur.
   DOĞRULANDI: `tur1-raporlar/ortaklik-tablosu.md` satır 13. Uyum: Aşama 2'de sahiplik kullanıcıya sorulur.
3. SONRA. `gecerliAletVarMi`, `aletGetir`, `vadesiGecenAletSayisi` `disari.ts`'te açık ama bugün çağıran modül yok; `aletlerVeKayitlari`'nı Arkon çağırır (A7, #518).
   Uyum: ölçüm yazan modül bağlanınca.

## Bağlamada kapanmayacak (kullanıcı kararıyla borçta)
4. KAPANDI (kart #369, kullanıcı kararı CK2 a): sürüm sütunu ve 409; kalibrasyon kaydı da sürümü artırır. Önceki hâli: sürüm denetimi yok: `POST /olcu-aletleri/:id/guncelle`, `POST /olcu-aleti-turleri/:id/guncelle` son yazanı kazandırır.
   DOĞRULANDI: tablolarda sürüm sütunu yok. Uyum: sürüm sütunu (dolu tabloya sütun); kullanıcı kararı gerekir.
5. KAPANDI (kart #247 N8, dal 247-kalibrasyon-tekrar): `POST /olcu-aletleri/:id/kalibrasyon-kaydet` tekrar korumalı; test KLB-S8.
   Kalan (kullanıcı kararı K8): `POST /olcu-aletleri` ilk kalibrasyonla kayıt da yazabilir ve korumasızdır. Çift gönderimde ikinci istek
   tekil alet numarasına çarpar (409, KLB-03), kayıt yinelenmez. Ancak ilk cevap yitirilirse kullanıcı 409 görür, alet ve kaydı açılmıştır.
   Uyum: gerekirse aynı kalıp bu uca da konur. Karar: kalsın, K8 geçerli (koordinatör kararı 17.10.2026, kullanıcı kartı yok).
6. SONRA. Tablo ve dizin adları modül adıyla başlamıyor: `olcu_aleti`, `olcu_aleti_turu` ve kısıtları. Dolu tabloyu değiştirir; kullanıcı kararı gerekir.
   Aşama 2'de (koordinatör kararı 17.10.2026, kullanıcı kartı yok).
7. SONRA. Kararla ertelenenler (NOTLAR.md): sertifika dosya eki yok (dosya saklama yok), dışa aktarma ayrı kartla.
8. SONRA (kart #843). Simge tür adından seçilir; adı tanınmayan ya da yeniden adlandırılan tür genel simgeye düşer. VARSAYIM: geri alma ucuz (tek dosya).
   Kalıcı yol: türe `simge` sütunu; dolu tabloya sütun ekler, kullanıcı kararı gerekir.
9. SONRA (kart #843, çekirdek isteği). Ana menü, ikinci menü ve ana sayfa kartı ortak setteki `ruler` simgesini kullanır; ortak sete kumpas simgesi
   eklenmesi `istemci/src/ortak/tasarim/simgeler.ts` işidir, bu modül dokunmaz.
