// 3741: aynı ad aynı OP'ye ikinci kez eklenmez; sunucu kuralıyla aynı karşılaştırma (büyük küçük harf, boşluk önemsiz).
export const maddeAdiAnahtari = (ad: string): string => ad.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr');
export const maddeAdiVarMi = (mevcut: readonly string[], ad: string): boolean => ad.trim() !== '' && mevcut.some((m) => maddeAdiAnahtari(m) === maddeAdiAnahtari(ad));
