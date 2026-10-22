# Çekirdek istekleri (saat)

Toplayıcılara yalnız saat satırları eklendi: `paylasilan/islemler.ts` (`SAAT_ISLEMLERI`), `paylasilan/islem-adlari.ts` (işlem adı, "Akıllı saat" grubu).

## Oturum (kart #86, ayrı yama)
- `sunucu/moduller/oturum/kurallar.ts` `SAAT_YAZMA_KALIPLARI` kümesine `/api/saat/uyarilar/ustlen` eklenir. Saat belirteci bugün yalnız duruş yazar.

## Rol x işlem (açık soru; karar 79 a üstlenmeyi onayladı, rol listesi verilmedi)
- `saat.uyari-ustlen` için rol satırları `kurulum/yetki-matrisi.md` tablosuna ve kisiler göçüne girer. Bugün saat uyarılarını yalnız saat okuma
  işlemi olan roller görür (`mudur`, `planlama_proje`, `kalite`, `cam`, `satin_alma`, `depo`, `muhasebe_finans`); `vardiya_sorumlusu` ve `bakim` uyarıları saatte görmez.
