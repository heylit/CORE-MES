import { Simge } from '../../../../ortak/arayuz/index.ts';
import { cubukDugmeleri, tonDurumu, type DurumDugmesi } from './kurallar.ts';
import type { SayimTusu } from './Parcalar.tsx';

// Telefonda işin ana eylemleri kaydırmadan erişilir (618): alt gezinmenin üstünde sabit durur.
export function EylemCubugu({ durum, pasif, eylem, tuslar }: { durum: string; pasif: boolean; eylem: (d: DurumDugmesi) => void; tuslar: readonly SayimTusu[] }) {
  const dugmeler = cubukDugmeleri(durum);
  if (!dugmeler.length && !tuslar.length) return null;
  return (
    <div className="tc-ay1-cubuk" role="group" aria-label="İş eylemleri">
      {dugmeler.map((d) => (
        <button key={d.key} type="button" className="tc-ay1-cubuk-dugme" data-durum={tonDurumu(d.ton)} data-ana={d.ana || undefined} disabled={pasif} onClick={() => eylem(d)}>
          <Simge ad={d.simge} />{d.etiket}
        </button>
      ))}
      {tuslar.map((t) => (
        <button key={t.etiket} type="button" className="tc-ay1-cubuk-dugme" data-tur={t.ton} disabled={t.kapali} onClick={t.bas} aria-label={t.aria}>
          <Simge ad={t.simge} />{t.etiket}
        </button>
      ))}
    </div>
  );
}
