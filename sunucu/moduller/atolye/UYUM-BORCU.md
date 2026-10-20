# UYUM BORCU: atolye (kart #599, Aşama 1: teslim olduğu gibi toplandı)

## Bağlamada kapanacak

1. Raf ve göz sahipliği: kullanıcı kararı (11.10.2026, 3b ve 2a) raf ve göz atölyenin; stok Aşama 2'de atölyeden okur, stoktaki raf ve göz kopyası kalkar.
   Onaylı karar "depo, raf, konum: stok" (2026-10-08) bu kararla değişti; stok modülünün göçü ve ekranları Aşama 2'de.
2. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): okuma uçları `sayfa.atolye` ya da `atolye.yaz` istiyor (`uclar.ts` `yetki: { biri: ['sayfa.atolye', 'atolye.yaz'] }`). Okuma uçları yalnız oturum ister, sayfa işlemi değil: `sayfa.atolye` olmayan kişi de haritayı okur. Uyum: `atolye.oku` ya da sayfa işlemiyle süzme.
3. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): rol satırları göçle girdi (`20261011214500_kisiler_atolye_islemleri.sql` `('mudur', 'sayfa.atolye')`, `('planlama_proje', 'atolye.yaz')` vb.). Rol x işlem satırı yok: `sayfa.atolye` ve `atolye.yaz` hiçbir role verilmedi; bugün yalnız yönetici görür ve yazar. Uyum: kullanıcı onayıyla göç
   (teslim önerisi CEKIRDEK-ISTEKLERI 3).
4. İkinci menü yok: Harita, Depo, Parçalar sayfa içi sekme (yerel durum, adres değil). Uyum: sekmeler adrese çevrilip ikinci menüye taşınır.
5. KAPANDI (borç #116, 16.10.2026): kalem kodu malzeme kartının stok koduyla eşleşirse okumada karta bağlanır, eşleşmeyen serbest kalır (`servis.ts` ATL-36, test "ATL-36 ..."). Ayrı `malzeme_id` sütunu ve yabancı anahtar açılmadı; eşleme yeterli sayıldı.
6. Parça no üretim emrindeki serbest metinle eşleşir (`parcaAnahtari`).
7. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): ON-PAKET açık soru 5'in kabul edilen istisnası; ortak etiket katmanı geçildi (madde 8), kalan değişken kalıbı (`istemci/src/moduller/atolye/sahne/motor.ts` `style.setProperty('--x', ...)`). Satır içi stil: sahne etiketleri konumu `style.setProperty('--x' | '--y')` ile verir (ON-PAKET açık soru 5).
8. Ortak bileşen eksikleri (CEKIRDEK-ISTEKLERI 7), borç 119: tam ekran `Pencere`, sahne etiket katmanı ve değişkenler geçildi (kapandı). Kalan: `.tc-gizli-etiket` (atolye.css `.tc-alan-etiket` kuralları; etiket ortak `Girdi` içinde çizilir, sınıf eklenemez), `DijitalIkiz` ipucu (transform değil left/top düzeni, ortak etiket sınıfına uymaz), SVG birimli çizgi/yazı değerleri ve metre birimli kesik `.4 .3` (değişken gerekmeyebilir).
9. Ana menü simgesi `target` (teslimin istediği `grid` kullanımda).
10. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): açık soruların önerileri uygulandı (`ON-PAKET-atolye.md` "açık sorular 2-6'nın önerilen seçenekleri uygulandı"; soru 1 `package.json` `"three": "0.186.1"`, soru 2 göç `20261011214500`, soru 5-6 madde 8 `Pencere` ve etiket katmanı). ON-PAKET açık soruları 1-6 (paket, rol, depo istasyonu, pasif raf, etiket, tam ekran).
11. Makine durumu ve son hareketler (kart #1121, #1122) istasyonlar `GET /makine-durumlari` ve üretim emirleri `GET /uretim-emirleri/son-olaylar` uçlarının
   yetkisine bağlı; yalnız `sayfa.atolye` olan kişi arızayı ve son hareketleri görmez. Uyum: rol dağıtımında bu okuma işlemleri haritayı görenlere verilir ya da uçlar `sayfa.atolye`yi kabul eder.
12. ~~Arkon olayları son hareketlerde yok~~ Kapandı (kart #1122, ATL-40): Arkon ucu #1160 ile geldi ve listeye eklendi.
