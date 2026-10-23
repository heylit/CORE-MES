# Çekirdek istekleri (vardiya)

Yok. Toplayıcıya yalnız `VARDIYA_IKINCI_MENU` satırı eklendi (ayrı commit, `paylasilan/sayfalar.ts`). İşlem listesi ve rol satırları değişmedi.

## Soru 142 b
- `paylasilan/sozlesme/vardiya.ts`: `takvimCevabi.gunler[].kaynak` bu yamada eklendi (kilit koordinatörden, 23.10.2026).
- Aynı dosyada `resmiTatilGovdesi` artık kullanılmıyor (`POST /takvim-gunleri/resmi-tatiller` kalktı); silinebilir. `takvimGunuGovdesi.tur`
  `tatil` değerini hâlâ kabul ediyor; sunucu reddediyor (VR-28). Sözleşmede yalnız `kapali` bırakılabilir. İkisi de dar tutuldu, dokunulmadı.
