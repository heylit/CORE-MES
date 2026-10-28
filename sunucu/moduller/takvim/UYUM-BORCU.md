# Uyum borcu (takvim)

## Bağlamada kapanacak
- Emir plan başlangıcı ve bitişi (plan), sevk (sevkiyat), satın alma termini (satin-alma) bağlanmadı: modülleri başka işte kilitli. Yetkisi olana `bekleyenler` ile "bağlanmadı" görünür. Her biri için o modülün `disari.ts`'ine `takvimKayitlari(db, baslangic, bitis)` gelir, `kurallar.ts` KAYNAK_YETKILERI'nde `bagli: true` olur, `servis.ts` OKUYUCULAR'a eklenir.
- `takvim.oku`, `sayfa.takvim` ve `ik.izin-oku` yalnız yönetici rolünde (göç yok, 1163 teyitli). Rol dağılımı ortak yetki matrisinden verilir.
- İzin (1191 a): `ik.oku` ya da `ik.izin-oku` olan bütün izinleri, öteki kişi yalnız kendi personel kaydının iznini görür; kullanıcıya bağlı personel kaydı olmayan izin görmez.
- Planlı duruş oturumla okunur (`/planli-duruslar` gibi). Varsayım.
- Sipariş ayrıntısına `/siparisler/:id` ile gidilir; öteki kaynaklarda kaydın kendi ekranı yerine modülün liste ekranı açılır (kayda doğrudan adres yok).
