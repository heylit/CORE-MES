# Özellik karşılama (ilk sistem -> uretim-emirleri, sunucu tarafı)

Ekranlar T4'tedir (Rota sayfası); burada yalnız sunucu karşılığı.

| Özellik (OZELLIK-LISTESI) | Karşılık | Durum |
|---|---|---|
| Yeni emir: ürün, adet, öncelik, başlangıç, teslim, açıklama | `uretimEmriAc` (rota ucu T4) | Var |
| Kompakt liste, emir kartı, adım adım görünüm | `GET /adimli-emirler`, `/:id` (durum, kaynak, istasyon, süreler, bağımlılık, başlama, bitiş, sağlam, talimat, bileşen) | Var |
| Bekleyen adıma kaynak seçici, "Tezgahsız", tezgahsız terminale düşmez | `POST .../adim-kaynagi` (makine ya da kişi, null = tezgahsız) | Var |
| Rotası değişti, emirlere uygula (güvenli kip) | `isEmirleriniYenile`; karşılaştırma rotada | Var (uç T4) |
| İptal; arşivdeki eski emirler salt okunur | `POST .../iptal`; `GET /adimli-emirler?arsiv=true` | Var |
| Terminal başlat/bitir sıradaki adıma; adım bitince sıradakine geçer | Bugünkü terminal uçları | Var |
| Durumlar taslak, serbest, üretimde, tamamlanan; Plana al | `taslak` durumu, `POST .../plana-al`; görünen durum | Var |
| Liste süzgeçleri | Durum cevaptadır; süzme ekranda | Var (veri) |
| Tamamla ve stokta, Eksikleri teslim al, emir önizlemesi, operasyon kartı komutları | Yazılmadı | UE-B3 |
| Operatör: başlat, adet, duraklat, bitir, arıza | Bugünkü uçlar (arıza = durdur + neden) | Var |
| Fason (yeni) | Gidiş/dönüş/tamamla | Var |
