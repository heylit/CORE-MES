import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react';
import type { DegerlendirmeCevabi, DegerlendirmeIstegi } from '#paylasilan/sozlesme/planlama.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { CozulmusPlan, PlanlamaCalismasi } from '../../tipler.ts';
import { degerlendirmeHatasi, degerlendirmeIste } from '../../siparis/degerlendirme.ts';
import { abone, hesapSuruyor, KAYDEDILEMEDI, koy } from '../coz.ts';
import { saatYazi, type OkunanPlan } from '../kurallar.ts';
import { tezgahKuyrugu } from '../cizelge/kurallar.ts';

// 2129-1 b: önizlemeli motor hamleleri (eski c-masa hamleDene, hamleKur, hamleUygula). Hesap sunucudadır (değerlendirme ucu,
// `plan-iyilestir` ve `one-al`); sonuç önce önizlenir, kişi Uygula derse çalışmaya yazılır (geri alınabilir), Vazgeç derse atılır.
// Önizleme sayfada tektir: hangi düğmeden istenirse istensin aynı şeritte görünür. Plan veriden eskiyse hamle istenmez: kayıtlı plan
// taban alındığı için önce bekleyen değişiklikler uygulanır.

export type HamleTuru = 'plan-iyilestir' | 'one-al' | 'sira-degistir';
type HamleSonucu = Extract<DegerlendirmeCevabi['sonuc'], { tur: HamleTuru }>;
export type DegisenSiparis = HamleSonucu['degisen'][number];
export interface HamleOnizlemesi {
  tur: HamleTuru; ad: string; plan: Record<string, unknown>; dataVer: number;
  gecikmeOnce: number; gecikmeSonra: number | null; degisen: DegisenSiparis[];
  siparisId: string | null; yol: string | null; bitisOnce: number | null; bitisSonra: number | null; tezgah: string | null;
}

export const ARANIYOR = 'Motor arıyor; bir dakikaya kadar sürebilir.';
export const BAYAT = 'Plan verinin gerisinde: önce bekleyen değişiklikleri uygulayın.';
export const PLAN_YOK = 'Önce plan kurulmalı.';
export const DAHA_IYISI_YOK = 'Daha iyi plan bulunamadı; plan olduğu gibi kaldı.';
export const HAMLE_ESKIDI = 'Önizlemeden sonra veri değişti; hamle uygulanmadı. Yeniden deneyin.';
export const SIRA_TUTULMADI = 'Motor bu sırayı tutamadı; plan olduğu gibi kaldı.';

let onizleme: HamleOnizlemesi | null = null;
const dinleyiciler = new Set<() => void>();
const yaz = (x: HamleOnizlemesi | null): void => { onizleme = x; for (const f of dinleyiciler) f(); };
const onizlemeAbone = (f: () => void) => { dinleyiciler.add(f); return () => { dinleyiciler.delete(f); }; };
export const onizlemeAl = (): HamleOnizlemesi | null => onizleme;
export function hamleSifirla(): void { yaz(null); }

export function onizlemeKur(s: HamleSonucu, dataVer: number): HamleOnizlemesi | string {
  if (s.plan === null) return s.tur === 'one-al' ? (s.neden ?? 'Sipariş öne alınamadı.') : s.tur === 'sira-degistir' ? (s.neden ?? SIRA_TUTULMADI) : DAHA_IYISI_YOK;
  const ad = s.tur === 'one-al' ? `${s.siparisId} öne alındı (${s.yol ?? ''})` : s.tur === 'sira-degistir' ? `${s.tezgah} sırası değişti` : 'Plan iyileştirildi';
  return {
    tur: s.tur, ad, plan: s.plan, dataVer, gecikmeOnce: s.gecikmeOnce, gecikmeSonra: s.gecikmeSonra, degisen: s.degisen,
    siparisId: s.tur === 'one-al' ? s.siparisId : null, yol: s.tur === 'one-al' ? s.yol : null,
    bitisOnce: s.tur === 'one-al' ? s.bitisOnce : null, bitisSonra: s.tur === 'one-al' ? s.bitisSonra : null,
    tezgah: s.tur === 'sira-degistir' ? s.tezgah : null,
  };
}

// Önizlenen plan çalışmaya alınır (eski hamleUygula): plan, değişikliğin artırdığı veri sürümüyle güncel sayılır. Önizlemeden sonra veri
// değiştiyse false.
export function hamleyiAl(t: PlanlamaCalismasi, o: HamleOnizlemesi, kim: string, zaman: number): boolean {
  if (o.dataVer !== t.dataVer || t.plan === null) return false;
  const once = t.plan.ozet ?? null;
  t.plan = { ...o.plan, dataVer: t.dataVer + 1, kim, zaman, kaynak: 'oneri', oneriKaynak: o.tur, oncekiOzet: once, kapali: t.kapali.slice() } as CozulmusPlan;
  return true;
}

export interface HamleAyari {
  komut: CalismaKomutu;
  iste?: (surum: number, istek: Extract<DegerlendirmeIstegi, { tur: HamleTuru }>) => Promise<DegerlendirmeCevabi>;
}
// Dönen: önizleme kurulduysa null, olmadıysa kişiye gösterilecek ileti.
export async function hamleIste(a: HamleAyari, istek: Extract<DegerlendirmeIstegi, { tur: HamleTuru }>): Promise<string | null> {
  if (hesapSuruyor()) return null;
  koy(true);
  try {
    const surum = await a.komut.kaydet();
    if (surum === null) return KAYDEDILEMEDI;
    const c = await (a.iste ?? degerlendirmeIste)(surum, istek);
    if (c.sonuc.tur !== istek.tur) return HAMLE_ESKIDI;
    const o = onizlemeKur(c.sonuc as HamleSonucu, c.dataVer);
    if (typeof o === 'string') { yaz(null); return o; }
    yaz(o);
    return null;
  } catch (h) {
    return degerlendirmeHatasi(h).metin;
  } finally {
    koy(false);
  }
}

export function hamleUygula(komut: CalismaKomutu, kim: string, zaman: number = Date.now()): string | null {
  const o = onizleme; if (o === null) return null;
  let alindi = false;
  komut.degistir(o.ad, (t) => (alindi = hamleyiAl(t, o, kim, zaman)), {
    ayrinti: `ağırlıklı gecikme ${saatYazi(o.gecikmeOnce)} → ${saatYazi(o.gecikmeSonra)}`, planKoru: true,
  });
  yaz(null);
  return alindi ? null : HAMLE_ESKIDI;
}

// Düğmelerin yüzü. `kapali` doluysa düğme yerinde pasif, nedeni ipucunda; yazamayan için null.
export interface Hamleci {
  iyilestir: () => void; oneAl: (siparisId: string) => void; sirala: (tezgah: string, sira: string[]) => void; uygula: () => void; vazgec: () => void;
  onizleme: HamleOnizlemesi | null; suruyor: boolean; kapali: string | null;
}
export function useHamle(o: Pick<PlanlamaEkranOzellikleri, 'komut' | 'yetki' | 'calisma' | 'depo'>, uyar: (ileti: string) => void): Hamleci | null {
  const s = useSyncExternalStore(abone, hesapSuruyor);
  const on = useSyncExternalStore(onizlemeAbone, onizlemeAl);
  const { komut, calisma } = o; const kim = o.depo.ben?.kisi.ad ?? '';
  const kapali = calisma === null || calisma.plan === null ? PLAN_YOK : calisma.plan.dataVer !== calisma.dataVer ? BAYAT : null;
  const iste = useCallback((istek: Extract<DegerlendirmeIstegi, { tur: HamleTuru }>) => {
    if (!komut || kapali) { if (kapali) uyar(kapali); return; }
    void hamleIste({ komut }, istek).then((h) => { if (h) uyar(h); });
  }, [komut, kapali, uyar]);
  const iyilestir = useCallback(() => { iste({ tur: 'plan-iyilestir' }); }, [iste]);
  const oneAl = useCallback((siparisId: string) => { iste({ tur: 'one-al', siparisId }); }, [iste]);
  const sirala = useCallback((tezgah: string, sira: string[]) => { iste({ tur: 'sira-degistir', tezgah, sira }); }, [iste]);
  const uygula = useCallback(() => { if (komut) { const h = hamleUygula(komut, kim); if (h) uyar(h); } }, [komut, kim, uyar]);
  const vazgec = useCallback(() => { yaz(null); }, []);
  // Önizleme başka veri sürümündense (sayfa değişti, geri alındı) gösterilmez; Uygula zaten reddederdi.
  const gecerli = on !== null && calisma !== null && on.dataVer === calisma.dataVer ? on : null;
  return useMemo(() => (komut && calisma && o.yetki.planYaz
    ? { iyilestir, oneAl, sirala, uygula, vazgec, onizleme: gecerli, suruyor: s, kapali } : null),
  [komut, calisma, o.yetki.planYaz, iyilestir, oneAl, sirala, uygula, vazgec, gecerli, s, kapali]);
}

// Düğmenin yapışı: hamleci yoksa yetki, varsa kapalılık ya da süren hesap nedeniyle pasif.
export const YETKISIZ_HAMLE = 'Plan yazma yetkiniz yok.';
export function hamleYapisi(h: Hamleci | null | undefined, yap: (h: Hamleci) => void): { yap: (() => void) | null; not: string } {
  if (!h) return { yap: null, not: YETKISIZ_HAMLE };
  if (h.kapali) return { yap: null, not: h.kapali };
  if (h.suruyor) return { yap: null, not: ARANIYOR };
  return { yap: () => { yap(h); }, not: '' };
}

// 2149: sıra hamlesi tahtanın içindeki çok yerden istenir (denetçi, kuyruk merceği, odak, kuyruk kartı, tezgâh sırası, klavye); hamleci
// Tahta'dan bağlamla iner. Bağlam dışında (testte tek başına çizilen parça) null'dır: düğme yetkisiz gibi pasif kalır.
export const HamleBaglami = createContext<Hamleci | null>(null);
export const useHamleci = (): Hamleci | null => useContext(HamleBaglami);

// Bir öne / bir arkaya: adım komşusuyla yer değiştirir. Sıra istenecek iki adım döner; sınırda ya da kuyrukta değilse null.
export function komsuSirasi(kuyruk: readonly string[], id: string, yon: -1 | 1): string[] | null {
  const i = kuyruk.indexOf(id); const k = i + yon; const h = kuyruk[k];
  if (i < 0 || h === undefined) return null;
  return yon < 0 ? [id, h] : [h, id];
}

// Seçili adımın kuyrukta bir öne ya da bir arkaya gitmesi (denetçi, odak, klavye '[' ']'): başlamış iş ve fason adım sırada sayılmaz.
export const KUYRUK_BASI = 'Kuyruğun başında.';
export const KUYRUK_SONU = 'Kuyruğun sonunda.';
export const FASON_SIRASI = 'Fason adımın tezgâh sırası yok.';
export const BASLAMIS_SIRA = 'Başlamış işin sırası değişmez.';
export function siraAdimi(h: Hamleci | null | undefined, p: OkunanPlan, id: string, yon: -1 | 1): { yap: (() => void) | null; not: string } {
  const r = p.ops[id];
  if (!r || r.fas || r.act) return { yap: null, not: r?.act ? BASLAMIS_SIRA : FASON_SIRASI };
  const l = komsuSirasi(tezgahKuyrugu(p, r.m).filter((x) => !x.act).map((x) => x.id), id, yon);
  if (!l) return { yap: null, not: yon < 0 ? KUYRUK_BASI : KUYRUK_SONU };
  return hamleYapisi(h, (x) => { x.sirala(r.m, l); });
}
