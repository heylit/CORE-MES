import type { ReactNode } from 'react';
import type { MakineDurumu } from '../../../../ortak/arayuz/index.ts';

// Raporların küçük ortak parçaları. Satır içi stil yazılmaz: oran çubuğu SVG özniteliğiyle çizilir, renk data-durum'dan gelir.

// Yatay oran çubuğu (prototip .bar > i, .progress): oran 0..1; bilinmiyorsa boş yol.
export function Cubuk({ oran, durum, etiket }: { oran: number | null; durum?: MakineDurumu | undefined; etiket?: string }) {
  const g = oran === null ? 0 : Math.max(0, Math.min(1, oran)) * 100;
  return (
    <svg className="tc-fr-cubuk" viewBox="0 0 100 8" preserveAspectRatio="none" data-durum={durum} role={etiket ? 'img' : undefined} aria-label={etiket} aria-hidden={etiket ? undefined : true}>
      <rect className="tc-fr-cubuk-yol" x={0} y={0} width={100} height={8} rx={4} />
      {g > 0 && <rect className="tc-fr-cubuk-dolu" x={0} y={0} width={g} height={8} rx={4} />}
    </svg>
  );
}

// Tek seçimli düğme şeridi (prototip .seg): aria-pressed ile.
export function Serit<D extends string | number>({ etiket, secenekler, secili, sec }: {
  etiket: string; secenekler: readonly { deger: D; baslik: ReactNode }[]; secili: D; sec: (d: D) => void;
}) {
  return (
    <div className="tc-fr-serit" role="group" aria-label={etiket}>
      {secenekler.map((s) => (
        <button key={String(s.deger)} type="button" className="tc-fr-serit-dugme" aria-pressed={s.deger === secili} onClick={() => sec(s.deger)}>{s.baslik}</button>
      ))}
    </div>
  );
}

// Ad ve değer satırı (prototip .metric-row).
export function Satir({ ad, children, ton }: { ad: ReactNode; children: ReactNode; ton?: MakineDurumu | undefined }) {
  return (
    <div className="tc-fr-satir">
      <span>{ad}</span>
      <b className="tc-fr-deger" data-durum={ton}>{children}</b>
    </div>
  );
}

// Açılır yöntem ya da açıklama (prototip details.method).
export function Aciklama({ baslik, children }: { baslik: string; children: ReactNode }) {
  return (
    <details className="tc-fr-yontem">
      <summary>{baslik}</summary>
      <div className="tc-fr-yontem-ic">{children}</div>
    </details>
  );
}

export const Formul = ({ children }: { children: ReactNode }) => <code className="tc-fr-formul">{children}</code>;
export const Not = ({ children }: { children: ReactNode }) => <p className="tc-fr-not">{children}</p>;

// Kazanç ve kayıp tonu (prototip .pos / .neg / .warn).
export const isaretTonu = (v: number | null): MakineDurumu | undefined => (v === null ? undefined : v < 0 ? 'durdu' : undefined);

// Sağlık skoru göstergesi (prototip gauge): yarım daire yay, ortada skor. Prototipin kendi çizimidir; ortak Kadran'a çevrilmez.
export function SkorGostergesi({ skor, durum }: { skor: number | null; durum?: MakineDurumu | undefined }) {
  const s = skor ?? 0, a = Math.PI * (1 - s / 100), r = 80, cx = 100, cy = 100;
  const x = cx + r * Math.cos(a), y = cy - r * Math.sin(a);
  return (
    <svg className="tc-fr-gosterge-yay" viewBox="0 0 200 118" role="img" aria-label={`Finansal sağlık skoru ${skor ?? 'yok'} / 100`} data-durum={durum}>
      <path className="tc-fr-yay-yol" d="M20 100 A80 80 0 0 1 180 100" />
      {skor !== null && <path className="tc-fr-yay-dolu" d={`M20 100 A80 80 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`} />}
      <text className="tc-fr-yay-sayi" x={100} y={88} textAnchor="middle" fontSize={40} fontWeight={800}>{skor ?? '—'}</text>
      <text className="tc-fr-yay-alt" x={100} y={110} textAnchor="middle" fontSize={12}>100 üzerinden</text>
    </svg>
  );
}

// Yan yana dilimli çubuk (prototip .ccc-track): dilimler aynı ölçekte, toplam 0..1 arası.
export function DilimliCubuk({ dilimler, etiket }: { dilimler: readonly { oran: number; sinif: string }[]; etiket: string }) {
  let bas = 0;
  return (
    <svg className="tc-fr-cubuk tc-fr-dilimli" viewBox="0 0 100 8" preserveAspectRatio="none" role="img" aria-label={etiket}>
      <rect className="tc-fr-cubuk-yol" x={0} y={0} width={100} height={8} rx={4} />
      {dilimler.map((d, i) => {
        const g = Math.max(0, Math.min(1, d.oran)) * 100;
        const x = bas; bas += g;
        return g > 0 ? <rect key={i} className={d.sinif} x={x} y={0} width={g} height={8} /> : null;
      })}
    </svg>
  );
}
