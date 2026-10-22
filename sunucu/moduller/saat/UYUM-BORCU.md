# Uyum borcu (saat)

## Bağlamada kapanacak
- KALIBRASYON_OKUMA_ISLEMLERI (kurallar.ts) kalibrasyon/uclar.ts OKUMA listesinin kopyası; kalibrasyon modülü disari.ts'ten dışa verince ona bağlanacak.
- Saat belirteci POST /saat/uyarilar/ustlen için oturum modülünde (Çekirdek) genişlemeyi bekliyor (CEKIRDEK-ISTEKLERI.md); o gelene kadar uç yalnız normal oturumla çalışır, saatten 403 döner.
- `saat.uyari-ustlen` hiçbir rolde değil, yalnız yöneticide (CEKIRDEK-ISTEKLERI.md, rol x işlem sorusu açık). Rol satırı kisiler göçüyle girer.
- Vardiya ucunun dolu yolu (kişinin takvimi olan vardiya) yalnız kural testiyle sınanır; uçtan uca testte kişiye vardiya ve istasyon ataması kurulmadı.
- Sıradaki iş ucu iş emrini plan satırının makinesiyle istasyona bağlar; kişiye yerleşmiş iş ve elle bölünmüş işin sonraki parçaları sayılmaz.
