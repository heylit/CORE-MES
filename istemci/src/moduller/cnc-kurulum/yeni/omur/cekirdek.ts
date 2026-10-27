import * as depo from '../depo.ts';
import type { CncDurumu } from '../durum.ts';
import * as omur from '../hesap/omur.ts';
import type { CarkSatiri } from './takip.ts';
import type { AsinmaKaydi, DepoKarti, OmurAyari, OmurKarti, Tezgah } from './tipler.ts';

// Takım Ömrü'nün iskeletten aldığı her şey bu dosyadan geçer: ad prototipindir (sözleşme bölüm 2), görünümün kodu çağrı yerinde
// değişmez. İskeletin adı ya da yolu değişirse yalnız bu dosya uyarlanır.

// Durumun bu görünümün okuduğu ve yazdığı alanları. İskelette görünüm alanları açık uçludur (`unknown`); görünüm kendi tipiyle okur.
export interface OmurDurumKaydi {
  machine: string;
  material: string;
  coolant: string;
  tools: CncDurumu['tools'];
  inv: Record<string, (NonNullable<CncDurumu['inv'][string]> & { loc?: string; demo?: 1 }) | undefined>;
  life: OmurAyari;
  wear: Record<string, Record<string, AsinmaKaydi>>;
  wearLog: { ts: number; mid: string; n: number; d: Record<string, number> }[];
  gsim: { name: string; machine: string; total: number; perTool: Record<string, { t: number; S: number; F: number }> } | null;
  ptime?: Record<string, Record<string, { id: string; tp: number }>>;
  lifeDemo?: string;
}

// Depodaki `state` canlı bağdır (emir seçiminde yeni nesne olur); vekil her erişimde güncel nesneye gider, tip yalnız buradadır.
const guncel = (): Record<string | symbol, unknown> => depo.state as unknown as Record<string | symbol, unknown>;
export const state = new Proxy({}, {
  get: (_h, k) => guncel()[k],
  set: (_h, k, v) => { guncel()[k] = v; return true; },
  has: (_h, k) => k in guncel(),
  deleteProperty: (_h, k) => delete guncel()[k],
  ownKeys: () => Reflect.ownKeys(guncel()),
  getOwnPropertyDescriptor: (_h, k) => {
    const d = Object.getOwnPropertyDescriptor(guncel(), k);
    return d ? { ...d, configurable: true } : undefined;
  },
}) as OmurDurumKaydi;

export { save, useCncSurum } from '../depo.ts';
export { D } from '../veri/cncdata.ts';
export { isLatheTool, isMillTool } from '../veri/takim-turu.ts';
export { useCncYetkisi } from '../veri.ts';
export { gecisSecenegiAl, useGorunum, useTuslar, type OmurGecisi } from '../gorunum.ts';
export {
  byId, allMachines, allMaterials, allMill, allLathe, machine, material, tools, toolById, toolLib, invKey, usage, stockOf, dirtyUsage,
} from '../secici.ts';
export { fmtN, num, pad2, clamp, sstep, upTR } from '../bicim.ts';
export {
  LIFE_DEF, DEF_TP, REL_TXT, ST_TXT, STK_TXT, lifeRefs, lifeOpt, lifeModel, lifeKind, lifeMat, catParams, progFor, progParams,
  weibull, vbShape, toolsOf, tpInfo, cycleOf, DEPOT_G, fmtDur, fmtDay,
} from '../hesap/omur.ts';
// Çekirdek kart ve kayıt tiplerini geniş yazar; lifeCard ve depotCards her kartta alanları kurar, aşınma kaydının yenileme alanları
// (ed, rg, lf, dd, dl, log) prototipin şemasıdır. Tip yalnız burada daralır.
export const machineCards = (m: Tezgah): OmurKarti[] => omur.machineCards(m) as OmurKarti[];
export const depotCards = (): Record<string, DepoKarti[]> => omur.depotCards();
export const lwDefs = (): CarkSatiri[] => omur.lwDefs() as CarkSatiri[];
export const wearPeek = (mid: string, p: number, id: string): AsinmaKaydi => omur.wearPeek(mid, p, id) as AsinmaKaydi;
export const wearRec = (mid: string, p: number, id: string): AsinmaKaydi => omur.wearRec(mid, p, id) as AsinmaKaydi;
export { fmtT } from '../hesap/gkod.ts';
// Dilim 2b (sahne/): adlar sözleşmede (bölüm 7); dosyalar gelene kadar yerel tip kökleri durur (yamaya girmez).
export { Sahne, type Cizim } from '../sahne/Sahne.tsx';
export { envTex, lights, maxAniso, thumb, rr, draw, numTex } from '../sahne/gl.ts';
export { Orbit, textSprite, sizeSprite, disposeObj, drawChart } from '../sahne/yardimci.ts';
export { R, ALPHA, CR, CW, CH, SP, BETA, FOV, GEO, glowTex, gearG, gearMat, spokeG, pawlMat, plat } from '../sahne/cark.ts';
export { CNC3D } from '../sahne/cnc3d.ts';
