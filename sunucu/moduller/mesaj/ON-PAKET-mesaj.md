# Ön paket: mesaj

Prototip: Mesai ekip sohbeti ve iş alanı (`mesai.html`). Taban: `main` 708190c.

## Sayfa ve ikinci menü
- Sayfa `/mesaj`, görme işlemi `sayfa.mesaj`, başlık "Mesaj", simge `bell`, grup `Yönetim`, sıra 7.
- İkinci menü çerçeveli (`cerceveli: true`), tek madde: ana sayfa. Prototip kendi iç gezinmesini taşır.

## Veri
Prototip `window.claude` (db, user, room, assets, downloads) ile çalışır; köprü bu yetenekleri TMI uçlarıyla karşılar. Kanal, ileti, görev, duyuru, onay, toplantı, sipariş, kural ve zamanlı iş belgeleri modülün belge deposunda durur. Kişiler TMI kişileridir (kimlik = TMI kişi no). Yerel tercihler (`mesai:` önekli anahtarlar) kişinin özel alanına yazılır.

Boş depo: Boş depoda yönetici ilk açtığında `genel` ve `duyurular` kanalları kurulur (ileti yok).

Çerçeve yetenekleri: db, user, room (yalnız varlık: kim açık), assets (en çok 700 KB), downloads.

## Uçlar ve yetki
| Uç | Yetki | Ne yapar |
|---|---|---|
| GET /mesaj/ben | `sayfa.mesaj` ya da `mesaj.oku` ya da `mesaj.yaz` | kimlik, yazma ve yönetim bayrağı, kurulum gerekli mi |
| GET /mesaj/damga | `mesaj.oku` ya da `.yaz` | son sürüm (değişiklik yoklaması) |
| GET /mesaj/sorgu | aynı | koleksiyon; koşul, sıra, sınır |
| GET /mesaj/belge | aynı | tek belge |
| POST /mesaj/belge/yaz | `mesaj.yaz` | tam ya da birleştirerek yazma, beklenen sürüm |
| POST /mesaj/belge/sil | `mesaj.yaz` | silme |
| POST /mesaj/belge/kilitle | `mesaj.yaz` | süreli kilit (tek sefer koşan işler) |
| GET /mesaj/kisiler | `mesaj.oku` ya da `.yaz` | etkin kişiler (no, ad) |
| POST /mesaj/kurulum | `mesaj.yonet` | boş depoda başlangıç belgeleri |
| GET /mesaj/oda | `mesaj.oku` ya da `.yaz` | açık olanlar ve durumları |
| POST /mesaj/ekler/yukle | `mesaj.yaz` | ek yükleme (gövdesiz denetim) |
| GET /mesaj/ekler/:id | `mesaj.oku` ya da `.yaz` | ek okuma |

Rol dağılımı (kullanıcı kararı 12.10.2026, 1 "evet"; rol satırları çekirdek isteğidir, CEKIRDEK-ISTEKLERI 5). `mesaj.yonet` yalnız yöneticide kalır:

| Rol | İşlem |
|---|---|
| `mudur`, `planlama_proje`, `kalite`, `cam`, `bakim`, `satin_alma`, `depo`, `sevkiyat`, `insan_kaynaklari`, `idari_isler`, `muhasebe_finans` | oku, yaz |
| `operator` | yok (#720: operatör yalnız terminal ve kuyruğu görür; İK için sorulan soruya göre Mesaj da sorulur) |

Listedeki her role ayrıca `sayfa.mesaj` verilir.

## Tablolar
- `mesaj_belge`: yol (PK), üst koleksiyon, kimlik, veri (jsonb nesne), sürüm, oluşturan/güncelleyen kişi ve zaman, kilit sahibi ve bitişi.
- `mesaj_ek`: kimlik (32 hex), ad, tür, boyut (≤ 700 KB), içerik (bytea), yükleyen, zaman.
- `mesaj_surum`: tek sürüm sayacı.

## İş kuralları
KURAL-TEST.md'deki BD-1..BD-14. Prototipin kendi iş kuralları ekranda kalır (UYUM-BORCU.md).

## disari.ts ile açılan
`mesajKoleksiyonu(db, koleksiyon)`: kişiye özel alan (`data/...`) dışındaki bir koleksiyonun belgeleri, salt okunur. Aşama 2'de bağlanacak modüller için.

## Bu modül şunları varsaydı
- Modül adı `mesaj` (kullanıcı kararı 12.10.2026; teslimde `mesai-alani`): `/mesai` yolu vardiyanın "Günlük Mesai" sayfasında dolu.
- Prototipin `room.emit/on` anlık olayları yok sayılır; yazıyor göstergesi gibi anlık olaylar görünmez, veri 2,5 sn yoklamayla gelir.
- Yönetici bayrağı (`isOwner`) `mesaj.yonet` işleminden gelir.
- Değişiklik 2,5 sn'de bir damga yoklamasıyla gelir (anlık itme yok).
- Ek en çok 700 KB.

## Kararlar (12.10.2026)
1. Ek içeriği denetim kaydına girmez; ad ve tür girer.
2. Rol dağılımı yukarıdaki tablodur.
3. SheetJS (`xlsx`) eklenmez (oturtmada kullanıcı kararı 2 "hayır"); Excel dosyası içe aktarımı kapalı, CSV ve yapıştırma açık.

## Açık sorular
Yok.
