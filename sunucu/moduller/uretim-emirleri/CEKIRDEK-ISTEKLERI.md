# Çekirdek istekleri (uretim-emirleri, kart #262)

Bu teslim çekirdeğe ve ortak parçaya dokunmadı; yeni işlem adı istemedi (V3: komutlar `uretim-emirleri.yaz`, terminal `terminal.uret`).

| No | İstek | Neden | Durum |
|---|---|---|---|
| C1 | Rol x işlem: `uretim-emirleri.yaz` bugün planlama_proje, müdür, yönetici. Fason gidiş/dönüşü depo ya da satın alma da yazacaksa rol satırı | Fason sevkiyatı kimin yazdığı | Kullanıcı onayladı (2026-10-09): yeni işlem `uretim-emirleri.fason`; depo, müdür, planlama_proje. Göç `20261009194000_kisiler_uretim_emri_fason_islemi.sql` |
| C2 | Sayfa kaydı: iş emirli emir ekranı Rota sayfasının "Üretim emirleri" bölümündedir (`/rota/emirler`, `sayfa.rota`); yeni sayfa istenmedi | Ekran T4'te | İstek yok |
| C3 | `gocler` damgası 20261009193500; sonrasına aynı tabloya göç girerse sıra denetimi | Göç sırası | Bilgi |
| C4 | Onaylı kapanış işlemleri `uretim-emirleri.kapanis-oku`, `kapanis-kalite`, `kapanis-onay` `paylasilan/islemler/uretim-emirleri.ts` ve `paylasilan/islem-adlari.ts`'e girdi (1078 a); rol satırları K2 göçünde | 1078 a | Bu teslimde (islem-adlari satırları modül kapatma yamasıyla birlikte yeniden üretilir) |
