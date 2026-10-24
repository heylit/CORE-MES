import { tatilleriOku, type Tatiller } from '../../../../../../arkon/web/src/data/tatil.ts';
import { nedenKaynagi } from '../../../../../../arkon/web/src/app/neden-kaynagi.ts';
import { VARSAYILAN_KURALLAR, YERLESIK_DURUS_NEDENLERI, YERLESIK_HURDA_NEDENLERI, nedenDurumu } from './sabitler.ts';
import { BOS_TESIS } from './tesis.ts';
import type { AppMode, Gauge, PermMatrix, Plant, PlannedDown, Policy, Reason, ScrapReason, Shift } from './tipler.ts';
import { yetkiMatrisi } from './yetki.ts';
import type { MakineDurumu } from '../../../../ortak/arayuz/index.ts';

// Arkon'un ortak ayarları (ortak-ayarlar.ts loadCfg): vardiya, tatil, kip, tesis, yetki matrisi, çalışma kuralları, neden listeleri,
// planlı duruşlar, ölçü aletleri. Eski ekranda modül değişkenlerindeydi; burada tek değer olarak okunur, ekran bağlamdan alır.

export type DurusNedeni = Reason & { durum: MakineDurumu };

export interface ArkonAyarlari {
  vardiyalar: Shift[];
  tatiller: Tatiller;
  kip: AppMode;
  tesis: Plant;
  yetkiler: PermMatrix;
  kurallar: Policy;
  durusNedenleri: DurusNedeni[];
  hurdaNedenleri: ScrapReason[];
  planliDuruslar: PlannedDown[];
  olcuAletleri: Gauge[];
}

// Okuma öncesi değerler: sunucu kipinde yerleşik neden listesi ve tanıtım tesisi açılmaz.
export const ILK_AYARLAR: ArkonAyarlari = {
  vardiyalar: [], tatiller: {}, kip: { demo: false }, tesis: BOS_TESIS, yetkiler: yetkiMatrisi(null), kurallar: VARSAYILAN_KURALLAR,
  durusNedenleri: [], hurdaNedenleri: [], planliDuruslar: [], olcuAletleri: [],
};

interface AyarKaynagi {
  DB: { get(depo: string, kimlik: string): Promise<unknown>; all(depo: string): Promise<unknown[]> };
  status(): { mode: 'server' | 'local' };
}

type Sonuc = { ok: true; v: unknown } | { ok: false };

// Okumalar birbirini beklemeden gider; her ayar ayrı uygulanır: biri okunamazsa öncekinin değeri kalır, ötekiler yine yüklenir.
// İlk okumada neden listeleri boştur: eski ekran yerleşik listeyle açılıp okunamayınca boşaltıyordu, sonuç aynıdır.
export async function ayarlariOku(kaynak: AyarKaynagi, onceki: ArkonAyarlari = ILK_AYARLAR): Promise<ArkonAyarlari> {
  const sunucu = kaynak.status().mode === 'server';
  const sonuc = (p: Promise<unknown>): Promise<Sonuc> => p.then((v): Sonuc => ({ ok: true, v }), (): Sonuc => ({ ok: false }));
  const [sh, md, pl, pm, po, rs, sc, dw, gg, hd] = await Promise.all([
    kaynak.DB.get('kv', 'shifts'), kaynak.DB.get('kv', 'mode'), kaynak.DB.get('kv', 'plant'), kaynak.DB.get('kv', 'perms'), kaynak.DB.get('kv', 'policy'),
    kaynak.DB.get('kv', 'reasons'), kaynak.DB.get('kv', 'scraps'), kaynak.DB.all('downs'), kaynak.DB.all('gauges'), kaynak.DB.get('kv', 'holidays'),
  ].map(sonuc)) as Sonuc[];
  const a: ArkonAyarlari = { ...onceki };
  const uygula = (r: Sonuc | undefined, f: (v: unknown) => void, yoksa?: () => void): void => {
    try {
      if (!r?.ok) throw new Error('okunamadı');
      f(r.v);
    } catch {
      yoksa?.();
    }
  };
  uygula(sh, (v) => { a.vardiyalar = Array.isArray(v) && v.length ? (v as Shift[]) : []; });
  uygula(hd, (v) => { a.tatiller = tatilleriOku(v); }, () => { a.tatiller = {}; });
  // Sunucuya bağlı kurulum her zaman gerçek kullanımdadır (kart #1087): kayıtlı eski 'mode' değeri tanıtımı açamaz.
  uygula(md, (v) => { a.kip = sunucu ? { ...(v as object | null ?? {}), demo: false } : { demo: true, ...(v as object | null ?? {}) }; });
  // Tanıtım tesisi yeni ekrana girmez (208 a): kayıtlı tesis yoksa boştur.
  uygula(pl, (v) => { const t = v as Partial<Plant> | null; a.tesis = t && t.sts ? { ...BOS_TESIS, ...t } as Plant : BOS_TESIS; });
  uygula(pm, (v) => { a.yetkiler = yetkiMatrisi(v as Parameters<typeof yetkiMatrisi>[0]); });
  uygula(po, (v) => { a.kurallar = { ...VARSAYILAN_KURALLAR, ...(v as Partial<Policy> | null ?? {}) }; });
  uygula(rs, (v) => {
    a.durusNedenleri = nedenKaynagi(sunucu, v as Reason[] | null, YERLESIK_DURUS_NEDENLERI).map((x) => ({ ...x, durum: nedenDurumu(x) }));
  });
  uygula(sc, (v) => { a.hurdaNedenleri = nedenKaynagi(sunucu, v as ScrapReason[] | null, YERLESIK_HURDA_NEDENLERI); });
  uygula(dw, (v) => { a.planliDuruslar = v as PlannedDown[]; });
  uygula(gg, (v) => { a.olcuAletleri = v as Gauge[]; });
  return a;
}

export const durusNedeni = (a: Pick<ArkonAyarlari, 'durusNedenleri'>, kod: string | null | undefined): DurusNedeni | null =>
  a.durusNedenleri.find((r) => r.code === kod) ?? null;
export const planliNedenMi = (a: Pick<ArkonAyarlari, 'durusNedenleri'>, kod: string | null | undefined): boolean => durusNedeni(a, kod)?.cat === 'p';
export const hurdaNedeni = (a: Pick<ArkonAyarlari, 'hurdaNedenleri'>, kod: string | null | undefined): ScrapReason | null =>
  a.hurdaNedenleri.find((r) => r.code === kod) ?? null;
