# ADR 0019 — Test robotunda dil modeli istisnası

Durum: kabul (kullanıcı kararları 174 c, 175 a, 176 a, 177 a, 178 a; 23.10.2026: "174 c onayli: robota dis dil modeli istisnasi,
yukaridaki kosullarla"; yazma onayı aynı gün "test robotu yaz, onayli").

## Bağlam

Kullanıcı uygulamayı rollerle, eşzamanlı kullanıcılarla ve gerçeğe benzer senaryolarla deneyen, sonucu yorumlayan bir test robotu istedi;
bir aylık kullanım bir saat içinde koşmalı. Yorum dil modeli ister. CLAUDE.md dış servis çağrısını yasaklar; istisnalar yalnız kurum içi
üç servistir. Robot geliştirme aracıdır; uygulamanın parçası değildir ve canlıya gitmez.

## Karar

1. **Tek yer.** Dil modeli yalnız `ekran-testleri/benzetim/model.ts`'den çağrılır. Uygulama kodu (sunucu, istemci, arkon, paylasilan)
   modele bağlanmaz.
2. **İki kip, varsayılan kapalı.** `TMIV2_ROBOT_MODEL`: `kapali` (varsayılan), `claude-kod` (aynı bilgisayardaki, abonelikle oturum açmış
   Claude Code; `claude -p`, istem stdin'den), `api` (Claude API, düz HTTP; yeni paket yok). Anahtar yalnız `TMIV2_ROBOT_MODEL_ANAHTARI`'nda,
   depoda örnek anahtar dahil hiçbir anahtar yoktur. Koşu başına çağrı üst sınırı `TMIV2_ROBOT_MODEL_UST_SINIR` (varsayılan 30).
3. **Yalnız sentetik veri.** Robot `TMIV2_ORTAM` canlıysa ya da yoksa başlamaz. Veritabanı boştur, göç ve örnek veriyle (ORN-) kurulur;
   robotun ürettiği kayıtlar BNZ- önekli ve anlamsızdır. Modele giden yalnız robotun koşu kaydıdır.
4. **Canlı paketine girmez.** `.gitattributes` `ekran-testleri/benzetim/` ve `test-robotu/` için `export-ignore` taşır; paket `git archive`
   ile çıktığından bu klasörler pakete girmez.
5. **Sonuç depo dışında.** Koşu klasörü `TMIV2_ROBOT_SONUC` (varsayılan işletim sisteminin geçici klasörü) depo içini reddeder.
   Biçim `ekran-testleri/benzetim/sozlesme.ts`'dedir; izleme uygulaması yalnız bu dosyaları okur.
6. **Yorum karar değildir.** Model bulgu ve kart önerisi yazar; karta geçiş kullanıcı onayıyla olur.

## CLAUDE.md satırı

> Test robotu istisnası (ADR 0019, karar 174 c): yalnız `ekran-testleri/benzetim/model.ts` dil modeli çağırır ...

## Sonuçlar

- Robot ayrı yapılandırmayla koşar (`npm run robot`); `npm run ekran` ve `kontrol` ona dokunmaz. Birim testleri `npm run robot:test`.
- Saat ileri alınmaz: "gün" döngü adımıdır; saate bağlı işler bu aşamada sınanmaz (gerçek saat kaydırma ayrıca sorulur).
- Keşif kipi (model sıradaki adımı seçer, adımı robotun kendi Playwright kodu atar) ayrı yamadır; Playwright MCP girmez (karar 179 c).
- DOĞRULANMADI: aboneliğin otomatik `claude -p` kullanımına kullanım şartlarının izin verdiği.
