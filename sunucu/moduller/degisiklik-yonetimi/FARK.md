# FARK: degisiklik-yonetimi P1 sunucu (kart 1120)

Taban: `main` 55427f0 (S0 0001 sözleşme içinde) + S0 0002 (işlemler) + S0 0003 (rota olgunluğu, olay araması). Yeni modül; depoda önceki sürüm yok.
- Yeni göç `20261028110000_degisiklik_yonetimi.sql`: sekiz boş tablo, hepsi `degisiklik_yonetimi_` önekli (talep, talep_kalemi, emir, emir_kalemi, karar, ilk_parca, gecmis, olay). Dolu tabloya dokunmaz.
- Yeni `kurallar.ts` (DY-1 - DY-20), `sorgular.ts`, `servis.ts`, `uclar.ts` (28 uç, S0 uç listesiyle bire bir), iki test dosyası, bu belgeler.
- Toplayıcı satırı yok: sunucu modülleri `uclar.ts` dosyasından kendiliğinden bulunur (`sunucu/cekirdek/uygulama.ts`). Sayfa kaydı P2'de.
- `disari.ts` yok: Aşama 1'de bu modülden okuyan modül yok.
- Ortak ve çekirdek dosyaya dokunulmadı; yeni paket yok; rol x işlem satırı yok (testte geçici rol yalnız test veritabanında).
- S0'dan sonraki istekler: `gorevlerimCevabi.kapanan90Gun` (1149 b), çevrim iş günü müşteri onayını beklemeyi saymaz (P4), aile ipliği, seri listesi ucu, soy ağacı, sapma satırı (1142-1145 a): kaynağı bağlı olmayanlar null.
- 1175 a: olay günlüğü `ara` ile kayıt no ve alan değerlerinde arar (joker karakter düz metin). 1176 a: `rotaOlgunlugu` null (rota bağlı değil). 1177 a: UYUM-BORCU madde 12.
- Göç damgası 101000'den 110000'e alındı: main'e 101000'den sonra 106000 ve 107000 girdi.
