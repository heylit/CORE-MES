import type { FocusEvent, KeyboardEvent, ReactNode } from 'react';
import { renkSinifi } from './renk.ts';

// Oto-CAM panelinin ortak parçaları (prototipin sh, cgrid, prmsg, note, kv sınıfları).

export function Baslik({ children, ek, ilk }: { children: ReactNode; ek?: ReactNode; ilk?: boolean }) {
  return <div className={ilk ? 'tc-cc-sh tc-cc-sh-ilk' : 'tc-cc-sh'}>{children}{ek != null && <em>{ek}</em>}</div>;
}

export interface Kutu { k: string; b: ReactNode; i?: ReactNode; ton?: 'iyi' | 'kotu' | 'kisa' }
// Üçlü özet kutuları: küçük başlık, büyük değer, açıklama.
export function Kutular({ kutular }: { kutular: Kutu[] }) {
  return (
    <div className="tc-cc-kutular">
      {kutular.map((x) => (
        <div key={x.k}><small>{x.k}</small><b className={x.ton ? `tc-cc-ton-${x.ton}` : undefined}>{x.b}</b>{x.i != null && <i>{x.i}</i>}</div>
      ))}
    </div>
  );
}

export function Not({ children }: { children: ReactNode }) { return <p className="tc-cc-not">{children}</p>; }

export type MesajTuru = 'err' | 'warn' | 'ok';
const ISARET: Record<MesajTuru, string> = { err: '✕', warn: '!', ok: '✓' };
export function Mesajlar({ satirlar }: { satirlar: { tur: MesajTuru; metin: ReactNode }[] }) {
  return (
    <div className="tc-cc-mesajlar">
      {satirlar.map((s, i) => <div key={i} className={`tc-cc-mesaj-${s.tur}`}><i aria-hidden="true">{ISARET[s.tur]}</i><span>{s.metin}</span></div>)}
    </div>
  );
}

export function RenkOrnegi({ ad }: { ad: string }) { return <i className={`tc-cc-ornek ${renkSinifi(ad)}`} aria-hidden="true" />; }

export function Satir({ k, v }: { k: string; v: ReactNode }) { return <div className="tc-cc-kv"><span>{k}</span><b>{v}</b></div>; }

// Yatay oran çubuğu: SVG yüzdeleriyle (satır içi stil yok).
export function OranCubugu({ oran, sinif }: { oran: number; sinif?: string }) {
  const w = Math.max(0, Math.min(100, oran * 100));
  return (
    <svg className={sinif ? `tc-cc-oran ${sinif}` : 'tc-cc-oran'} viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <rect x={0} y={0} width={+w.toFixed(1)} height={4} rx={1} />
    </svg>
  );
}

// Kaynak bağlantısı: yeni sekmede açılır, uygulama kendisi istek atmaz.
export function Kaynak({ ad, adres }: { ad: string; adres: string }) {
  return <a href={adres} target="_blank" rel="noopener noreferrer">{ad}</a>;
}

// Sayı alanı yazılınca değil, bırakılınca ya da Enter'da işlenir (prototipte change olayı).
export function tamamlaninca(f: (deger: string) => void) {
  return {
    onBlur: (e: FocusEvent<HTMLInputElement>) => { f(e.currentTarget.value); },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') f(e.currentTarget.value); },
  };
}
