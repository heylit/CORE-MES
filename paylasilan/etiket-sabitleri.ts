// Etiket Merkezi'nin zod taşımayan sabitleri: istemci değer olarak ithal eder (sözleşme dosyası yalnız tip olarak).
// 2929 a: refakat kartı varsayılan iki kopya basılır (biri lotla gider, biri kaynakta kalır); bekleyen sayacı, doğrudan basım ve
// Etiket bas aynı sayıyı kullanır.
export const REFAKAT_KOPYA_SAYISI = 2;

// 3011 a: standart dışı rulonun ölçü sınırı (mm). Ekran girişte, sözleşme sunucuda aynı sınırla denetler.
export const OZEL_OLCU_SINIRI = { enAz: 10, enCokEn: 110, enCokBoy: 300 } as const;
