# Ön paket: recete-rota

Prototip: Reçete ve Rota Motoru (`Reçete ve Rota Motoru.html`, tek dosya). Taban: `main` 3cbc270.

## Sayfa ve ikinci menü
- Sayfa `/recete-rota`, görme işlemi `sayfa.recete-rota`, başlık "Reçete ve Rota", simge `tool`, grup `Tanımlar`, sıra 10 (eski Rota'nın yeri; eski Rota menüde gizli).
- İkinci menü çerçeveli (`cerceveli: true`), tek madde. Prototip kendi iç gezinmesini taşır (9 bölüm; Operatör ekranı kaldırıldı).

## Veri
Prototip `localStorage` (anahtarlar `recete-rota-motoru-v1`, `:studio`, `:studio:<senaryo>`, `:op`, `:side`) ve isteğe bağlı
`window.claude` (db, user) çağırır. Köprü yerel depoyu `recete_rota_kayit` tablosuna yazar (jsonb); `window.claude` hiçbir yetenek vermez (hepsi null; indirme yok). Cihaza özel `:op`, `:side`, `:studio:intro` sunucuya gitmez, kabuğun tarayıcı deposunda kalır. Kayıt atölyede ortaktır; sürüm denetimi başkasının yazdığının üstüne yazmayı engeller. Boş depoda prototip
boş fabrikayla açılır (kurulum ekranı ve örnek senaryo yok) ve ilk değişiklikte yazılır; okunamayan kayıtta hata iletisi çıkar, kaydın üstüne yazılmaz; sunucu başlangıç verisi yok.

## Uçlar ve yetki
| Uç | Yetki | Ne yapar |
|---|---|---|
| GET /recete-rota/ben | `sayfa.recete-rota` ya da `.oku` ya da `.yaz` | kişi ve yazma bayrağı |
| GET /recete-rota/kayitlar | aynı | bütün kayıtlar (anahtar, biçim, değer, sürüm) |
| POST /recete-rota/kayitlar/yaz | `recete-rota.yaz` | sürüm denetimli yazma (gövdesiz denetim) |
| POST /recete-rota/kayitlar/sil | `recete-rota.yaz` | sürüm denetimli silme |

Rol dağılımı (göç `20261013061901_kisiler_recete_rota_yetkileri.sql`, çekirdek yamasında; VARSAYIM, Rota'yı gören roller):

| Rol | İşlem |
|---|---|
| `mudur`, `planlama_proje` | sayfa, oku, yaz |
| `kalite`, `cam` | sayfa, oku |
| öteki roller (operatör dahil) | yok |

Yönetici bayraklı rol olarak hepsini alır.

## Tablolar
- `recete_rota_kayit`: anahtar (PK, önek kısıtlı), biçim (`json` / `metin`), değer (jsonb), sürüm, güncelleyen kişi, zaman.
- `recete_rota_surum`: tek sürüm sayacı.

## disari.ts ile açılan
`receteRotaDurumu(db)`: prototipin ana durum kaydı, salt okunur (Aşama 2: emir, malzeme, istasyon eşlemesi için).

## Bu modül şunları varsaydı
- Modül adı `recete-rota`; menüde eski Rota'nın yerinde, adı "Reçete ve Rota" (kullanıcı kararı). Eski `/rota` menüde gizli, adresle açılır.
- Rol dağılımı: müdür ve planlama yazar, kalite ve CAM görür, operatör görmez.
- Kayıt atölyede ortaktır; prototipteki kişiye özel hesap deposu kullanılmaz.
- Aynı anda iki kişi değiştirirse sonra yazan uyarı alır ve sayfayı yeniler (son yazan kazanmaz).
- Yazma ucunun gövdesi denetim defterine girmez (CNC Kurulum Motoru kalıbı).
- Açılışta TMI teması geçer; prototip içinde tema düğmesi yoktur.
- Bu ekranın verisi depodaki rota, üretim emri ve stok tablolarından ayrıdır; bağlama Aşama 2'dedir.
