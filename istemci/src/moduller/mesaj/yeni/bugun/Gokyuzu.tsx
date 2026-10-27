import { useId, useState, type ReactNode } from 'react';

// Prototipin hero'su: günün saatine göre gökyüzü (şafak, gün, akşam, gece), yayda ilerleyen güneş ya da ay ve fabrika
// silüeti. Konumlar SVG yüzdeleriyle verilir (satır içi stil yok); renkler bugun.css'te tasarım değişkenleriyle.
export type Evre = 'dawn' | 'day' | 'dusk' | 'night';
export const evre = (saat: number): Evre => (saat < 5 || saat >= 21 ? 'night' : saat < 8 ? 'dawn' : saat < 17 ? 'day' : 'dusk');

const FABRIKA = (() => {
  let d = 'M0 90V58';
  let x = 0;
  for (let i = 0; i < 6; i++) { d += `L${String(x + 34)} 38V58`; x += 34; d += `H${String(x)}`; }
  d += 'H214V22H226V58H246V30H352V58';
  x = 352;
  for (let i = 0; i < 7; i++) { d += `L${String(x + 36)} 40V58`; x += 36; }
  return `${d}H640V90Z`;
})();
const PENCERELER = Array.from({ length: 12 }, (_, i) => ({ r: Math.floor(i / 6), c: i % 6 }));

// Güneş ilk açılışta yükselir; sonraki çizimlerde yerinde durur (S.heroShown).
let yukseldi = false;

export function Gokyuzu({ saat, children }: { saat: number; children: ReactNode }) {
  const e = evre(saat);
  const p = Math.max(0, Math.min(1, (saat - 6) / 15));
  const cx = e === 'night' ? 78 : 6 + p * 82;
  const cy = e === 'night' ? 18 : 64 - Math.sin(p * Math.PI) * 50;
  const kirpma = useId();
  const [yuksel] = useState(() => { const y = !yukseldi; yukseldi = true; return y; });
  const yuzde = (n: number) => `${n.toFixed(1)}%`;
  return (
    <div className={`tc-mb-gok tc-mb-gok-${e}`}>
      <svg className={`tc-mb-gok-cizim${yuksel ? ' tc-mb-yuksel' : ''}`} width="100%" height="100%" aria-hidden="true">
        {e === 'night' ? (
          <g className="tc-mb-ay">
            <clipPath id={kirpma}><circle cx={yuzde(cx)} cy={yuzde(cy)} r={31} /></clipPath>
            <circle className="tc-mb-ay-golge" cx={yuzde(cx)} cy={yuzde(cy)} r={31} />
            <circle clipPath={`url(#${kirpma})`} cx={yuzde(cx)} cy={yuzde(cy)} r={31} transform="translate(-7 -3)" />
          </g>
        ) : (
          <g className="tc-mb-gunes">
            <circle className="tc-mb-hale-2" cx={yuzde(cx)} cy={yuzde(cy)} r={60} />
            <circle className="tc-mb-hale" cx={yuzde(cx)} cy={yuzde(cy)} r={45} />
            <circle cx={yuzde(cx)} cy={yuzde(cy)} r={31} />
          </g>
        )}
      </svg>
      <svg className="tc-mb-fabrika" viewBox="0 0 640 90" preserveAspectRatio="xMidYMax slice" aria-hidden="true">
        <path d={FABRIKA} />
        {PENCERELER.map(({ r, c }) => (
          <rect key={`${String(r)}-${String(c)}`} className={(r + c) % 3 === 0 ? 'tc-mb-pencere tc-mb-pencere-acik' : 'tc-mb-pencere'} x={256 + c * 15} y={38 + r * 12} width={8} height={6} rx={1} />
        ))}
        <circle className="tc-mb-duman" cx={220} cy={12} r={6} />
        <circle className="tc-mb-duman" cx={230} cy={4} r={4} />
      </svg>
      <div className="tc-mb-gok-metin">{children}</div>
    </div>
  );
}

// Prototipteki fincan (Masan tertemiz).
export function Fincan() {
  return (
    <svg className="tc-mb-fincan" viewBox="0 0 120 92" width="112" aria-hidden="true">
      <ellipse className="tc-mb-fincan-golge" cx="60" cy="84" rx="44" ry="6" />
      <rect className="tc-mb-fincan-govde" x="36" y="40" width="44" height="42" rx="10" />
      <path className="tc-mb-fincan-kulp" d="M80 50h5a10 10 0 010 20h-5" />
      <path className="tc-mb-fincan-buhar" d="M50 32c-5-7 5-9 0-18M62 32c-5-7 5-9 0-18" />
    </svg>
  );
}
