# UYUM BORCU: atolye (kart #599, Aşama 1: teslim olduğu gibi toplandı)

## Bağlamada kapanacak

1. Raf ve göz sahipliği: kullanıcı kararı (11.10.2026, 3b ve 2a) raf ve göz atölyenin; stok Aşama 2'de atölyeden okur, stoktaki raf ve göz kopyası kalkar.
   Onaylı karar "depo, raf, konum: stok" (2026-10-08) bu kararla değişti; stok modülünün göçü ve ekranları Aşama 2'de.
2. KAPANDI (17.10.2026): okuma uçları `sayfa.atolye` ya da `atolye.yaz` ister (`uclar.ts` `yetki: { biri: ['sayfa.atolye', 'atolye.yaz'] }`); sayfa işlemi olmayan kişi haritayı okuyamaz.
3. KAPANDI (17.10.2026): rol satırları göçle girdi (`20261011214500_kisiler_atolye_islemleri.sql`); bugün `sayfa.atolye` müdür, planlama, kalite, CAM ve depoda, `atolye.yaz` planlamada (operatör satırı `20261012095300_kisiler_operator_sadelestir.sql` ile kalktı). Yönetici her işlemi bayrakla taşır.
4. KAPANDI (kart 1800 ATL-7, kullanıcı kararı 02.11.2026): Harita, Dijital ikiz, Depo, Parçalar ikinci menüdedir (`paylasilan/sayfalar/atolye.ts` `ATOLYE_IKINCI_MENU`); sekme adresten okunur (`/atolye`, `/atolye/ikiz`, `/atolye/depo`, `/atolye/parcalar`), sayfa içi sekme şeridi kalktı.
5. KAPANDI (borç #116, 16.10.2026): kalem kodu malzeme kartının stok koduyla eşleşirse okumada karta bağlanır, eşleşmeyen serbest kalır (`servis.ts` ATL-36, test "ATL-36 ..."). Ayrı `malzeme_id` sütunu ve yabancı anahtar açılmadı; eşleme yeterli sayıldı.
7. KAPANDI (borç değerlendirmesi 17.10.2026, geçersiz): ON-PAKET açık soru 5'in kabul edilen istisnası; ortak etiket katmanı geçildi (madde 8), kalan değişken kalıbı (`istemci/src/moduller/atolye/sahne/motor.ts` `style.setProperty('--x', ...)`). Satır içi stil: sahne etiketleri konumu `style.setProperty('--x' | '--y')` ile verir (ON-PAKET açık soru 5).
8. Ortak bileşen eksikleri (CEKIRDEK-ISTEKLERI 7), borç 119: tam ekran `Pencere`, sahne etiket katmanı ve değişkenler geçildi (kapandı). Kalan: `.tc-gizli-etiket` (atolye.css `.tc-alan-etiket` kuralları; etiket ortak `Girdi` içinde çizilir, sınıf eklenemez), `DijitalIkiz` ipucu (transform değil left/top düzeni, ortak etiket sınıfına uymaz), SVG birimli çizgi/yazı değerleri ve metre birimli kesik `.4 .3` (değişken gerekmeyebilir).
10. KAPANDI (borç değerlendirmesi 17.10.2026, yapılmış): açık soruların önerileri uygulandı (`ON-PAKET-atolye.md` "açık sorular 2-6'nın önerilen seçenekleri uygulandı"; soru 1 `package.json` `"three": "0.186.1"`, soru 2 göç `20261011214500`, soru 5-6 madde 8 `Pencere` ve etiket katmanı). ON-PAKET açık soruları 1-6 (paket, rol, depo istasyonu, pasif raf, etiket, tam ekran).
12. ~~Arkon olayları son hareketlerde yok~~ Kapandı (kart #1122, ATL-40): Arkon ucu #1160 ile geldi ve listeye eklendi.

## Bilgi (borç değil)

Kurgu, karar ve sınır kayıtları; kapanacak iş değildir (borç denetimi, kart 2049).

### Bağlamada kapanacak

- Parça no üretim emrindeki serbest metinle eşleşir (`parcaAnahtari`).
- Ana menü simgesi `target` (teslimin istediği `grid` kullanımda).
- Makine durumu ve son hareketler (kart #1121, #1122) istasyonlar `GET /makine-durumlari` ve üretim emirleri `GET /uretim-emirleri/son-olaylar` uçlarının
   yetkisine bağlı; yalnız `sayfa.atolye` olan kişi arızayı ve son hareketleri görmez. Uyum: rol dağıtımında bu okuma işlemleri haritayı görenlere verilir ya da uçlar `sayfa.atolye`yi kabul eder.
