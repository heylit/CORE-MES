import type { Metin } from './ozet/veri.ts';

// Motor bağlanmadan çalışmayan düğmenin notu (357 b) ve yeni ekranda karşılığı olmayan iç görünümün notu (459/5 a).
export const MOTOR_NOTU = 'Plan motoru bağlanınca açılır.';
export const YOK_NOTU = 'Bu görünüm yeni ekranda yok.';
// Sonraki teslimde gelen bölümün notu (harita, çizelge, keşfet ve kartlar).
export const HAZIRLANIYOR = 'Hazırlanıyor.';

// Kalın parçalı metin (eski sayfanın <b> vurgusu).
export function MetinYaz({ m }: { m: Metin }) {
  return <>{m.map((x, i) => (typeof x === 'string' ? x : <b key={i}>{x.b}</b>))}</>;
}

// Satır içi stil yazılmaz: konum ve oran CSS değişkeniyle öğeye ref üzerinden verilir.
export function degisken(d: Record<string, string | number>) {
  return (el: HTMLElement | SVGElement | null) => { if (el) for (const [k, v] of Object.entries(d)) el.style.setProperty(k, String(v)); };
}
export const yuzde = (x: number) => `${(x * 100).toFixed(2)}%`;
