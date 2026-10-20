import { useEffect, useId, useState } from 'react';
import type { Durak } from './iplik.ts';

const ARA = 150;
const YUKSEKLIK = 250;
const ORTA = 125;
const SALINIM = 38;
const SURE_MS = 2400;
const AZAMI_HARF = 22;

const kisalt = (m: string) => (m.length > AZAMI_HARF ? `${m.slice(0, AZAMI_HARF - 1)}…` : m);

// Sade hareket seçiminde, işletim sistemi azaltılmış hareket istediğinde ya da ortam bunu söyleyemediğinde iplik tam çizili gelir.
function hareketsizMi(): boolean {
  if (document.documentElement.dataset.hareket === 'sade') return true;
  if (typeof window.matchMedia !== 'function') return true;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const yumusak = (f: number) => (f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2);

type Nokta = readonly [number, number];

// Ardışık iki durak arası kübik eğri; kontrol noktaları ortada olduğundan x tek yönlü artar, bu yüzden x'ten nokta bulunur.
function egriNoktasi(a: Nokta, b: Nokta, x: number): Nokta {
  const m = (a[0] + b[0]) / 2;
  const bez = (t: number, p0: number, p1: number, p2: number, p3: number) =>
    (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3;
  let alt = 0;
  let ust = 1;
  for (let i = 0; i < 24; i++) {
    const t = (alt + ust) / 2;
    if (bez(t, a[0], m, m, b[0]) < x) alt = t; else ust = t;
  }
  const t = (alt + ust) / 2;
  return [x, bez(t, a[1], a[1], b[1], b[1])];
}

export function Iplik({ duraklar, baslik }: { duraklar: Durak[]; baslik: string }) {
  const kirpma = useId();
  const [ilerleme, setIlerleme] = useState(() => (hareketsizMi() ? 1 : 0));

  useEffect(() => {
    if (hareketsizMi()) { setIlerleme(1); return undefined; }
    let kare = 0;
    const bas = performance.now();
    const adim = (t: number) => {
      const f = Math.min(1, (t - bas) / SURE_MS);
      setIlerleme(yumusak(f));
      if (f < 1) kare = requestAnimationFrame(adim);
    };
    kare = requestAnimationFrame(adim);
    return () => cancelAnimationFrame(kare);
  }, []);

  const genislik = Math.max(duraklar.length, 2) * ARA;
  const noktalar: Nokta[] = duraklar.map((_, i) => [ARA / 2 + i * ARA, ORTA + Math.sin(i * 1.2) * SALINIM]);
  let yol = noktalar.length > 0 ? `M${String(noktalar[0]![0])} ${String(noktalar[0]![1])}` : '';
  for (let i = 1; i < noktalar.length; i++) {
    const [a, b] = noktalar[i - 1]!;
    const [c, d] = noktalar[i]!;
    const m = (a + c) / 2;
    yol += ` C${String(m)} ${String(b)} ${String(m)} ${String(d)} ${String(c)} ${String(d)}`;
  }
  const ilkX = noktalar[0]?.[0] ?? 0;
  const sonX = noktalar.at(-1)?.[0] ?? 0;
  const ucX = ilkX + (sonX - ilkX) * ilerleme;
  const bolum = Math.min(noktalar.length - 2, Math.max(0, Math.floor((ucX - ilkX) / ARA)));
  const uc: Nokta = noktalar.length > 1 ? egriNoktasi(noktalar[bolum]!, noktalar[bolum + 1]!, ucX) : noktalar[0] ?? [0, 0];

  return (
    <div className="tc-iplik">
      <svg width={genislik} height={YUKSEKLIK} viewBox={`0 0 ${String(genislik)} ${String(YUKSEKLIK)}`} role="img" aria-label={baslik}>
        <defs>
          <clipPath id={kirpma}><rect x={0} y={0} width={ucX + 1} height={YUKSEKLIK} /></clipPath>
        </defs>
        <path className="tc-iplik-arka" d={yol} strokeWidth={2} />
        <path className="tc-iplik-hat" d={yol} strokeWidth={3.5} clipPath={`url(#${kirpma})`} />
        <g role="list">
          {duraklar.map((d, i) => {
            const [x, y] = noktalar[i]!;
            const ustte = i % 2 === 1;
            const satir = (k: number) => (ustte ? y - 26 - k * 14 : y + 32 + k * 14);
            const yandi = d.kayitli && ucX >= x - 1;
            const sinif = ['tc-iplik-durak', yandi ? 'tc-iplik-yandi' : '', d.kayitli ? '' : 'tc-iplik-bos'].filter(Boolean).join(' ');
            return (
              <g key={d.anahtar} className={sinif} role="listitem" aria-label={`${d.ad}: ${d.satirlar.join(', ')}`}>
                <circle cx={x} cy={y} r={11} strokeWidth={2} />
                <text className="tc-iplik-ad" x={x} y={satir(0)} textAnchor="middle">{kisalt(d.ad)}</text>
                {d.satirlar.map((s, k) => (
                  <text key={k} className="tc-iplik-bilgi" x={x} y={satir(k + 1)} textAnchor="middle">{kisalt(s)}</text>
                ))}
              </g>
            );
          })}
        </g>
        {noktalar.length > 0 && <circle className="tc-iplik-uc" cx={uc[0]} cy={uc[1]} r={5} />}
      </svg>
    </div>
  );
}
