// Geliştirme kipinde (node --watch) iş parçacığının yüklediği her modül ana iş parçacığına { 'watch:require': [...] } iletisiyle bildirilir.
// Bu ileti hesabın sonucu sanılırsa hesap "sonuçsuz" biter (1786: Uygula planlama rolünde düşüyordu); sonucu bekleyen yalnız öteki iletiyi alır.
export const izlemeIletisi = (m: unknown): boolean =>
  typeof m === 'object' && m !== null && !Array.isArray(m) && Object.keys(m).some((k) => k.startsWith('watch:'));
