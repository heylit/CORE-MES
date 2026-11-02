# GUVENLIK-DENETIMI: markalama (kart #806, dal 806-markalama)

Her uç `uclar.ts`'te `uc({...})` ile. Testler `markalama.test.ts` (gerçek PostgreSQL). Oturumsuz istek her uçta 401 (çekirdek).
Okuma: `{ biri: ['sayfa.markalama'] }`. Test rolleri: operatör (sayfa + seri-ver), kalite (sayfa + durum-yaz), yetkisiz (hiçbiri).

| Uç | İşlem | Sunucudaki kurallar | İzinli test | Reddeden test |
|---|---|---|---|---|
| `GET /markalama/tanimlar`, `/tanimlar/:id` | sayfa.markalama | yok (okuma) | MRK-U1 (operatör okur) | MRK-U1 (yetkisiz 403) |
| `GET /markalama/tanimlar/:id/onizleme` | sayfa.markalama | sayaç tüketilmez; emir verilirse MRK-07 | MRK-U3 | MRK-U1 |
| `GET /markalama/tanimlar/:id/emirler` | sayfa.markalama | yalnız tanımın malzemesinin açık emirleri | MRK-U3 | MRK-U1 |
| `POST /markalama/tanimlar/ekle` | markalama.tanim-yaz | MRK-01, 02, 08; (malzeme, op) tekil | MRK-U1, MRK-U2 | MRK-U1 (yetkisiz, operatör 403), MRK-U2 (400, 409) |
| `POST /markalama/tanimlar/:id/kaydet` | markalama.tanim-yaz | MRK-01, 02; sürüm | MRK-U2 | MRK-U2 (eski sürüm 409) |
| `POST /markalama/birimler/markala` | markalama.seri-ver, tekrar korumalı | MRK-02, 03, 07; seri tekil | MRK-U3 | MRK-U3 (kalite 403, başka malzemenin emri 422, seri alanı yok 422) |
| `POST /markalama/birimler/dogrula` | markalama.seri-ver | MRK-06 | MRK-U4 | MRK-U4 (yetkisiz 403, hurda 422, olmayan 404) |
| `POST /markalama/birimler/:id/durum` | markalama.durum-yaz | MRK-04, 05; sürüm; satır kilidi | MRK-U5 | MRK-U5 (operatör 403, geçersiz geçiş 409, eksik ya da yersiz neden 400, eski sürüm 409) |
| `GET /markalama/birimler`, `/birimler/:id`, `/emirler/:emirId/ozet` | sayfa.markalama | liste 500 satırla sınırlı | MRK-U4, MRK-U5 | MRK-U1 |

## Yalnız ekranda kalan
- Düğmelerin görünmesi işleme bağlıdır; durum düğmeleri MRK-04'ü yansıtır, karar sunucudadır.
- 3B model Çizim Merkezi uçlarından okunur; o uçların yetkisi (`sayfa.cizimler`, `belge-merkezi.oku`, `malzemeler.yaz`) geçerlidir, ekran 403'te yazıyla uyarır.

## Açık konular
Rol satırı yok (UYUM-BORCU 1). Kişi kimliği tabloda, ad yok; olayın kişisi denetim kaydı ve `kisi_id` ile.
