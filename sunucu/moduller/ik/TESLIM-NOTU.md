# Teslim notu: ik v3 (Mesailerim, bordro onayı), taban 640bebf

Ekran yolu A (v2 ile aynı): uygulama yalıtılmış çerçevede, menü kabukta. Kararlar: ON-PAKET-ik-v3.md (kullanıcı kararları 12.10.2026,
"1-a, 2a"). Kural-test: KURAL-TEST.md "v3 ekleri". Uyum borcu: sunucu/moduller/ik/UYUM-BORCU.md "v3".

## Bu modül şunları varsaydı
1. IK-33 (VARSAYIM yanlış çıktı, DOĞRULANDI): bugünkü bordro hesabı onay durumuna bakmaz; ayın bütün devam kayıtları mesai
   ve kesintiye girer (paket.ts bordro mesai toplamı, `onay` süzgeci yok). Ekrana bugünkü kural yazıldı: "Onay bekleyen kayıtlar da
   bordro hesabına girer; bordro kesinleşmeden önce insan kaynakları düzeltebilir." Kullanıcı kararı 12.10.2026 ("2a"): kural böyle kalır.
2. IK-34 (DOĞRULANDI): yıllık fazla mesai personel kartındaki "Bu yıl fazla mesai" ile aynı hesap: "Fazla mesai" ve "Hafta tatili
   çalışması" türleri, sınır ayarlardaki `yillikMesaiLimit` (yoksa 270). Fark: kart bugünün yılını, Mesailerim seçili ayın yılını alır.
3. Devamsızlık (gün): kayıt sayısıdır, bir kayıt bir gün (VARSAYIM; uygulamanın Devam ekranı da kayıt sayar).
4. IK-43: kesinleştirme sayısı ayrı sütunda tutulmaz; bordro kaydının `surum` alanı odur (bordro yalnız kesinleştirmede yazılır, her
   yazmada bir artar; DOĞRULANDI `ik_kayit_koru` tetikleyicisi ve "yeniden kesinleştirme" testi). Yeniden kesinleştirme onayı her zaman düşürür,
   tutar değişmese de (VARSAYIM: onaylanan belge yeniden üretildi).
5. Rol: `ik.bordro-gordum` "İK İşlemlerim" sayfasını alan her rolde. Kullanıcı kararı 12.10.2026 ("1-a"): `bakim` ve `sevkiyat` da
   sayfayı, izin talebini ve bordro onayını alır (göç `20261012083020_kisiler_ik_bakim_sevkiyat.sql`).
6. Yapılacaklar hatırlatması son üç ayın kesinleşmiş bordrolarını kapsar, ay başına bir iş (VARSAYIM).
7. İK'nın "başka gözle önizleme"sinde onay düğmesi yerine "Onay bekliyor" çipi görünür (onay yalnız kişinin kendisinden).
8. İtiraz yolu yok (ON-PAKET açık sorusu; öneri: ilk sürümde yok).
9. Paket yaması: ik-modulu kaynağı teslimde yok; değişiklik derlenmiş pakete `yama/ik_v3_uygulama_yamasi.py` ile yapıldı. Betik her
   yerin tek olduğunu denetler, ikinci koşuda dokunmaz. Kaynak yeniden derlenirse aynı değişiklik kaynağa taşınmalı.

## Komutlar (depo kopyası, Node 22.22, PostgreSQL 16; Node 24 kurulamadı)
Üç ağaçta koşuldu: (a) taban + kalite + ik v3, (b) taban + yalnız ik v3, (c) taban + yalnız kalite.
- `npm run tip`: hatasız (a, b). `npm run lint`: hatasız (a, b). `npm run sinir`: (a) "885 dosya, 0 ihlal", (b) "864 dosya, 0 ihlal".
- `npm run test:sunucu` (a, karar 1-a sonrası): 2123 testten 2122 geçti. Kalan kırmızı oturum "aynı çiftten 20 eşzamanlı deneme"
  temiz 640bebf'de de kırmızı (ortam: eşzamanlılık 4). Önceki koşuda plan "PL-03, PL-04, PL-09" da kırmızıydı; o da tabanda kırmızı
  çıktı ve bu koşuda geçti (saate bağlı görünüyor, VARSAYIM); bu teslimle ilgisiz.
- `npm run test:istemci` (a): "Test Files 131 passed (131)", "Tests 1181 passed (1181)".
- (b) ağacındaki ik modül, oturum, sağlık, kisiler ve istemci sonuçları: KURULUM.md "Doğrulama".

## Geçiş
Var olan kurulumda `ik_bordro_onayi` boş başlar: daha önce kesinleşen bordrolar onaysız görünür ve çalışan onaylayabilir.
