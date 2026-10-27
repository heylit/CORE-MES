# Güvenlik denetimi: dosya uçları

Bütün uçlar `uclar.ts`'tedir; üçü de `oturum` ister (oturumsuz 401). Dosyayı veren okuma ucu bağlayan modüldedir (ADR 0009).

| Uç | İşlem | Sunucu kuralları | İzinli test | Reddedilen test |
|---|---|---|---|---|
| POST /dosyalar/eksikler | oturum | yalnız özet listesi (en çok 500); gövdesiz denetim | `DSK-01` | `yükleme uçları: ...` şema dışı özet 400, oturumsuz 401 |
| POST /dosyalar/:ozet/parca | oturum | kişi şeridi; kişi kilidi; 5 açık yükleme, 1 GiB açık parça, 2 GiB bağsız dosya, 50 GB depo; tek dosya 200 MB (413); özet ve tür tamamlamada; daha önce kendisi gönderen "tamam" alır, gerisi bütün içeriği gönderir; gövdesiz denetim | `DSK-01`, `DSK-03`, `DSK-04`, `DSK-06`, `DSK-13` | `DSK-02` 400, `DSK-03` 413 ve 429, `DSK-05` 400, `DSK-06`, `DSK-12` 429, `yükleme uçları` 401 ve 400 |
| GET /dosyalar/:ozet | oturum | yalnız içeriği kendisi gönderen (`dosya_yukleyeni`) ve yalnız bağsız dosya; ikili cevap, nosniff, ek olarak indirme | `DSK-07`, `DSK-11` | `DSK-07` başkası 404, oturumsuz 401, bağlı 404; `DSK-11` özeti bilen 404 |

`disari.ts` `dosyaTutamagi(modul).dosyaBagla`: bağlayan içeriği kendisi göndermiş olmalı; özeti bilen ret alır (`DSK-11`). Kullanıcı kararı DSb a.
Bağ işlevleri modül adına bağlı tutamaktadır (#144): bir modülün tutamağı başka modülün bağını göremez, akıtamaz, kaldıramaz; adı modül
klasörü olmayan tutamak açılışta hata verir (test `tutamak: ...`). Kalan sınır: bir modül kendi adı yerine başka modülün adıyla tutamak
alabilir; bunu yalnız inceleme yakalar (sınır kuralı yok, UYUM-BORCU madde 3).

## Kart #732 (kararlar 732 a, 743 a)
- `kaynaktanBagla` (her tutamakta): sunucu kodu, başka bir modülün kaydına zaten bağlı dosyayı kişisiz bağlar; özet kişiden gelmez, kaynak
  modülün sunucu kodundan gelir. Bağsız, yok ya da yalnız aynı modülde bağlı dosyada ret; modülün tür ve boyut sınırı geçerli (test
  `kaynaktan bağlama ...`). Kalan sınır: çağıranın özeti kişiden almadığını yalnız inceleme yakalar (uç değil, `disari` işlevi).
- `modulDeposuTutamagi(modul).icerikYaz`: kendi yükleme şeridi olan modül (Arkon) tamamladığı içeriği yazar; özet sunucuda yeniden hesaplanır,
  tutmazsa ret; kişi yükleyen olur (DSb korunur). İmzasız içerik `ikili` türüyle girer (MIME `application/octet-stream`); kişinin yükleme ucu
  bu türü hiç üretmez (DSK-05). Olağan `dosyaTutamagi` ikili dosya bağlayamaz (bağ sınırı türü sözleşmedeki türlerdir) ve bağında ikili görürse hata verir.
