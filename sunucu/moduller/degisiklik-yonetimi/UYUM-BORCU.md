# UYUM BORCU: degisiklik-yonetimi (kart 1120)

Her madde: kural / istisna / nerede / nasıl uyumlanır. İşaretler: DOĞRULANDI, VARSAYIM, BİLMİYORUM.

## Bağlamada kapanacak
1. Rol x işlem: on bir işlem yalnız yöneticide (1122 a). Roller ortak yetki matrisinden verilir.
2. ~~Etkilenen emir ve stok kaynağı: `servis.ts` `EtkiCozucusu` uretim-emirleri ve stok `disari.ts` ile bağlanır; o zamana kadar karar satırı yok, kapanış koşulu 'bilinmiyor'.~~ Kapandı (1644): `KAYNAKLARDAN_ETKI` yayında malzemenin taslak, planlı ve başlamış emirlerini ve stoğunu okur; açık karar kapanışı durdurur. Kalanı 25-28.
3. Kararın sahada uygulanması (karantina, emir yenileme, hurda, rework, NCR) sahibi modülün ucuyla (1123 a); bugün yalnız iç olay günlüğüne yazılır.
4. İlk parça kanıtı (ölçüm, rapor) denetlenmez; kalite-merkezi bağlanınca.
5. Seri, markalama ve uyum: `konfigurasyon.seriler`, `seriler` ucu, `izlenebilirlik.iplik`, `modSeviyesi`, `emirRevizyonu`, `soyAgaci` null ya da boş; uyum 'bilinmiyor'.
6. Baseline (yayımlı çizim ve rota revizyonu, NC programı), aile ipliği, revizyon stoğu null; cizimler, recete-rota ve stok bağlanınca. Konfigürasyon kaydı 1642 ile bu modülde (20).
7. Maliyetler (hurda, rework) ve engellenen NC denemesi null; finans ve NC doğrulama bağlanınca.
8. Sapma satırında kapsam, kalem, revizyon, emir no ve bitiş null; kalite-merkezi sapma kaydı bağlanınca.
9. Tatil takvimi yok; iş günü pazartesi-cuma (VARSAYIM).
10. ~~Malzemeye yabancı anahtar (talep_kalemi, emir_kalemi, gecerlilik_son_urun_id): Aşama 2 ayrı göç.~~ Kapandı (1314, 1305 a): `20261029151000_degisiklik_yonetimi_malzeme_fk.sql`.
12. Parça kutusundaki "Kaydı aç" (malzeme ekranı yolu) Aşama 2'de bağlanır; o zamana kadar gizli (1177 a).
14. Kalem revizyon denetimi (1735, TMI B6): rota öğesi kapandı (1819, DY-25: `rota/disari.ts` `revizyonKunyeleri` ile var olma ve parçaya aitlik). Çizim ve diğer öğe türleri denetlenmez: belge merkezinde revizyonun sahibi parçayı veren `disari.ts` okuması yok; o okuma gelince kapanır. Ekran o zamana kadar etiket yerine kimlik gösterebilir.
15. Rota bağı ekranda (1735, TMI B7): yürürlükteki ve yeni rota revizyonu için seçim alanı yok; rota bağlanınca gelir. Metin bugün yalnız kimliğin yazıldığını söyler.
16. Bildirim (1735, TMI B9): CCB, ret ve FAI işleri kişiye bildirim olarak gitmez; yalnız Görevlerim. Rollerle birlikte bağlanır.
17. Rol önerisi (1735, TMI B10): talep açma herkese, sınıflandırma planlama ve kaliteye, CCB müdür ve kaliteye; ortak yetki matrisinde kullanıcıya sorulur.
18. Talebi geri çekme (1819, DY-26): uç `talepler/:id/geri-cek` var, yetki şimdilik `talep-ac` işlemi ve açan kişi denetimi; ayrı işlem gerekip gerekmediği ortak yetki matrisinde kullanıcıya sorulur.
20. Konfigürasyon (1642): parça revizyonu, proses sürümü ve öğe kimlikleri bu modülde yazılır; revizyon etiketleri (`baseline.cizimRevizyonu`, `rotaRevizyonu`, öğe `etiket`), NC adları, tasarım otoritesi ve parça hali sahibi modüller bağlanınca dolar. Sahibi modülde yürürlüğe alma (ortak arayüz, 1641) bağlanana dek yayın yalnız bu kaydı yazar.
21. Ekran (1642): kalem formunda parça revizyonu ve öğe listesi alanı yok (prototip ister); tasarım sınıfında parça revizyonu verilmezse konfigürasyonda önceki revizyon kalır. Prototip gelince tasarımda zorunlu olur.
22. Yeni parça numarası alan kalemde (D1, değiştirilemez) konfigürasyon yazılmaz: kartı malzemeler açar (Aşama 2); kart açılınca yeni parçanın ilk konfigürasyonu yazılır.
23. Kalemin eski dört revizyon sütunu (`eski_/yeni_cizim_revizyonu_id`, `eski_/yeni_rota_revizyonu_id`) 1642 göçüyle öğe tablosuna kopyalandı ve okunmuyor; silinmesi dolu tabloyu değiştiren göçtür, kullanıcı onayıyla ayrı kart.
24. Öğe revizyon kimlikleri sahibi modülde var mı ve kalemin parçasına mı ait, denetlenmez (14 ile aynı); sahibi modüllerin `disari.ts` okumasıyla kapanır.
25. Etkilenen emir alanları (1644): donmuş bölge, seri aralığı ve yeni rotayla termin kayması emirde tutulmuyor; `donmus` false, `seriAraligi` null, `terminKayar` null verilir. Termin null olduğundan emir kararı otomatik uygulanmaz (onaylı ya da MRB). Plan ve seri kaydı bağlanınca dolar.
26. ~~Stok hedefi (1644, VARSAYIM): malzeme başına tek karar satırı.~~ 1647 ile değişti: stok hedefi parti başına (`stok`, `hedefId` = parti id), partisiz bakiye malzeme başına (`partisiz_stok`, `hedefId` = malzeme no). Parti kimliği bigint, hedef kimliği int: 2^31'i aşan parti kimliği bu tabloya yazılamaz (bugün uzak, VARSAYIM). Revizyonu boş eski partiler de hedeftir (revizyonu bilinmiyor).
27. Kaynak kapsamı (1644, 1647): açık satın alma sipariş satırı 1647 ile okunur (`siparis_satiri`); fason hizmet satırı emir hedefinin içindedir, ayrı hedef olmaz. Sevk edilmiş ürün ve üst montaj (where-used) okunmuyor; ayrı kartlarla.
28. Etki analizi adımı (talep aşaması) kaynak okumaz; etkilenenler yalnız yayında hesaplanır. Talep ekranında etkilenen sayısı göstermek ayrı iş.
29. Revizyonun dolması (1647): parti ve sipariş satırı açılışta yürürlükteki parça revizyonunu `disari.ts yururluktekiParcaRevizyonlari` ile alır (kablolama); siparişli mal kabulde parti sipariş satırının revizyonunu alır. Üretim partisinin revizyonu emrin sabit revizyonundan gelmeli; emre sabitleme (1645) gelene kadar açılış anındaki yürürlükteki revizyondur.
30. Sipariş satırı kararı (1647): olay ilgili listesinde satın alma yok; `stok_karari` olayı ilgilisiz ve `hedef` alanıyla yazılır. "Tedarikçiye iade" ve "stok bitince kullan" kodu yok (1606 raporu); bugün D1'de öneri "Karantinada beklet" (MRB) adıyla görünür. İkisi ayrı kart (sabit listesi ve göç).
24. Öğe revizyon kimlikleri sahibi modülde var mı ve kalemin parçasına mı ait: rota denetlenir (1819, DY-25); diğer türler 14 ile aynı, sahibi modüllerin `disari.ts` okumasıyla kapanır.

## Bilgi (borç değil)

Kurgu, karar ve sınır kayıtları; kapanacak iş değildir (borç denetimi, kart 2049).

### Bağlamada kapanacak

- Kural, sürüm ve sunucu kuralları akış akış kapanır; kabul kullanıcı deneyince.
