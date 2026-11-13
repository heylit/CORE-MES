import { Simge } from '../../../../ortak/arayuz/index.ts';
import { Hamleler, type HamleOzellikleri } from './Hamleler.tsx';
import { durumYazisi, satirKimligi, tasinabilir, type KokpitEmri, type KokpitModeli } from './kurallar.ts';

// Seçili emrin ayrıntısı: adımları, yerleri ve seçili adım için tezgâh seçenekleri. Bilgisayarda tahtanın yanında, telefonda alttan açılır;
// telefonda taşıma buradaki düğmelerle yapılır.
export interface AyrintiOzellikleri extends Pick<HamleOzellikleri, 'zaman' | 'uygula'> {
  m: KokpitModeli; e: KokpitEmri; secIs: string | null;
  adimSec: (isId: string) => void;
  kapat: () => void;
}

export function Ayrinti({ m, e, secIs, zaman, uygula, adimSec, kapat }: AyrintiOzellikleri) {
  const kod = new Map(m.tezgahlar.map((t) => [t.id, t.kod]));
  const secili = secIs ? m.isler[secIs] : undefined;
  return (
    <aside className="tc-pyq-ayrinti" aria-label={`${e.no} ayrıntısı`} data-d={e.durum}>
      <header>
        <div><b>{e.no}</b><small>{e.urun} · {e.adet} adet</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Ayrıntıyı kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      <dl>
        <div><dt>Durum</dt><dd data-d={e.durum}>{durumYazisi(e)}</dd></div>
        <div><dt>Termin</dt><dd>{e.termin === null ? '–' : zaman(e.termin)}</dd></div>
        <div><dt>Plandaki bitiş</dt><dd>{e.bitis === null ? '–' : zaman(e.bitis)}</dd></div>
      </dl>
      <h3>Adımlar</h3>
      <ol className="tc-pyq-adimlar">
        {e.adimlar.map((a, i) => {
          const x = m.isler[a.id];
          return (
            <li key={a.id}>
              <button type="button" aria-current={secIs === a.id} disabled={!x} onClick={() => { adimSec(a.id); }}>
                <b>{i + 1}. {a.ad}</b>
                <small>{x ? `${kod.get(satirKimligi(x)) ?? x.m} · ${zaman(x.S).slice(6)} – ${zaman(x.C).slice(6)}${x.basladi ? ' · sürüyor' : ''}` : 'plansız'}</small>
              </button>
            </li>
          );
        })}
      </ol>
      {e.durum === 'plansiz' ? <p className="tc-pyq-not">Bu emrin adımları henüz plana alınmadı.</p> : (
        <>
          <h3>{secili ? `${secili.ad}: tezgâh seçenekleri` : 'Erkene alma seçenekleri'}</h3>
          {secili && tasinabilir(secili) ? <p className="tc-pyq-not">{tasinabilir(secili)}</p> : <Hamleler m={m} e={e} isId={secIs} zaman={zaman} uygula={uygula} />}
        </>
      )}
    </aside>
  );
}
