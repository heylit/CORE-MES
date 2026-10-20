# Ön paket: denetim-hazirlik

Prototip: ISO 9001 Denetim Hazırlığı (`denetim-hazirlik.html`). Taban: `main` 708190c.

## Sayfa ve ikinci menü
- Sayfa `/denetim-hazirlik`, görme işlemi `sayfa.denetim-hazirlik`, başlık "Denetim Hazırlığı", simge `check`, grup `Kalite`, sıra 20.
- İkinci menü çerçeveli (`cerceveli: true`), tek madde: ana sayfa. Prototip kendi iç gezinmesini taşır.

## Veri
Prototip bütün verisini tarayıcının yerel deposunda tek kayıtta tutar (`kalite-denetim-v4`). Köprü bu kaydı TMI'de ortak alana (`yerel/kalite-denetim-v4`) yazar: herkes aynı denetim hazırlığını görür. Yazma sürümle yapılır; araya başka kişinin yazması girerse ekran uyarır ve o oturumda yazmayı durdurur (sayfa yenilenince güncel kayıt gelir).

Boş depo: Gerekmez; boş depoda prototip kendi boş durumuyla açılır.

Çerçeve yetenekleri: Yok (prototip `window.claude` kullanmaz).

## Uçlar ve yetki
| Uç | Yetki | Ne yapar |
|---|---|---|
| GET /denetim-hazirlik/ben | `sayfa.denetim-hazirlik` ya da `denetim-hazirlik.oku` ya da `denetim-hazirlik.yaz` | kimlik, yazma ve yönetim bayrağı, kurulum gerekli mi |
| GET /denetim-hazirlik/damga | `denetim-hazirlik.oku` ya da `.yaz` | son sürüm (değişiklik yoklaması) |
| GET /denetim-hazirlik/sorgu | aynı | koleksiyon; koşul, sıra, sınır |
| GET /denetim-hazirlik/belge | aynı | tek belge |
| POST /denetim-hazirlik/belge/yaz | `denetim-hazirlik.yaz` | tam ya da birleştirerek yazma, beklenen sürüm |
| POST /denetim-hazirlik/belge/sil | `denetim-hazirlik.yaz` | silme |
| POST /denetim-hazirlik/belge/kilitle | `denetim-hazirlik.yaz` | süreli kilit (tek sefer koşan işler) |
| GET /denetim-hazirlik/kisiler | `denetim-hazirlik.oku` ya da `.yaz` | etkin kişiler (no, ad) |
| POST /denetim-hazirlik/kurulum | `denetim-hazirlik.yonet` | boş depoda başlangıç belgeleri |
| GET /denetim-hazirlik/oda | `denetim-hazirlik.oku` ya da `.yaz` | açık olanlar ve durumları |
| POST /denetim-hazirlik/ekler/yukle | `denetim-hazirlik.yaz` | ek yükleme (gövdesiz denetim) |
| GET /denetim-hazirlik/ekler/:id | `denetim-hazirlik.oku` ya da `.yaz` | ek okuma |

Rol dağılımı (kullanıcı kararı 12.10.2026; göç `20261012165223_kisiler_denetim_hazirlik_yetkileri.sql`). `denetim-hazirlik.yonet` yalnız yöneticide kalır:

| Rol | İşlem |
|---|---|
| `mudur` | oku, yaz |
| `kalite` | oku, yaz |
| `planlama_proje` | oku |

Her role ayrıca `sayfa.denetim-hazirlik` verilir.

## Tablolar
- `denetim_hazirlik_belge`: yol (PK), üst koleksiyon, kimlik, veri (jsonb nesne), sürüm, oluşturan/güncelleyen kişi ve zaman, kilit sahibi ve bitişi.
- `denetim_hazirlik_ek`: kimlik (32 hex), ad, tür, boyut (≤ 700 KB), içerik (bytea), yükleyen, zaman.
- `denetim_hazirlik_surum`: tek sürüm sayacı.

## İş kuralları
KURAL-TEST.md'deki BD-1..BD-14. Prototipin kendi iş kuralları ekranda kalır (UYUM-BORCU.md).

## disari.ts ile açılan
`denetimHazirlikKoleksiyonu(db, koleksiyon)`: kişiye özel alan (`data/...`) dışındaki bir koleksiyonun belgeleri, salt okunur. Aşama 2'de bağlanacak modüller için.

## Bu modül şunları varsaydı
- Denetim hazırlığı kişiye değil kuruluşa aittir; bu yüzden ortak alanda, sürüm denetimiyle tutulur (VARSAYIM; kişiye özel istenirse `kapsam: "kisisel"` tek satır).
- Prototipin eski anahtarları (`iso9001-denetim-v1..v3`) taşınmaz: yeni sistemde boştur.
- Değişiklik 2,5 sn'de bir damga yoklamasıyla gelir (anlık itme yok).
- Ek en çok 700 KB.

## Kararlar (12.10.2026)
1. Ek içeriği denetim kaydına girmez; ad ve tür girer.
2. Rol dağılımı yukarıdaki tablodur.
3. Mesai'nin Excel içe aktarımı için SheetJS eklendi.

## Açık sorular
Yok.
