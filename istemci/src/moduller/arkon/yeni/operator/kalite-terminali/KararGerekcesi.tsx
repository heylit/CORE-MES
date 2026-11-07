import { KM_CIDDIYETLER, type Ciddiyet } from '../../../../kalite-merkezi/disari.ts';
import type { KararSecenegi } from './kurallar.ts';

// Şart için hazır cümleler (eldivenle yazmadan). Terminaller ayarı (2166-3) gelince oradan okunur; o zamana dek sabit örnek.
export const HAZIR_SARTLAR = ['Montajda seçilerek kullanılır', 'Müşteri sapma izniyle', 'Sonraki operasyonda düzeltilir'] as const;

export interface Gerekce { ciddiyet: Ciddiyet; kusur: string | null; hazir: string | null; serbest: string }
export const bosGerekce = (): Gerekce => ({ ciddiyet: 'Majör', kusur: null, hazir: null, serbest: '' });

// Sunucuya giden tek not: seçilen kusur, hazır cümle ve yazılan metin (500 karakter sınırı sözleşmede).
export const gerekceNotu = (g: Gerekce): string => [g.kusur, g.hazir, g.serbest.trim()].filter(Boolean).join(' · ').slice(0, 500);

export function KararGerekcesi({ secenek, kusurlar, gerekce, degistir }: {
  secenek: KararSecenegi; kusurlar: readonly string[]; gerekce: Gerekce; degistir: (g: Gerekce) => void;
}) {
  const sart = secenek.deger === 'sartli_kabul';
  return (
    <div className="tc-kt-gerekce" aria-label={sart ? 'Şart' : 'Gerekçe'} role="group">
      <div className="tc-kt-alan">
        <span className="tc-ay1-ust-yazi">Ciddiyet</span>
        <div className="tc-kt-segment" role="radiogroup" aria-label="Ciddiyet">
          {KM_CIDDIYETLER.map((c) => (
            <button key={c} type="button" role="radio" aria-checked={gerekce.ciddiyet === c} className="tc-kt-segment-tus" onClick={() => degistir({ ...gerekce, ciddiyet: c })}>{c}</button>
          ))}
        </div>
      </div>
      {kusurlar.length ? (
        <div className="tc-kt-alan">
          <span className="tc-ay1-ust-yazi">Kusur</span>
          <div className="tc-kt-secmeler">
            {kusurlar.map((k) => (
              <button key={k} type="button" className="tc-kt-secme" data-ton="kotu" aria-pressed={gerekce.kusur === k}
                onClick={() => degistir({ ...gerekce, kusur: gerekce.kusur === k ? null : k })}>{k}</button>
            ))}
          </div>
        </div>
      ) : null}
      {sart ? (
        <div className="tc-kt-alan">
          <span className="tc-ay1-ust-yazi">Şart (zorunlu)</span>
          <div className="tc-kt-secmeler">
            {HAZIR_SARTLAR.map((s) => (
              <button key={s} type="button" className="tc-kt-secme" aria-pressed={gerekce.hazir === s}
                onClick={() => degistir({ ...gerekce, hazir: gerekce.hazir === s ? null : s })}>{s}</button>
            ))}
          </div>
        </div>
      ) : null}
      <label className="tc-kt-alan">
        <span className="tc-ay1-ust-yazi">{sart ? 'Şart notu' : 'Not'}</span>
        <textarea className="tc-ay1-kalite-not" rows={2} maxLength={300} value={gerekce.serbest} aria-label={sart ? 'Şart notu' : 'Gerekçe notu'}
          onChange={(e) => degistir({ ...gerekce, serbest: e.target.value })} />
      </label>
    </div>
  );
}
