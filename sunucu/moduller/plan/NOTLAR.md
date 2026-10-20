# Plan notları

- `POST /plan/kuyruklari-yaz` (Reçete ve Rota köprüsü, kart #1186) vardır çünkü tek tek `yerlestir`/`tasi` çağrıları ara durumlarda
  birbirini bozar ve atomik değildir. Tek işlemde ayar (isteğe bağlı) + makine kuyrukları taslağa yazılır; değişiklik türü olarak
  mevcut `sirala`/`ayar` kullanıldı (tür listesi kapalı, göç gerekmedi).
- Prototipin zaman ekseni iş günü kesridir; saate çevrilmez. Yalnız kuyruk sırası (elle_sira), atama (makine) ve dondurma bayrağı
  bağlayıcıdır; saatleri sunucu makinenin verimi ve takvimiyle kendisi kurar.
- Canlıya alma aynı çağrıda `canliyaAl: true` ile denenir; `plan.canliya-al` yoksa 403 döner ve istemci aynı gövdeyi
  `canliyaAl: false` ile (yalnız taslak) yeniden yollar.
- Başlamış, kilitli ya da dondurulmuş iş sunucuda sabittir: atlanır ve `atlanan` sayısına girer. Bölünmüş işte yalnız en erken parça yazılır.
- VARSAYIM (kart #1185'e bağlı): prototip emir kimliği = `uretim_emri.id` (sayı dizesi), emir no = `emir_no`, adım `seq` = `op_no`.
  Sayı olmayan kimlikli (yerel) emir ve sunucu makinesi olmayan iş yazılmaz.
