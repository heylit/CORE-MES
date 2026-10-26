import type { KeyboardEvent } from 'react';
import { cubukAraligi, genislik, gunCizgileri, konum, type Olcek } from './olcek.ts';
import './cizelge.css';

// Ortak plan çizelgesi tuvali (tahta, tezgâh panosu, atölye): kaynak başına bir satır, satırda saat eksenli çubuklar. Etiket sütunu
// HTML'dir ve yatay kaydırmada solda kalır; çubuklar satır başına bir SVG'dir, koordinatlar öznitelik olarak verilir (rota KaynakCizelgesi
// kalıbı). Renk ve görünüm `sinif` ile parçadan gelir; tuval yalnız konum hesaplar.
export interface CizelgeCubugu { anahtar: string; bas: number; bit: number; etiket: string; ipucu?: string; sinif?: string }
export interface CizelgeSatiri { anahtar: string; baslik: string; altBaslik?: string; cubuklar: readonly CizelgeCubugu[] }

const SATIR = 34;
const EKSEN = 24;
// Etiket yazılacak en dar çubuk (ekran birimi).
const ETIKET_EN = 70;

export function Cizelge({ etiket, olcek, satirlar, simdi, secili, sec, gunEtiketi }: {
  etiket: string;
  olcek: Olcek;
  satirlar: readonly CizelgeSatiri[];
  simdi?: number | null;
  secili?: string | null;
  sec?: (anahtar: string) => void;
  gunEtiketi?: (saat: number) => string;
}) {
  const EN = genislik(olcek);
  const gunler = gunCizgileri(olcek);
  const simdiX = simdi == null || simdi < olcek.bas || simdi > olcek.bit ? null : konum(olcek, simdi);
  const tus = (anahtar: string) => (o: KeyboardEvent<SVGGElement>) => {
    if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); sec?.(anahtar); }
  };
  return (
    <div className="tc-pyc-kap" role="group" aria-label={etiket}>
      <div className="tc-pyc-ic">
        <div className="tc-pyc-satir">
          <div className="tc-pyc-etiket" />
          <svg className="tc-pyc-iz" width={EN} height={EKSEN} viewBox={`0 0 ${EN} ${EKSEN}`} aria-hidden="true">
            {gunEtiketi && gunler.map((s) => <text key={s} className="tc-pyc-gun" x={konum(olcek, s) + 4} y={EKSEN - 8}>{gunEtiketi(s)}</text>)}
          </svg>
        </div>
        {satirlar.map((r) => (
          <div className="tc-pyc-satir" key={r.anahtar} data-satir={r.anahtar}>
            <div className="tc-pyc-etiket" title={r.baslik}><span>{r.baslik}</span>{r.altBaslik !== undefined && <small>{r.altBaslik}</small>}</div>
            <svg className="tc-pyc-iz" width={EN} height={SATIR} viewBox={`0 0 ${EN} ${SATIR}`} role="presentation">
              {gunler.map((s) => <line key={s} className="tc-pyc-cizgi" x1={konum(olcek, s)} x2={konum(olcek, s)} y1={0} y2={SATIR} />)}
              {simdiX !== null && <line className="tc-pyc-simdi" x1={simdiX} x2={simdiX} y1={0} y2={SATIR} />}
              {r.cubuklar.map((c) => {
                const a = cubukAraligi(olcek, c.bas, c.bit);
                if (a === null) return null;
                return (
                  <g
                    key={c.anahtar} data-cubuk={c.anahtar} aria-label={c.etiket}
                    className={`tc-pyc-cubuk${c.sinif ? ` ${c.sinif}` : ''}${secili === c.anahtar ? ' tc-secili' : ''}`}
                    {...(sec ? { role: 'button', tabIndex: 0, onClick: () => { sec(c.anahtar); }, onKeyDown: tus(c.anahtar) } : {})}
                  >
                    <title>{c.ipucu ?? c.etiket}</title>
                    <rect className="tc-pyc-renk" x={a.x} y={4} width={a.en} height={SATIR - 8} rx={4} />
                    {a.en > ETIKET_EN && <text className="tc-pyc-yazi" x={a.x + 4} y={21}>{c.etiket}</text>}
                  </g>
                );
              })}
            </svg>
          </div>
        ))}
      </div>
    </div>
  );
}
