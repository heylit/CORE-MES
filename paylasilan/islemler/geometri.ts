// geometri.oku: 3B modellerin geometri analizini (kutu, döndürülmüş kutu, hacim, alan) ve ham ölçü önerisini görür.
// geometri.hesapla: bir revizyonun analizini yeniden kuyruğa alır. Hesabı ayrı süreç yapar (1427 a); uç yalnız kuyruğa yazar.
// geometri.yuzey-yaz: modelin yüzlerine boya, kaplama ve maske işareti yazar (kart 2144).
// geometri.kalibrasyon: süre kalibrasyonundan parçayı dışarıda bırakır ya da geri alır; Kalibrasyon sayfasını görür (3321 S2 a).
export const GEOMETRI_ISLEMLERI = ['geometri.oku', 'geometri.hesapla', 'geometri.yuzey-yaz', 'geometri.kalibrasyon'] as const;
