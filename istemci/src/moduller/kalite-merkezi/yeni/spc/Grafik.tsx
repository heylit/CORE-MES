import { useEffect, useRef } from 'react';
import type { Chart, ChartConfiguration } from 'chart.js';
import './grafik.css';

// Kalite grafikleri uygulamadaki gibi Chart.js ile çizilir; seçenekler uygulamanın grafikleriyle aynıdır.
// Kitaplık ilk grafikte yüklenir: grafiği olmayan görünüm paketi büyütmez. Renkler tasarım değişkenlerinden okunur.

export type Renk = 'grafik' | 'grafik2' | 'tamam' | 'uyari' | 'hata' | 'soluk';
export type Boy = 'kisa' | 'orta' | 'uzun';

export interface CizgiSerisi {
  ad: string;
  degerler: readonly (number | null)[];
  renk: Renk;
  kesik?: boolean;
  nokta?: boolean;
  noktaRengi?: (i: number) => Renk;
  // Göstergede aynı adla iki seri (alt ve üst sınır) tek satır yazılır.
  gostergedeYok?: boolean;
  kalin?: boolean;
  egri?: boolean;
}

export interface CubukSerisi { ad: string; degerler: readonly number[]; renk: Renk | ((i: number) => Renk) }

const DEGISKEN: Record<Renk, string> = {
  grafik: '--grafik', grafik2: '--grafik-2', tamam: '--run', uyari: '--hold', hata: '--stop', soluk: '--idle',
};

type Kurucu = (renk: (r: Renk) => string, stil: (ad: string) => string) => ChartConfiguration;

let kitaplik: Promise<typeof Chart> | null = null;
const yukle = () => (kitaplik ??= import('chart.js/auto').then((m) => m.default));

// Tuval bağlamı olmayan ortamda (jsdom) grafik kurulmaz; başlık ve tablo yine görünür.
const tuvalVar = (c: HTMLCanvasElement) => {
  try { return Boolean(c.getContext('2d')); } catch { return false; }
};

function useGrafik(anahtar: string, kur: Kurucu) {
  const tuval = useRef<HTMLCanvasElement>(null);
  const kurucu = useRef(kur);
  kurucu.current = kur;
  useEffect(() => {
    const c = tuval.current;
    if (!c || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.getContext) return undefined;
    let grafik: Chart | null = null;
    let bitti = false;
    void yukle().then((ChartSinifi) => {
      if (bitti || !tuvalVar(c)) return;
      const s = getComputedStyle(c);
      const stil = (ad: string) => s.getPropertyValue(ad).trim();
      const yapi = kurucu.current((r) => stil(DEGISKEN[r]), stil);
      ChartSinifi.defaults.font.family = stil('--font-ana') || ChartSinifi.defaults.font.family;
      ChartSinifi.defaults.font.size = Number.parseFloat(stil('--yazi-xs')) || ChartSinifi.defaults.font.size;
      ChartSinifi.defaults.color = stil('--muted');
      ChartSinifi.defaults.borderColor = stil('--edge');
      grafik = new ChartSinifi(c, yapi);
    });
    return () => { bitti = true; grafik?.destroy(); };
  }, [anahtar]);
  return tuval;
}

const gosterge = (gorunsun: boolean) => ({
  display: gorunsun, position: 'bottom' as const,
  labels: { boxWidth: 12, boxHeight: 12, filter: (o: { text: string }) => !o.text.startsWith('_') },
});

const baslik = (metin?: string) => (metin ? { display: true, text: metin } : { display: false });

function Cerceve({ etiket, boy, tuval }: { etiket: string; boy: Boy; tuval: React.RefObject<HTMLCanvasElement> }) {
  return (
    <figure className="tc-km2-grafik" aria-label={etiket}>
      <div className={`tc-km2-g-alan tc-km2-g-${boy}`}>
        <canvas ref={tuval} role="img" aria-label={etiket} />
      </div>
    </figure>
  );
}

export function CizgiGrafigi({
  etiket, seriler, xEtiketleri, yBicim = String, ipucuBicim, boy = 'orta', ipucu, yMin, yMax, xBaslik, yBaslik, gostergeli = true,
}: {
  etiket: string;
  seriler: readonly CizgiSerisi[];
  xEtiketleri: readonly string[];
  yBicim?: (v: number) => string;
  ipucuBicim?: (v: number) => string;
  boy?: Boy;
  ipucu?: (i: number) => string;
  yMin?: number;
  yMax?: number;
  xBaslik?: string;
  yBaslik?: string;
  gostergeli?: boolean;
}) {
  const n = Math.max(0, ...seriler.map((s) => s.degerler.length));
  const tarif = seriler.map((s) => ({
    ad: s.gostergedeYok ? `_${s.ad}` : s.ad, degerler: s.degerler, renk: s.renk, kesik: !!s.kesik, nokta: !!s.nokta,
    noktalar: s.noktaRengi ? s.degerler.map((_, i) => s.noktaRengi!(i)) : null, kalin: !!s.kalin, egri: !!s.egri,
  }));
  const anahtar = JSON.stringify([etiket, xEtiketleri, tarif, yMin, yMax, xBaslik, yBaslik, gostergeli]);
  const tuval = useGrafik(anahtar, (renk) => ({
    type: 'line',
    data: {
      labels: [...xEtiketleri],
      datasets: tarif.map((s) => ({
        label: s.ad,
        data: [...s.degerler],
        borderColor: renk(s.renk),
        backgroundColor: renk(s.renk),
        pointBackgroundColor: s.noktalar ? s.noktalar.map(renk) : renk(s.renk),
        pointBorderColor: s.noktalar ? s.noktalar.map(renk) : renk(s.renk),
        pointRadius: s.nokta ? (n > 60 ? 2 : 3.5) : 0,
        borderWidth: s.kalin ? 2.5 : 1.5,
        borderDash: s.kesik ? (s.egri ? [5, 4] : [6, 4]) : [],
        tension: s.egri ? 0.25 : 0,
        fill: false,
      })),
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: gosterge(gostergeli),
        tooltip: {
          callbacks: {
            ...(ipucu ? { title: (o: { dataIndex: number }[]) => (o[0] ? ipucu(o[0].dataIndex) : '') } : {}),
            label: (o: { dataset: { label?: string }; parsed: { y: number | null } }) =>
              `${(o.dataset.label ?? '').replace(/^_/, '')}: ${o.parsed.y == null ? '' : (ipucuBicim ?? yBicim)(o.parsed.y)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 12 }, title: baslik(xBaslik) },
        y: {
          min: yMin, max: yMax, beginAtZero: yMin === 0,
          ticks: { callback: (v: number | string) => yBicim(Number(v)) },
          title: baslik(yBaslik),
        },
      },
    },
  }));
  return <Cerceve etiket={etiket} boy={boy} tuval={tuval} />;
}

export function CubukGrafigi({
  etiket, kategoriler, seriler, yatay = false, enCok, bicim = String, boy, yigin = false, xBaslik,
}: {
  etiket: string;
  kategoriler: readonly string[];
  seriler: readonly CubukSerisi[];
  yatay?: boolean;
  enCok?: number;
  bicim?: (v: number) => string;
  boy?: Boy;
  yigin?: boolean;
  xBaslik?: string;
}) {
  const tarif = seriler.map((s) => ({
    ad: s.ad, degerler: s.degerler, renkler: s.degerler.map((_, i) => (typeof s.renk === 'function' ? s.renk(i) : s.renk)),
  }));
  const anahtar = JSON.stringify([etiket, kategoriler, tarif, yatay, enCok, yigin, xBaslik]);
  const deger = yatay ? 'x' : 'y';
  const kategori = yatay ? 'y' : 'x';
  const tuval = useGrafik(anahtar, (renk) => ({
    type: 'bar',
    data: {
      labels: [...kategoriler],
      datasets: tarif.map((s) => ({
        label: s.ad, data: [...s.degerler], backgroundColor: s.renkler.map(renk),
        ...(yatay ? {} : { barPercentage: 1, categoryPercentage: 0.96 }),
      })),
    },
    options: {
      indexAxis: kategori,
      responsive: true, maintainAspectRatio: false, animation: false,
      plugins: {
        legend: gosterge(seriler.length > 1),
        tooltip: { callbacks: { label: (o: { dataset: { label?: string }; parsed: Record<'x' | 'y', number | null> }) => `${o.dataset.label ?? ''}: ${bicim(o.parsed[deger] ?? 0)}` } },
      },
      scales: {
        [kategori]: { stacked: yigin, grid: { display: false }, ticks: yatay ? {} : { maxRotation: 45 }, title: baslik(xBaslik) },
        [deger]: {
          stacked: yigin, min: 0, max: enCok,
          ticks: { precision: 0, callback: (v: number | string) => bicim(Number(v)) },
        },
      },
    },
  }));
  const yuk: Boy = boy ?? (yatay ? (kategoriler.length <= 4 ? 'kisa' : kategoriler.length <= 9 ? 'orta' : 'uzun') : 'orta');
  return <Cerceve etiket={etiket} boy={yuk} tuval={tuval} />;
}
