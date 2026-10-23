import { useEffect, useRef } from 'react';
import { Chart, registerables, type ChartConfiguration } from 'chart.js';

Chart.register(...registerables);

// Uygulamanın grafikleri bugünkü gibi Chart.js ile (mevcut bağımlılık, 4.4.1). Renkler uygulamadaki adlarla tasarım değişkeninden okunur:
// kırmızı, amber, çelik, zeytin, soluk.
const DEGISKENLER = { kirmizi: '--stop', amber: '--hold', celik: '--grafik', zeytin: '--run', soluk: '--idle' } as const;
export type RenkAdi = keyof typeof DEGISKENLER;
export type Renk = (ad: RenkAdi) => string;

const oku = (el: Element, ad: string): string => getComputedStyle(el).getPropertyValue(ad).trim();

// Uygulamanın chartDefaults'u: yazı, renk, çizgi, gösterge kutusu, oran serbest.
function varsayilanlar(el: Element): void {
  const yazi = oku(el, '--font-ana');
  if (yazi) Chart.defaults.font.family = yazi;
  Chart.defaults.font.size = 12.5;
  Chart.defaults.color = oku(el, '--muted') || Chart.defaults.color;
  Chart.defaults.borderColor = oku(el, '--edge') || Chart.defaults.borderColor;
  Chart.defaults.plugins.legend.labels.boxWidth = 12;
  Chart.defaults.plugins.legend.labels.boxHeight = 12;
  Chart.defaults.maintainAspectRatio = false;
}

interface Ozellikler {
  etiket: string;
  // Veri değişince grafik yeniden kurulur; anahtar verinin özetidir.
  anahtar: string;
  kur: (renk: Renk) => ChartConfiguration;
  boy?: 'kisa' | 'normal' | 'uzun';
}

export function Grafik({ etiket, anahtar, kur, boy = 'normal' }: Ozellikler) {
  const tuval = useRef<HTMLCanvasElement>(null);
  const kurucu = useRef(kur);
  kurucu.current = kur;
  useEffect(() => {
    const el = tuval.current;
    // Tuval çizilemiyorsa (test ortamı) grafik kurulmaz; veriler sayfadaki tablolarda kalır.
    if (!el || !el.getContext('2d')) return undefined;
    varsayilanlar(el);
    const renk: Renk = (ad) => oku(el, DEGISKENLER[ad]);
    const g = new Chart(el, kurucu.current(renk));
    return () => g.destroy();
  }, [anahtar]);
  return (
    <div className={`tc-km4-ch tc-km4-ch-${boy}`}>
      <canvas ref={tuval} role="img" aria-label={etiket} />
    </div>
  );
}

// Son ya da sonraki ayların etiketi ve anahtarı (yyyy-aa), uygulamadaki MONTHS ile.
const AYLAR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
export function aylar(adet: number, ileri = false, simdi = new Date()): { etiket: string; anahtar: string }[] {
  const out: { etiket: string; anahtar: string }[] = [];
  for (let i = 0; i < adet; i++) {
    const k = ileri ? i : adet - 1 - i;
    const d = new Date(simdi.getFullYear(), simdi.getMonth() + (ileri ? k : -k), 1);
    out.push({ etiket: `${AYLAR[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`, anahtar: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` });
  }
  return out;
}

// Uygulamanın noData'sı.
export function VeriYok({ children }: { children?: string }) {
  return <p className="tc-km4-veri-yok"><b>Henüz veri yok</b>{children ? <><br />{children}</> : null}</p>;
}
