# Uyum borcu (takvim)

## Bağlamada kapanacak
- Emir başlangıcı ve teslimi `sayfa.uretim-emirleri` ile okunur (üretim emirlerinin okuma işlemi yok); emir ayrıntısını yalnız `sayfa.rota`, `uretim-emirleri.yaz`, `uretim-emirleri.fason` ya da `plan.yaz` ile açan kişi bu iki kaynağı görmez. Varsayım.
- Emir günleri emrin `baslangic` ve `teslim` tarihidir (plan bunları emre yazar); plan çizelgesindeki adım saatleri okunmaz. Varsayım (D-P).
- `takvim.oku`, `sayfa.takvim` ve `ik.izin-oku` yalnız yönetici rolünde (göç yok, 1163 teyitli). Rol dağılımı ortak yetki matrisinden verilir.
- İzin (1191 a): `ik.oku` ya da `ik.izin-oku` olan bütün izinleri, öteki kişi yalnız kendi personel kaydının iznini görür; kullanıcıya bağlı personel kaydı olmayan izin görmez.
- Planlı duruş oturumla okunur (`/planli-duruslar` gibi). Varsayım.
- Sipariş ayrıntısına `/siparisler/:id`, emir ayrıntısına `/uretim-emirleri/:id` ile gidilir; öteki kaynaklarda (sevk, satın alma dahil) kaydın kendi ekranı yerine modülün liste ekranı açılır (kayda doğrudan adres yok).
