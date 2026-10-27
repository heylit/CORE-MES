import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';
import { ST_TXT } from './cekirdek.ts';

// Panellerin ortak küçük parçaları: anahtar-değer satırı, durum özet şeridi, açılır bölüm.

export function Kv({ k, children }: { k: string; children: ReactNode }) {
  return <div className="tc-co-kv"><span>{k}</span><b>{children}</b></div>;
}

type Ton = 'over' | 'crit' | 'warn' | 'ok';
export function Ozet({ satirlar }: { satirlar: readonly { ton: Ton; sayi: number; ad: string }[] }) {
  return (
    <div className={`tc-co-ozet tc-co-ozet-${satirlar.length}`}>
      {satirlar.map((s) => <span key={s.ad} className={`tc-co-sc tc-co-sc-${s.ton}`}><b>{s.sayi}</b>{s.ad}</span>)}
    </div>
  );
}

export const durumOzeti = (n: Record<Ton, number>) =>
  (['over', 'crit', 'warn', 'ok'] as const).map((k) => ({ ton: k, sayi: n[k], ad: ST_TXT[k] }));

export const depoOzeti = (n: { short: number; low: number; ok: number }) => [
  { ton: 'over' as const, sayi: n.short, ad: 'Eksik' }, { ton: 'warn' as const, sayi: n.low, ad: 'Kritik' }, { ton: 'ok' as const, sayi: n.ok, ad: 'Yeterli' },
];

export function Bolum({ baslik, ek, acik, degisti, children }: {
  baslik: ReactNode; ek?: ReactNode; acik?: boolean; degisti?: (acik: boolean) => void; children: ReactNode;
}) {
  return (
    <details className="tc-co-bolum" open={acik} onToggle={(e) => degisti?.(e.currentTarget.open)}>
      <summary>{baslik}{ek != null && <em>{ek}</em>}</summary>
      {children}
    </details>
  );
}

export const Baslik = ({ children }: { children: ReactNode }) => <div className="tc-co-sh">{children}</div>;
export const Not = ({ children }: { children: ReactNode }) => <p className="tc-co-not">{children}</p>;
export const Uyari = ({ children }: { children: ReactNode }) => <div className="tc-co-uyari">{children}</div>;

// Sayı alanı prototipteki "change" olayıyla yazar: alan bırakılınca ya da Enter'da (her tuşta değil).
export function degisince(yaz: (deger: string) => void) {
  return {
    onBlur: (e: FocusEvent<HTMLInputElement>) => { if (e.currentTarget.value !== e.currentTarget.defaultValue) yaz(e.currentTarget.value); },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') e.currentTarget.blur(); },
  };
}
