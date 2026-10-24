import { useRef, type PointerEvent } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { clamp } from '../bicim.ts';
import { fmtT } from '../hesap/gkod.ts';
import type { CizelgeParcasi } from './oynatma.ts';

// Oynatma cubugu (prototipin .transport'u): basa, onceki, oynat/duraklat, sonraki, sona; takim bazinda zaman cizelgesi, sure, hiz.
export type OynatmaEylemi = 'start' | 'prev' | 'play' | 'next' | 'end';

export interface CizelgeDilimi extends CizelgeParcasi { ad: string; uyumsuz: boolean; renkSinifi: string }

interface Ozellikler {
  oynuyor: boolean;
  zaman: number;
  toplam: number;
  dilimler: readonly CizelgeDilimi[];
  hiz: string;
  hizSec: (h: string) => void;
  eylem: (a: OynatmaEylemi) => void;
  git: (t: number) => void;
}

const HIZLAR = [['auto', 'Hız: otomatik'], ['1', '1× gerçek'], ['5', '5×'], ['20', '20×'], ['100', '100×'], ['500', '500×']] as const;

const yuzde = (el: HTMLElement | null, ad: string, v: number) => { el?.style.setProperty(ad, `${v}%`); };

export function Oynatici({ oynuyor, zaman, toplam, dilimler, hiz, hizSec, eylem, git }: Ozellikler) {
  const cizelge = useRef<HTMLDivElement>(null);
  const surukle = useRef(false);
  const ara = (e: PointerEvent<HTMLDivElement>) => {
    const r = cizelge.current?.getBoundingClientRect();
    if (!r || r.width <= 0 || !toplam) return;
    git(clamp((e.clientX - r.left) / r.width, 0, 1) * toplam);
  };
  return (
    <div className="tc-ch-oynatici">
      <Dugme simge="first" aria-label="Başa (Home)" title="Başa (Home)" onClick={() => { eylem('start'); }} />
      <Dugme simge="chev-left" aria-label="Önceki hareket (←)" title="Önceki hareket (←)" onClick={() => { eylem('prev'); }} />
      <Dugme tur="birincil" simge={oynuyor ? 'pause' : 'play'} aria-label="Oynat / duraklat (Boşluk)" title="Oynat / duraklat (Boşluk)" onClick={() => { eylem('play'); }} />
      <Dugme simge="chev-right" aria-label="Sonraki hareket (→)" title="Sonraki hareket (→)" onClick={() => { eylem('next'); }} />
      <Dugme simge="last" aria-label="Sona (End)" title="Sona (End)" onClick={() => { eylem('end'); }} />
      <div
        ref={cizelge} className="tc-ch-cizelge" title="Tıkla / sürükle: o ana git" role="slider" tabIndex={0}
        aria-label="Program zamanı" aria-valuemin={0} aria-valuemax={Math.round(toplam * 60)} aria-valuenow={Math.round(zaman * 60)} aria-valuetext={fmtT(zaman)}
        onPointerDown={(e) => { surukle.current = true; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yakalama desteklenmiyorsa surukleme yine calisir */ } ara(e); }}
        onPointerMove={(e) => { if (surukle.current) ara(e); }}
        onPointerUp={() => { surukle.current = false; }} onPointerCancel={() => { surukle.current = false; }}
      >
        {dilimler.map((s) => {
          const genis = toplam ? (s.e - s.s) / toplam * 100 : 0;
          return (
            <div
              key={s.s} className={'tc-ch-dilim ' + s.renkSinifi + (s.uyumsuz ? ' tc-ch-dilim-uyumsuz' : '')} title={'T' + s.T + ' · ' + s.ad + ' · ' + fmtT(s.e - s.s)}
              ref={(el) => { yuzde(el, '--tc-ch-sol', toplam ? s.s / toplam * 100 : 0); yuzde(el, '--tc-ch-en', genis); }}
            >{genis > 5 ? 'T' + s.T : ''}</div>
          );
        })}
        <div className="tc-ch-imlec" ref={(el) => { yuzde(el, '--tc-ch-sol', toplam ? zaman / toplam * 100 : 0); }} />
      </div>
      <span className="tc-ch-sure">{fmtT(zaman)} / {fmtT(toplam)}</span>
      <select className="tc-ch-hiz" aria-label="Oynatma hızı" title="Oynatma hızı" value={hiz} onChange={(e) => { hizSec(e.target.value); }}>
        {HIZLAR.map(([d, b]) => <option key={d} value={d}>{b}</option>)}
      </select>
    </div>
  );
}
