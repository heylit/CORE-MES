import { glbYaz } from '../../glb.ts';
import { MACHINES } from '../veri/cncdata.ts';
import type { Kalem, Tezgah } from '../veri/tipler.ts';
import { build, dispose } from './cnc3d.ts';

// Çizim Merkezi'nin CNC makineleri sayfası (1135 a) modeli bu ekranın sahnesinden üretir. Kayıt sayfanın okuduğu metinden
// ayrıştırılır; ekranın genel durumu (depo.ts) kurulmaz, çünkü sayfa CNC Kurulum'un dışındadır ve kayıt yazmaz.

export interface MakineOzeti { makineId: string; no: string | null; ad: string }

// Ad ve numara ekranın gösterdiğiyle aynıdır (elle yapılan düzeltmeler dahil).
export interface ModelIletisi { makineId: string; no: string | null; ad: string; glb: Uint8Array }

type Kayit = { customMachines?: unknown; mo?: unknown };
type Makine = Partial<Tezgah> & { id?: unknown };

function kayitOku(metin: string | undefined): Kayit {
  if (metin === undefined) return {};
  try {
    const d = JSON.parse(metin) as unknown;
    return d !== null && typeof d === 'object' ? d as Kayit : {};
  } catch { return {}; }
}

// Ekranın makineleri, elle eklenenler ve elle yapılan düzeltmeler dahil; sıra ekrandakiyle aynıdır.
function makineler(metin: string | undefined): Makine[] {
  const d = kayitOku(metin);
  const liste: Makine[] = [...MACHINES, ...(Array.isArray(d.customMachines) ? d.customMachines as Makine[] : [])];
  const mo = d.mo !== null && typeof d.mo === 'object' ? d.mo as Record<string, Makine | undefined> : {};
  return liste.map((m) => ({ ...m, ...(mo[String(m.id)] ?? {}) }));
}

// Ad numarasızdır: belge adı numarayı ayrıca önüne koyar (belgeAdi).
const ozet = (m: Makine): MakineOzeti => ({
  makineId: String(m.id),
  no: typeof m.no === 'string' && m.no !== '' ? m.no : null,
  ad: typeof m.name === 'string' && m.name !== '' ? m.name : String(m.id),
});

export function makineListesi(metin: string | undefined): MakineOzeti[] {
  return makineler(metin).map(ozet);
}

export function modelUret(makineId: string, metin: string | undefined): ModelIletisi {
  const m = makineler(metin).find((x) => String(x.id) === makineId);
  if (!m || typeof m.kind !== 'string') throw new Error('Makine modeli bulunamadı.');
  const o = ozet(m);
  const kok = build({ id: o.makineId, name: o.ad, kind: m.kind } as Kalem);
  try {
    return { ...o, glb: glbYaz(kok, o.ad) };
  } finally {
    dispose(kok);
  }
}
