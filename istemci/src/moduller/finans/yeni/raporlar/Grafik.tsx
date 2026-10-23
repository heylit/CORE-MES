import { useEffect, useRef } from 'react';
import type { Chart, ChartConfiguration } from 'chart.js';

// Raporların grafikleri chart.js ile çizilir (paket bağımlılıkta var; prototipte de chart.js 4.4.1). Renkler tasarım
// değişkenlerinden okunur; tema değişince grafik yeniden kurulur. Kitaplık ilk grafikte yüklenir (ana pakete girmez).

export interface Renkler {
  iyi: string; dikkat: string; risk: string; seri: string; seri2: string; yazi: string; soluk: string; izgara: string; zemin: string;
}

const DEGISKEN: Record<keyof Renkler, string> = {
  iyi: '--run', dikkat: '--hold', risk: '--stop', seri: '--grafik', seri2: '--grafik-2', yazi: '--ink', soluk: '--muted', izgara: '--edge', zemin: '--panel-solid',
};

export function renkleriOku(oge: Element = document.documentElement): Renkler {
  const stil = getComputedStyle(oge);
  return Object.fromEntries(Object.entries(DEGISKEN).map(([ad, d]) => [ad, stil.getPropertyValue(d).trim()])) as unknown as Renkler;
}

// Tasarım değişkeni onaltılıktır (#rgb ya da #rrggbb); dolgu ve bant için saydamlık eklenir. Başka biçim olduğu gibi döner.
export function saydam(renk: string, oran: number): string {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(renk);
  if (!m) return renk;
  const h = m[1]!.length === 3 ? m[1]!.split('').map((c) => c + c).join('') : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${oran})`;
}

// Prototip baseOpts: duyarlı, alt açıklama, sade ızgara.
export function ortakSecenekler(r: Renkler): NonNullable<ChartConfiguration['options']> {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'bottom', labels: { color: r.soluk, boxWidth: 10, filter: (o) => !String(o.text).startsWith('_') } } },
    scales: { x: { grid: { display: false }, ticks: { color: r.soluk, maxRotation: 0, autoSkip: true } }, y: { grid: { color: r.izgara }, ticks: { color: r.soluk } } },
  };
}

interface Ozellikler {
  etiket: string;
  kur: (r: Renkler) => ChartConfiguration;
  boy?: 'kisa' | 'orta' | 'uzun';
  // Veri değişince grafik yeniden kurulur; kur işlevi her çizimde yeni olduğu için ayrı anahtarla izlenir.
  anahtar: string;
}

export function Grafik({ etiket, kur, boy = 'orta', anahtar }: Ozellikler) {
  const tuval = useRef<HTMLCanvasElement>(null);
  const kurRef = useRef(kur);
  kurRef.current = kur;
  useEffect(() => {
    const t = tuval.current;
    if (!t || !t.getContext('2d')) return;
    let grafik: Chart | null = null, bitti = false;
    const ciz = (ChartSinifi: typeof Chart) => {
      if (bitti) return;
      grafik?.destroy();
      grafik = new ChartSinifi(t, kurRef.current(renkleriOku()));
    };
    let sinif: typeof Chart | null = null;
    void import('chart.js/auto').then((m) => { sinif = m.default; ciz(m.default); });
    const gozcu = new MutationObserver(() => { if (sinif) ciz(sinif); });
    gozcu.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => { bitti = true; gozcu.disconnect(); grafik?.destroy(); };
  }, [anahtar]);
  return (
    <div className={`tc-fr-grafik tc-fr-grafik-${boy}`}>
      <canvas ref={tuval} role="img" aria-label={etiket} />
    </div>
  );
}
