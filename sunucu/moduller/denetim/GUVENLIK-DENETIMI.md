# Güvenlik denetimi: denetim (3. tur, kart #48)

Tek yazma yolu `denetimYaz` (`disari.ts`): uç katmanı her yazma komutunda çağırır (`sunucu/uygulama-secenekleri.ts`), ayarlar değişiklik kaydı için
çağırır. Zaman veritabanı saatinden (`zaman` varsayılanı), kişi oturumdan. Modülün kendi uçları yalnız okumadır.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /denetim-kayitlari` | `denetim.oku` | gövde ve parametre seçilmez, cevap şemasında yok; yalnız DNT-01 kimlikleri, modül ve yetki adı; modül süzgeci kalıpla sınırlı (1371 a) | `liste: denetim.oku taşıyan müdür görür; ...` | aynı test (operatör 403, oturumsuz 401); `liste satırı gövde ve parametre taşımaz; ...`; `modül ve yetki: ...` (kötü modül adı 400, operatör 403) |
| `GET /denetim-kayitlari/suzgecler` | `denetim.oku` | kişi adları ve komut kalıpları; içerik yok | `süzgeç seçenekleri: ...` | `liste: ...` (operatör 403) |
| `GET /denetim-kayitlari/:id/govde` | `denetim.govde-oku` | okumada `gizle` yeniden; yoksa 404 | `gövde ucu: ...` (yönetici) | aynı test (müdür ve operatör 403) |

| `GET /denetim-degisiklikleri` | `denetim.oku` | değer taşımaz; tablo, kayıt anahtarı, işlem, alan adları; `kayitlar` süzgeci şemayla sınırlı (en çok 50 çift, tablo ve alan adı kalıpla, değer parametreyle gider; 1384 b) | `degisiklik.test.ts` `liste: ...` (müdür) | `degisiklik.test.ts` `reddedilen: ...` (operatör 403, oturumsuz 401); `kayıt süzgeci: ...` (bozuk liste 400, operatör 403) |
| `GET /denetim-degisiklikleri/suzgecler` | `denetim.oku` | kişi ve tablo listesi | `degisiklik.test.ts` `liste: ...` | aynı red testi (operatör 403) |
| `GET /denetim-degisiklikleri/:id/icerik` | `denetim.govde-oku` | okumada gizli adlı alanın iki değeri de maskelenir; yoksa 404 | `degisiklik.test.ts` `içerik: ...` (yönetici) | `degisiklik.test.ts` `reddedilen: ...` (müdür 403) |

Yazma tarafı (önceki tur, değişmedi):

| Kural | Nerede | Test |
|---|---|---|
| parola, token, pin, password, passwd, secret adlı alanlar iç içe yapıda da maskelenir | `kurallar.ts` `gizle` | `kurallar.test.ts` |
| TCKN, SGK no, IBAN, maaş, ücret geçmişi, kan grubu, engel durumu, adres, telefon, doğum tarihi adlı alanlar maskelenir (okurken de) | `kurallar.ts` `KISISEL_KIMLIK`, `KISISEL_HASSAS` | `kurallar.test.ts`, `okuma.test.ts` |
| yol parametresi de maskelenir; gövdesiz uçta özet maskeli gövdeden | `servis.ts` | `denetim.test.ts` |
| kayıt değiştirilemez, silinemez, boşaltılamaz | `20261005120200_denetim.sql` tetikleyiciler | oturum testi |
| değişiklik defteri tetikle yazılır; kişi oturum değişkeninden, sayı değilse boş; defter değiştirilemez, silinemez, boşaltılamaz | `20261023194500_denetim_degisiklik_defteri.sql` | `degisiklik.test.ts` |

## Yalnız ekranda kalan kurallar

Yok. Ekran içerik yetkisini oturumdaki işlemden okur ve yetkisizde gövde ucunu hiç çağırmaz; red sunucudadır (403).
Kullanıcı metni React ile düz yazılır (`<pre>` içinde `JSON.stringify`); HTML olarak basılmaz.
