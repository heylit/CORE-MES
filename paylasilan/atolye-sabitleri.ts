// Atölye modülünün zod taşımayan sabitleri: istemci değer olarak ithal eder (sözleşme dosyası yalnız tip olarak).
// 3B model dosyası GLB 2.0'dır; uç gövdesi 1 MiB ile sınırlı olduğundan dosya parça parça gider ve gelir.
export const MODEL_PARCA_BAYT = 524288;
export const MODEL_AZAMI_BAYT = 26214400;

// Parça numarası eşleme anahtarı: baştaki ve sondaki boşluk atılır, iç boşluk teke iner, Türkçe büyük harfe çevrilir.
// Üretim emrindeki parça no serbest metindir; parça modeli bu anahtarla bulunur (sunucu ve istemci aynı işlevi kullanır).
export function parcaAnahtari(parcaNo: string): string {
  return parcaNo.trim().replace(/\s+/g, ' ').toLocaleUpperCase('tr-TR');
}
