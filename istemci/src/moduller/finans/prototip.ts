// Prototip sayfası artık açılmaz (1392 a); ekranın hesaplarının prototiple aynı sonucu verdiğini sınayan eşitlik testlerinin
// başvurusudur. Yalnız testler ithal eder: uygulama kodu ithal ederse büyük metin pakete ayrı parça olarak girer.
export const prototipYukle = (): Promise<string> => import('./cerceve/finans.html?raw').then((m) => m.default);
