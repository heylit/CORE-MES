import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { ayAdi } from '../bicim.ts';

// "GGGG-AA" ayını bir ileri bir geri kaydırır.
export function ayKaydir(ay: string, adim: number): string {
  const [y, m] = ay.split('-').map(Number) as [number, number];
  const toplam = y * 12 + (m - 1) + adim;
  return `${Math.floor(toplam / 12)}-${String((toplam % 12) + 1).padStart(2, '0')}`;
}

export function AySecici({ ay, degistir }: { ay: string; degistir: (ay: string) => void }) {
  return (
    <span className="tc-ik-ay" role="group" aria-label="Ay">
      <Dugme simge="chev-left" aria-label="Önceki ay" onClick={() => { degistir(ayKaydir(ay, -1)); }} />
      <b aria-live="polite">{ayAdi(ay)}</b>
      <Dugme simge="chev-right" aria-label="Sonraki ay" onClick={() => { degistir(ayKaydir(ay, 1)); }} />
    </span>
  );
}
