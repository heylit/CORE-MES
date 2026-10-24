import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';
import { SEVIYELER, UYARI_ZAMANLARI } from './kurallar.ts';
import type { Uyari } from './tipler.ts';

const bosVer = (): void => undefined;

// Operatöre çıkan hazırlık uyarısı (kurallar.ts WarnOv). "Okudum" demeden kapanmaz: perde, Esc ve kapatma düğmesi yoktur.
export function UyariPenceresi({ liste, baslik, okudum }: { liste: readonly Uyari[]; baslik?: string; okudum: () => void }) {
  const ilk = liste[0];
  if (ilk === undefined) return null;
  const ust = liste.some((w) => w.lvl === 'crit') ? 'crit' : liste.some((w) => w.lvl === 'warn') ? 'warn' : 'info';
  const S = SEVIYELER[ust];
  const ad = liste.length > 1 ? liste.length + ' uyarı' : SEVIYELER[ilk.lvl].l;
  return (
    <Pencere
      acik kapat={bosVer} baslik={ad}
      ust={(
        <header className="tc-ay2-up-ust" data-seviye={ust}>
          <span className="tc-ay2-up-simge" data-ton={S.ton}><Simge ad={S.simge} boyut="b" /></span>
          <div><span className="tc-ay2-ust-yazi">{baslik || 'Hazırlıktan uyarı'}</span><h2>{ad}</h2></div>
        </header>
      )}
      alt={<Dugme boyut="ana" simge="check" onClick={okudum}>Okudum, anladım</Dugme>}
    >
      <div className="tc-ay2-up-liste" role="alert">
        {liste.map((w) => (
          <div key={w.id} className="tc-ay2-up-satir" data-ton={SEVIYELER[w.lvl].ton}>
            <i aria-hidden="true" />
            <b>{w.t}</b>
            <small>
              {SEVIYELER[w.lvl].l} · {(UYARI_ZAMANLARI.find((x) => x[0] === w.when) || [])[1] || ''}
              {w.when === 'every' ? ' · ' + w.n + ' parça' : w.when === 'interval' ? ' · ' + w.n + ' dk' : ''}
            </small>
          </div>
        ))}
      </div>
    </Pencere>
  );
}
