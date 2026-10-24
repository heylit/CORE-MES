# Güvenlik denetimi: logo (kart #207)

Uçlar: `GET /logo/birim-setleri` (`sayfa.malzemeler` ya da `logo.birim-seti-yaz`), `POST /logo/birim-setleri/ekle` ve
`POST /logo/birim-setleri/:kod/kaldir` (`logo.birim-seti-yaz`, yalnız yönetici; yazma tam denetlenir). Gönderim zamanlanmış işten
(`logo-malzeme-gonderimi`), kişisi yok (ADR 0010 karar 7): malzemelere yalnız `malzemeLogoSonucu` ile Logo sonucunu yazar; kartın başka alanına dokunmaz.

| Yüzey | Kural | İzinli test | Reddeden test |
|---|---|---|---|
| Ortam değişkeni | yalnız `TMIV2_LOGO_*`; ikisi birlikte; kurum içi adres; kimlik/sorgu taşımaz | `LGB-1: kurum içi adres ve anahtar açar ...` | `LGB-1 (ret): ...`, `LGB-2: ...` |
| Köprü isteği | anahtar `X-Api-Key` başlığında, adreste değil; yönlendirme izlenmez; 60 sn süre | `LGB-8 kabul ...` (başlık ve yol) | `LGB-4 401 ...` |
| Hata metni | adres ve anahtar taşımaz; köprü metni 2000'de kırpılır; ekranda React kaçırarak basar | `LGB-3 doğrulama hatası ...` | `LGB-4 köprüye ulaşılamaz: ... metin adres taşımaz` |
| Çift gönderim | LGB-6 | `LGB-8 kabul ...` | `LGB-6 ...` (6 akış testi) |
| Kapalı bağlantı | anahtar kapalı ya da değişken yok: istek yok, yazma yok | `LGB-1 anahtar açık + değişkenler var ...` | `LGB-1 anahtar kapalı ...`, `LGB-1 anahtar açık + değişken yok ...` (fetch çağrılırsa düşer) |
| Birim seti uçları | yazma yalnız `logo.birim-seti-yaz`; kod boşluksuz, en çok 40; kullanılan ve köprüden gelen set kaldırılamaz | `LGB-14 ...` (yönetici) | `LGB-14 ...` (operatör 403, boşluklu kod 400, kullanılan 422) |
| Geçersiz karşılık | izinli listede olmayan tür ya da birim seti gönderilmez | `LGB-8 kabul ...` | `LGB-10 ...` |
| Hizmet kartı | kodda kapalı yön için istek yok; "var mı" yolu yoksa açma isteği yok; malzeme ucuna gitmez | `LGB-19 ...` (yalnız test açar) | `LGB-16`, `LGB-17`, `LGB-18`, `LGB-19 kalkan ...` |
| Sonucun karta yazılması | kart kuralı reddederse (gönderilmiş, kayıt no başka kartta) tur düşmez, neden giden kutusunda | `LGB-6 kalkan ...` | testte sahte köprünün tekrarlayan numarasıyla görüldü (NOTLAR "Tuzak") |

| Satın alma gönderimi | iki ayar açık (`logo.baglanti`, `logo.satin-alma-gonderimi`) ve değişkenler varken; kuralı tutmayan belgeye istek yok; cari Logo'da yoksa açma yok; sipariş numarayla bulunur, talep fişi yalnız niyetle (sonucu bilinmeyen yinelenmez); satır sayısı tutmazsa bağ yazılmaz; düzenleme ve karşılama önce okur; iptal önce karşılamayı kaldırır | `LGS-8`, `LGS-14`, `LGS-15`, `LGS-17`, `LGS-18`, `LGS-19` | `LGS-7`, `LGS-10`..`LGS-13`, `LGS-16` |
| Satış gönderimi | iki ayar açık (`logo.baglanti`, `logo.satis-gonderimi`) ve değişkenler varken; cari kodu yoksa ya da CRM satış müşterisi değilse teklif açılmaz; sipariş yalnız Logo'daki tekliften; yalnız niyet kalkanı | `LGT-7` | `LGT-6`, `LGT-8`, `LGT-9`, `LGT-10` |
| Hizmet kartı ve ad güncellemesi | hizmet yön başına ayrı anahtar, kapalı gelir; ad güncellemesi yalnız Logo'ya gitmiş karta | `LGB-21`, `LGS-20` | `LGB-18`, `LGB-19` |

Sipariş işi kişisizdir (ADR 0010 karar 7); satın almaya yalnız sonuç işlevleriyle yazar, yeni uç ve işlem yok.
Veri kapsamı yok (iş merkezine bağlı değil). Uç yazmaları tekrar korumalı değil (ekleme ve kaldırma yinelendiğinde sonuç aynı). Sürüm: `logo_giden` yalnız tur kilidi altında yazılır.
| Hazırlık ve canlı deneme (`GET /logo/hazirlik`, `GET /logo/hazirlik/kontrol`) | `saglik.ayrinti-oku` (yalnız yönetici); yeni işlem yok; anahtar değeri cevaba girmez, yalnız "tanımlı"; deneme yalnız GET, Logo'ya yazma yok; deneme ucu işlem dışı (uzun dış çağrı okuma işlemini tutmaz) | `hazirlik.test.ts` uç testleri | yetkisize 403, oturumsuza 401 |
| Okuma akışları (mal kabul, cari ve ambar, fatura) | yeni uç, işlem, rol ya da sayfa yok; yalnız zamanlanmış iş; Logo'ya yalnız GET; "Logo bağlantısı" + akışın kendi anahtarı (varsayılan kapalı) + köprü değişkenleri; okunan veri yalnız saklanır; istek sıralı, süre 60 sn; Logo'ya SQL yok | `LOGO-O6`, `LOGO-O9`, `LOGO-O11` (yalnız GET) | `LOGO-O4`, `LOGO-O5` (kapalıyken istek yok), `LOGO-O8`, `LOGO-O10`, `LOGO-O12` (401, ağ) |
| Malzeme fişi gönderimi | ayar `logo.malzeme-fisi-gonderimi` kapalı ve tür başına şekil (yalnız `ayarlar.yaz`, yalnız yönetici); niyet kalkanı, sonucu bilinmeyen fiş kendiliğinden yinelenmez; elle gönderim isteği stokta `stok.malzeme-fisi-gonder` ile, sürümlü (kart #492) | `LOGO-O13`, `LOGO-O17`, `LOGO-O18` | `LOGO-O4`, `LOGO-O14`, `LOGO-O15`, `LOGO-O17` (kapalı tür, istek yokken elle tür) |

## Yalnız ekranda kalan kurallar
Yok.
