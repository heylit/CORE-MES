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
- 3401-1 a: `/plan/bedel-ayari` planı yazana açıktır ama taban bedel, finansman ve kâr riski oranı yalnız `finans.maliyet-oku` ya da `plan.bedel-ayari` olana gelir (ötekine null); eşik ve çarpanlar herkese. Çarpan geçmişi yalnız bu ikisine (satış ve planlama 403). Motor bedeli sunucuda okur, planlamacının planı kurması bundan etkilenmez.
- 3751 (Soru Merkezi "Sürükle-bırak + menü"): Kokpit'te pay kardeşine bırakılınca birleşir; yalnız Emirler görünümünde (Tezgâhlar'da kardeşler uzak satırda, orada yalnız sağ tık menüsü), telefonda pay kartındaki alt sayfa. Komut yeni değil (elle-bol / elle-bol-sil). Tek pay kalınca tezgâhı sunucu seçer (çalışan ya da plandaki ilk pay); hedefin tezgâhı yalnız iki ve üstü pay kalınca korunur.
- 3791 (canlı şikâyet "bölünen iş taşınamıyor"): "pay sürüklenmez" kuralı kalktı; pay da taşınır, kardeşinin üstüne bırakılırsa birleşir. Pay kilidi `adım~N` anahtarıyla yazılır; payın tezgâhını kilit değil adımın `elleBol` kaydı belirler, bu yüzden başka tezgâhta taşınan payın kaydı yeni tezgâhla, rotadaki "paralel böl" payı taşınınca bölme elle bölmeye dönerek yazılır (kayıt yokken adım kilidi bölmeyi tek parçaya indirir). Başlamış ya da sayımı olan pay başka tezgâha taşınmaz; aynı tezgâhta saati kayar. Başlamış adımda sayımsız pay sayımı olan kardeşin tezgâhına da konmaz (motor sayımı tezgâh anahtarıyla dağıtır, iki paya yazılır).
