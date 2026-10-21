# BASKA-MODUL-ISTEKLERI: bildirim

Tetik çağrıları sahibi modüllerde yazılır; bu dal yazmaz. Çağrı tek: `bildirimGonder(db, olay)` (`sunucu/moduller/bildirim/disari.ts`),
çağıranın transaction'ında. İmza: `{ tur, baslik, metin?, yol?, kaynakKimlik?, kisiler?, haric? }`; alıcıları türün işlemi belirler
(`paylasilan/sozlesme/bildirim.ts` `BILDIRIM_TURLERI`). Yön tek: modül -> bildirim; bildirim yalnız `kisiler/disari.ts` ithal eder, döngü yok.

1. KAPANDI (eski depo #1885). satin-alma: `servis.ts` `talepKaydet`, sürümlü yazmadan sonra (yaklaşık :404), koşul `yazilacak.durum === 'onayda' && eski.durum !== 'onayda'`.
   `bildirimGonder(db, { tur: 'satin-alma.talep-onay-bekliyor', baslik: \`Onay bekleyen talep: ${eski.no}\`, metin: yazilacak.baslik, yol: '/satin-alma/onaylar', kaynakKimlik: id, haric: k.id })`.
2. KAPANDI (servis.ts siparisEkle). siparisler: `servis.ts` `siparisEkle`, `kalemleriYaz` sonrası (yaklaşık :92). Ayrı "onaya gönder" durumu yok: taslak açılınca onay bekler (teklifden dönüşüm de buradan geçer).
   `bildirimGonder(db, { tur: 'siparisler.onay-bekliyor', baslik: \`Onay bekleyen sipariş: ${no}\`, yol: \`/siparisler/${id}\`, kaynakKimlik: String(id), haric: kullanici.id })`.
3. KAPANDI (eski depo #1873). ik: `servis.ts` `yaz`, kayıt yazıldıktan sonra (yaklaşık :313), koşul `g.tur === 'leave' && !kayitli && yeni['durum'] === 'Beklemede'`.
   `bildirimGonder(db, { tur: 'ik.izin-onay-bekliyor', baslik: 'İzin talebi onay bekliyor', metin: '<ad, tür, tarih>', yol: '<İK onay ekranı>', kaynakKimlik: g.kimlik, haric: kullanici.id })`.
   Not: tür bütün `ik.izin-onay` sahiplerine gider; yalnız ekip yöneticisine gitmesi istenirse İK `kisiler` ile alıcıyı verir ve tür ayarı değişir (sonraki karar).
4. KAPANDI (eski depo #1882; tekil ve toplu yol). istasyonlar: `servis.ts` `makineDurumuYaz` (yaklaşık :437) ve toplu `makineDurumlariniYaz` (:195), koşul yeni durum `ariza` ve önceki `ariza` değil.
   `bildirimGonder(db, { tur: 'istasyonlar.makine-durdu', baslik: \`Makine durdu: ${makine.kod}\`, metin: g.aciklama, yol: '/istasyonlar', kaynakKimlik: String(makineId), haric: kullanici.id })`.
5. KAPANDI (Profil.tsx "Bildirimlerim"). profil: `istemci/src/moduller/profil/Profil.tsx` Hesap ya da üst kartta "Bildirimlerim" bağlantısı (`/profil/bildirimler`, simge `bell`).
