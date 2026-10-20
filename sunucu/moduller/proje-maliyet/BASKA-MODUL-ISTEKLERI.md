# Başka modül istekleri (proje-maliyet)

Hepsi okuma; çağıranın db'si, transaction açmaz, yetki denetlemez. Olmayan kimlik haritada yoktur, sıfır uydurulmaz.

1. (karşılandı, #1820; plan bitişi plan `canliSira`ndan) uretim-emirleri: `projeninIsEmirleri(db: Db, projeId: number): Promise<ProjeIsEmri[]>`
   `ProjeIsEmri { isEmriId: number; uretimEmriId: number; emirNo: string; opNo: number; istasyonId: number | null; istasyonAd: string | null;
   kaynakTur: 'makine' | 'kisi' | 'fason' | null; adet: number; saglam: number | null; birimSureDk: string | null; ayarSureDk: string | null;
   durum: 'bekliyor' | 'calisiyor' | 'tamam'; planBitis: null; bitis: string | null (zaman) }`. İptal ve arşiv gelmez (Üretim emirleri cevabı 19.10).
   Plan bitişi: plan `isEmriPlanBitisleri(db, idler): Map<id, zaman>`.
2. (karşılandı, #1820; ayarSn boş olabilir) uretim-emirleri: `isEmriSureleri(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, { islemeSn: number; ayarSn: number; katilim: { kisiId: number; saniye: number }[] }>>`
   İşleme ve ayar makine kullanımından (ayar kullanımı ayrı), katılım kişi başına; açık aralık şimdiye kadar.
3. (karşılandı, #1809) satin-alma: `isEmriFasonTutarlari(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, { tutar: string; paraBirimi: string }[]>>`
   `satin_alma_siparis_satiri.is_emri_id` üzerinden, iptal olmayan satırlar, KDV hariç; para birimi başına bir satır.
4. projeler: `projeGetir` cevabına `butceTutari: string | null`, `butceParaBirimi: string | null` (198 a).
5. plan: `planAyariOku` cevabına `karRiskiGunlukOran: string` (yüzde, varsayılan 0.3; 194 a, sıra 6b).
6. projeler (istemci): proje ayrıntısına "Maliyet" sekmesi; içerik `istemci/src/moduller/proje-maliyet/disari.ts` `ProjeMaliyeti({ projeId })`,
   sekme yalnız `MALIYET_OKUMA_ISLEMI` (`finans.maliyet-oku`) olana görünür.
