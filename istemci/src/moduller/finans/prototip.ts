// Prototip sayfası ayrı parça olarak yüklenir; çerçeve ve motor testleri aynı yolu kullanır.
export const prototipYukle = (): Promise<string> => import('./cerceve/finans.html?raw').then((m) => m.default);
