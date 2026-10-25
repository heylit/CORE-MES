// Tuvalin renkleri tasarım değişkenlerinden okunur (eski atRenkler); her renk saydamlığı ayarlanabilsin diye rgb'ye çözülür.
// Değişken karışım (color-mix) taşıyabilir: önce bir öğenin hesaplanan rengi, sonra 1x1 tuvalde boyanmış nokta okunur.
export type Rgb = [number, number, number];
export interface HaritaRenkleri {
  run: Rgb; idle: Rgb; stop: Rgb; hold: Rgb; hazard: Rgb; ink: Rgb; muted: Rgb; edge2: Rgb; panel: Rgb; done: Rgb; bp: Rgb;
  is: Rgb[]; mono: string;
}
const ADLAR = { run: '--run', idle: '--idle', stop: '--stop', hold: '--hold', hazard: '--hazard', ink: '--ink', muted: '--muted', edge2: '--edge2', panel: '--panel-solid', done: '--done', bp: '--bp' } as const;

export const rgba = (c: Rgb, a = 1): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function renkleriOku(el: HTMLElement): HaritaRenkleri | null {
  const nokta = document.createElement('canvas'); nokta.width = 1; nokta.height = 1;
  const g = nokta.getContext('2d', { willReadFrequently: true }); if (!g) return null;
  const ornek = document.createElement('i'); ornek.hidden = true; el.appendChild(ornek);
  const cs = getComputedStyle(el);
  const coz = (ad: string): Rgb => {
    ornek.style.setProperty('color', cs.getPropertyValue(ad).trim());
    g.clearRect(0, 0, 1, 1); g.fillStyle = getComputedStyle(ornek).color; g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data; return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0];
  };
  try {
    const r = Object.fromEntries(Object.entries(ADLAR).map(([k, v]) => [k, coz(v)])) as Omit<HaritaRenkleri, 'is' | 'mono'>;
    return { ...r, is: Array.from({ length: 10 }, (_, i) => coz(`--tc-pym-is-${i}`)), mono: cs.getPropertyValue('--font-mono').trim() || 'monospace' };
  } finally { ornek.remove(); }
}
