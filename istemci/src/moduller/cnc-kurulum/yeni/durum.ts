import { D } from './veri/cncdata.ts';
import type { IsMalzemesi, Kalem, Tezgah, TezgahTuru } from './veri/tipler.ts';

// Prototipin bütün durumu: tek kayıt (`cnc-kurulum-motoru.v1`), eski ekranla aynı şema (soru 204 a). Görünümlerin kendi alanları
// (`stock`, `life`, `wear`, `wearLog`, `cam`, `gsim*`, `prep`, `mstat`, `suProf`...) burada açık uçludur: her görünüm kendi
// varsayılanını prototipteki gibi ilk açılışta birleştirir ve kendi tipiyle okur.
export const DURUM_ANAHTARI = 'cnc-kurulum-motoru.v1';

export interface Baglama { fixture: string; jaw: string; zero: string }
export interface KalemStogu { qty?: number | null; min?: number; tmiStok?: { malzemeId: number; kod?: string; ad?: string | null; birim?: string | null } | null; [alan: string]: unknown }

export interface CncDurumu {
  machine: string;
  material: string;
  coolant: string;
  byType: Partial<Record<TezgahTuru, Baglama>>;
  wcs: Record<string, string>;
  // Tezgâh başına magazin: cep sırasıyla takım kimliği ('empty' boş cep).
  tools: Record<string, string[]>;
  gauges: string[];
  cons: string[];
  meta: { part: string; prog: string; op: string; stock: string; [alan: string]: unknown };
  // Tezgâh düzeltmeleri (Tanımlar): tezgâh kimliği → değişen alanlar.
  mo: Record<string, Partial<Tezgah>>;
  inv: Record<string, KalemStogu | undefined>;
  // Tezgâhta elle kullanılan adet (magazin dışı): tezgâh → kalem → adet.
  active: Record<string, Record<string, number>>;
  custom: Kalem[];
  customMachines: Tezgah[];
  customMats: IsMalzemesi[];
  matO: Record<string, Partial<IsMalzemesi>>;
  stock: unknown;
  life: unknown;
  gsim: unknown;
  [alan: string]: unknown;
}

export function defaults(): CncDurumu {
  return {
    machine: 'f5a', material: 'c45', coolant: 'bor5',
    byType: { mill: { fixture: 'vise125', jaw: 'j_hard', zero: 'z_probe' }, lathe: { fixture: 'ch3', jaw: 'lj_hard', zero: 'z_arm' }, millturn: { fixture: 'ch3', jaw: 'lj_soft', zero: 'z_probe' } },
    wcs: { heid: 'p1', iso: 'g54' }, tools: {}, gauges: ['g_cal', 'g_mic', 'g_dial'], cons: ['c_bez', 'c_cap', 'c_eld', 'c_goz'],
    meta: { part: '', prog: '', op: '', stock: '' }, mo: {}, inv: {}, active: {}, custom: [], customMachines: [], customMats: [], matO: {}, stock: {}, life: {}, gsim: null,
  };
}

const nesneMi = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

// Kayıt prototipin açılışındaki gibi varsayılanlarla birleşir. Prototip `Object.assign(df, kayit)`tan sonra byType, wcs ve
// meta'yı `df`nin (artık kaydın) alanına birleştirir: sonuç kaydın alanının kendisidir, eksik alt alan varsayılanla dolmaz.
// Aynı sonuç burada açıkça yazılır; kayıtta olmayan ya da nesne olmayan alan varsayılan kalır. Okunamayan kayıt varsayılandır.
export function durumBirlestir(kayit: unknown): CncDurumu {
  const df = defaults();
  if (!nesneMi(kayit)) return df;
  const s = Object.assign(df, kayit) as CncDurumu;
  const ilk = defaults();
  if (!nesneMi(kayit['byType'])) s.byType = ilk.byType;
  if (!nesneMi(kayit['wcs'])) s.wcs = ilk.wcs;
  if (!nesneMi(kayit['meta'])) s.meta = ilk.meta;
  return s;
}

// Kayıt metni (sunucudan gelen JSON metni) durum olur; bozuk metin varsayılandır.
export function durumOku(metin: string | null | undefined): CncDurumu {
  if (metin == null || metin === '') return defaults();
  try { return durumBirlestir(JSON.parse(metin) as unknown); } catch { return defaults(); }
}

export { D };
