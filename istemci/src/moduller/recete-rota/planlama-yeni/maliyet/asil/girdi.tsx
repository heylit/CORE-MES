import { type FocusEvent, type KeyboardEvent, type ReactNode } from 'react';
import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import { Simge, useBildirim } from '../../../../../ortak/arayuz/index.ts';
import { sayiGirdisi, sayiOku } from '../kurallar.ts';

// "Tüm satırlar"ın parçaları: bugünkü sayfanın kartı, gösterge sırası, satır içi girdi ve iki düğmeli seçim (zu-yan-sayfalar kart, ymKpi,
// ymSayi, pm-seg). Satır içi girdi alandan çıkınca ya da Enter'da tek değişiklik olarak yazar (sayfanın "change" olayı).

// Plan motoru tarayıcıda yoktur: motorla ölçülen öneriler motor bağlanınca açılır (357 b).
export const MOTOR_KAPALI = 'Plan motoru bağlanınca açılır.';

export function AsilKart({ simge, baslik, eylem, children }: { simge: SimgeAdi; baslik: string; eylem?: ReactNode; children: ReactNode }) {
  return (
    <section className="tc-kart tc-pyk-akart" aria-label={baslik}>
      <header className="tc-kart-ust">
        <h3 className="tc-kart-baslik tc-pyk-kb"><Simge ad={simge} boyut="k" />{baslik}</h3>
        {eylem && <div className="tc-kart-sag">{eylem}</div>}
      </header>
      {children}
    </section>
  );
}

export type KpiSatiri = [SimgeAdi, string, string, string, ('uyari' | 'hata' | 'tamam' | '')?];
export function Kpi({ l }: { l: KpiSatiri[] }) {
  return (
    <div className="tc-pyk-kpi">
      {l.map(([sm, ad, d, alt, ton]) => (
        <div key={ad} data-ton={ton || undefined}><small><Simge ad={sm} boyut="k" />{ad}</small><b className="tc-pyk-mono">{d}</b><span>{alt}</span></div>
      ))}
    </div>
  );
}

export function Not({ children }: { children: ReactNode }) { return <p className="tc-pyk-soluk">{children}</p>; }
export function AltNot({ children }: { children: ReactNode }) { return <small className="tc-pyk-alt">{children}</small>; }

// Fiyat, maliyet ve kâr bilgisi yetkisi olmayana kart yerine kilit (ymKilit).
export function Kilit({ ad }: { ad: string }) {
  return (
    <AsilKart simge="lock" baslik={ad}>
      <Not>Fiyat, maliyet ve kâr bilgisini maliyet okuma yetkisi olan görür ve girer.</Not>
    </AsilKart>
  );
}

const yazilan = (v: number | null | undefined): string => (v === null || v === undefined ? '' : String(v));

export function SayiGir({ deger, ad, yaz, min = 0, max, adim, yer = '—', kapali = false, bosOlmaz = false }: {
  deger: number | null | undefined; ad: string; yaz: (v: number | null) => boolean; min?: number; max?: number; adim?: number; yer?: string;
  kapali?: boolean; bosOlmaz?: boolean;
}) {
  const { bildir } = useBildirim();
  const eski = yazilan(deger);
  const geri = (el: HTMLInputElement) => { el.value = eski; };
  const bitir = (el: HTMLInputElement) => {
    if (el.value.trim() === eski) return;
    const s = sayiGirdisi(el.value, { min, max });
    if (!s.tamam || (bosOlmaz && s.deger === null)) { bildir('hata', 'Geçerli bir sayı girin.'); geri(el); return; }
    if (sayiOku(deger) === s.deger) { geri(el); return; }
    if (!yaz(s.deger)) geri(el);
  };
  return (
    <input
      key={eski} className="tc-alan-kutu tc-pyk-sayi" type="text" inputMode="decimal" defaultValue={eski} placeholder={yer}
      aria-label={ad} disabled={kapali} data-adim={adim}
      onBlur={(o: FocusEvent<HTMLInputElement>) => { bitir(o.currentTarget); }}
      onKeyDown={(o: KeyboardEvent<HTMLInputElement>) => { if (o.key === 'Enter') { o.preventDefault(); bitir(o.currentTarget); } else if (o.key === 'Escape') geri(o.currentTarget); }}
    />
  );
}

export function MetinGir({ deger, ad, yaz, kapali = false }: { deger: string; ad: string; yaz: (v: string) => boolean; kapali?: boolean }) {
  const bitir = (el: HTMLInputElement) => { const v = el.value.trim(); if (!v || v === deger) { el.value = deger; return; } if (!yaz(v)) el.value = deger; };
  return (
    <input
      key={deger} className="tc-alan-kutu tc-pyk-metin" defaultValue={deger} aria-label={ad} disabled={kapali}
      onBlur={(o) => { bitir(o.currentTarget); }}
      onKeyDown={(o) => { if (o.key === 'Enter') { o.preventDefault(); bitir(o.currentTarget); } }}
    />
  );
}

export function SecimGir({ deger, ad, secenek, yaz, kapali = false }: {
  deger: string; ad: string; secenek: readonly (readonly [string, string])[]; yaz: (v: string) => void; kapali?: boolean;
}) {
  return (
    <select className="tc-alan-kutu tc-pyk-secim" value={deger} aria-label={ad} disabled={kapali} onChange={(o) => { yaz(o.target.value); }}>
      {secenek.map(([k, n]) => <option key={k} value={k}>{n}</option>)}
    </select>
  );
}

export function Segment({ ad, secenek, deger, sec, kapali = false }: {
  ad: string; secenek: readonly (readonly [string, string])[]; deger: string; sec: (v: string) => void; kapali?: boolean;
}) {
  return (
    <div className="tc-pyk-seg" role="group" aria-label={ad}>
      {secenek.map(([k, n]) => (
        <button key={k} type="button" aria-pressed={deger === k} disabled={kapali} onClick={() => { if (deger !== k) sec(k); }}>{n}</button>
      ))}
    </div>
  );
}

export function Alan({ ad, children }: { ad: string; children: ReactNode }) {
  return <label className="tc-pyk-alan"><span>{ad}</span>{children}</label>;
}
