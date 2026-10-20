# ADR 0008 — Denetim eki

Durum: kabul (kullanıcı kararı N4, 08.10.2026, kart #259)

## Bağlam

Denetim kaydı komutun gövdesini ve parametresini yazar. Gövdenin söylemediği değişiklik (fiyatın önceki değeri, toplu
güncellemede etkilenen satırlar) kayda girmiyordu. Modüller bunu kendi tablolarında ayrı tarihçeyle tutmaya başlayacaktı
(satın alma fiyat kaydı); her modülde ayrı kalıp, ayrı yetki ve ayrı maskeleme olurdu.

## Karar

1. **İşleyici kayda ek bırakır.** `isle` bağlamında `denetimEki(satirlar)`: ilkel değerli düz nesne satırları. Uç katmanı
   eki komutla aynı transaction'daki denetim kaydına iletir.
2. **Sınırlar seçiciyle aynıdır:** satır başına en çok 8 alan ve 512 bayt; en çok 100 satır. Boş liste, iç içe değer,
   geçersiz alan adı hatadır. Liste bir kez okunur ve kopyalanır.
3. **Yalnız denetlenen yazma komutunda, bir kez.** Okuma ucunda, `denetim: 'yok'` uçta, ikinci çağrıda ya da sınır
   aşılınca komut 500 ile düşer ve geri alınır. İşleyici hatayı yakalasa, hatta yazıları koruyan ret fırlatsa da düşer:
   eki kaybolan komut kalıcı olmaz.
4. **Ek gövdenin parçasıdır.** Gövdede ayrılmış `_ek` anahtarına maskelenerek girer; yalnız `denetim.govde-oku` görür,
   liste cevabında yer almaz. Gövde düz nesne değilse ya da kendisi `_ek` taşıyorsa gövde `_govde` altına alınır.
5. Ayrı sütun ve göç yok: gövdeyi okuma yetkisi eki de kapsar.

## Sonuçlar

- Önceki değeri saklaması gereken modül (satın alma fiyat kaydı) kendi tarihçe tablosunu kurmaz; eki yazar.
- Ek içeriğine göre süzme yoktur; gerekirse ayrı kararla sütuna taşınır.
