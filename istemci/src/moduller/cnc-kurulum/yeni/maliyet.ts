import type { PARA_ALANLARI as SOZLESME_LISTESI } from '#paylasilan/sozlesme/cnc-kurulum.ts';

// 3401-1 a: para alanları (kg fiyatı, takım fiyatı, tezgâh ücreti) maliyet görmeyen kişide kayda gönderilmez; sunucu kayıttaki
// eski değeri korur. Liste sözleşmedeki PARA_ALANLARI'nın kopyasıdır (istemci sözleşmeden değer ithal etmez); ikisinin aynı olduğunu aşağıdaki tip denetler (farklıysa derleme durur). Yalnız prototipin durum nesnesine uygulanır.
export const PARA_ALANLARI = [['stock', 'price'], ['life', 'price'], ['life', 'rate']] as const;

type Ayni = typeof PARA_ALANLARI extends typeof SOZLESME_LISTESI ? (typeof SOZLESME_LISTESI extends typeof PARA_ALANLARI ? true : never) : never;
export const LISTE_SOZLESMEYLE_AYNI: Ayni = true;

const nesneMi = (d: unknown): d is Record<string, unknown> => typeof d === 'object' && d !== null && !Array.isArray(d);

export function paraAlanlariniAyikla(deger: unknown): unknown {
  if (!nesneMi(deger)) return deger;
  const sonuc: Record<string, unknown> = { ...deger };
  for (const [grup, alan] of PARA_ALANLARI) {
    const g = sonuc[grup];
    if (nesneMi(g) && alan in g) { const { [alan]: _atilan, ...kalan } = g; sonuc[grup] = kalan; }
  }
  return sonuc;
}
