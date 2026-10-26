import { useEffect, useMemo, useState } from 'react';
import type { TabanVeCanliCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { api, hataIletisi } from '../../../../ortak/veri/api.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { pgKaynakKur, type PgAdim } from './atolye/kurallar.ts';
import type { OkunanPlan } from './kurallar.ts';

// Önceki planla fark (x-resim rsRef, rsDegisenler, rsFarkOzet): tahtadaki plan son canlı planla karşılaştırılır. Eski sayfanın "yayınlanan
// plan"ı yeni ekranda sunucudaki canlı plandır (taban-ve-canli okuması, Plan ve gerçekleşen ile aynı); açıkken okunur, canlı sürüm değişince yenilenir.
export type CanliPlanDurumu = { tur: 'kapali' } | { tur: 'okunuyor' } | { tur: 'hata'; ileti: string } | { tur: 'tamam'; canli: Record<string, PgAdim> };

export function useCanliPlan(acik: boolean, c: PlanlamaCalismasi, p: OkunanPlan | null, canliSurum: number | null): CanliPlanDurumu {
  const [r, setR] = useState<{ cevap: TabanVeCanliCevabi } | { hata: string } | null>(null);
  useEffect(() => {
    if (!acik) return undefined;
    let gecerli = true; setR(null);
    api.get<TabanVeCanliCevabi>('/plan/planlama-calismasi/taban-ve-canli').then(
      (cevap) => { if (gecerli) setR({ cevap }); },
      (h: unknown) => { if (gecerli) setR({ hata: hataIletisi(h, 'Canlı plan okunamadı.') }); },
    );
    return () => { gecerli = false; };
  }, [acik, canliSurum]);
  return useMemo((): CanliPlanDurumu => {
    if (!acik) return { tur: 'kapali' };
    if (!r) return { tur: 'okunuyor' };
    if ('hata' in r) return { tur: 'hata', ileti: r.hata };
    return { tur: 'tamam', canli: p ? pgKaynakKur(r.cevap, c, p).canli : {} };
  }, [acik, r, c, p]);
}

// Karşılaştırma planı: tahtadaki planın işleri canlıdaki yerleriyle; canlıda olmayan iş yerleşmemiş sayılır.
export function canliPlani(p: OkunanPlan, canli: Record<string, PgAdim>): OkunanPlan {
  const ops: OkunanPlan['ops'] = {};
  for (const [id, r] of Object.entries(p.ops)) { const x = canli[id]; ops[id] = x ? { ...r, m: x.m, S: x.S, C: x.C } : { ...r, S: Number.NaN, C: Number.NaN }; }
  return { ...p, ops };
}

// Yeri değişen iş: tahtada yerleşmiş ve canlıda yok, başka tezgâhta ya da çeyrek saatten çok kaymış.
export function degisenler(p: OkunanPlan, canli: Record<string, { m: string; S: number }>): Set<string> {
  const s = new Set<string>();
  for (const [id, b] of Object.entries(p.ops)) { const a = canli[id]; if (Number.isFinite(b.S) && (!a || a.m !== b.m || Math.abs(a.S - b.S) > 0.25)) s.add(id); }
  return s;
}
export function farkOzeti(p: OkunanPlan, canli: Record<string, { m: string; S: number }>): { is: number; tez: number; sip: number } {
  const d = [...degisenler(p, canli)];
  return { is: d.length, tez: new Set(d.map((id) => p.ops[id]?.m)).size, sip: new Set(d.map((id) => p.ops[id]?.job)).size };
}
