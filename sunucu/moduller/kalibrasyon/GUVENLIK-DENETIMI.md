# GUVENLIK-DENETIMI: kalibrasyon (kart #247, dal 247-tanim-modulleri)

Her uç `uclar.ts`'te `uc({...})` ile. Testler `kalibrasyon.test.ts` (gerçek PostgreSQL); "Test" sütunundaki adlar test başlığının başıdır.
"yetki-1": "yetki: oturumsuz 401; işlemi olmayan 403; ...", "yetki-2": "yetki: sayfası olan rol kalibrasyon.oku olmadan okur ...".
yetki-1 bütün uçlarda oturumsuz 401 ve işlemsiz (operatör) 403 ölçer.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /olcu-aletleri` | `biri: sayfa.kalibrasyon, kalibrasyon.oku` | arama, vade sırası, özet (KLB-12, KLB-13) | yetki-1 (oku), yetki-2 (sayfa) | yetki-1, yetki-2 (operatör 403) |
| `GET /olcu-aletleri/ozet` | aynı | liste ucunun özetiyle aynı hesap (`ozetSay`); aletler taşınmaz | yetki-1, yetki-2, "ana sayfa özeti liste ucunun özetiyle aynıdır" | yetki-1, yetki-2 |
| `GET /olcu-aletleri/:id` | aynı | son altı kayıt (KLB-14); kişi adı kisiler `disari.ts` ile | yetki-1, yetki-2 | yetki-1, yetki-2 |
| `GET /olcu-aleti-turleri` | aynı | alet sayısıyla | yetki-1, yetki-2 | yetki-1, yetki-2 |
| `POST /olcu-aletleri` | `kalibrasyon.yaz` | numara zorunlu, büyük harf, tekil (KLB-02, KLB-03, kısıt); tür var ve aktif (KLB-S3); periyot 1-3650 | KLB-01 | yetki-1 (okur 403), KLB-02, KLB-03 (409), KLB-S3 |
| `POST /olcu-aletleri/:id/guncelle` | `kalibrasyon.yaz` | tam kayıt, periyot zorunlu; tekil numara | "güncelleme alet bilgisini değiştirir" | yetki-1, yetki-2 (403), aynı test (404), "güncellemede periyot zorunludur", KLB-03 |
| `POST /olcu-aletleri/:id/sil` | `kalibrasyon.yaz` | kaydı olan alet silinmez (KLB-S6) | KLB-S6 | yetki-1 (403), KLB-S6 (409) |
| `POST /olcu-aletleri/:id/kalibrasyon-kaydet` | `kalibrasyon.yaz`; tekrar korumalı | aynı istek kimliği ikinci kayıt yazmaz, başlık zorunlu (KLB-S8); kişi sunucudan (KLB-07); gelecek tarih ret (KL3); durumu en yeni tarihli kayıt belirler (KL3); defter yalnız ekleme (KLB-11) | KLB-07, KL3, KLB-S8 | yetki-1 (403), KL3 (gelecek tarih 400), KLB-S8 (başlıksız 400, başka gövde reddi, okur 403) |
| `POST /olcu-aletleri/:id/kullanim-disi` | `kalibrasyon.yaz` | neden zorunlu; zaten kullanım dışı ise çakışma (KLB-S7) | KLB-S7 | yetki-1 (403), KLB-S7 |
| `POST /olcu-aleti-turleri` | `kalibrasyon.yaz` | ad zorunlu ve tekil (KLB-S3) | KLB-S3 | yetki-1, yetki-2 (403), KLB-S3 (409) |
| `POST /olcu-aleti-turleri/:id/guncelle` | `kalibrasyon.yaz` | ad tekil; pasif tür mevcut aleti bozmaz (KLB-S3) | KLB-S3 | yetki-1 (403), KLB-S3 |

## Genel arama kaynağı (kart #1243)
`disari.ts` `kayitAramaKaynaklari` (tür `olcuAleti`) okuma uçlarıyla aynı işlemle (`sayfa.kalibrasyon` ya da `kalibrasyon.oku`)
açılır; çekirdek kişide bu işlemlerden biri yoksa kaynağı çağırmaz (`paylasilan/kayit-aramasi.ts`). Kaynak yazmaz. Aletin
kalibrasyon formunu açan satır yalnız `kalibrasyon.yaz` taşıyana ve numarası tam yazılınca gelir; kaydı form ve yazma ucu yazar
(1230 a). Desen kaçırılmış gelir, joker karakter joker değildir. Testler `arama/arama.test.ts` (izinli: form satırı yazana;
reddedilen: okura ve eksik numaraya form satırı yok). Oturumsuz ve işlemsiz isteğin reddi çekirdeğin `/arama` testindedir (1233).
Ekran `?alet=`, `?form=` ve `?yeni=1` adreslerini okur; form yalnız `kalibrasyon.yaz` taşıyana açılır, yetki yine yazma ucundadır.

- Kalibrasyon kaydı güncellenmez ve silinmez (uç yok; KLB-11). Kaydı giren kişinin satırı silinemez (KL1).
- Kayıt zamanı (`olusturuldu`) veritabanından, kişi oturumdan.

## Denetim kaydı
Yazma uçları gövdeyi denetime tam yazar (çekirdek varsayılanı).

## Yalnız ekranda kalan kurallar
- Ekle, düzenle, kaydet düğmelerinin görünmesi `kalibrasyon.yaz`'a bağlıdır; yetki sunucudadır.
- İkinci menü maddeleri yalnız görünürlüktür.

## Açık konular
Alet açma ucunda tekrar koruması yok (UYUM-BORCU 5, kullanıcı kararı K8). Kapananlar: rol satırları (UYUM-BORCU 1, kalite görür ve yazar,
müdür görür; `kisiler/rol-dagilimi.test.ts`), sürüm denetimi (UYUM-BORCU 4, kart #369: alet ve tür güncellemesi beklenen sürümle, eskiyse 409).
