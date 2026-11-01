// Durumlu kaydın izinli geçişleri tek tabloda yazılır: anahtar her durumdur, değer o durumdan gidilebilen durumlardır.
// Record tipi yeni eklenen durumu tabloya yazmadan derlemez; geçişsiz son durum boş dizi taşır.
// Kendine geçiş tabloya yazılmaz: aynı durumla kaydetmenin geçiş sayılıp sayılmayacağı çağıranın seçimidir (ayniDurum).

export type GecisTablosu<D extends string> = Readonly<Record<D, readonly D[]>>;

export interface GecisSecenegi {
  // Durumu değiştirmeyen kayıt (yalnız başka alan düzeltilir) geçiş sayılır.
  ayniDurum?: boolean;
}

// Durum veritabanından ya da istekten gelir; tabloda olmayan ya da Object.prototype'tan gelen ad ('constructor')
// tip denetimini atlatmış olabilir, geçiş sayılmaz.
export function gecisVarMi<D extends string>(tablo: GecisTablosu<D>, eski: D, yeni: D, secenek: GecisSecenegi = {}): boolean {
  if (!Object.hasOwn(tablo, eski) || !Object.hasOwn(tablo, yeni)) return false;
  if (eski === yeni) return secenek.ayniDurum === true;
  return tablo[eski].includes(yeni);
}

// Modül testinde tablonun kendisi sınanır: kendine geçiş ve tekrar eden hedef yazım hatasıdır.
export function gecisTablosuHatalari<D extends string>(tablo: GecisTablosu<D>): string[] {
  const hatalar: string[] = [];
  for (const eski of Object.keys(tablo) as D[]) {
    const hedefler = tablo[eski];
    if (hedefler.includes(eski)) hatalar.push(`${eski}: kendine geçiş tabloya yazılmaz`);
    const gorulen = new Set<D>();
    for (const hedef of hedefler) {
      if (gorulen.has(hedef)) hatalar.push(`${eski}: ${hedef} iki kez yazılmış`);
      gorulen.add(hedef);
    }
  }
  return hatalar;
}
