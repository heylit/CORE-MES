import { dilimFarki } from './esdegerlik.ts';
import { kaynakDilimiKapsami, kaynakDilimiKur, type KaynakDilimiOkumasi, type KaynakElleVerisi } from './kaynaklar-kurallar.ts';

// 1720 kaynak (1683 b birleştirmenin ilk parçası): bayrak açıkken kaynak alanlarını tipli dilim belirler. Eski birleştirme (girdi.betik
// kaynakBirlestir) önce koşar; dilimi okunan kaynak alanları sonra tipli kurulumla değişir. Eski yol, tipli yolu henüz olmayan alanları
// (ürün, malzeme, sipariş, fasoncu, satın alma) ve okunamayan dilimleri (1744 a) kurmaya devam eder; eski yol 1723'te silinir.
export type KaynakBirlestir = (D0: Record<string, unknown>, kayit: unknown, kaynak: unknown, bugun: string) => string[];

// Ürünlerin rota adımındaki tezgâh listesi eski yolda makinelerden kurulur (rrCevir). Tipli tezgâh listesi eskisinden kimlik ya da istasyon
// olarak ayrılırsa adımlar eski listeye göre kalır; tutarsız girdi kurmak yerine o okumada tezgâhlar eski yolunki olur.
const tezgahIskeleti = (l: unknown): string => JSON.stringify(Array.isArray(l) ? l.map((t: Record<string, unknown>) => [String(t['id']), String(t['grup'])]) : null);

export function tipliKaynakBirlestir(eski: KaynakBirlestir, okuma: KaynakDilimiOkumasi): KaynakBirlestir {
  return (D0, kayit, kaynak, bugun) => {
    // Elle veri açık çalışmanın birleşmeden önceki hâlidir: eski yol aynı değerden başlar.
    const elle = structuredClone({ tezgahlar: D0['tezgahlar'], personel: D0['personel'], devamsizlik: D0['devamsizlik'] }) as KaynakElleVerisi;
    const degisen = eski(D0, kayit, kaynak, bugun);
    const yeni = kaynakDilimiKur(okuma, elle);
    const alanlar = kaynakDilimiKapsami(okuma)
      .filter((a) => a !== 'tezgahlar' || tezgahIskeleti(yeni.tezgahlar) === tezgahIskeleti(D0['tezgahlar']))
      .filter((a) => yeni[a] !== undefined && dilimFarki(D0, yeni, [a], 1).length > 0);
    for (const a of alanlar) D0[a] = structuredClone(yeni[a]);
    return [...new Set([...degisen, ...alanlar])];
  };
}

// Değerlendirme ve teklif denemesi betikleri kendi iş parçacıklarında, kendi bağlamlarında koşar. Bu dosya oraya dinamik import ile yüklenir
// ve bağlamın kaynakBirlestir'i aynı sarmayla değişir. Tipli okuma yoksa (bayrak kapalı) hiçbir şey yüklenmez. Yükleme ya da sarma
// başarısız olursa iş eski yolla sürer; hata iş parçacığının hata çıkışına yazılır.
export const BIRLESTIRME_ADRESI = import.meta.url;
export const ISCI_TIPLI_KAYNAK = `
async function tipliKaynakBagla(b, okuma, adres) {
  if (!okuma) return;
  try {
    const { tipliKaynakBirlestir } = await import(adres);
    b.kaynakBirlestir = tipliKaynakBirlestir(b.kaynakBirlestir, okuma);
  } catch (e) {
    console.error('Tipli kaynak dilimi bağlanamadı; eski yolla sürüyor.', e);
  }
}
`;
