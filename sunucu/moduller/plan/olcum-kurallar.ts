// Plan ölçüm kaydı (1470 a): canlıya almada önceki ve yeni canlı planın farkı ve emir başına tahmini bitiş, saf hesap. Zamanlar dakika,
// ölçüm anına göre (artı gelecek).

export interface OlcumYeri { isEmriId: number; kaynak: string; baslangic: number; bitis: number }

// Motorun değişiklik ölçüsündeki eşik (engine.betik evaluate: bir vardiyadan fazla kayma iş listesini değiştirir).
export const DEGISIM_ESIGI_DK = 8 * 60;
export const YAKIN_DK = 72 * 60;

// Yalnız bu canlıya almada geçen işler sayılır: geçmeyen işin canlıdaki yeri değişmez.
export function degisimler(eski: readonly OlcumYeri[], yeni: readonly OlcumYeri[], gecen: ReadonlySet<number>): { degisen: number; yakinDegisen: number; yeni: number } {
  const once = new Map(eski.map((y) => [y.isEmriId, y]));
  let degisen = 0;
  let yakinDegisen = 0;
  let yeniIs = 0;
  for (const y of yeni) {
    if (!gecen.has(y.isEmriId)) continue;
    const o = once.get(y.isEmriId);
    if (o === undefined) { yeniIs += 1; continue; }
    if (o.kaynak === y.kaynak && Math.abs(o.baslangic - y.baslangic) <= DEGISIM_ESIGI_DK) continue;
    degisen += 1;
    if (o.baslangic < YAKIN_DK) yakinDegisen += 1;
  }
  return { degisen, yakinDegisen, yeni: yeniIs };
}

// Emrin tahmini bitişi işlerinin en geç bitişidir; planlanacak işlerinden biri yerleşmemişse bilinmez (null).
export function emirBitisleri(
  isler: readonly { id: number; uretimEmriId: number; teslim: string | null }[], yeni: readonly OlcumYeri[],
): { uretimEmriId: number; bitis: number | null; termin: string | null }[] {
  const bitis = new Map(yeni.map((y) => [y.isEmriId, y.bitis]));
  const emirler = new Map<number, { bitis: number | null; termin: string | null }>();
  for (const i of isler) {
    const e = emirler.get(i.uretimEmriId) ?? { bitis: -Infinity, termin: i.teslim };
    const b = bitis.get(i.id);
    e.bitis = b === undefined || e.bitis === null ? null : Math.max(e.bitis, b);
    emirler.set(i.uretimEmriId, e);
  }
  return [...emirler].map(([uretimEmriId, e]) => ({ uretimEmriId, bitis: e.bitis, termin: e.termin }));
}
