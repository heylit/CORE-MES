// Arkon'un ölçü ayrıştırıcısı (cekirdek/tol.ts) ve STEP'ten teknik resim üreticisi (cekirdek/stepdraw.ts) eski haliyle kalır; eski Arkon da
// onları buradan okur. İkisi Arkon'un tsconfig.core.json'uyla (strict) denetlenir; istemcinin ek kuralı (noUncheckedIndexedAccess) eski dosyaya
// uygulanmasın diye glob ile yüklenir (tip denetimi glob'u izlemez) ve ekranın kullandığı yüzü burada tiplenir. Eşliği cekirdek.test.ts gerçek modülle sınar.

export interface TolSonucu {
  raw: string; count: number; prefix: string; nominal: number; fit: string | null; kind: string; up: number; lo: number; min: number; max: number;
  nomText: string; tolText: string; general: boolean; tool: string; gauge: boolean; gdtName?: string; explicitFit?: boolean; unknownFit?: boolean;
  note?: string; label?: string; ref?: boolean;
}
export interface Tol {
  parse(s: unknown, opt?: { cls?: string; requireMarkup?: boolean }): TolSonucu | null;
  detectClass(metin?: string | null): string;
  GDT_CHARS: string;
}

export interface OcctAgi {
  name?: string;
  attributes: { position: { array: ArrayLike<number> }; normal?: { array: ArrayLike<number> } };
  index: { array: ArrayLike<number> };
}
export interface OcctSonucu { success?: boolean; meshes: OcctAgi[] }
export interface StepModeli {
  pos: ArrayLike<number>; feature: { a: number; b: number }[]; bbox: { mn: ArrayLike<number>; mx: ArrayLike<number> }; diag: number;
}
export interface StepBalonu { id: number; x: number; y: number; l: string; nom: string; tol: string; min: number; max: number; tool: string; gauge: boolean }
export interface StepResmi {
  svg: string; balloons: StepBalonu[]; w: number; h: number;
  info: { scale: string; size: number[]; holes: number; cylinders: number; frontAxis: string; tris: number; edges: number };
}
export interface Step {
  parseSTL(u8: Uint8Array): OcctSonucu;
  buildModel(r: OcctSonucu, opt?: { regionGrow?: boolean }): StepModeli;
  makeDrawing(M: StepModeli, meta: { name?: string; hidden?: boolean; fa?: number; dims?: boolean }): StepResmi;
  frontAxis(M: StepModeli): number;
}

const TOL = import.meta.glob<Tol>('./cekirdek/tol.ts', { eager: true, import: 'AKTol' });
const STEP = import.meta.glob<Step>('./cekirdek/stepdraw.ts', { eager: true, import: 'AKStep' });

const tek = <T>(m: Record<string, T>, ad: string): T => {
  const d = Object.values(m)[0];
  if (d === undefined) throw new Error(`Arkon çekirdeği bulunamadı: ${ad}`);
  return d;
};

export const AKTol: Tol = tek(TOL, 'tol');
export const AKStep: Step = tek(STEP, 'stepdraw');
