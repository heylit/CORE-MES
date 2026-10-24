import { highsYukle } from '../../highs.ts';
import type { CozumCevabi } from './kurallar.ts';

// Yıllık planın HiGHS çözücüsü (361 b; paket recete-rota/highs.ts ile bir kez yüklenir). Eski sayfadaki gibi (h-cozuculer.betik hsIsci)
// sayfanın kendi iş parçacığında çözer: model 60 saniyeye kadar sürebilir, ekran donmaz. Bu bir plan motoru değildir (357 b): yalnız
// tarayıcıdaki kaba kapasite modelini çözer, plana yazmaz.

// HiGHS örneğinin kullanılan yüzü (highs 1.15.3 createModel).
export interface HighsOrnegi {
  createModel: (g: { format: 'lp'; data: string }) => {
    options: { set: (o: Record<string, unknown>) => void };
    run: () => void;
    getModelStatus: () => number;
    getObjectiveValue: () => number;
    getSolution: () => { colValue: ArrayLike<number>; colDual?: ArrayLike<number> };
    getColByName: (ad: string) => number;
    dispose: () => void;
  };
}

// Tek modeli çözer. İş parçacığına metniyle gider: dış adlara dayanmaz.
export function modelCoz(H: HighsOrnegi, lp: string, sure: number, want: readonly string[]): CozumCevabi {
  let md: ReturnType<HighsOrnegi['createModel']> | null = null;
  try {
    md = H.createModel({ format: 'lp', data: lp });
    md.options.set({ output_flag: false, time_limit: sure, mip_rel_gap: 0 });
    md.run();
    const s = md.getModelStatus(); const ob = md.getObjectiveValue();
    const so = md.getSolution(); const val: Record<string, number> = {}; const dual: Record<string, number | null> = {};
    for (const ad of want) { const i = md.getColByName(ad); val[ad] = so.colValue[i] ?? 0; dual[ad] = so.colDual ? so.colDual[i] ?? null : null; }
    return { s, ob, val, dual };
  } finally { if (md) md.dispose(); }
}

// Klasik iş parçacığı: paket betiği + bu gövde (çerçeve politikası modül iş parçacığını açmaz; highs.ts klasik betiğe çevirir).
const isciGovdesi = (): string => `
const modelCoz = ${modelCoz.toString()};
let H = null;
self.onmessage = async (e) => { const m = e.data;
  if (m.t === 'kur') { try { H = await Module({ instantiateWasm: (imp, ok) => { WebAssembly.instantiate(m.wasm, imp).then((r) => ok(r.instance, r.module)).catch((err) => self.postMessage({ t: 'hata', e: String(err && err.message || err) })); return {}; } }); self.postMessage({ t: 'hazir' }); } catch (err) { self.postMessage({ t: 'hata', e: String(err && err.message || err) }); } return; }
  if (m.t === 'coz') { try { self.postMessage({ id: m.id, ...modelCoz(H, m.lp, m.sure, m.want) }); } catch (err) { self.postMessage({ id: m.id, e: String(err && err.message || err) }); } } };`;

type Bekleyen = (m: { e?: string } & Partial<CozumCevabi>) => void;
let isci: Promise<Worker> | null = null;
let sira = 0;
const bekleyenler = new Map<number, Bekleyen>();

function isciAc(): Promise<Worker> {
  isci ??= highsYukle().then((k) => new Promise<Worker>((tamam, ret) => {
    const adres = URL.createObjectURL(new Blob([`${k.betik}\n${isciGovdesi()}`], { type: 'text/javascript' }));
    const w = new Worker(adres);
    w.onmessage = (o: MessageEvent<{ t?: string; id?: number; e?: string } & Partial<CozumCevabi>>) => {
      const m = o.data;
      if (m.t === 'hazir') { tamam(w); return; }
      if (m.t === 'hata') { ret(new Error(m.e)); return; }
      const b = m.id === undefined ? undefined : bekleyenler.get(m.id);
      if (b && m.id !== undefined) { bekleyenler.delete(m.id); b(m); }
    };
    w.onerror = (o) => { ret(new Error(o.message || 'İş parçacığı açılamadı.')); };
    w.postMessage({ t: 'kur', wasm: k.wasm.slice(0) });
  }));
  isci.catch(() => { isci = null; });
  return isci;
}

// LP modelini çözer; `sure` saniye sınırıdır.
export async function hsCoz(lp: string, sure: number, want: readonly string[]): Promise<CozumCevabi> {
  const w = await isciAc();
  const id = ++sira;
  return new Promise((tamam, ret) => {
    bekleyenler.set(id, (m) => {
      if (m.e !== undefined || m.s === undefined || m.ob === undefined) { ret(new Error(m.e ?? 'HiGHS cevap vermedi.')); return; }
      tamam({ s: m.s, ob: m.ob, val: m.val ?? null, dual: m.dual ?? null });
    });
    w.postMessage({ t: 'coz', id, lp, sure, want: [...want] });
  });
}
