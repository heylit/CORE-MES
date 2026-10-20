# Ön paket: cnc-kurulum

Prototip: CNC Kurulum Motoru (`cnc-kurulum-motoru.html`, tek dosya, 3B). Taban: `main` b610f0f.

## Sayfa ve ikinci menü
- Sayfa `/cnc-kurulum`, görme işlemi `sayfa.cnc-kurulum`, başlık "CNC Kurulum Motoru", simge `bolt`, grup `Üretim`, sıra 40.
- İkinci menü çerçeveli (`cerceveli: true`), tek madde. Prototip kendi iç gezinmesini taşır (8 ekran, Oto-CAM dahil).

## Veri
Prototip `window.claude` kullanmaz; yalnız `localStorage` (tek anahtar `cnc-kurulum-motoru.v1`). Köprü bu anahtarı
`cnc_kurulum_kayit` tablosuna yazar (jsonb). Kayıt atölyede ortaktır; sürüm denetimi başkasının yazdığının üstüne yazmayı engeller.
Boş depoda prototip kendi varsayılanlarıyla açılır; başlangıç kurulumu yok.

## Uçlar ve yetki
| Uç | Yetki | Ne yapar |
|---|---|---|
| GET /cnc-kurulum/ben | `sayfa.cnc-kurulum` ya da `.oku` ya da `.yaz` | kişi ve yazma bayrağı |
| GET /cnc-kurulum/kayitlar | aynı | bütün kayıtlar (anahtar, biçim, değer, sürüm) |
| POST /cnc-kurulum/kayitlar/yaz | `cnc-kurulum.yaz` | sürüm denetimli yazma (gövdesiz denetim) |
| POST /cnc-kurulum/kayitlar/sil | `cnc-kurulum.yaz` | sürüm denetimli silme |

Rol dağılımı (göç `20261012172818_kisiler_cnc_kurulum_yetkileri.sql`, çekirdek yamasında; kullanıcı kararı 12.10.2026):

| Rol | İşlem |
|---|---|
| `mudur`, `planlama_proje`, `cam` | sayfa, oku, yaz |
| `kalite`, `bakim` | sayfa, oku |
| öteki roller (operatör dahil) | yok |

Yönetici bayraklı rol olarak hepsini alır. `.yonet` işlemi yok (kurulum gerekmez).

## Tablolar
- `cnc_kurulum_kayit`: anahtar (PK, önek kısıtlı), biçim (`json` / `metin`), değer (jsonb), sürüm, güncelleyen kişi, zaman.
- `cnc_kurulum_surum`: tek sürüm sayacı.

## disari.ts ile açılan
`cncKurulumDurumu(db)`: prototipin durum kaydı, salt okunur (Aşama 2: takım stoğu, tezgâh ve malzeme eşlemesi için).

## Kararlar (kullanıcı, 12.10.2026)
- Rol dağılımı yukarıdaki gibi kalır (operatör görmez).
- Yazma ucunun gövdesi denetim defterine girmez; anahtar, biçim ve beklenen sürüm girer.
- Kayıt atölyede ortaktır (kütüphane, stok, takım ömrü herkes için aynı).

Açık soru yok.

## Bu modül şunları varsaydı
- Modül adı `cnc-kurulum`, menüde Üretim grubunda (VARSAYIM; değişirse sayfa dosyası ve göç).
- Aynı anda iki kişi değiştirirse sonra yazan uyarı alır ve sayfayı yeniler (son yazan kazanmaz).
- Kayıt en çok yaklaşık 1 MB (sunucunun gövde sınırı); prototip NC programını zaten 600 000 karakterde kırpar.
- Prototipteki tezgâh ve takım değerleri (tipik katalog değerleri, prototipte "varsayım" diye yazılı) örnek tanımdır, gerçek atölye kaydı değildir (VARSAYIM).
- STEP okuyucusu için çerçevede `unsafe-eval` açıktır (çerçeve yalıtılmış, dış istek kapalı).
- Oto-CAM ve ayar süresi ekranlarındaki kaynak bağlantıları çerçevede açılmaz (açılır pencere kapalı, dış adrese çıkılmaz) (VARSAYIM; açılsın denirse çerçeveye `allow-popups` eklenir).
