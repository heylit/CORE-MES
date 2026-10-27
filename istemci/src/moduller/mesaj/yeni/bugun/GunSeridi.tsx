import { useEffect, useRef, type KeyboardEvent } from 'react';
import { SIMGELER } from '../../../../ortak/tasarim/simgeler.ts';
import { H, saatDakika } from '../bicim.ts';
import type { GunSeridi as Serit, SeritOgesi } from './kurallar.ts';

// Saat başına genişlik ve en kısa toplantı bloğu prototiptekiyle aynı; çizim SVG öznitelikleriyle konumlanır (satır içi stil yok).
const SAAT_GENIS = 64;
const EN_AZ_GENIS = 600;
const EN_AZ_BLOK = 168;
const BOY = 120;
const SERIT_Y = [22, 54] as const;
const BLOK_BOY = 28;
const IGNE_Y = 100;

const SIMGE = { gorev: 'check', siparis: 'box', zamanli: 'clock' } as const;

interface Ozellikler {
  serit: Serit;
  simdi: number;
  ac: (oge: SeritOgesi) => void;
}

export function GunSeridi({ serit, simdi, ac }: Ozellikler) {
  const kutu = useRef<HTMLDivElement>(null);
  const span = serit.sonSaat - serit.ilkSaat;
  const genis = Math.max(EN_AZ_GENIS, span * SAAT_GENIS);
  const gunBasi = new Date(simdi).setHours(0, 0, 0, 0);
  const x = (ts: number) => ((ts - gunBasi) / H - serit.ilkSaat) / span * genis;
  const simdiX = x(simdi);

  // Açılışta şimdi iğnesi görünür alanın üçte birine kaydırılır.
  useEffect(() => {
    const k = kutu.current;
    if (k) k.scrollLeft = Math.max(0, simdiX - k.clientWidth * 0.35);
  // Yalnız ilk çizimde; kullanıcının kaydırması korunur.
  }, []);

  const tus = (o: KeyboardEvent, oge: SeritOgesi) => {
    if (o.key === 'Enter' || o.key === ' ') { o.preventDefault(); ac(oge); }
  };
  const saatler = Array.from({ length: span + 1 }, (_, i) => serit.ilkSaat + i);

  return (
    <div ref={kutu} className="tc-mb-serit" role="group" aria-label="Bugünün akışı">
      <svg width={genis} height={BOY} viewBox={`0 0 ${String(genis)} ${String(BOY)}`} className="tc-mb-serit-cizim">
        {saatler.map((s, i) => {
          const sx = i / span * genis;
          return (
            <g key={s} className={i === 0 || i === span ? 'tc-mb-saat tc-mb-saat-uc' : 'tc-mb-saat'}>
              <line x1={sx} x2={sx} y1={18} y2={BOY} />
              <text x={sx + 4} y={12}>{String(s % 24).padStart(2, '0')}</text>
            </g>
          );
        })}
        {serit.ogeler.filter((o) => o.tur === 'toplanti').map((o) => {
          const bx = x(o.bas);
          const bw = Math.max(x(o.bit ?? o.bas) - bx, EN_AZ_BLOK);
          const etiket = `${saatDakika(o.bas)} ${o.baslik}`;
          return (
            <g
              key={o.id} role="button" tabIndex={0} aria-label={etiket}
              className={`tc-mb-blok${(o.bit ?? o.bas) < simdi ? ' tc-mb-blok-gecti' : ''}`}
              onClick={() => ac(o)} onKeyDown={(e) => tus(e, o)}
            >
              <title>{etiket}</title>
              <rect x={bx} y={SERIT_Y[o.serit]} width={bw} height={BLOK_BOY} rx={6} />
              <text x={bx + 8} y={SERIT_Y[o.serit] + 18}>{etiket.length > 26 ? `${etiket.slice(0, 25)}…` : etiket}</text>
            </g>
          );
        })}
        {serit.ogeler.filter((o) => o.tur !== 'toplanti').map((o) => {
          const px = x(o.bas);
          const etiket = `${saatDakika(o.bas)} ${o.baslik}`;
          return (
            <g
              key={`${o.tur}-${o.id}`} role="button" tabIndex={0} aria-label={etiket}
              className={`tc-mb-igne-oge tc-mb-igne-${o.tur}`}
              onClick={() => ac(o)} onKeyDown={(e) => tus(e, o)}
            >
              <title>{etiket}</title>
              <circle cx={px} cy={IGNE_Y} r={12} />
              <path d={SIMGELER[SIMGE[o.tur as Exclude<typeof o.tur, 'toplanti'>]]} transform={`translate(${String(px - 8)} ${String(IGNE_Y - 8)}) scale(0.667)`} />
            </g>
          );
        })}
        <g className="tc-mb-simdi" aria-hidden="true">
          <line x1={simdiX} x2={simdiX} y1={16} y2={BOY} />
          <text x={simdiX + 4} y={BOY - 4}>{saatDakika(simdi)}</text>
        </g>
        {serit.ogeler.length === 0 && <text className="tc-mb-serit-bos" x={genis / 2} y={BOY / 2 + 6}>Bugün takviminde bir şey yok</text>}
      </svg>
    </div>
  );
}
