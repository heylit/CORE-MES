import { allMaterials, byId, material } from '../secici.ts';
import type { IsMalzemesi, IsoGrubu } from '../veri/tipler.ts';

// Prototipin MALZEME DAVRANIŞI bölümünün veri ve hesap kısmı: zor malzemede kesme hızı ve ilerleme dışındaki farklar.
//   eng: kaba frezede radyal kavrama (ae) çarpanı · apT: kaba tornada talaş derinliği (ap) çarpanı (referans 2 mm)
//   nk: Taylor üssü n çarpanı (küçük n = ömür kesme hızına daha duyarlı) · tune: ilk işte ek deneme süresi (dk)
//   wh: iş sertleşmesi. ISO grubu varsayılanı malzemeye özel değerle (m.beh) ezilir.

export interface Davranis { eng: number; apT: number; nk: number; tune: number; wh: number; [alan: string]: number }

export const MB_ISO: Record<IsoGrubu, Davranis> = {
  P: { eng: 1, apT: 1, nk: 1, tune: 0, wh: 0 },
  M: { eng: 0.8, apT: 0.75, nk: 0.85, tune: 6, wh: 1 },
  K: { eng: 1, apT: 1, nk: 1.1, tune: 0, wh: 0 },
  N: { eng: 1.1, apT: 1.25, nk: 1.4, tune: 0, wh: 0 },
  S: { eng: 0.6, apT: 0.6, nk: 0.7, tune: 12, wh: 1 },
  H: { eng: 0.45, apT: 0.5, nk: 0.7, tune: 10, wh: 0 },
};
export const MB_LBL = { eng: 'Kaba kavrama ×', apT: 'Torna talaş derinliği ×', nk: 'Ömür üssü ×', tune: 'Yeni işte ek hazırlık (dk)' } as const;

// Hesabın okuduğu alanlar; matRef'in yedeği tam malzeme değildir.
export type MalzemeOzu = Pick<IsMalzemesi, 'id' | 'name' | 'vcK' | 'fk' | 'iso'> & Partial<IsMalzemesi>;

export function matBeh(m?: MalzemeOzu | null): Davranis {
  const mm: MalzemeOzu = m || material();
  const b: Davranis = Object.assign({}, MB_ISO[mm.iso] ?? MB_ISO.P);
  const o = (mm.beh ?? {}) as Record<string, unknown>;
  Object.keys(o).forEach((k) => {
    const v = o[k];
    if (v !== '' && v != null && Number.isFinite(Number(v))) b[k] = Number(v);
  });
  if (mm.metal === 0) b.wh = 0;
  return b;
}
export function matRef(): MalzemeOzu { return byId(allMaterials(), 'c45') || { id: 'c45', name: 'C45', vcK: 180, fk: 0.9, iso: 'P' }; }

// Kesme süresi katsayıları: süre ∝ 1 / (Vc · f); kabada ayrıca 1 / kavrama.
export interface SureKatsayisi { fin: number; mill: number; turn: number }
export function mbK(m: MalzemeOzu): SureKatsayisi {
  const b = matBeh(m), f = 1 / Math.max(1, m.vcK * m.fk);
  return { fin: f, mill: f / b.eng, turn: f / b.apT };
}

// Zorluk göstergesi: C45'e göre kaba işleme süre katsayısı 1-5 yıldıza iner. Prototip HTML döndürür; burada değer döner,
// çizimi görünüm yapar (yildiz dolu nokta sayısı, oran başlıktaki "×" değeri).
export function mbStars(m: MalzemeOzu): { yildiz: number; oran: number } {
  const ref = matRef(), x = mbK(m).mill / mbK(ref).mill;
  const s = x < 0.8 ? 1 : x < 1.3 ? 2 : x < 2.2 ? 3 : x < 4 ? 4 : 5;
  return { yildiz: s, oran: x };
}
