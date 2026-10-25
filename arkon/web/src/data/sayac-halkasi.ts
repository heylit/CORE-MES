// Terminal halkasında iyi ve hurda payı. Hurda gerçek oranıyla çizilir: büyütülünce 50 parçalık işte 4 hurda halkanın yarısından
// fazlasını kaplıyor, operatör işi bitmiş ya da çöpe gitmiş sanıyordu. Hurda iyi payının ardından gelir ve halkayı aşmaz.
export function halkaPaylari(iyi: number, hurda: number, hedef: number): { iyi: number; hurda: number } {
  if (!(hedef > 0)) return { iyi: 0, hurda: 0 };
  const i = Math.min(1, Math.max(0, iyi) / hedef);
  return { iyi: i, hurda: Math.min(1 - i, Math.max(0, hurda) / hedef) };
}

// Kalan adet hedefe eksik sağlamdır (521 2 b): emir sağlam adetle kapanır ve sunucu hedefe kadar sağlam sayımı kabul eder. Hurdayı da düşünce
// 38 iyi 2 hurdada halka "0 kaldı" diyor, operatör hedefe 2 sağlam eksikken işi bitiriyordu. Hurda halkada kendi rengiyle görünür, kalana girmez.
// Üçüncü değişken çağıranların imzası değişmesin diye kalır; hesaba girmez.
export function kalanAdet(hedef: number, iyi: number, _hurda?: number): number {
  return Math.max(0, (hedef || 0) - Math.max(0, iyi || 0));
}

// İstasyona atanmış iş yokken hedef ve kalan yoktur (veri yoksa null): boş işe hedef 1 yazılınca "0 / 1 · 1 kaldı" görünüyordu.
export function sayacGosterimi(is: { empty?: boolean; good: number; scrap: number; target: number }): { hedef: number | null; kalan: number | null; iyi: number; hurda: number } {
  if (is.empty) return { hedef: null, kalan: null, iyi: 0, hurda: 0 };
  return { hedef: is.target, kalan: kalanAdet(is.target, is.good), ...halkaPaylari(is.good, is.scrap, is.target) };
}
