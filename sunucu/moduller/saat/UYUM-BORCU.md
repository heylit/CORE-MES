# Uyum borcu (saat)

## Bağlamada kapanacak
- KALIBRASYON_OKUMA_ISLEMLERI (kurallar.ts) kalibrasyon/uclar.ts OKUMA listesinin kopyası; kalibrasyon modülü disari.ts'ten dışa verince ona bağlanacak.
- Saat belirteci POST /saat/emirler/:id/durdur için oturum modülünde (Çekirdek) genişlemeyi bekliyor; o gelene kadar uç yalnız normal oturumla çalışır.
