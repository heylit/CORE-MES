# Başka modül istekleri (tezgah-baglantisi)

Kart 3753: yok. LSV2 okuması yalnız bu modülün tablolarına yazar; SmartES karşılaştırması bugünkü `smartes/disari.ts`
`smartesMakineDegerleri` ile değişmeden çalışır (cihaz adı SmartES makine koduyla aynı yazılır).

Kart 3811: `uretim-emirleri/disari.ts` içine tek salt okuma `makineIsAraliklari` eklendi (kullanıcı kararı S5 a, 27.11): makine
kullanım aralığı (kırpılmamış), iş emri no, OP, parça no, ilk parça onay anı. Göç yok, yazma yok; testi `oee-verisi.test.ts`.

Açık (sonraki iş): rota adımının "NC program" alanı (3800'ün proses NC kaydı main'e girince ona bağlanmak değerlendirilir) ve
"çevrimde parça" alanı; ikisi gelene kadar tahmin eşleşmesi ve eşleme ekranındaki makine ayarı kullanılır.
