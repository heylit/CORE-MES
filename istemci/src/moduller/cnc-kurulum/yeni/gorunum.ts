import { useEffect, useSyncExternalStore } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Görünümler prototipin anahtarlarıyla (data-view) anılır; adresleri prototipin VIEW_HASH'idir.
export const GORUNUMLER = ['home', 'setup', 'prep', 'lib', 'stock', 'cam', 'gcode', 'life'] as const;
export type Gorunum = (typeof GORUNUMLER)[number];
export const VIEW_HASH: Record<Gorunum, string> = {
  home: 'ana-sayfa', setup: 'kurulum', prep: 'hazirlik', lib: 'kutuphane', stock: 'hammadde', cam: 'oto-cam', gcode: 'simulasyon', life: 'takim-omru',
};
export const HASH_VIEW: Record<string, Gorunum> = Object.fromEntries(GORUNUMLER.map((g) => [VIEW_HASH[g], g]));
export const KOK = '/cnc-kurulum/yeni';
// Prototip adres yoksa Ana Sayfa'da açılır.
export const ACILIS: Gorunum = 'home';

export function gorunumOku(adres: string | undefined): Gorunum | null { return adres === undefined ? null : HASH_VIEW[adres] ?? null; }
// Ekran kalıcı rotadır (rota dışında çizilir, useParams boştur); görünüm adresin kendisinden okunur.
export function adrestenGorunum(yol: string): Gorunum | null {
  return yol.startsWith(`${KOK}/`) ? gorunumOku(yol.slice(KOK.length + 1).split('/')[0]) : null;
}
export function gorunumAdresi(g: Gorunum): string { return `${KOK}/${VIEW_HASH[g]}`; }

// Görünüm değiştirme (prototipin setView'i). `secenek` hedef görünüme geçecek küçük bilgidir (orn. Takım Ömrü'nün kipi); hedef
// görünüm useGecisSecenegi ile bir kez alır.
// Bilinen geçiş seçenekleri: Ana Sayfa'dan Takım Ömrü'ne tezgâh ve cep (prototipin hLifeGo'su), Hazırlık'a son adım ya da program adımı (prGo).
export interface OmurGecisi { tezgah: string; cep?: number | string | null }
export interface HazirlikGecisi { adim: 'son' | 'prog' }

// Ekran başka sayfadayken gizli kalır; o sürede son görünüm korunur, `burada` yanlıştır (gizliyken yönlendirme yapılmaz).
let gecisSecenegi: { gorunum: Gorunum; deger: unknown } | null = null;
let sonGorunum: Gorunum = ACILIS;
export function useGorunum(): { gorunum: Gorunum; burada: boolean; git: (g: Gorunum, secenek?: unknown) => void } {
  const { pathname } = useLocation();
  const git = useNavigate();
  const burada = pathname === KOK || pathname.startsWith(`${KOK}/`);
  if (burada) sonGorunum = adrestenGorunum(pathname) ?? ACILIS;
  return {
    gorunum: sonGorunum, burada,
    git: (g, secenek) => {
      gecisSecenegi = secenek === undefined ? null : { gorunum: g, deger: secenek };
      void git(gorunumAdresi(g));
    },
  };
}
export function gecisSecenegiAl(g: Gorunum): unknown {
  if (gecisSecenegi?.gorunum !== g) return undefined;
  const d = gecisSecenegi.deger;
  gecisSecenegi = null;
  return d;
}

// ----- Tanımlar penceresi (prototipin openDefs'i): hangi görünümden olursa olsun kabuk açar -----
export type TanimSekmesi = 'mach' | 'mat' | 'model' | 'su';
let tanim: { acik: boolean; sekme: TanimSekmesi } = { acik: false, sekme: 'mach' };
const tanimDinleyicileri = new Set<() => void>();
const tanimYaz = (t: typeof tanim): void => { tanim = t; for (const d of tanimDinleyicileri) d(); };
export function openDefs(sekme?: TanimSekmesi): void { tanimYaz({ acik: true, sekme: sekme ?? tanim.sekme }); }
export function closeDefs(): void { tanimYaz({ ...tanim, acik: false }); }
export function useTanimlar(): { acik: boolean; sekme: TanimSekmesi } {
  return useSyncExternalStore((d) => { tanimDinleyicileri.add(d); return () => { tanimDinleyicileri.delete(d); }; }, () => tanim, () => tanim);
}

// Klavye yalnız etkin görünümde, yazı alanı odakta değilken ve Tanımlar kapalıyken (prototipin libKey/gKey/prKey/lwKey'i).
export function useTuslar(etkin: boolean, isleyici: (e: KeyboardEvent) => void): void {
  useEffect(() => {
    if (!etkin) return undefined;
    const tus = (e: KeyboardEvent): void => {
      const h = e.target;
      if (h instanceof HTMLElement && (h.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(h.tagName))) return;
      if (tanim.acik) return;
      isleyici(e);
    };
    window.addEventListener('keydown', tus);
    return () => { window.removeEventListener('keydown', tus); };
  }, [etkin, isleyici]);
}
