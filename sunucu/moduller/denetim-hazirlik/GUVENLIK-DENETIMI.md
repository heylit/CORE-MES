# denetim-hazirlik: güvenlik denetimi

Kaynak: `sunucu/moduller/denetim-hazirlik/uclar.ts`, `servis.ts`; testler `denetim-hazirlik.test.ts` (BD-01..BD-12). Kural numaraları KURAL-TEST.md'dedir.

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /denetim-hazirlik/ben` | `sayfa.denetim-hazirlik` ya da `.oku` ya da `.yaz` | kişi ve yetki bayrakları sunucudan | BD-07 | BD-07 (işlemsiz kişi 403) |
| `GET /denetim-hazirlik/damga` | `.oku` ya da `.yaz` | sayaç okuması | BD-01 | BD-07 |
| `GET /denetim-hazirlik/sorgu` | `.oku` ya da `.yaz` | yol biçimi (BD-1), kişiye özel alan (BD-2), koşul ve sınır sunucuda (BD-5) | BD-04 | BD-06, BD-07, BD-09 |
| `GET /denetim-hazirlik/belge` | `.oku` ya da `.yaz` | BD-1, BD-2 | BD-01 | BD-06, BD-09 |
| `POST /denetim-hazirlik/belge/yaz` | `.yaz` | BD-1, BD-2, sürüm (BD-4), damga (BD-6), kişi ve zaman sunucudan | BD-01, BD-02, BD-03 | BD-03 (409), BD-06, BD-07 (sayfa işlemiyle 403) |
| `POST /denetim-hazirlik/belge/sil` | `.yaz` | BD-1, BD-2, BD-6 | BD-05 | BD-07 |
| `POST /denetim-hazirlik/belge/kilitle` | `.yaz` | kilit (BD-8) | BD-08 | BD-08 (başkasının geçerli kilidi) |
| `GET /denetim-hazirlik/kisiler` | `.oku` ya da `.yaz` | yalnız etkin kişilerin no ve adı (`kisiler/disari.ts`) | BD-07 | BD-07 |
| `POST /denetim-hazirlik/kurulum` | `.yonet` (yalnız yönetici) | işaret belgesi varsa kurmaz (BD-10) | BD-11 | BD-11 (`.yaz` ile 403) |
| `GET /denetim-hazirlik/oda` | `.oku` ya da `.yaz` | yalnız son 45 sn (BD-11) | BD-12 | BD-07 |
| `POST /denetim-hazirlik/ekler/yukle` | `.yaz` | boyut en çok 700 KB (BD-9, kısıt); denetim kaydına içerik girmez, ad ve tür girer | BD-10 | BD-07 |
| `GET /denetim-hazirlik/ekler/:id` | `.oku` ya da `.yaz` | kimlik biçimi | BD-10 | BD-10 (olmayan ek 404) |

## Yalnız ekranda kalan kurallar
Prototipin iş kuralları (denetim programı, bulgu, DÖF, kapanış) ekrandadır; sunucu belge gövdesini yorumlamaz. UYUM-BORCU.md'de "bağlamada kapanacak".

## Bilinen açık (bağlamada kapanacak)
- Genel belge deposu ucu: `belge/yaz` ve `sorgu` her koleksiyona yazar ve okur; proje kuralı 7 ("genel depo ucu yok") ile çelişir. Aşama 2'de koleksiyon başına ayrı uç.
- Onaylı ya da kesinleşmiş kayıt kavramı sunucuda yok; kesinleşmiş denetim kaydı yazma yetkisi olan herkesçe değiştirilebilir.
