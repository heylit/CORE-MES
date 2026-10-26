// Hazırlığın kayıt biçimi Arkon'un ortak modelidir (arkon/shared/model.ts): eski ekranla yeni ekran aynı paketi okur ve yazar.
// Modelde `any` kalan alanlar (kurallar, istasyon ayarı, numune kuralı) burada tiplenir; kayıttaki değer olduğu gibi kalır.
export type {
  Meas, OpType, Order, Pin, Pkg, PkgFile, PlanItem, Result, SampleRequest, Step,
} from '../../../../../../arkon/shared/model.ts';

export type UyariSeviyesi = 'info' | 'warn' | 'crit';
export type UyariZamani = 'start' | 'every' | 'interval' | 'tool' | 'shift';
export interface Uyari { id: string; t: string; lvl: UyariSeviyesi; when: UyariZamani; n?: number; ack?: boolean }

export interface KaliteKurallari {
  // 564 7 a: numune reddi üretimi durdurmaz; kayıtlı eski 'stop' uyarı olarak okunur.
  who: 'quality' | 'operator'; firstPiece: boolean; nok: 'warn' | 'call' | 'stop'; band: number; critTwice: boolean; autoSend: boolean;
}
export interface Takim { id: string; name: string; life: number; warnPct: number }
export interface UretimKurallari { scrapPct: number; scrapMin: number; maxPauseMin: number; tools: Takim[] }
export interface IsKurallari { warns: Uyari[]; q: KaliteKurallari; prod: UretimKurallari }

export type NumuneZamani = 'first' | 'every' | 'time' | 'shift' | 'last';
export type Olcen = 'q' | 'op';
export interface NumuneKurali { id: string; when: NumuneZamani; n?: number; who: Olcen[]; items: 'all' | 'crit' | number[]; gate?: boolean }

export interface KuralSablonu { id: string; name: string; scope: 'machine' | 'family' | 'all'; key: string; def: boolean; rules: unknown; at: number }

// Eski ekranın renk adları (temel.ts ST, LVL, PSTAT): renk tasarım değişkeninden seçilir, anlam her zaman metinle yazılır.
export type Ton = 'run' | 'hold' | 'stop' | 'done' | 'hazard' | 'idle';
