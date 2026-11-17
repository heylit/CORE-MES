import { gonderimUyarisi, istasyonsuzMu, rotaEksigi, ISTASYONSUZ_GONDERIM } from '../../../../../../arkon/web/src/data/tmi-plan.ts';
import type { Plant, Policy } from '../cekirdek/tipler.ts';
import { isTuru, onayBekliyor, onayGerekir, paketDenetimi, planYokUyarisiGerekir } from './kurallar.ts';
import type { Pkg, Result } from './tipler.ts';

// 3362-1: takip tablosundan toplu terminale gönderme. Her paket tek paketteki "Terminale gönder" kapılarından aynı sırayla geçer
// (Hazirlik.tsx yayinla): eksik durdurur, kontrol planı yok uyarısı onay ister (1307 b), kalite onayı gereken iş kaliteye gider,
// canlı planda olmayan iş onay ister (#1257). Toplu pencere uyarıyı paket başına ayrı kutuyla sorar (Risk K1).

// Gönderilebilir: taslak ya da terminalde olup değişikliği gönderilmemiş, işi bitmemiş paket.
export const topluGonderilebilir = (p: Pick<Pkg, 'status' | 'dirty'>, r: Pick<Result, 'state'> | null | undefined): boolean =>
  r?.state !== 'done' && (p.status === 'draft' || p.dirty);

export type GonderimUyariTuru = 'planYok' | 'planDisi';
export interface GonderimUyarisiSatiri { tur: GonderimUyariTuru; neden: string }
export type GonderimHali =
  | { tur: 'engel'; neden: string }
  | { tur: 'bekliyor'; neden: string }
  | { tur: 'terminal' | 'kalite'; uyarilar: GonderimUyarisiSatiri[] };

export const PLAN_YOK_NEDENI = 'Kontrol planı olmayan talaşlı iş yalnız onaylanırsa gider; onay kayda geçer.';

export function gonderimHali(p: Pkg, tesis: Plant, kurallar: Pick<Policy, 'approval'>): GonderimHali {
  if (paketDenetimi(p, tesis).some((x) => !x.ok && !x.soft)) {
    const rota = rotaEksigi(p);
    return { tur: 'engel', neden: istasyonsuzMu(p) ? ISTASYONSUZ_GONDERIM : rota ?? 'Paket eksik: Bilgiler, Kontrol planı ya da Adımlar sekmesine bakın.' };
  }
  const uyarilar: GonderimUyarisiSatiri[] = planYokUyarisiGerekir(p) ? [{ tur: 'planYok', neden: PLAN_YOK_NEDENI }] : [];
  if (onayGerekir(p, kurallar)) {
    if (onayBekliyor(p)) return { tur: 'bekliyor', neden: 'Kalite onayı bekleniyor.' };
    return { tur: 'kalite', uyarilar };
  }
  const plan = gonderimUyarisi(p);
  if (plan) uyarilar.push({ tur: 'planDisi', neden: `${plan.neden} İşaretlenmezse gönderilmez.` });
  return { tur: 'terminal', uyarilar };
}

// Uyarı kutusunun anahtarı paket ve uyarı türüdür: aynı paketin iki uyarısı ayrı onaylanır.
export const uyariAnahtari = (id: string, tur: GonderimUyariTuru): string => `${id}:${tur}`;
// Paket ancak bütün uyarıları işaretliyse gider; kaliteye gidecek iş hiçbir kutuyla doğrudan terminale geçmez (Risk K1).
export function gidecekMi(id: string, h: GonderimHali, onaylar: ReadonlySet<string>): boolean {
  if (h.tur !== 'terminal' && h.tur !== 'kalite') return false;
  return h.uyarilar.every((u) => onaylar.has(uyariAnahtari(id, u.tur)));
}
export interface GonderimSayilari { terminal: number; kalite: number }
export function gonderimSayilari(l: readonly { p: Pick<Pkg, 'id'>; h: GonderimHali }[], onaylar: ReadonlySet<string>): GonderimSayilari {
  let terminal = 0, kalite = 0;
  for (const { p, h } of l) if (gidecekMi(p.id, h, onaylar)) { if (h.tur === 'kalite') kalite++; else terminal++; }
  return { terminal, kalite };
}
export function gonderDugmesi(s: GonderimSayilari): string {
  const t = s.terminal ? `${String(s.terminal)} işi gönder` : '';
  const k = s.kalite ? `${String(s.kalite)} işi kaliteye yolla` : '';
  return [t, k].filter(Boolean).join(', ') || 'Gönderilecek iş yok';
}

// 3362-2: benzer paketten doldurma. Aday yalnız en az bir kez gönderilmiş pakettir (V4); sıra: aynı parça ve aynı OP, aynı parça
// başka OP, aynı iş türü ve istasyonda başka parça. Aynı paket ve aynı iş emrinin kendi paketi aday olmaz.
export type AdayDerecesi = 'ayni-op' | 'ayni-parca' | 'ayni-tur';
export interface BenzerAday { p: Pkg; derece: AdayDerecesi }
const DERECE_SIRASI: Readonly<Record<AdayDerecesi, number>> = { 'ayni-op': 0, 'ayni-parca': 1, 'ayni-tur': 2 };
const parcaAnahtari = (p: Pick<Pkg, 'malzemeNo' | 'partNo'>): string | null =>
  typeof p.malzemeNo === 'number' ? `m${String(p.malzemeNo)}` : p.partNo ? `p${p.partNo}` : null;
const opNo = (p: Pkg): number | null => (typeof p.tmi?.opNo === 'number' ? p.tmi.opNo : null);

export function benzerAdaylar(hedef: Pkg, paketler: readonly Pkg[]): BenzerAday[] {
  const parca = parcaAnahtari(hedef), op = opNo(hedef), tur = isTuru(hedef);
  const l: BenzerAday[] = [];
  for (const p of paketler) {
    if (p.id === hedef.id || typeof p.publishedAt !== 'number') continue;
    const ayniParca = parca !== null && parcaAnahtari(p) === parca;
    if (ayniParca && p.rev === hedef.rev && op !== null && opNo(p) === op && p.tmi?.isEmriId === hedef.tmi?.isEmriId) continue;
    const derece: AdayDerecesi | null = ayniParca && op !== null && opNo(p) === op ? 'ayni-op'
      : ayniParca && isTuru(p) === tur ? 'ayni-parca'
        : isTuru(p) === tur && p.machine === hedef.machine && hedef.machine !== '' ? 'ayni-tur' : null;
    if (derece !== null) l.push({ p, derece });
  }
  return l.sort((a, b) => DERECE_SIRASI[a.derece] - DERECE_SIRASI[b.derece] || (b.p.publishedAt ?? 0) - (a.p.publishedAt ?? 0));
}
export const enIyiAday = (hedef: Pkg, paketler: readonly Pkg[]): BenzerAday | null => benzerAdaylar(hedef, paketler)[0] ?? null;

// Kopyalanabilen içerik alanları (Risk K2): onay, kayıt, kişi, yayın geçmişi, kalite ve ilk parça kararları, stok bağı taşınmaz.
// Resim ve kontrol planı yalnız aynı parça ve aynı revizyonda (V5; sunucu şablonundaki kural).
export type KopyaAlani = 'steps' | 'rules' | 'samp' | 'material' | 'resim' | 'plan';
export const KOPYA_ALANLARI: readonly { k: KopyaAlani; ad: string }[] = [
  { k: 'steps', ad: 'Adımlar' }, { k: 'rules', ad: 'Kurallar' }, { k: 'samp', ad: 'Numune planı' }, { k: 'material', ad: 'Malzeme notu' },
  { k: 'resim', ad: 'Resim ve dokümanlar' }, { k: 'plan', ad: 'Kontrol planı' },
];
export const ayniRevizyon = (hedef: Pkg, kaynak: Pkg): boolean =>
  parcaAnahtari(hedef) !== null && parcaAnahtari(hedef) === parcaAnahtari(kaynak) && hedef.rev !== '' && hedef.rev === kaynak.rev;
export function kopyaAcikMi(hedef: Pkg, kaynak: Pkg, k: KopyaAlani): boolean {
  if (k === 'resim' || k === 'plan') return ayniRevizyon(hedef, kaynak);
  if (k === 'material') return parcaAnahtari(hedef) !== null && parcaAnahtari(hedef) === parcaAnahtari(kaynak);
  return true;
}
export const varsayilanKopya = (hedef: Pkg, kaynak: Pkg): Set<KopyaAlani> =>
  new Set(KOPYA_ALANLARI.map((x) => x.k).filter((k) => kopyaAcikMi(hedef, kaynak, k)));

// Paketin doldurulmuş içeriği: toplu doldurma yalnız boş taslağı doldurur, dolu paket tek tek açılır.
export const icerikDolu = (p: Pick<Pkg, 'steps' | 'samp' | 'rules'>): boolean => p.steps.length > 0 || (p.samp?.length ?? 0) > 0;

type Kural = { q?: Record<string, unknown> } & Record<string, unknown>;
const kayit = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// Hedefin değişecek alanları. İlk parça seçimi hedefin rotasından gelir (sunucu `ilkParcasizKural`): hedefte kapalıysa kapalı kalır.
// Kontrol planı taşınmazsa numune kuralındaki ölçü kimlikleri hedefin planına göre süzülür; boş kalan kural bütün ölçüleri alır.
export function benzerKopya(hedef: Pkg, kaynak: Pkg, alanlar: ReadonlySet<KopyaAlani>): Partial<Pkg> {
  const acik = (k: KopyaAlani) => alanlar.has(k) && kopyaAcikMi(hedef, kaynak, k);
  const sonuc: Partial<Pkg> = {};
  if (acik('steps')) sonuc.steps = kaynak.steps.map((s) => ({ ...s }));
  if (acik('rules') && kayit(kaynak.rules)) {
    const r = structuredClone(kaynak.rules) as Kural;
    const hq = kayit(hedef.rules) && kayit(hedef.rules['q']) ? hedef.rules['q'] : null;
    if (hq && hq['firstPiece'] === false) r.q = { ...(kayit(r.q) ? r.q : {}), firstPiece: false };
    sonuc.rules = r;
  }
  if (acik('material')) sonuc.material = kaynak.material;
  if (acik('resim')) {
    sonuc.files = kaynak.files.map((f) => ({ ...f })); sonuc.primary = kaynak.primary;
    if (kaynak.readCfg !== undefined) sonuc.readCfg = structuredClone(kaynak.readCfg);
  }
  // Kontrol planı Kalite Merkezi balonlarıdır (789): aynı revizyonda resim bağıyla birlikte gelir.
  if (acik('plan')) { sonuc.plan = kaynak.plan.map((b) => ({ ...b })); sonuc['kmResim'] = kaynak['kmResim'] ?? null; }
  if (acik('samp')) {
    const plan = new Set((sonuc.plan ?? hedef.plan).map((b) => b.id));
    sonuc.samp = (kaynak.samp ?? []).map((s) => {
      if (!Array.isArray(s.items)) return { ...s, who: [...s.who] };
      const items = s.items.filter((i) => plan.has(i));
      return { ...s, who: [...s.who], items: items.length ? items : 'all' };
    });
  }
  return sonuc;
}

// Uygulamadan önce hedefte silinecekler (Arayüz 2): dolu alanın üzerine yazılırken pencere söyler.
export function silinecekler(hedef: Pkg, kopya: Partial<Pkg>): string[] {
  const l: string[] = [];
  if (kopya.steps && hedef.steps.length) l.push(`${String(hedef.steps.length)} adım`);
  if (kopya.samp && hedef.samp?.length) l.push(`${String(hedef.samp.length)} numune kuralı`);
  if (kopya.plan && hedef.plan.length) l.push(`${String(hedef.plan.length)} kontrol noktası`);
  if (kopya.files && hedef.files.length) l.push(`${String(hedef.files.length)} dosya`);
  if (kopya.material !== undefined && hedef.material.trim() !== '' && hedef.material !== kopya.material) l.push('malzeme notu');
  return l;
}
export function gelecekler(kopya: Partial<Pkg>): string[] {
  const l: string[] = [];
  if (kopya.steps) l.push(`${String(kopya.steps.length)} adım`);
  if (kopya.rules) l.push('kurallar');
  if (kopya.samp) l.push(`${String(kopya.samp.length)} numune kuralı`);
  if (kopya.plan) l.push(`${String(kopya.plan.length)} kontrol noktası`);
  if (kopya.files) l.push(`${String(kopya.files.length)} dosya`);
  if (kopya.material !== undefined) l.push('malzeme notu');
  return l;
}
