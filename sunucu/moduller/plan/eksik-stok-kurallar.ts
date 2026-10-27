// Stoku bilinmeyen malzeme (kart 811 P3, 772 a), saf. "Dur" ayarında canlıya geçecek işin adımında tüketilen hammadde ya da ticari
// malın stok kaydı yoksa taslak canlıya alınmaz; motor o malzemeyi 0 sayar (veri sağlığı "stok-bos"), plan gerçekte yürümeyebilir.

// Recete ve Rota'nın 'ham' saydığı katalog türleri (recete-rota kurallar KATALOG_TURU_PROTOTIP).
const HAM_TURLER: ReadonlySet<string> = new Set(['hammadde', 'ticari_mal']);

export interface EksikStokIsi { uretimEmriId: number; emirNo: string; opNo: number }
export interface EksikStokGirdisi {
  isler: readonly EksikStokIsi[];
  // Üretim emri -> adım malzemeleri; emri bulunamayan ya da ürünü olmayan emirde null.
  ihtiyaclar: ReadonlyMap<number, readonly { malzemeNo: number; opNo: number }[] | null>;
  kartlar: ReadonlyMap<number, { kod: string; ad: string | null; tur: string }>;
  // Stok kaydı (bakiye ya da ayar) olan kartlar.
  stokluKartlar: ReadonlySet<number>;
}
export interface EksikStok { kod: string; ad: string | null; emirler: string[] }

// Yalnız işin kendi adımında tüketilen malzemeye bakılır: başka adımın malzemesi o adım canlıya geçerken denetlenir.
export function eksikStoklar(g: EksikStokGirdisi): EksikStok[] {
  const sonuc = new Map<number, Set<string>>();
  for (const is of g.isler) {
    for (const m of g.ihtiyaclar.get(is.uretimEmriId) ?? []) {
      if (m.opNo !== is.opNo || g.stokluKartlar.has(m.malzemeNo)) continue;
      const kart = g.kartlar.get(m.malzemeNo);
      if (!kart || !HAM_TURLER.has(kart.tur)) continue;
      const emirler = sonuc.get(m.malzemeNo) ?? new Set<string>();
      emirler.add(is.emirNo);
      sonuc.set(m.malzemeNo, emirler);
    }
  }
  return [...sonuc].map(([id, e]) => ({ kod: g.kartlar.get(id)!.kod, ad: g.kartlar.get(id)!.ad, emirler: [...e].sort() }))
    .sort((a, b) => a.kod.localeCompare(b.kod, 'tr'));
}

export function eksikStokIletisi(l: readonly EksikStok[]): string {
  const satir = (x: EksikStok) => `${x.kod}${x.ad ? ` ${x.ad}` : ''} (${x.emirler.join(', ')})`;
  return `Taslakta stoku bilinmeyen malzemeyi tüketen iş var: ${l.map(satir).join('; ')}. Stok kaydı girilmeden canlıya alınmaz `
    + '(Motor ayarları: stoku bilinmeyen malzeme "Dur").';
}
