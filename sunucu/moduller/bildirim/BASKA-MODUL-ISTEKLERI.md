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

## Ekip çağrısı (298 a, ayarcı 298 b; dal `298-ekip-cagrisi-yonlendirme`)

6. AÇIK. arkon (sunucu): çağrı kaydı açılınca bildirim. `calls` deposuna `phase: 'open'` belgesi yazılınca, aynı transaction'da
   `ekipCagrisiBildir(db, { ekip: govde.team, yer: <istasyon ya da makine kodu: govde.mc ?? govde.machine>, not: govde.note ?? null,
   cagriKimligi: govde.callId, haric: kullanici.id })` (`sunucu/moduller/bildirim/disari.ts`). `team` CAGRI_EKIPLERI dışındaysa çağrılmaz.
   Alıcıyı bildirim seçer (Sistem Ayarları > Bildirim yönetimi). Bu girmeden çağrı bildirime dönüşmez. Testler: açan almaz; ekibin rolündeki kişi alır;
   `phase: 'ack'`, `'done'` ve `'esc'` yeni bildirim açmaz.
7. AÇIK. arkon (istemci, prototip değişikliği onaylı: "298 ayarcı b"): `arkon/web/src/app/temel.ts` `CALLS` listesine beşinci ekip
   `{ k: 'ayarci', l: 'Ayarcı', ... }`; simge ve renk Arkon'un kararı. `giris-ayarlar-spc.ts` `CALL_ROLES` bannerı bugün ayrı bir eşleme
   tutuyor (malzeme -> plan); iki kaynak kalmaması için banner ya kaldırılır ya da `GET /bildirimler/cagri-yonlendirme` ile aynı eşlemeyi okur
   (o uç `ayarlar.yaz` ister; Arkon için okuma yolu gerekirse çekirdeğe istek yazılır).
8. AÇIK. saat (ikinci sürüm): saatten çağrı yazma gelince aynı Arkon kaydını ya da `ekipCagrisiBildir`'i kullanır; ayrı yönlendirme kurulmaz.
9. AÇIK. arkon (istemci): çağrı bandı `giris-ayarlar-spc.ts` `CALL_ROLES` kopyası yerine `GET /bildirimler/cagri-yonlendirme/benim` okur
   (`{ ekipler: CagriEkibi[] }`, yetki oturum; sözleşme `cagriEkiplerimCevabi`). Yönetici ve vardiya amirinin bütün çağrıları görmesi Arkon kuralıdır,
   bu uç yalnız eşlemeyi verir. Arkon CEKIRDEK-ISTEKLERI 8 bu uçla karşılanır; banner geçince Arkon UYUM-BORCU'daki iki kaynak maddesi kapanır.
