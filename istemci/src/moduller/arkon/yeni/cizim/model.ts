import type { ArkonDeposu } from '../veri/depo.ts';
import { AKStep, type OcctSonucu, type StepModeli, type StepResmi } from './cekirdek.ts';
import { bekle, occt } from './kitaplik.ts';
import { AG_SAPMASI, ayarImzasi, MODEL_ANAHTARLARI, type OkumaAyari } from './kurallar.ts';

// 3B model işleme (model-3b.ts): STEP, IGES, STL; görünüm verisi ve teknik resim. Önbellek kaydı eski ekranınkiyle aynı biçimdedir
// (aynı anahtar, aynı alanlar): iki ekran birbirinin hesabını kullanır.

export interface Gorunum3B { meshes: { p: Float32Array; n: Float32Array | null; i: Uint32Array }[]; ep: Float32Array; bbox: { mn: number[]; mx: number[] }; diag: number }
export interface ModelKaydi { kind: 'STEP' | 'IGES' | 'STL'; fa: number; V: Gorunum3B; D?: StepResmi }

export const MODEL_BELLEGI = new Map<string, ModelKaydi>();
const OZETLER = new WeakMap<Uint8Array, string>();

// Dosya içerik özeti (önbellek anahtarı): SHA-256, yoksa (düz http) FNV-1a.
export async function dosyaOzeti(u8: Uint8Array): Promise<string> {
  const var0 = OZETLER.get(u8); if (var0) return var0;
  let h: string;
  try {
    const d = new Uint8Array(await crypto.subtle.digest('SHA-256', u8 as Uint8Array<ArrayBuffer>));
    h = Array.from(d.subarray(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let a = 0x811c9dc5, c = 0x9dc5811c;
    for (let i = 0; i < u8.length; i++) { a = Math.imul(a ^ u8[i]!, 0x01000193); c = Math.imul(c ^ u8[u8.length - 1 - i]!, 0x01000193); }
    h = (a >>> 0).toString(16) + (c >>> 0).toString(16);
  }
  h += '-' + u8.length; OZETLER.set(u8, h); return h;
}

// 3B görünüm için sıkı veri: tipli diziler (önbelleğe ve pakete doğrudan yazılır).
function sikistir(r: OcctSonucu, M: StepModeli): Gorunum3B {
  const meshes = r.meshes.map((m) => ({
    p: Float32Array.from(m.attributes.position.array), n: m.attributes.normal ? Float32Array.from(m.attributes.normal.array) : null, i: Uint32Array.from(m.index.array),
  }));
  const ep = new Float32Array(M.feature.length * 6);
  M.feature.forEach((e, i) => { for (let k = 0; k < 3; k++) { ep[6 * i + k] = M.pos[3 * e.a + k]!; ep[6 * i + 3 + k] = M.pos[3 * e.b + k]!; } });
  return { meshes, ep, bbox: { mn: Array.from(M.bbox.mn), mx: Array.from(M.bbox.mx) }, diag: M.diag };
}

const tamam = (r: ModelKaydi | null | undefined, gerek: 'draw' | '3d'): r is ModelKaydi => !!r && !!r.V && (gerek === '3d' || !!r.D);

export interface ModelSecenegi {
  need?: 'draw' | '3d'; derived?: Record<string, unknown> | null; cfg: OkumaAyari; fresh?: boolean;
  // Büyük ekran modeli hesaplatmaz (geometri çekirdeği ağırdır): yalnız hazır veri varsa gösterir.
  yalnizHazir?: boolean;
}
// Sıra: bellek, paketle gelen hazır veri, cihaz önbelleği, hesap. need '3d' iken resim çizilmez (yaklaşık yarı süre).
export async function modelIsle(depo: Pick<ArkonDeposu, 'Cache'>, bytes: Uint8Array, name: string, adim: (i: number) => void,
  opt: ModelSecenegi & { yalnizHazir: true }): Promise<ModelKaydi | null>;
export async function modelIsle(depo: Pick<ArkonDeposu, 'Cache'>, bytes: Uint8Array, name: string, adim: (i: number) => void, opt: ModelSecenegi): Promise<ModelKaydi>;
export async function modelIsle(depo: Pick<ArkonDeposu, 'Cache'>, bytes: Uint8Array, name: string, adim: (i: number) => void, opt: ModelSecenegi): Promise<ModelKaydi | null> {
  const need = opt.need || 'draw', mc = opt.cfg, sig = ayarImzasi(mc, MODEL_ANAHTARLARI), h = await dosyaOzeti(bytes), key = 'model:' + h + sig;
  let rec: ModelKaydi | null | undefined = opt.fresh ? null : MODEL_BELLEGI.get(key);
  if (!tamam(rec, need) && !opt.fresh && opt.derived) { const d = opt.derived[h + sig] as ModelKaydi | undefined; if (tamam(d, need)) rec = d; }
  if (!tamam(rec, need) && !opt.fresh) { const c = await depo.Cache.get(key) as ModelKaydi | undefined; if (tamam(c, need)) rec = c; }
  if (tamam(rec, need)) { MODEL_BELLEGI.set(key, rec); return rec; }
  if (opt.yalnizHazir) return null;
  const low = name.toLowerCase(), isStl = /\.stl$/.test(low), isIges = /\.(igs|iges)$/.test(low);
  adim(0); await bekle(60);
  let r: OcctSonucu;
  if (isStl) r = AKStep.parseSTL(bytes);
  else {
    const o = await occt(); adim(1); await bekle();
    r = isIges ? await o.ReadIgesFile(bytes, null) : await o.ReadStepFile(bytes, {
      linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: AG_SAPMASI[mc.mesh] || 0.0012,
      angularDeflection: mc.mesh === 'fine' ? 0.15 : mc.mesh === 'coarse' ? 0.4 : 0.25,
    });
  }
  if (!r || !r.success || !r.meshes.length) throw new Error('Dosyada okunabilir katı model bulunamadı.');
  adim(2); await bekle();
  const M = AKStep.buildModel(r, { regionGrow: isStl });
  adim(3); await bekle();
  let D: StepResmi | null = null, fa: number;
  if (need === 'draw') {
    D = AKStep.makeDrawing(M, { name, hidden: mc.hidden !== false, ...(mc.fa === 'auto' ? {} : { fa: { X: 0, Y: 1, Z: 2 }[mc.fa] }), dims: mc.autoDim !== false });
    fa = 'XYZ'.indexOf(D.info.frontAxis);
  } else fa = AKStep.frontAxis(M);
  adim(4); await bekle(150);
  const yeni: ModelKaydi = { ...(rec || {}), kind: isStl ? 'STL' : isIges ? 'IGES' : 'STEP', fa, V: sikistir(r, M), ...(D ? { D } : {}) };
  MODEL_BELLEGI.set(key, yeni); void depo.Cache.put(key, yeni);
  return yeni;
}
