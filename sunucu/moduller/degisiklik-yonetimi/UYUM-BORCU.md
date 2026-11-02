# UYUM BORCU: degisiklik-yonetimi (kart 1120)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

## Bağlamada kapanacak
1. Rol x işlem: on bir işlem yalnız yöneticide (1122 a). Roller ortak yetki matrisinden verilir.
2. Etkilenen emir ve stok kaynağı: `servis.ts` `EtkiCozucusu` uretim-emirleri ve stok `disari.ts` ile bağlanır; o zamana kadar karar satırı yok, kapanış koşulu 'bilinmiyor'.
3. Kararın sahada uygulanması (karantina, emir yenileme, hurda, rework, NCR) sahibi modülün ucuyla (1123 a); bugün yalnız iç olay günlüğüne yazılır.
4. İlk parça kanıtı (ölçüm, rapor) denetlenmez; kalite-merkezi bağlanınca.
5. Seri, markalama ve uyum: `konfigurasyon.seriler`, `seriler` ucu, `izlenebilirlik.iplik`, `modSeviyesi`, `emirRevizyonu`, `soyAgaci` null ya da boş; uyum 'bilinmiyor'.
6. Baseline (yayımlı çizim ve rota revizyonu, NC programı), aile ipliği, revizyon stoğu null; cizimler, recete-rota ve stok bağlanınca. Konfigürasyon kaydı 1642 ile bu modülde (20).
7. Maliyetler (hurda, rework) ve engellenen NC denemesi null; finans ve NC doğrulama bağlanınca.
8. Sapma satırında kapsam, kalem, revizyon, emir no ve bitiş null; kalite-merkezi sapma kaydı bağlanınca.
9. Tatil takvimi yok; iş günü pazartesi-cuma (VARSAYIM).
10. ~~Malzemeye yabancı anahtar (talep_kalemi, emir_kalemi, gecerlilik_son_urun_id): Aşama 2 ayrı göç.~~ Kapandı (1314, 1305 a): `20261029151000_degisiklik_yonetimi_malzeme_fk.sql`.
11. Ekran (P4 isteği): bağlı olmayan veri ekranda "bağlı değil / Veri yok" yazar; İzlenebilirlik'te "Sevk et" düğmesi yok (sevkiyat, Aşama 2).
12. Parça kutusundaki "Kaydı aç" (malzeme ekranı yolu) Aşama 2'de bağlanır; o zamana kadar gizli (1177 a).
13. Kural, sürüm ve sunucu kuralları akış akış kapanır; kabul kullanıcı deneyince.
14. Kalem revizyon denetimi (1735, TMI B6): `kalemKaydet` yeni çizim ve rota revizyon kimliğinin var olduğunu ve kalemin malzemesine ait olduğunu denetlemez; cizimler ve rota `disari.ts` okumasıyla kapanır. Ekran o zamana kadar etiket yerine kimlik gösterebilir.
15. Rota bağı ekranda (1735, TMI B7): yürürlükteki ve yeni rota revizyonu için seçim alanı yok; rota bağlanınca gelir. Metin bugün yalnız kimliğin yazıldığını söyler.
16. Bildirim (1735, TMI B9): CCB, ret ve FAI işleri kişiye bildirim olarak gitmez; yalnız Görevlerim. Rollerle birlikte bağlanır.
17. Rol önerisi (1735, TMI B10): talep açma herkese, sınıflandırma planlama ve kaliteye, CCB müdür ve kaliteye; ortak yetki matrisinde kullanıcıya sorulur.
18. Talebi geri çekme ya da iptal (1735, TMI B12): uç yok; yeni uç ve işlem olarak kullanıcıya sorulur.
19. Kapanış imzası (1735): bilinmeyen koşul varken imza "bağlı olmayan koşulları bilerek kapatıyorum" der (`kapanisImzaAnlami`); kaynaklar bağlanınca bilinmeyen kalmaz ve eski imza döner.
20. Konfigürasyon (1642): parça revizyonu, proses sürümü ve öğe kimlikleri bu modülde yazılır; revizyon etiketleri (`baseline.cizimRevizyonu`, `rotaRevizyonu`, öğe `etiket`), NC adları, tasarım otoritesi ve parça hali sahibi modüller bağlanınca dolar. Sahibi modülde yürürlüğe alma (ortak arayüz, 1641) bağlanana dek yayın yalnız bu kaydı yazar.
21. Ekran (1642): kalem formunda parça revizyonu ve öğe listesi alanı yok (prototip ister); tasarım sınıfında parça revizyonu verilmezse konfigürasyonda önceki revizyon kalır. Prototip gelince tasarımda zorunlu olur.
22. Yeni parça numarası alan kalemde (D1, değiştirilemez) konfigürasyon yazılmaz: kartı malzemeler açar (Aşama 2); kart açılınca yeni parçanın ilk konfigürasyonu yazılır.
23. Kalemin eski dört revizyon sütunu (`eski_/yeni_cizim_revizyonu_id`, `eski_/yeni_rota_revizyonu_id`) 1642 göçüyle öğe tablosuna kopyalandı ve okunmuyor; silinmesi dolu tabloyu değiştiren göçtür, kullanıcı onayıyla ayrı kart.
24. Öğe revizyon kimlikleri sahibi modülde var mı ve kalemin parçasına mı ait, denetlenmez (14 ile aynı); sahibi modüllerin `disari.ts` okumasıyla kapanır.
19. Kapanış (K16 a, kart 1819): bilinmeyen koşul varken ECO kapanmaz (`kapatilabilirMi`, sunucu ve düğme aynı kural). Seri ve yeni revizyonla üretim koşulları bugün hep bilinmiyor olduğundan hiçbir ECO kapanamaz; etki çözücü, seri ve rota-üretim kaynakları bağlanınca kapanış açılır.
