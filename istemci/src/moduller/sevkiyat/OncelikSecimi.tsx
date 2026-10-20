// Rota önceliği: en hızlı, en kısa yol, en ucuz. Seçilmeyen seçeneğin altında, seçilseydi ne değişeceği yazar;
// karşılaştırma seçimin yanında durur ki kullanıcı ayrı bir satırda aramasın.
import type { Amac } from '#paylasilan/sozlesme/sevkiyat.ts';
import { AMAC_ACIKLAMASI, AMAC_ADI, AMAC_KISA, AMACLAR } from './bicim.ts';

export function OncelikSecimi({ secili, sec, farklar, kapali = false }: {
  secili: Amac; sec: (amac: Amac) => void; farklar?: Partial<Record<Amac, string>>; kapali?: boolean;
}) {
  return (
    <div className="tc-sevkiyat-oncelik" role="group" aria-label="Rota önceliği">
      {AMACLAR.map((a) => (
        <button key={a} type="button" aria-pressed={a === secili} disabled={kapali && a !== secili} title={AMAC_ACIKLAMASI[a]} onClick={() => sec(a)}>
          <b>{AMAC_ADI[a]}</b>
          <small>{a !== secili && farklar?.[a] ? farklar[a] : AMAC_KISA[a]}</small>
        </button>
      ))}
    </div>
  );
}
