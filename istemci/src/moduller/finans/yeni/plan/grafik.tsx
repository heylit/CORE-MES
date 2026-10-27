import { useEffect, useRef, useState } from 'react';
import type { Chart, ChartConfiguration } from 'chart.js';
import { fmt, fmtK } from '../motor.ts';
import './plan.css';

// F2 grafikleri chart.js ile çizilir (bağımlılık zaten var; prototipteki 4.4.1). Renkler tasarım değişkeninden okunur,
// prototipteki renk anlamı korunur: giriş/iyi --run, çıkış/risk --stop, eşik/uyarı --hold, bakiye --grafik.
const DEGISKENLER = {
  giris: '--run', cikis: '--stop', uyari: '--hold', bakiye: '--grafik', ikinci: '--grafik-2',
  metin: '--ink', soluk: '--muted', izgara: '--grid', zemin: '--panel-solid',
} as const;
export type Renkler = Record<keyof typeof DEGISKENLER, string>;

export function renkleriOku(kok: Element = document.documentElement): Renkler {
  const stil = getComputedStyle(kok);
  return Object.fromEntries(Object.entries(DEGISKENLER).map(([ad, d]) => [ad, stil.getPropertyValue(d).trim() || 'gray'])) as Renkler;
}

// Prototipteki alpha(): yalnız #rrggbb biçimi saydamlaşır; öteki biçim (rgba, ad) olduğu gibi kalır.
export function saydam(renk: string, a: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(renk)) return renk;
  const n = Number.parseInt(renk.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

type Ayar = NonNullable<ChartConfiguration['options']>;
// İpucu değeri: dikey grafikte y, yatayda x, halkada sayının kendisi (prototipte ctx.parsed.y ?? ctx.parsed).
const ipucuDegeri = (p: unknown): number => {
  if (typeof p === 'number') return p;
  const o = (p ?? {}) as { x?: unknown; y?: unknown };
  return Number(o.y ?? o.x) || 0;
};
// Prototipteki baseOpts: ortak eksen, ipucu ve gösterge ayarı. "_" ile başlayan seri göstergede ve ipucunda görünmez.
export function temelAyar(r: Renkler, ek: Ayar = {}): Ayar {
  return {
    responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: r.soluk, boxWidth: 12, boxHeight: 12, usePointStyle: true, pointStyle: 'rectRounded', filter: (i) => !String(i.text).startsWith('_') } },
      tooltip: {
        backgroundColor: r.metin, titleColor: r.zemin, bodyColor: r.zemin, padding: 10,
        filter: (i) => !String(i.dataset.label).startsWith('_'),
        callbacks: { label: (c) => ` ${c.dataset.label ?? ''}: ${fmt(ipucuDegeri(c.parsed))}` },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: r.soluk } },
      y: { grid: { color: r.izgara }, ticks: { color: r.soluk, callback: (v) => fmtK(Number(v)) }, border: { display: false } },
    },
    ...ek,
  };
}

// Tema değişince (kabuk data-theme yazar) renkler yeniden okunur.
function useTemaSurumu(): number {
  const [surum, surumYaz] = useState(0);
  useEffect(() => {
    if (typeof MutationObserver === 'undefined') return undefined;
    const izleyen = new MutationObserver(() => surumYaz((s) => s + 1));
    izleyen.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => izleyen.disconnect();
  }, []);
  return surum;
}

export type GrafikBoyu = 'kisa' | 'orta' | 'uzun';

// Tuval ekran okuyucuya tek resimdir; sayıların kendisi her bölümde ayrıca tabloda yazar.
export function Grafik({ etiket, boy = 'orta', kur }: { etiket: string; boy?: GrafikBoyu; kur: (r: Renkler) => ChartConfiguration }) {
  const tuval = useRef<HTMLCanvasElement>(null);
  const grafik = useRef<Chart | null>(null);
  const tema = useTemaSurumu();
  const [hata, hataYaz] = useState(false);

  useEffect(() => {
    let canli = true;
    const el = tuval.current;
    // Tuval bağlamı olmayan ortamda (test) çizilmez; sayılar tabloda kalır.
    if (!el || !el.getContext('2d')) return undefined;
    void import('chart.js/auto').then(({ default: ChartSinifi }) => {
      if (!canli) return;
      const ayar = kur(renkleriOku());
      if (grafik.current) {
        grafik.current.data = ayar.data;
        if (ayar.options) grafik.current.options = ayar.options;
        grafik.current.update('none');
      } else grafik.current = new ChartSinifi(el, ayar);
    }).catch(() => { if (canli) hataYaz(true); });
    return () => { canli = false; };
  }, [kur, tema]);

  useEffect(() => () => { grafik.current?.destroy(); grafik.current = null; }, []);

  if (hata) return <p className="tc-fy-not">Grafik çizilemedi.</p>;
  return (
    <div className={`tc-fc-grafik tc-fc-grafik-${boy}`}>
      <canvas ref={tuval} role="img" aria-label={etiket} />
    </div>
  );
}
