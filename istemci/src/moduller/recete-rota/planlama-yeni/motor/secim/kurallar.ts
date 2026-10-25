import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatYaz, type Derleme, type OkunanPlan, type PlanIslemi } from '../kurallar.ts';
import type { Sahne } from '../harita/kurallar.ts';

// Yan panelin seçimi (zl-yan dkSecimVar, zc-tahta tkSecim): iş adımı, sipariş ya da tezgâh; sahnede yeri olmayan seçim panel açmaz.
export type SecimTuru = 'is' | 'siparis' | 'tezgah';
export interface PanelSecimi { tur: SecimTuru; id: string }
export function panelSecimi(p: OkunanPlan, s: Sahne, sec: { adim: string | null; siparis: string | null; tezgah: string | null }, t: number): PanelSecimi | null {
  const r = sec.adim ? p.ops[sec.adim] : undefined;
  if (sec.adim && r) return s.ist[r.m] ? { tur: 'is', id: sec.adim } : null;
  const l = sec.siparis ? s.byJ[sec.siparis] : undefined;
  if (sec.siparis && l) {
    // Panel siparişin şu anki ya da son adımının tezgâhına bağlıdır (eski kartın çapası); o tezgâh sahnede yoksa açılmaz.
    const a = l.find((x) => x.C > t) ?? l[l.length - 1];
    return a && s.ist[a.m] ? { tur: 'siparis', id: sec.siparis } : null;
  }
  return sec.tezgah && s.ist[sec.tezgah] ? { tur: 'tezgah', id: sec.tezgah } : null;
}

// Tezgâh adı: fason tezgâh "@" olmadan, "(fason)" ekiyle (kmSiparis yolculuk).
export const tezgahYazi = (m: string): string => (m.startsWith('@') ? `${m.slice(1)} (fason)` : m);

// Siparişin yolculuğu (kmSiparis): adımlar başlangıç sırasıyla; şimdiki ve biten adım işaretli.
export interface YolculukAdimi { r: PlanIslemi; simdi: boolean; bitti: boolean; zaman: string }
export function yolculuk(c: PlanlamaCalismasi, s: Sahne, j: string, t: number): YolculukAdimi[] {
  return (s.byJ[j] ?? []).slice().sort((a, b) => a.S - b.S).map((r) => ({
    r, simdi: r.S <= t && r.C > t, bitti: r.C <= t, zaman: `${saatYaz(c.D, r.S).slice(6)} → ${saatYaz(c.D, r.C).slice(10)}`,
  }));
}

// Ek mesai adayları (q-studyo stMesaiAdaylari): önümüzdeki beş günde tezgâhın çalışmadığı vardiyalar, eklenmiş olanlar hariç; en çok on.
export interface MesaiAdayi { gun: number; vardiya: string; ad: string }
export function mesaiAdaylari(c: PlanlamaCalismasi, cx: Derleme, m: string): MesaiAdayi[] {
  const D = c.D; const t = D.tezgahlar.find((x) => x.id === m); const tv = t?.vardiyalar ?? [];
  if (!t || !tv.length) return [];
  const d0 = Math.floor(cx.now / 24);
  const var_ = new Set(c.ekMesai.filter((e) => e.m === m).map((e) => `${String(e.gun)}/${String(e.vardiya)}`));
  const l: MesaiAdayi[] = [];
  for (let g = 0; g < 5; g++) {
    for (const v of D.vardiyalar ?? []) {
      const id = String(v.id ?? '');
      if (!id || tv.includes(id) || var_.has(`${d0 + g}/${id}`)) continue;
      l.push({ gun: d0 + g, vardiya: id, ad: `${saatYaz(D, (d0 + g) * 24).slice(0, 9)} ${id} ${String(v.bas ?? '')}-${String(v.bit ?? '')}` });
    }
  }
  return l.slice(0, 10);
}
