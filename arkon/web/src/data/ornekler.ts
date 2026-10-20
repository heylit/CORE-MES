/* Örnek dosya düğmeleri (#199 TB2): örnek dosyalar depoda yoktur (gerçek ya da tanıtım verisi girmez), TMI'deki sürüm onları sayfaya gömmez.
   Verisi sayfada olmayan örnek gösterilmez; dosyasız yerleşik çizim (demo) her zaman gösterilir. */
export function gorunenOrnekler<T extends { id: string; kind?: string }>(liste: readonly T[], veriVar: (id: string) => boolean): T[] {
  return liste.filter(s => s.kind === 'demo' || veriVar(s.id));
}
export function ornekHazir(kimlikler: readonly string[], veriVar: (id: string) => boolean): boolean {
  return kimlikler.every(veriVar);
}
/* Operatör ekranında iş yokken ya da işin dokümanı yokken yerleşik örnek çizim (FLN-120) çizilmez: TMI'ye bağlı Arkon'da
   örnek resim gerçek iş sanılır (demo bulgusu). Yalnız TMI'siz tanıtım kipinde iş yokken örnek çizim kalır. */
export function ornekCizimGorunur(gomulu: boolean, isVar: boolean, bos: boolean): boolean {
  return !bos && !isVar && !gomulu;
}
