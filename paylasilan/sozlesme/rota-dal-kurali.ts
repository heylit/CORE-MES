// Çok dallı rota (1248 a): adımın dalından ve birleştirdiği dallardan öncül listesi. Sunucu (rota) ve ekran (Reçete ve Rota) aynı
// kuralı okur. zod taşımaz: istemci değer olarak ithal eder (eslint.config.js ZODSUZ).

export type OnculTuru = 'bekleyen' | 'akisli';
export interface Oncul { opNo: number; tur: OnculTuru; devirAdedi: number | null }
export interface DalAdimi { opNo: number; bagimlilik: 'bagimsiz' | 'bekleyen' | 'akisli'; devirAdedi: number | null; dal: string | null; birlesen: readonly string[] }

// Hiçbir adımı dal ya da birleştirme taşımayan rota tek hattır: öncüller türetilmez, bugünkü bağımlılık kuralı sürer.
export function dalliMi(adimlar: readonly Pick<DalAdimi, 'dal' | 'birlesen'>[]): boolean {
  return adimlar.some((a) => a.dal !== null || a.birlesen.length > 0);
}

// Adımlar sıra düzenindedir. Dallı rotada her adımın öncülleri: kendi hattındaki (aynı dal; dal boşsa ana hat) bir önceki adım,
// dalın ilk adımında ondan önceki son ana hat adımı (yoksa hiçbir şeyi beklemez) ve birleştirdiği her dalın kendinden önceki son adımı.
// Bağımsız adım kendi hattını beklemez, birleştirdiği dalları bekler. Türü adımın bağımlılığıdır; akışlı değilse bekleyen.
// Tek hatlı rotada her adım için null döner.
export function oncullerCikar(adimlar: readonly DalAdimi[]): (Oncul[] | null)[] {
  if (!dalliMi(adimlar)) return adimlar.map(() => null);
  const sonAdim = (i: number, dal: string | null): DalAdimi | undefined => {
    for (let j = i - 1; j >= 0; j -= 1) if (adimlar[j]?.dal === dal) return adimlar[j];
    return undefined;
  };
  return adimlar.map((a, i) => {
    const tur: OnculTuru = a.bagimlilik === 'akisli' ? 'akisli' : 'bekleyen';
    const oncul = (o: DalAdimi): Oncul => ({ opNo: o.opNo, tur, devirAdedi: tur === 'akisli' ? a.devirAdedi : null });
    const liste: Oncul[] = [];
    if (a.bagimlilik !== 'bagimsiz') {
      const kendi = sonAdim(i, a.dal) ?? (a.dal === null ? undefined : sonAdim(i, null));
      if (kendi) liste.push(oncul(kendi));
    }
    for (const d of a.birlesen) {
      const o = sonAdim(i, d);
      if (o && !liste.some((x) => x.opNo === o.opNo)) liste.push(oncul(o));
    }
    return liste;
  });
}

// Dal ve birleştirme denetimi; dönen ileti alanı söyler. Birleşen dal adımdan önce başlamış olmalı, adımın kendi dalı olamaz, bir dal
// yalnız bir kez birleşir ve birleştikten sonra adımı olmaz; son adımın dalı dışında her dal bir yerde birleşmelidir (açıkta dal kalmaz).
export function dalDenetle(adimlar: readonly Pick<DalAdimi, 'dal' | 'birlesen'>[]): { alan: string; ileti: string } | null {
  const baslayan = new Set<string>();
  const biten = new Map<string, number>();
  for (const [i, a] of adimlar.entries()) {
    const alan = `adimlar.${i}`;
    if (a.dal !== null && biten.has(a.dal)) {
      return { alan: `${alan}.dal`, ileti: `${a.dal} dalı ${String(biten.get(a.dal))}. adımda birleşti; sonrasına bu dalda adım eklenemez.` };
    }
    if (new Set(a.birlesen).size !== a.birlesen.length) return { alan: `${alan}.birlesen`, ileti: 'Aynı dal iki kez seçilemez.' };
    for (const d of a.birlesen) {
      if (d === a.dal) return { alan: `${alan}.birlesen`, ileti: `Adım kendi dalını (${d}) birleştiremez.` };
      if (!baslayan.has(d)) return { alan: `${alan}.birlesen`, ileti: `${d} dalının bu adımdan önce adımı yok.` };
      if (biten.has(d)) return { alan: `${alan}.birlesen`, ileti: `${d} dalı ${String(biten.get(d))}. adımda zaten birleşti.` };
      biten.set(d, i + 1);
    }
    if (a.dal !== null) baslayan.add(a.dal);
  }
  const sonDal = adimlar.at(-1)?.dal ?? null;
  const acik = [...baslayan].filter((d) => !biten.has(d) && d !== sonDal).sort();
  if (acik.length > 0) return { alan: 'adimlar', ileti: `${acik.join(', ')} dalı hiçbir adımda birleşmiyor; birleştirme adımında seçilmeli.` };
  return null;
}
