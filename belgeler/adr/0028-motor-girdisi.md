# ADR 0028 — Plan motorunun girdisi sahibi modüllerin tablolarından tipli kurulur

Durum: kabul (kart 1715; kullanıcı kararı 01.11.2026: 1728 a teyit). Değiştirir: ADR 0018 madde 5 ("motorun girdisini Reçete ve Rota
kurar" cümlesi). Dayandığı karar: 1683 b (girdi sunucu tablolarından, kartlar 1715-1723).

## Bağlam

- Motorun girdisi (`st.D`) tipsiz bir betikle (`sunucu/moduller/plan/motor/girdi.betik` `kaynakBirlestir`) üç kaynaktan birleşir: sahibi
  modüllerin okuması, Reçete ve Rota'nın JSON kaydı ve Planlama sayfasının JSON kaydı. Sunucudan gelen alan JSON'dakinin üstüne yazılır,
  gelmeyen alan JSON'daki eski hâliyle kalır.
- Elle girilen planlama bilgisinin (fason kapasitesi, aparat, aile ayar matrisi, taşıma ve program süresi, FAI) sahibi tablo yoktur: başka
  modül görmez, alan bazında geçmişi yoktur, girilmemiş alan sessizce varsayılan değer alır.
- Bir modül alan adını değiştirirse betik derlemede kırılmaz; plan eski değerle kurulur.
- Tasarım `sunucu/moduller/plan/girdi/TASARIM.md`.

## Seçenekler

- **a) Girdi tipli TypeScript'le, sahibi modüllerin `disari.ts` okumasından kurulur; elle ana veri sahibinin tablosuna taşınır; Planlama
  JSON kaydı yalnız sayfa ayarı tutar:** tek veri kaynağı, derlemede tip denetimi; bedeli kartlar 1715-1723 süren geçiş ve eşdeğerlik testi.
- **b) Betik kalır, yalnız JSDoc ile tip denetimi eklenir:** ucuz; elle verinin sahipsizliği ve JSON üstüne yazma sürer.
- **c) Bugünkü yol sürer:** bedelsiz; sorunlar sürer.

## Karar

1. **Tipli sözleşme.** Motorun girdisi `sunucu/moduller/plan/girdi/tipler.ts` `MotorVerisi`'dir; her üst ve satır alanının kaynağı aynı
   dosyadaki kaynak tablolarındadır (`UST_ALAN_KAYNAKLARI`).
2. **Tek kaynak.** Sunucu alanı her okumada sahibi modülün `disari.ts` okumasından kurulur. Elle girilen ana verinin sahibi bir tablodur;
   sahibi kullanıcıya sorulur (1719). Planlama sayfasının JSON kaydı yalnız sayfa ayarı ve deneme verisi tutar.
3. **Dilim.** Girdi dilimlerle kurulur: okuma (yalnız `disari.ts`) ve saf kurulum (`kur`) ayrıdır.
4. **Eşdeğerlik.** Eski yol ile yeni yol aynı veride aynı girdiyi vermelidir; fark alan alan yazılır (`girdi/esdegerlik.ts`,
   `girdi/esdegerlik.test.ts`). Bilerek kabul edilen fark yalnız karar numarasıyla izinli fark listesine girer.
5. **Geçiş.** Yeni yol son kart birleşene kadar bayrakla kapalıdır; eski yol (`girdi.betik` birleştirme kısmı, `emirler.betik`) kullanıcı
   kabulünden sonra silinir.
6. Motorun kendisi (`engine.betik` ve öteki motor dosyaları) bu kararla değişmez; ADR 0018 maddeleri 1-4 ve 6 aynen sürer.

## Sonuçlar

- Planlama sayfasının elle veri yazan alanları sahibinin uçlarına yazar (1721); ekran akışı aynı kalır.
- Geçiş süresince iki yol vardır; eşdeğerlik testi ikisini aynı tutar.
- Motorun algoritması ve plan kalitesi değişmez.

## Vazgeçilenler

- b: elle verinin sahipsizliğini çözmez.
- Motoru TypeScript'e yeniden yazmak (364 a, ADR 0018).

## Doğrulanmadı

- Eşdeğerlik testinin sayfaya özgü kenar durumları yakalayıp yakalamadığı; önlem gerçek veriyle kıyas seti (1475 a) ve bayrak.
