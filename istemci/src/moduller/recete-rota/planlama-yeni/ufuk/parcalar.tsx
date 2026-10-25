import { useEffect, useState, type ReactNode } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';

// P5'in küçük ortak parçaları: biçim, gösterge şeridi, seçim düğmeleri ve sayı girdisi (eski sayfanın sayi, agTL, ymKpi, pm-seg, ymSayi'si).

const bicimler = new Map<number, Intl.NumberFormat>();
// Veri yoksa "—"; sıfır uydurulmaz.
export function sayi(x: number | null | undefined, k = 1): string {
  if (x === null || x === undefined || !Number.isFinite(x)) return '—';
  let b = bicimler.get(k);
  if (!b) { b = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: k, minimumFractionDigits: 0 }); bicimler.set(k, b); }
  return b.format(x);
}
export const tl = (x: number | null | undefined): string => (x === null || x === undefined || !Number.isFinite(x) ? '—' : `${sayi(Math.round(x), 0)} TL`);

export type Ton = 'tamam' | 'uyari' | 'hata';
export interface Gosterge { simge: SimgeAdi; ad: string; deger: string; alt?: string; ton?: Ton }

export function GostergeSeridi({ l }: { l: readonly Gosterge[] }) {
  return (
    <div className="tc-pyu-kpi">
      {l.map((g) => (
        <div key={g.ad} className="tc-pyu-kpi-kutu" data-ton={g.ton}>
          <small><Simge ad={g.simge} boyut="k" />{g.ad}</small>
          <b className="mono">{g.deger}</b>
          {g.alt && <span>{g.alt}</span>}
        </div>
      ))}
    </div>
  );
}

export function SecimDugmeleri<D extends string>({ etiket, secenekler, secili, sec, kapali }: {
  etiket: string; secenekler: readonly (readonly [D, string, SimgeAdi?])[]; secili: D; sec: (d: D) => void; kapali?: boolean;
}) {
  return (
    <div className="tc-pyu-seg" role="group" aria-label={etiket}>
      {secenekler.map(([d, ad, simge]) => (
        <button key={d} type="button" aria-pressed={d === secili} disabled={kapali} onClick={() => { if (d !== secili) sec(d); }}>
          {simge && <Simge ad={simge} boyut="k" />}{ad}
        </button>
      ))}
    </div>
  );
}

// Sayı girdisi: değişiklik alan bırakılınca ya da Enter'la yazılır; boş değer null'dur. Geçersizse eski değere döner.
export function SayiGirdisi({ etiket, deger, yaz, gecersiz, min = 0, max, adim, yer, kapali }: {
  etiket: string; deger: number | null; yaz: (v: number | null) => void; gecersiz: () => void; min?: number; max?: number; adim?: number; yer?: string; kapali?: boolean;
}) {
  const dis = deger === null ? '' : String(deger);
  const [metin, metinYaz] = useState(dis);
  useEffect(() => { metinYaz(dis); }, [dis]);
  const bitir = (): void => {
    if (metin === dis) return;
    const v = metin.trim() === '' ? null : Number(metin.replace(',', '.'));
    if (v !== null && (!Number.isFinite(v) || v < min || (max !== undefined && v > max))) { metinYaz(dis); gecersiz(); return; }
    yaz(v);
  };
  return (
    <input
      className="tc-alan-kutu tc-pyu-sayi" type="number" inputMode="decimal" aria-label={etiket} value={metin} min={min} max={max} step={adim ?? 'any'}
      placeholder={yer ?? '—'} disabled={kapali}
      onChange={(o) => { metinYaz(o.target.value); }} onBlur={bitir} onKeyDown={(o) => { if (o.key === 'Enter') bitir(); }}
    />
  );
}

export function Not({ children, ton }: { children: ReactNode; ton?: Ton }) {
  return ton ? <p className="tc-pyu-uyari" data-ton={ton}><Simge ad="alert" boyut="k" />{children}</p> : <p className="tc-pyu-not">{children}</p>;
}
