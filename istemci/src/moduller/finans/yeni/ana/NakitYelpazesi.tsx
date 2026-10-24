import { useEffect, useRef } from 'react';
import { CategoryScale, Chart, Filler, LinearScale, LineController, LineElement, PointElement, Tooltip } from 'chart.js';
import { addDays, fmt, fmtD, fmtK } from '../motor.ts';
import { yelpaze, type MonteCarlo } from '../gorunum.ts';

Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

// Renkler tasarım değişkeninden okunur: tema değişince grafik yeniden kurulur (ekran yeniden çizildiğinde).
const degisken = (ad: string): string => getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
export function saydam(renk: string, oran: number): string {
  const m = renk.match(/^#([0-9a-f]{6})$/i);
  if (!m) return renk;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${oran})`;
}

// Olası nakit seyri (prototip fanDatasets): %10-90 ve %25-75 bantları, ortanca, güvenlik eşiği; en düşük hafta işaretli.
// Değerler gizli tabloda da okunur (ekran okuyucu ve grafiksiz ortam).
export function NakitYelpazesi({ mc, bugun }: { mc: MonteCarlo; bugun: string }) {
  const tuval = useRef<HTMLCanvasElement>(null);
  const y = yelpaze(mc);
  const etiketler = y.p50.map((_, i) => fmtD(addDays(bugun, i * 7)));

  useEffect(() => {
    const el = tuval.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return undefined;
    const ana = degisken('--grafik'), esik = degisken('--hold'), dip = degisken('--stop'), yazi = degisken('--muted'), cizgi = degisken('--edge');
    const grafik = new Chart(ctx, {
      type: 'line',
      data: {
        labels: etiketler,
        datasets: [
          { label: '_p90', data: y.p90, borderWidth: 0, pointRadius: 0, fill: false },
          { label: '%10–90 aralığı', data: y.p10, borderWidth: 0, pointRadius: 0, backgroundColor: saydam(ana, 0.12), fill: '-1' },
          { label: '_p75', data: y.p75, borderWidth: 0, pointRadius: 0, fill: false },
          { label: '%25–75 aralığı', data: y.p25, borderWidth: 0, pointRadius: 0, backgroundColor: saydam(ana, 0.2), fill: '-1' },
          {
            label: 'Ortanca', data: y.p50, borderColor: ana, backgroundColor: ana, borderWidth: 2.5, tension: 0.3, fill: false,
            pointRadius: y.p50.map((_, i) => (i === y.dipHafta ? 5 : 0)), pointBackgroundColor: y.p50.map((_, i) => (i === y.dipHafta ? dip : ana)),
          },
          { label: 'Güvenlik eşiği', data: y.esik, borderColor: esik, borderDash: [6, 5], pointRadius: 0, borderWidth: 1.5, fill: false },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 300 }, interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: { filter: (i) => !String(i.dataset.label).startsWith('_'), callbacks: { label: (c) => ` ${String(c.dataset.label)}: ${fmt(Number(c.raw))}` } },
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: yazi }, border: { color: cizgi } },
          y: { grid: { color: cizgi }, ticks: { color: yazi, callback: (v) => fmtK(Number(v)) }, border: { display: false } },
        },
      },
    });
    return () => grafik.destroy();
  }, [mc, bugun]);

  return (
    <div className="tc-fa-grafik">
      <canvas ref={tuval} role="img" aria-label="Önümüzdeki 13 haftanın olası nakit seyri" />
      <table className="tc-fa-gizli">
        <caption>Haftalık olası nakit (ortanca, %10 ve %90)</caption>
        <thead><tr><th>Hafta</th><th>Ortanca</th><th>%10</th><th>%90</th></tr></thead>
        <tbody>{etiketler.map((e, i) => <tr key={e}><td>{e}</td><td>{fmt(y.p50[i])}</td><td>{fmt(y.p10[i])}</td><td>{fmt(y.p90[i])}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
