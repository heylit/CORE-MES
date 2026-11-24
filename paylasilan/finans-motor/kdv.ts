// Tek KDV kuralı (3674): KDV = round(net x oran / 100, 2); tevkifat = round(KDV x pay / payda, 2); toplam = net + KDV - tevkifat.
// Veritabanı `finans_belge` sütunları, sunucu denetimleri ve ekran aynı kuralı kullanır; yuvarlama yarım yukarıdır (PostgreSQL round(numeric)).
// Hesap kuruş tamsayısındadır (BigInt): kayan nokta kuruş farkı üretmez. Bir belge tek orandır; çok oranlı fatura iki belgeye bölünür.

// Ondalık metni 10^basamak ölçekli tamsayıya çevirir; fazla basamak yarım yukarı yuvarlanır.
export function olcekli(metin: string | number, basamak: number): bigint {
  const [tam = '0', kesir = ''] = Number(metin).toFixed(basamak + 1).split('.');
  return (BigInt(tam + kesir) + 5n) / 10n;
}
export const kurusaCevir = (tutar: string | number): bigint => olcekli(tutar, 2);
const tlMetni = (kurus: bigint): string => `${kurus / 100n}.${String(kurus % 100n).padStart(2, '0')}`;

export function kdvKurus(netKurus: bigint, oran: string | number): bigint {
  return (netKurus * olcekli(oran, 2) + 5_000n) / 10_000n;
}
export function kdvTutari(net: string | number, oran: string | number): string {
  return tlMetni(kdvKurus(kurusaCevir(net), oran));
}
export interface BelgeToplami { kdv: string; tevkifat: string; toplam: string }
export function belgeToplami(net: string | number, oran: string | number, tevkifatPay: number | null = null, tevkifatPayda: number | null = null): BelgeToplami {
  const n = kurusaCevir(net);
  const kdv = kdvKurus(n, oran);
  const tevkifat = tevkifatPay === null || tevkifatPayda === null ? 0n : (kdv * BigInt(tevkifatPay) * 2n + BigInt(tevkifatPayda)) / (BigInt(tevkifatPayda) * 2n);
  return { kdv: tlMetni(kdv), tevkifat: tlMetni(tevkifat), toplam: tlMetni(n + kdv - tevkifat) };
}
// KDV dahil toplamdan net: toplamı kuruşu kuruşuna veren net bulunur; tek oranla hiçbir net o toplamı vermiyorsa (ör. %20'de 0,15) null.
export function kdvDahildenNet(brut: string | number, oran: string | number): string | null {
  const g = kurusaCevir(brut);
  const o = olcekli(oran, 2);
  const tahmin = (g * 10_000n) / (10_000n + o);
  for (let n = tahmin - 2n; n <= tahmin + 2n; n += 1n) if (n > 0n && n + kdvKurus(n, oran) === g) return tlMetni(n);
  return null;
}
// Belge para biriminden TL kuruşuna: round(tutar x kur, 2), belge sütunlarıyla aynı yuvarlama.
export function kurlaKurus(kurus: bigint, kur: string | number): bigint {
  return (kurus * olcekli(kur, 6) + 500_000n) / 1_000_000n;
}
// Kuruşu ağırlıklarla böler; toplam her zaman tam tutar (en büyük kalan yöntemi). Parçalara bölünen belgenin KDV'si belge KDV'sinden sapmaz.
export function kurusBol(toplam: bigint, agirliklar: readonly bigint[]): bigint[] {
  const payda = agirliklar.reduce((a, b) => a + b, 0n);
  if (payda <= 0n) return agirliklar.map((_, i) => (i === 0 ? toplam : 0n));
  const taban = agirliklar.map((w) => (toplam * w) / payda);
  let kalan = toplam - taban.reduce((a, b) => a + b, 0n);
  const sira = agirliklar.map((w, i) => ({ i, r: (toplam * w) % payda })).sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  for (const { i } of sira) { if (kalan <= 0n) break; taban[i] = (taban[i] ?? 0n) + 1n; kalan -= 1n; }
  return taban;
}
export const kurusTl = (kurus: bigint): number => Number(kurus) / 100;
