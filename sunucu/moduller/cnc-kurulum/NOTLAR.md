# CNC Kurulum notları

- Maliyet kilidi (kart 3401, 3401-1 a): kg fiyatı (`stock.price`), takım fiyatı (`life.price`) ve tezgâh ücreti (`life.rate`) prototipin
  opak durum kaydındadır (`cnc-kurulum-motoru.v1`); hesaplanan maliyet kayda yazılmaz, ekranda bu girdilerden çıkar. Liste
  `PARA_ALANLARI` (paylasilan/sozlesme/cnc-kurulum.ts): sunucu süzmesi, istemci kilidi ve testteki yürüyüş buna bağlıdır; yeni
  para alanı yalnız oraya eklenir.
- `finans.maliyet-oku` olmayan kişiye alanlar okuma ve yazma cevabında hiç gelmez; yazarken kayıttaki eski değer geri konur
  (silinmez, gönderdiği yok sayılır). `disari.ts` `cncKurulumDurumu` yetki sormaz (modül içi okuma): dışarı açan uç yazan modül süzer.
- Emir anlığı (`EMIR_ALANLARI`) stock ve life taşımaz; para alanı emir kayıtlarında kopyalanmaz.
