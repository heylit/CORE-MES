// Terminal halkasında iyi ve hurda payı. Hurda gerçek oranıyla çizilir: büyütülünce 50 parçalık işte 4 hurda halkanın yarısından
// fazlasını kaplıyor, operatör işi bitmiş ya da çöpe gitmiş sanıyordu. Hurda iyi payının ardından gelir ve halkayı aşmaz.
export function halkaPaylari(iyi: number, hurda: number, hedef: number): { iyi: number; hurda: number } {
  if (!(hedef > 0)) return { iyi: 0, hurda: 0 };
  const i = Math.min(1, Math.max(0, iyi) / hedef);
  return { iyi: i, hurda: Math.min(1 - i, Math.max(0, hurda) / hedef) };
}

// Kalan adet işlenen parçaya göredir: hurda da ham parçayı tüketir (iyi + hurda). Yalnız iyi sayılınca 50'lik işte 40 iyi 4 hurdada
// "10 kaldı" yazıyordu, operatör hurdanın sayılmadığını görüyordu.
export function kalanAdet(hedef: number, iyi: number, hurda: number): number {
  return Math.max(0, (hedef || 0) - Math.max(0, iyi || 0) - Math.max(0, hurda || 0));
}
